/**
 * Independent Public-Deal Verifier.
 *
 * Standalone verifier that accepts a public TCLK deal transcript and contract ID
 * and independently validates the complete cryptographic, protocol, rail, and state integrity.
 *
 * INDEPENDENCE GUARANTEE:
 * Does NOT rely on local DealEngine or internal state as its authority.
 * Recomputes all identifiers, verifies all Ed25519 transport signatures, checks rail invariants,
 * and validates witness preimages independently.
 */

import {
  applyFrame,
  contractId as computeContractId,
  decodeFrame,
  decodePaperRecord,
  offerId as computeOfferId,
  openContract,
  paperNote,
  verifySecret,
  type AcceptCore,
  type ContractState,
  type NoteStore,
  type OfferFrame,
  type TclkFrame,
  type TclkStatus,
} from "@flop-labs/tclk";
import { verifyRoomMessage } from "../../../technocore/verify.ts";
import type { SignedRoomMessage } from "../../../technocore/envelope.ts";
import type { NetworkProvenance } from "./types.ts";

export interface DealVerificationCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly details: string;
}

export interface PublicDealVerificationResult {
  readonly verified: boolean;
  readonly contractId: string;
  readonly offerId?: string;
  readonly classification: "VALID" | "INVALID" | "INCOMPLETE" | "UNSUPPORTED";
  readonly status?: TclkStatus;
  readonly provenance: NetworkProvenance;
  readonly checks: readonly DealVerificationCheck[];
  readonly errors: readonly string[];
  readonly state?: ContractState;
  readonly frames?: readonly TclkFrame[];
  readonly participants?: {
    readonly payerDid?: string;
    readonly payeeDid?: string;
  };
  readonly timelocks?: {
    readonly expiresMs?: number;
    readonly claimByMs?: number;
    readonly refundAfterMs?: number;
  };
  readonly verifiedAt: string;
}

/**
 * Parses diverse transcript representations (JSON strings, message arrays, objects)
 * into normalized SignedRoomMessage[] for independent verification.
 */
export function parseTranscriptInput(input: unknown): SignedRoomMessage[] {
  if (!input) return [];
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return [];
    }
  }

  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "object" && raw !== null && "messages" in raw && Array.isArray((raw as { messages: unknown[] }).messages)
    ? (raw as { messages: unknown[] }).messages
    : [raw];

  const messages: SignedRoomMessage[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const did = typeof rec["did"] === "string" ? rec["did"] : typeof rec["from"] === "string" ? (rec["from"] as string) : "";
    const sig = typeof rec["sig"] === "string" ? rec["sig"] : typeof rec["signature"] === "string" ? (rec["signature"] as string) : "";
    const nonce = typeof rec["nonce"] === "string" ? rec["nonce"] : rec["nonce"] === null ? "" : String(rec["nonce"] ?? "");
    const text = typeof rec["text"] === "string" ? rec["text"] : "";

    if (text) {
      messages.push({ did, sig, nonce, text });
    }
  }

  return messages;
}

export interface VerifyPublicDealOptions {
  readonly defaultRoom?: string;
  readonly noteStore?: NoteStore;
  readonly provenance?: NetworkProvenance;
  readonly nowMs?: number;
}

/**
 * Independently verifies a public deal transcript.
 */
