/**
 * Technocore Contract & Protocol Interoperability Test Harness (TCLK-TestKit)
 *
 * Standalone, deterministic, local-first evaluation engine for Technocore Lock Protocol (tclk/1)
 * contract frames and state transitions.
 *
 * Invariants & Guarantees:
 * - Pure deterministic evaluation: (state, frame) => (result, nextState)
 * - Zero external mutations: Never creates public deals, never broadcasts to Technocore, never touches funds.
 * - Authoritative protocol fidelity: Uses canonical @flop-labs/tclk parsing, canonicalization, and state rules.
 */

import {
  TCLK_VERSION,
  TCLK_PREFIX,
  MAX_FRAME_CHARS,
  canonicalJson,
  offerId as computeOfferId,
  validateFrame as validateFrameStructural,
  decodeFrame as decodeFrameCanonical,
  isTclkLine,
  openContract,
  applyFrame,
  makeOffer,
  makeAccept,
  generateHashLock,
  type OfferFields,
  type OfferFrame,
  type AcceptFrame,
  type LockFrame,
  type RevealFrame,
  type RefundFrame,
  type CancelFrame,
  type ReceiptFrame,
  type TclkFrame,
  type TclkStatus,
  type ContractState,
  type LockKind,
} from "@flop-labs/tclk";
import { isValidDid } from "../../identity/did.ts";
import { computeSha256Hex } from "../diagnostics/permutations.ts";

export interface FrameValidationResult {
  readonly valid: boolean;
  readonly frameType?: TclkFrame["type"];
  readonly frame?: TclkFrame;
  readonly canonicalWireText?: string;
  readonly wireSha256?: string;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly schemaDetails?: {
    readonly version: string;
    readonly fromDid: string;
    readonly targetContractId?: string;
    readonly amount?: string;
    readonly asset?: string;
    readonly lockKind?: LockKind;
    readonly statement?: string;
    readonly secret?: string;
  };
}

export interface TestKitContractState {
  readonly status: TclkStatus;
  readonly offer: OfferFrame;
  readonly contractId?: string;
  readonly offerId: string;
  readonly payerDid?: string;
  readonly payeeDid?: string;
  readonly lockKind: LockKind;
  readonly statement?: string;
  readonly rail?: string;
  readonly railRef?: string;
  readonly secret?: string;
  readonly appliedFrames: readonly TclkFrame[];
  readonly frameHashes: readonly string[];
  readonly lastUpdatedMs: number;
}

export interface TransitionEvaluationResult {
  readonly accepted: boolean;
  readonly transitionName: string;
  readonly previousStatus: TclkStatus | "none";
  readonly nextStatus: TclkStatus;
  readonly nextState: TestKitContractState | null;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly evidenceHash: string;
}

export interface LifecycleStepReport {
  readonly stepIndex: number;
  readonly frameType: TclkFrame["type"];
  readonly frame: TclkFrame;
  readonly accepted: boolean;
  readonly statusBefore: TclkStatus | "none";
  readonly statusAfter: TclkStatus | "none";
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly evidenceHash: string;
}

export interface LifecycleSimulationResult {
  readonly success: boolean;
  readonly totalSteps: number;
  readonly acceptedSteps: number;
  readonly rejectedSteps: number;
  readonly initialStatus: TclkStatus | "none";
  readonly finalStatus: TclkStatus | "none";
  readonly finalContractId?: string;
  readonly steps: readonly LifecycleStepReport[];
  readonly finalState: TestKitContractState | null;
  readonly summary: string;
}

/**
 * Validates a TCLK frame structurally and semantically without mutating state.
 */
