/**
 * Common identifiers, constants, and utility types for the Civilization Protocol.
 *
 * All identifiers follow strict prefix conventions to prevent ambiguous IDs
 * across entities in the event ledger.
 */

import { isValidDid } from "../../identity/did.ts";

export const CIVILIZATION_PROTOCOL = "civilization-event-v1" as const;
export type CivilizationProtocol = typeof CIVILIZATION_PROTOCOL;

export const CIVILIZATION_PROTOCOL_VERSION = "1.0.0" as const;
export type CivilizationProtocolVersion = typeof CIVILIZATION_PROTOCOL_VERSION;

export type DidString = string;
export type IsoUtcTimestamp = string;
export type SignatureProof = string;

export type EventId = `evt_${string}`;
export type MissionId = `mis_${string}`;
export type TaskId = `tsk_${string}`;
export type DisputeId = `dsp_${string}`;
export type DeliverableId = `del_${string}`;

/** Validate an ISO 8601 UTC timestamp string. */
export function isValidIsoUtcTimestamp(timestamp: string): boolean {
  if (typeof timestamp !== "string") return false;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  if (!isoRegex.test(timestamp)) return false;
  const date = new Date(timestamp);
  return !Number.isNaN(date.getTime());
}

/** Generate a cryptographically random prefixed identifier. */
export function generatePrefixedId<T extends string>(prefix: string, bytesLength = 12): T {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return `${prefix}_${hex}` as T;
}

export function generateEventId(): EventId {
  return generatePrefixedId<EventId>("evt", 12);
}

export function generateMissionId(): MissionId {
  return generatePrefixedId<MissionId>("mis", 8);
}

export function generateTaskId(): TaskId {
  return generatePrefixedId<TaskId>("tsk", 8);
}

export function generateDisputeId(): DisputeId {
  return generatePrefixedId<DisputeId>("dsp", 8);
}

export function generateDeliverableId(): DeliverableId {
  return generatePrefixedId<DeliverableId>("del", 8);
}

export function assertValidDid(did: string, context = "DID"): void {
  if (!isValidDid(did)) {
    throw new Error(`${context}: invalid Ed25519 DID identifier: "${did}"`);
  }
}