export async function verifyPublicDeal(
  messages: readonly SignedRoomMessage[],
  expectedContractId?: string,
  options: VerifyPublicDealOptions = {},
): Promise<PublicDealVerificationResult> {
  const room = options.defaultRoom ?? "tclk-offers";
  const nowMs = options.nowMs ?? Date.now();
  const provenance: NetworkProvenance = options.provenance ?? "NETWORK_OBSERVED";
  const checks: DealVerificationCheck[] = [];
  const errors: string[] = [];

  // Check 1: Non-empty transcript
  if (messages.length === 0) {
    return {
      verified: false,
      contractId: expectedContractId ?? "unknown",
      classification: "INVALID",
      provenance,
      checks: [{ name: "transcript-not-empty", passed: false, details: "Transcript is empty" }],
      errors: ["Transcript contains no messages"],
      verifiedAt: new Date(nowMs).toISOString(),
    };
  }
  checks.push({ name: "transcript-not-empty", passed: true, details: `Contains ${messages.length} messages` });

  // Check 2: Cryptographic transport signatures
  let allSignaturesValid = true;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!;
    const sigRes = await verifyRoomMessage(room, msg);
    if (!sigRes.verified) {
      allSignaturesValid = false;
      errors.push(`Message ${i} signature invalid: ${sigRes.reason ?? "mismatch"}`);
    }
  }
  checks.push({
    name: "transport-signatures",
    passed: allSignaturesValid,
    details: allSignaturesValid ? "All transport signatures cryptographically verified" : "One or more signatures failed",
  });

  // Check 3: Frame decoding
  const frames: TclkFrame[] = [];
  let allDecoded = true;
  for (let i = 0; i < messages.length; i++) {
    try {
      const f = decodeFrame(messages[i]!.text);
      frames.push(f);
    } catch (err) {
      allDecoded = false;
      errors.push(`Message ${i} frame decode failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  checks.push({
    name: "frame-decoding",
    passed: allDecoded,
    details: allDecoded ? `Successfully decoded ${frames.length} frames` : "Failed to decode some frames",
  });

  if (!allDecoded || frames.length === 0) {
    return {
      verified: false,
      contractId: expectedContractId ?? "unknown",
      classification: "UNSUPPORTED",
      provenance,
      checks,
      errors,
      verifiedAt: new Date(nowMs).toISOString(),
    };
  }

  // Check 4: Frame 0 is offer
  const offerFrame = frames[0]!;
  if (offerFrame.type !== "offer") {
    errors.push(`Transcript does not begin with offer frame (found ${offerFrame.type})`);
    checks.push({ name: "initial-offer-frame", passed: false, details: `Initial frame is ${offerFrame.type}` });
  } else {
    checks.push({ name: "initial-offer-frame", passed: true, details: `Valid offer frame ${offerFrame.id}` });
  }

  // Check 5: Author attribution (envelope DID matches frame 'from')
  let attributionValid = true;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    const msg = messages[i]!;
    if (f.from !== msg.did) {
      attributionValid = false;
      errors.push(`Frame ${i} from (${f.from}) does not match envelope DID (${msg.did})`);
    }
  }
  checks.push({
    name: "sender-attribution",
    passed: attributionValid,
    details: attributionValid ? "All frame senders match signed envelope DIDs" : "Mismatched frame senders",
  });

  // Check 6: Offer ID integrity
  if (offerFrame.type === "offer") {
    const { id: _unusedId, ...offerFields } = offerFrame;
    void _unusedId;
    const computedId = computeOfferId(offerFields);
    const offerIdValid = computedId === offerFrame.id;
    if (!offerIdValid) {
      errors.push(`Offer ID mismatch: declared ${offerFrame.id}, computed ${computedId}`);
    }
    checks.push({
      name: "offer-id-computation",
      passed: offerIdValid,
      details: `Offer ID: ${offerFrame.id}`,
    });
  }

  // Check 7: State machine evaluation
  let state: ContractState = {} as ContractState;
  let stateMachineValid = true;
  if (offerFrame.type === "offer") {
    try {
      state = openContract(offerFrame as OfferFrame);
    } catch (err) {
      stateMachineValid = false;
      errors.push(`openContract failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (let i = 1; i < frames.length; i++) {
    const f = frames[i]!;
    const step = applyFrame(state, f, nowMs);
    if (!step.ok) {
      stateMachineValid = false;
      errors.push(`Frame ${i} (${f.type}) transition rejected: ${step.reason}`);
    } else {
      state = step.state;
    }
  }
  checks.push({
    name: "state-machine-progression",
    passed: stateMachineValid,
    details: stateMachineValid ? `Terminal/Current status: ${state.status}` : "State machine rejected a transition",
  });

  // Check 8: Contract ID derivation on Accept
  let contractIdDerivationValid = true;
  const acceptFrame = frames.find((f) => f.type === "accept");
  if (acceptFrame && acceptFrame.type === "accept" && offerFrame.type === "offer") {
    const acceptCore: AcceptCore = {
      from: acceptFrame.from,
      ref: acceptFrame.ref,
      statement: acceptFrame.statement,
      paymentKey: acceptFrame.paymentKey,
      nonce: acceptFrame.nonce,
    };
    const derivedContractId = computeContractId(offerFrame as OfferFrame, acceptCore);
    if (derivedContractId !== acceptFrame.contract) {
      contractIdDerivationValid = false;
      errors.push(`Contract ID mismatch: accept declared ${acceptFrame.contract}, recomputed ${derivedContractId}`);
    }
    if (expectedContractId && expectedContractId !== derivedContractId) {
      contractIdDerivationValid = false;
      errors.push(`Contract ID mismatch: expected ${expectedContractId}, recomputed ${derivedContractId}`);
    }
    checks.push({
      name: "contract-id-derivation",
      passed: contractIdDerivationValid,
      details: `Recomputed contract ID: ${derivedContractId}`,
    });
  }

  // Check 9: Timelock consistency
  if (offerFrame.type === "offer") {
    const timelockValid =
      offerFrame.expiresMs <= offerFrame.claimByMs && offerFrame.claimByMs < offerFrame.refundAfterMs;
    if (!timelockValid) {
      errors.push(
        `Invalid timelocks: expiresMs (${offerFrame.expiresMs}) <= claimByMs (${offerFrame.claimByMs}) < refundAfterMs (${offerFrame.refundAfterMs}) violated`,
      );
    }
    checks.push({
      name: "timelock-bounds",
      passed: timelockValid,
      details: `expires: ${offerFrame.expiresMs}, claimBy: ${offerFrame.claimByMs}, refundAfter: ${offerFrame.refundAfterMs}`,
    });
  }

  // Check 10: Secret / Witness verification on reveal
  const revealFrame = frames.find((f) => f.type === "reveal");
  if (revealFrame && revealFrame.type === "reveal" && state.statement && offerFrame.type === "offer") {
    const secretValid = verifySecret(offerFrame.lock, state.statement, revealFrame.secret);
    if (!secretValid) {
      errors.push(`Secret witness does not open lock statement ${state.statement}`);
    }
    checks.push({
      name: "secret-witness-verification",
      passed: secretValid,
      details: secretValid ? "Revealed secret successfully opened lock statement" : "Invalid secret witness",
    });
  }

  // Check 11: PaperRail Record Invariant (if rail is paper and NoteStore supplied)
  const resolvedContract = state.contract ?? expectedContractId ?? "";
  const contractRefundAfterMs = state.offer?.refundAfterMs ?? (offerFrame.type === "offer" ? offerFrame.refundAfterMs : undefined);
  if (options.noteStore && state.rail === "paper" && resolvedContract.startsWith("0x")) {
    let paperRailValid = false;
    let paperDetail = "";
    try {
      const { ns, key } = paperNote(resolvedContract);
      const raw = await options.noteStore.get(ns, key);
      if (!raw) {
        errors.push(`PaperRail note not found at ${ns}/${key}`);
        paperDetail = "Note missing in NoteStore";
      } else {
        const parsed = decodePaperRecord(raw);
        if (!parsed) {
          errors.push(`PaperRail note unparseable at ${ns}/${key}`);
          paperDetail = "Unparseable record";
        } else if (parsed.statement !== state.statement) {
          errors.push(`PaperRail statement mismatch: note=${parsed.statement}, contract=${state.statement}`);
          paperDetail = "Statement mismatch";
        } else if (contractRefundAfterMs !== undefined && parsed.refundAfterMs !== contractRefundAfterMs) {
          errors.push(`PaperRail refundAfterMs mismatch: note=${parsed.refundAfterMs}, contract=${contractRefundAfterMs}`);
          paperDetail = "refundAfterMs mismatch";
        } else {
          paperRailValid = true;
          paperDetail = `Verified PaperRail record: status=${parsed.status}, lock=${parsed.lock}`;
        }
      }
    } catch (err) {
      errors.push(`PaperRail check error: ${err instanceof Error ? err.message : String(err)}`);
      paperDetail = "Error accessing note";
    }
    checks.push({
      name: "paper-rail-compatibility",
      passed: paperRailValid,
      details: paperDetail,
    });
  }

  // Classification & final determination
  const isTerminal = state.status === "claimed" || state.status === "refunded" || state.status === "cancelled";
  let classification: "VALID" | "INVALID" | "INCOMPLETE" | "UNSUPPORTED" = "VALID";

  if (errors.length > 0 || !allSignaturesValid || !stateMachineValid) {
    classification = "INVALID";
  } else if (!isTerminal) {
    classification = "INCOMPLETE";
  }

  const verified = classification === "VALID";

  return {
    verified,
    contractId: resolvedContract,
    offerId: offerFrame.type === "offer" ? offerFrame.id : undefined,
    classification,
    status: state.status,
    provenance,
    checks,
    errors,
    state,
    frames,
    participants: {
      payerDid: state.payerDid ?? (offerFrame.type === "offer" ? offerFrame.from : undefined),
      payeeDid: state.payeeDid ?? (acceptFrame && acceptFrame.type === "accept" ? acceptFrame.from : undefined),
    },
    timelocks:
      offerFrame.type === "offer"
        ? {
            expiresMs: offerFrame.expiresMs,
            claimByMs: offerFrame.claimByMs,
            refundAfterMs: offerFrame.refundAfterMs,
          }
        : undefined,
    verifiedAt: new Date(nowMs).toISOString(),
  };
}
