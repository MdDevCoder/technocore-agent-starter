/**
 * Replay Guard & Timestamp Validator for Event Ingestion.
 */

import { isValidIsoUtcTimestamp } from "../types/common.ts";

export interface ReplayCheckResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export class ReplayGuard {
  private readonly recentEventIds = new Set<string>();
  private readonly maxCacheSize: number;

  constructor(maxCacheSize = 10000) {
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Validates that the event timestamp is a valid UTC ISO string and within acceptable clock drift.
   */
  validateTimestamp(timestamp: string, maxSkewSeconds = 300, nowMs: number = Date.now()): ReplayCheckResult {
    if (!isValidIsoUtcTimestamp(timestamp)) {
      return { valid: false, reason: `Invalid ISO 8601 UTC timestamp format: "${timestamp}"` };
    }

    const eventTimeMs = new Date(timestamp).getTime();
    if (Number.isNaN(eventTimeMs)) {
      return { valid: false, reason: "Timestamp could not be parsed to valid epoch millisecond" };
    }

    const diffSeconds = (nowMs - eventTimeMs) / 1000;
    if (Math.abs(diffSeconds) > maxSkewSeconds) {
      return {
        valid: false,
        reason: `Excessive clock skew: event timestamp differs from server time by ${Math.round(diffSeconds)}s (max allowed: ${maxSkewSeconds}s)`,
      };
    }

    return { valid: true };
  }

  /**
   * Tracks an event ID in the fast-rejection in-memory cache.
   */
  markSeen(eventId: string): void {
    if (this.recentEventIds.size >= this.maxCacheSize) {
      // Evict oldest elements when cache reaches limit
      const first = this.recentEventIds.values().next().value;
      if (first) {
        this.recentEventIds.delete(first);
      }
    }
    this.recentEventIds.add(eventId);
  }

  /**
   * Checks if an event ID was recently processed in-memory.
   */
  isRecentlySeen(eventId: string): boolean {
    return this.recentEventIds.has(eventId);
  }

  /**
   * Clears the in-memory cache.
   */
  clear(): void {
    this.recentEventIds.clear();
  }
}