export async function validateTclkFrame(
  rawInput: string | Record<string, unknown> | TclkFrame
): Promise<FrameValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let frameObj: TclkFrame | null = null;
  let rawText = "";

  // 1. Parsing and Input Normalization
  if (typeof rawInput === "string") {
    rawText = rawInput.trim();
    if (rawText.length > MAX_FRAME_CHARS) {
      errors.push(`Frame exceeds maximum length of ${MAX_FRAME_CHARS} characters (received ${rawText.length})`);
    }

    if (!isTclkLine(rawText)) {
      if (!rawText.startsWith("{")) {
        errors.push(`Frame text does not begin with mandatory prefix '${TCLK_PREFIX}'`);
      } else {
        warnings.push(`Frame provided as raw JSON without '${TCLK_PREFIX}' protocol prefix.`);
      }
    }

    try {
      if (rawText.startsWith(TCLK_PREFIX)) {
        frameObj = decodeFrameCanonical(rawText);
      } else if (rawText.startsWith("{")) {
        const parsed = JSON.parse(rawText);
        try {
          frameObj = validateFrameStructural(parsed);
        } catch {
          // If it's an offer missing id, allow semantic validation
          if (parsed && typeof parsed === "object" && parsed.type === "offer") {
            frameObj = parsed as TclkFrame;
          } else {
            throw new Error(`Invalid TCLK frame structure`);
          }
        }
      } else {
        errors.push("Input is neither a valid 'tclk1 ' wire line nor raw JSON object.");
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  } else if (typeof rawInput === "object" && rawInput !== null) {
    try {
      frameObj = validateFrameStructural(rawInput);
    } catch {
      // If it's a draft offer or missing id, preserve for semantic inspection
      if ("type" in rawInput && typeof rawInput["type"] === "string") {
        frameObj = rawInput as unknown as TclkFrame;
      } else {
        errors.push("Invalid input structure: missing required 'type' discriminator.");
      }
    }
  } else {
    errors.push("Invalid input type: expected JSON string or TclkFrame object.");
  }

  if (!frameObj) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  // 2. DID Syntax Validation
  if (frameObj.from && !isValidDid(frameObj.from)) {
    errors.push(`Author DID '${frameObj.from}' is not a valid Ed25519 did:key (must start with 'did:key:z6Mk')`);
  }

  // 3. Frame-Specific Semantic Rules
  let targetContractId: string | undefined;
  let amountStr: string | undefined;
  let assetStr: string | undefined;
  let lockKind: LockKind | undefined;
  let statementStr: string | undefined;
  let secretStr: string | undefined;

  switch (frameObj.type) {
    case "offer": {
      const offer = frameObj as OfferFrame;
      amountStr = offer.amount;
      assetStr = offer.asset;
      lockKind = offer.lock;

      if (!/^[1-9]\d*$/.test(offer.amount)) {
        errors.push(`Offer amount must be a positive decimal integer string without leading zeroes: '${offer.amount}'`);
      }
      if (!offer.asset || typeof offer.asset !== "string") {
        errors.push("Offer asset identifier must be a non-empty string.");
      }
      if (!Array.isArray(offer.rails) || offer.rails.length === 0) {
        errors.push("Offer must specify at least one supported settlement rail.");
      }
      if (offer.claimByMs <= 0 || offer.refundAfterMs <= 0 || offer.expiresMs <= 0) {
        errors.push("All offer deadlines (claimByMs, refundAfterMs, expiresMs) must be positive epoch timestamps.");
      }
      if (offer.refundAfterMs <= offer.claimByMs) {
        errors.push(`refundAfterMs (${offer.refundAfterMs}) must be strictly after claimByMs (${offer.claimByMs}) to prevent claim/refund race conditions.`);
      }

      // Recompute and verify offer ID
      try {
        const offerBody: Record<string, unknown> = { ...offer };
        delete offerBody["id"];
        const computedId = computeOfferId(offerBody as unknown as OfferFields);
        if (offer.id && offer.id !== computedId) {
          errors.push(`Offer ID mismatch: specified '${offer.id}', expected '${computedId}'`);
        }
      } catch (err) {
        errors.push(`Failed to compute offer ID: ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }

    case "accept": {
      const accept = frameObj as AcceptFrame;
      targetContractId = accept.contract;
      statementStr = accept.statement;

      if (!accept.ref || !/^0x[0-9a-f]{64}$/i.test(accept.ref)) {
        errors.push(`Accept ref must be a 32-byte 0x-hex offer ID (66 characters starting with 0x): '${accept.ref}'`);
      }
      if (!accept.statement || typeof accept.statement !== "string") {
        errors.push("Accept frame must include a cryptographic lock statement.");
      }
      break;
    }

    case "lock": {
      const lock = frameObj as LockFrame;
      targetContractId = lock.contract;
      if (!lock.rail || typeof lock.rail !== "string") {
        errors.push("Lock frame must specify a settlement rail identifier.");
      }
      if (!lock.ref || typeof lock.ref !== "string") {
        errors.push("Lock frame must specify a rail-specific reference (escrow ID, txid, payment ID).");
      }
      break;
    }

    case "reveal": {
      const reveal = frameObj as RevealFrame;
      targetContractId = reveal.contract;
      secretStr = reveal.secret;
      if (!reveal.secret || typeof reveal.secret !== "string") {
        errors.push("Reveal frame must contain a revealed preimage or scalar witness secret.");
      }
      break;
    }

    case "refund": {
      const refund = frameObj as RefundFrame;
      targetContractId = refund.contract;
      break;
    }

    case "cancel": {
      const cancel = frameObj as CancelFrame;
      targetContractId = cancel.contract;
      break;
    }

    case "receipt": {
      const receipt = frameObj as ReceiptFrame;
      targetContractId = receipt.contract;
      if (!["claimed", "refunded", "cancelled"].includes(receipt.outcome)) {
        errors.push(`Receipt outcome must be one of 'claimed', 'refunded', or 'cancelled': received '${receipt.outcome}'`);
      }
      break;
    }

    default:
      errors.push(`Unknown or unsupported TCLK frame type: '${(frameObj as { type: string }).type}'`);
  }

  // 4. Canonical Wire Representation & SHA-256
  let canonicalWireText = "";
  let wireSha256 = "";
  try {
    const compact = canonicalJson(frameObj);
    canonicalWireText = `${TCLK_PREFIX}${compact}`;
    const wireBytes = new TextEncoder().encode(canonicalWireText);
    wireSha256 = await computeSha256Hex(wireBytes);
  } catch (err) {
    warnings.push(`Could not generate canonical wire representation: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    valid: errors.length === 0,
    frameType: frameObj.type,
    frame: frameObj,
    canonicalWireText,
    wireSha256,
    errors,
    warnings,
    schemaDetails: {
      version: TCLK_VERSION,
      fromDid: frameObj.from,
      targetContractId,
      amount: amountStr,
      asset: assetStr,
      lockKind,
      statement: statementStr,
      secret: secretStr,
    },
  };
}

/**
 * Pure state machine transition evaluator.
 * Computes: (currentState, candidateFrame) => (result, nextState)
 */
export async function evaluateStateTransition(
  currentState: TestKitContractState | null,
  candidateFrame: TclkFrame,
  options: { nowMs?: number; authorDid?: string } = {}
): Promise<TransitionEvaluationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nowMs = options.nowMs ?? Date.now();

  // 1. Initial Offer Opening
  if (!currentState) {
    if (candidateFrame.type !== "offer") {
      errors.push(`Cannot apply frame of type '${candidateFrame.type}' without an existing contract state. First frame must be 'offer'.`);
      return {
        accepted: false,
        transitionName: "ILLEGAL_INITIAL_FRAME",
        previousStatus: "none",
        nextStatus: "proposed",
        nextState: null,
        errors,
        warnings,
        evidenceHash: "",
      };
    }

    const offer = candidateFrame as OfferFrame;
    try {
      const initialContractState = openContract(offer);
      const computedId = computeOfferId(offer);
      const wireText = `${TCLK_PREFIX}${canonicalJson(offer)}`;
      const wireHash = await computeSha256Hex(new TextEncoder().encode(wireText));

      const nextKitState: TestKitContractState = {
        status: initialContractState.status,
        offer,
        offerId: computedId,
        payerDid: offer.role === "payer" ? offer.from : undefined,
        payeeDid: offer.role === "payee" ? offer.from : undefined,
        lockKind: offer.lock,
        appliedFrames: [offer],
        frameHashes: [wireHash],
        lastUpdatedMs: nowMs,
      };

      return {
        accepted: true,
        transitionName: "OFFER_PROPOSED",
        previousStatus: "none",
        nextStatus: "proposed",
        nextState: nextKitState,
        errors: [],
        warnings: [],
        evidenceHash: wireHash,
      };
    } catch (err) {
      errors.push(`Failed to open contract from offer: ${err instanceof Error ? err.message : String(err)}`);
      return {
        accepted: false,
        transitionName: "INVALID_OFFER_OPENING",
        previousStatus: "none",
        nextStatus: "proposed",
        nextState: null,
        errors,
        warnings,
        evidenceHash: "",
      };
    }
  }

  // 2. Invariant: Duplicate / Replay Check
  const wireText = `${TCLK_PREFIX}${canonicalJson(candidateFrame)}`;
  const wireHash = await computeSha256Hex(new TextEncoder().encode(wireText));
  if (currentState.frameHashes.includes(wireHash)) {
    errors.push(`Duplicate frame detected: identical payload has already been applied in this contract history.`);
    return {
      accepted: false,
      transitionName: "DUPLICATE_REPLAY_REJECTED",
      previousStatus: currentState.status,
      nextStatus: currentState.status,
      nextState: currentState,
      errors,
      warnings,
      evidenceHash: wireHash,
    };
  }

  // 3. Terminal State Invariant
  if (["claimed", "refunded", "cancelled"].includes(currentState.status)) {
    errors.push(`Contract is already in terminal state '${currentState.status}'. No further state transitions allowed.`);
    return {
      accepted: false,
      transitionName: "TERMINAL_STATE_LOCKED",
      previousStatus: currentState.status,
      nextStatus: currentState.status,
      nextState: currentState,
      errors,
      warnings,
      evidenceHash: wireHash,
    };
  }

  // 4. Contract ID Binding Invariant
  if (candidateFrame.type !== "offer") {
    if (candidateFrame.type === "accept") {
      const accept = candidateFrame as AcceptFrame;
      if (accept.ref !== currentState.offerId) {
        errors.push(`Accept ref '${accept.ref}' does not match active offer ID '${currentState.offerId}'.`);
      }
    } else {
      const typedFrame = candidateFrame as { contract?: string };
      if (currentState.contractId && typedFrame.contract !== currentState.contractId) {
        errors.push(`Frame contract ID '${typedFrame.contract}' does not match active contract ID '${currentState.contractId}'.`);
      }
    }
  }

  // 5. Apply Frame using Canonical @flop-labs/tclk State Machine
  const internalState: ContractState = {
    status: currentState.status,
    offer: currentState.offer,
    payerDid: currentState.payerDid,
    payeeDid: currentState.payeeDid,
    contract: currentState.contractId,
    statement: currentState.statement,
    rail: currentState.rail,
    railRef: currentState.railRef,
    secret: currentState.secret,
  };

  const stepResult = applyFrame(internalState, candidateFrame, nowMs);

  if (!stepResult.ok) {
    errors.push(stepResult.reason || `Transition rejected by TCLK protocol rules for status '${currentState.status}'.`);
    return {
      accepted: false,
      transitionName: `REJECTED_${candidateFrame.type.toUpperCase()}`,
      previousStatus: currentState.status,
      nextStatus: currentState.status,
      nextState: currentState, // State preserved intact
      errors,
      warnings,
      evidenceHash: wireHash,
    };
  }

  // Transition Accepted: Construct updated state
  let nextContractId = currentState.contractId;
  if (candidateFrame.type === "accept") {
    nextContractId = (candidateFrame as AcceptFrame).contract;
  }

  const nextKitState: TestKitContractState = {
    status: stepResult.state.status,
    offer: stepResult.state.offer,
    contractId: nextContractId,
    offerId: currentState.offerId,
    payerDid: stepResult.state.payerDid,
    payeeDid: stepResult.state.payeeDid,
    lockKind: currentState.lockKind,
    statement: stepResult.state.statement ?? currentState.statement,
    rail: stepResult.state.rail ?? currentState.rail,
    railRef: stepResult.state.railRef ?? currentState.railRef,
    secret: stepResult.state.secret ?? currentState.secret,
    appliedFrames: [...currentState.appliedFrames, candidateFrame],
    frameHashes: [...currentState.frameHashes, wireHash],
    lastUpdatedMs: nowMs,
  };

  return {
    accepted: true,
    transitionName: `${currentState.status.toUpperCase()}_TO_${stepResult.state.status.toUpperCase()}`,
    previousStatus: currentState.status,
    nextStatus: stepResult.state.status,
    nextState: nextKitState,
    errors: [],
    warnings: [],
    evidenceHash: wireHash,
  };
}

/**
 * Simulates an entire lifecycle of TCLK frames sequentially.
 */
export async function simulateTclkLifecycle(
  frames: readonly (TclkFrame | string)[],
  options: { initialNowMs?: number; stepAdvanceMs?: number } = {}
): Promise<LifecycleSimulationResult> {
  const stepAdvanceMs = options.stepAdvanceMs ?? 1000;
  let currentClock = options.initialNowMs ?? 1789200000000;
  let currentState: TestKitContractState | null = null;
  const steps: LifecycleStepReport[] = [];
  let acceptedSteps = 0;
  let rejectedSteps = 0;

  for (let i = 0; i < frames.length; i++) {
    const raw = frames[i]!;
    let frame: TclkFrame;

    if (typeof raw === "string") {
      const val = await validateTclkFrame(raw);
      if (!val.valid || !val.frame) {
        steps.push({
          stepIndex: i + 1,
          frameType: (val.frameType ?? "offer") as TclkFrame["type"],
          frame: (val.frame ?? { type: "offer" }) as TclkFrame,
          accepted: false,
          statusBefore: currentState?.status ?? "none",
          statusAfter: currentState?.status ?? "none",
          errors: val.errors,
          warnings: val.warnings,
          evidenceHash: "",
        });
        rejectedSteps++;
        continue;
      }
      frame = val.frame;
    } else {
      frame = raw;
    }

    const beforeStatus = currentState?.status ?? "none";
    const res = await evaluateStateTransition(currentState, frame, { nowMs: currentClock });

    steps.push({
      stepIndex: i + 1,
      frameType: frame.type,
      frame,
      accepted: res.accepted,
      statusBefore: beforeStatus,
      statusAfter: res.nextStatus,
      errors: res.errors,
      warnings: res.warnings,
      evidenceHash: res.evidenceHash,
    });

    if (res.accepted && res.nextState) {
      currentState = res.nextState;
      acceptedSteps++;
    } else {
      rejectedSteps++;
    }

    currentClock += stepAdvanceMs;
  }

  const allAccepted = rejectedSteps === 0 && steps.length > 0;
  const summary = allAccepted
    ? `Successfully simulated ${steps.length} lifecycle step(s). Final state: ${currentState?.status.toUpperCase()}`
    : `Simulation encountered ${rejectedSteps} rejected transition(s) out of ${steps.length} total step(s).`;

  return {
    success: allAccepted,
    totalSteps: steps.length,
    acceptedSteps,
    rejectedSteps,
    initialStatus: steps[0]?.statusBefore ?? "none",
    finalStatus: currentState?.status ?? "none",
    finalContractId: currentState?.contractId,
    steps,
    finalState: currentState,
    summary,
  };
}

/**
 * Executes a canonical 4-stage bilateral settlement (offer -> accept -> lock -> reveal)
 * in-memory simulation and returns the resulting lifecycle simulation report.
 *
 * Guaranteed offline and deterministic; zero network broadcast or private key usage.
 */
export async function runCanonicalTclkSettlementSimulation(
  initialNowMs: number = 1789200000000,
): Promise<LifecycleSimulationResult> {
  const payerDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
  const payeeDid = "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG";
  const baseClock = initialNowMs;

  const offer = makeOffer({
    from: payerDid,
    role: "payer",
    amount: "1000",
    asset: "FLOP",
    lock: "hash",
    rails: ["paper"],
    expiresMs: baseClock + 3600000,
    claimByMs: baseClock + 7200000,
    refundAfterMs: baseClock + 10800000,
  });
  const hashLock = generateHashLock();
  const accept = makeAccept(offer, { from: payeeDid, statement: hashLock.hash });
  const contractId = accept.contract;
  const lock: LockFrame = { type: "lock", from: payerDid, contract: contractId, rail: "paper", ref: "ref-canonical-sim" };
  const reveal: RevealFrame = { type: "reveal", from: payeeDid, contract: contractId, secret: hashLock.preimage };

  return simulateTclkLifecycle([offer, accept, lock, reveal], { initialNowMs: baseClock });
}

