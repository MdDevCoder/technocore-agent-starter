/**
 * Civilization Replay Engine.
 *
 * Implements deterministic event stream replay, time-travel projections,
 * and referential/cryptographic validation across an entire civilization event log.
 */

import { verifyCivilizationEvent } from "../events/verifier.ts";
import type { CivilizationEvent } from "../types/events.ts";
import { reduceCivilizationState } from "./reducer.ts";
import { createInitialCivilizationState, type CivilizationState } from "./state.ts";

export interface ReplayOptions {
  /** Verify cryptographic signatures of every event during replay. Defaults to true. */
  readonly verifySignatures?: boolean;
  /** Verify that referenced parent events exist in prior event history. Defaults to true. */
  readonly checkParentReferences?: boolean;
  /** Stop replay at and including this specific eventId (for time-travel debugging). */
  readonly upToEventId?: string;
  /** Stop replay at and including this ISO UTC timestamp. */
  readonly upToTimestamp?: string;
}

export interface ReplayResult {
  readonly state: CivilizationState;
  readonly processedCount: number;
  readonly errors: readonly string[];
  readonly success: boolean;
}

/**
 * Deterministically reconstructs the complete Civilization State from an event stream.
 */
export async function replayCivilizationEvents(
  events: readonly CivilizationEvent[],
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const verifySignatures = options.verifySignatures ?? true;
  const checkParentReferences = options.checkParentReferences ?? true;
  const errors: string[] = [];

  let state = createInitialCivilizationState();
  let processedCount = 0;
  const knownEventIds = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const event = events[i]!;

    // 1. Time-travel bounds checking
    if (options.upToTimestamp && event.timestamp > options.upToTimestamp) {
      break;
    }

    // 2. Cryptographic and structural verification
    if (verifySignatures) {
      const verification = await verifyCivilizationEvent(event);
      if (!verification.valid) {
        errors.push(`Event[${i}] (${event.eventId}, ${event.eventType}): ${verification.reason ?? "Verification failed"}`);
        return {
          state,
          processedCount,
          errors,
          success: false,
        };
      }
    }

    // 3. Parent referential integrity check
    if (checkParentReferences && event.parentEventIds && event.parentEventIds.length > 0) {
      for (const parentId of event.parentEventIds) {
        if (!knownEventIds.has(parentId)) {
          errors.push(
            `Event[${i}] (${event.eventId}, ${event.eventType}) references missing parent eventId: "${parentId}"`,
          );
          return {
            state,
            processedCount,
            errors,
            success: false,
          };
        }
      }
    }

    // 4. Reduce state
    state = reduceCivilizationState(state, event);
    knownEventIds.add(event.eventId);
    processedCount++;

    // 5. Stop if reached targeted event ID
    if (options.upToEventId && event.eventId === options.upToEventId) {
      break;
    }
  }

  return {
    state,
    processedCount,
    errors,
    success: errors.length === 0,
  };
}
