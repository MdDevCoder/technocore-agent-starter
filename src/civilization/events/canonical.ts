/**
 * Canonical serialization for Civilization Events.
 *
 * Reuses the trusted `canonicalBytes` implementation from `src/crypto/canonical.ts`
 * to ensure that all JSON fields are sorted by Unicode code point, numbers are validated as safe integers,
 * and strings with lone surrogates are strictly audited.
 *
 * Defines the precise fields included in the signed payload.
 */

import { canonicalBytes, canonicalize, type JsonValue } from "../../crypto/canonical.ts";
import type { CivilizationEvent, CivilizationEventType, SignedCivilizationContent } from "../types/events.ts";

/**
 * Extracts the exact SignedContent from an event (or unsigned event parameters)
 * ensuring the `signature` field itself is excluded.
 */
export function extractSignedContent<TType extends CivilizationEventType = CivilizationEventType>(
  eventOrContent: CivilizationEvent<TType> | SignedCivilizationContent<TType>,
): SignedCivilizationContent<TType> {
  return {
    protocol: eventOrContent.protocol,
    version: eventOrContent.version,
    eventId: eventOrContent.eventId,
    eventType: eventOrContent.eventType,
    timestamp: eventOrContent.timestamp,
    authorDid: eventOrContent.authorDid,
    missionId: eventOrContent.missionId,
    taskId: eventOrContent.taskId ?? null,
    parentEventIds: Array.isArray(eventOrContent.parentEventIds) ? [...eventOrContent.parentEventIds] : [],
    payload: eventOrContent.payload,
  };
}

/**
 * Generates the canonical UTF-8 bytes over the signed content of a civilization event.
 */
export function canonicalEventBytes<TType extends CivilizationEventType = CivilizationEventType>(
  eventOrContent: CivilizationEvent<TType> | SignedCivilizationContent<TType>,
): Uint8Array {
  const content = extractSignedContent(eventOrContent);
  return canonicalBytes(content as unknown as JsonValue);
}

/**
 * Generates the canonical JSON string over the signed content.
 */
export function canonicalEventString<TType extends CivilizationEventType = CivilizationEventType>(
  eventOrContent: CivilizationEvent<TType> | SignedCivilizationContent<TType>,
): string {
  const content = extractSignedContent(eventOrContent);
  return canonicalize(content as unknown as JsonValue);
}
