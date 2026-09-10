/**
 * Strict Cryptographic & Semantic Verification Pipeline for Public Network Messages.
 *
 * Verifies raw wire observations from Technocore public rooms against cryptographic
 * signatures, frame decoders, and protocol specifications.
 *
 * INVARIANTS:
 * 1. Preserves exact wire bytes / payload for cryptographic integrity.
 * 2. Never weakens signature verification or protocol validations.
 * 3. Categorizes unverified, unsigned, or invalid traffic without discarding observations.
 * 4. Only allows cryptographically valid protocol events to be promoted to trusted civilization state.
 */

import { createHash } from "node:crypto";
import { decodeFrame } from "@flop-labs/tclk";
import { verifyRoomMessage } from "../../technocore/verify.ts";
import { isValidDid } from "../../identity/did.ts";
import { verifyCivilizationEvent } from "../events/verifier.ts";
import type {
  RawPublicWireMessage,
  VerificationStatus,
  ProtocolClassification,
  VerificationPipelineResult,
} from "./types.ts";

/**
 * Computes deterministic SHA-256 hash of raw wire message contents.
 */
export function computeRawHash(rawMsg: RawPublicWireMessage): string {
  const hash = createHash("sha256");
  hash.update(rawMsg.text !== undefined && rawMsg.text !== null ? String(rawMsg.text) : "");
  hash.update(rawMsg.nonce !== undefined && rawMsg.nonce !== null ? String(rawMsg.nonce) : "");
  hash.update(rawMsg.did !== undefined && rawMsg.did !== null ? String(rawMsg.did) : "");
  hash.update(rawMsg.sig !== undefined && rawMsg.sig !== null ? String(rawMsg.sig) : "");
  return hash.digest("hex");
}

export class VerificationPipeline {
  /**
   * Evaluates a single raw wire observation.
   */
  async verifyObservation(
    room: string,
    rawMsg: RawPublicWireMessage,
  ): Promise<VerificationPipelineResult> {
    const rawHash = computeRawHash(rawMsg);
    const did = rawMsg.did ? String(rawMsg.did).trim() : null;
    const sig = rawMsg.sig ? String(rawMsg.sig).trim() : null;
    const nonce = rawMsg.nonce !== undefined && rawMsg.nonce !== null ? String(rawMsg.nonce).trim() : "";
    const text = rawMsg.text !== undefined && rawMsg.text !== null ? String(rawMsg.text) : "";

    // 1. Signature Verification
    let status: VerificationStatus = "UNVERIFIABLE_UNSIGNED";
    let diagnostics: string | undefined;

    if (!did || !sig) {
      status = "UNVERIFIABLE_UNSIGNED";
      diagnostics = "Missing author DID or signature";
    } else if (!isValidDid(did)) {
      status = "UNVERIFIABLE_UNKNOWN_DID";
      diagnostics = `Unsupported or invalid DID format: ${did}`;
    } else {
      try {
        const verifyRes = await verifyRoomMessage(room, {
          did,
          sig,
          nonce,
          text,
        });

        if (verifyRes.verified) {
          status = "VALID_CRYPTOGRAPHIC";
        } else {
          status = "INVALID_SIGNATURE";
          diagnostics = verifyRes.reason || "Cryptographic Ed25519 signature mismatch";
        }
      } catch (err) {
        status = "INVALID_SIGNATURE";
        diagnostics = `Signature verification error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // 2. Protocol Semantic Classification
    let classification: ProtocolClassification = "RAW_TEXT";
    let parsedPayload: unknown = undefined;

    const trimmedText = (rawMsg.text || "").trim();

    // Check TCLK Frame formatting
    try {
      const frame = decodeFrame(trimmedText);
      if (frame && typeof frame === "object" && "type" in frame) {
        parsedPayload = frame;
        switch (frame.type) {
          case "offer":
            classification = "TCLK_CONTRACT_OFFER";
            break;
          case "accept":
            classification = "TCLK_CONTRACT_ACCEPT";
            break;
          case "lock":
          case "reveal":
          case "refund":
          case "cancel":
          case "receipt":
            classification = "TCLK_STEP_EVENT";
            break;
          default:
            classification = "UNSUPPORTED_PROTOCOL";
        }

      }
    } catch {
      // Not a TCLK single-line frame, inspect JSON or raw text
      if (trimmedText.startsWith("{") && trimmedText.endsWith("}")) {
        try {
          const json = JSON.parse(trimmedText) as Record<string, unknown>;
          parsedPayload = json;

          if (
            json &&
            typeof json === "object" &&
            typeof json.type === "string" &&
            ["offer", "accept", "step", "reveal", "claim", "refund", "cancel", "dispute", "verdict"].includes(json.type)
          ) {
            if (json.type === "offer") classification = "TCLK_CONTRACT_OFFER";
            else if (json.type === "accept") classification = "TCLK_CONTRACT_ACCEPT";
            else if (["dispute", "verdict"].includes(json.type)) classification = "TCLK_DISPUTE_EVENT";
            else classification = "TCLK_STEP_EVENT";
          } else if (
            json &&
            typeof json === "object" &&
            ("protocol" in json || "eventType" in json || "event_type" in json)
          ) {
            // Check if it matches civilization-event-v1
            if (json.protocol === "civilization-event-v1" || json.eventType) {
              classification = "CIVILIZATION_EVENT";
              // Perform deep event schema verification if cryptographically valid
              if (status === "VALID_CRYPTOGRAPHIC") {
                const civVerif = await verifyCivilizationEvent(json);
                if (!civVerif.valid) {
                  diagnostics = `Civilization event schema validation failed: ${civVerif.reason}`;
                }
              }
            } else {
              classification = "UNSUPPORTED_PROTOCOL";
            }
          } else if (json && typeof json === "object" && ("message" in json || "body" in json || "content" in json)) {
            classification = "CHAT_MESSAGE";
          } else {
            classification = "NON_PROTOCOL_JSON";
          }
        } catch {
          classification = "RAW_TEXT";
        }
      } else {
        classification = "RAW_TEXT";
      }
    }


    return {
      status,
      classification,
      rawHash,
      extractedDid: did,
      signature: sig,
      parsedPayload,
      diagnostics,
    };
  }

  /**
   * Determines if a verified observation satisfies requirements for promotion to trusted events.
   */
  canPromote(result: VerificationPipelineResult): boolean {
    return (
      result.status === "VALID_CRYPTOGRAPHIC" &&
      (result.classification === "CIVILIZATION_EVENT" ||
        result.classification === "TCLK_CONTRACT_OFFER" ||
        result.classification === "TCLK_CONTRACT_ACCEPT" ||
        result.classification === "TCLK_STEP_EVENT")
    );
  }
}
