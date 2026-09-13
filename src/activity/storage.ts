/**
 * Technocore Agent Activity Center — Persistence & Ingestion Engine
 *
 * Provides versioned localStorage persistence under `technocore_activity_v1` with bounded capacity,
 * LRU eviction, deterministic deduplication, and safe in-memory fallback.
 */

import { validateAndSanitizeActivity } from "./schema.ts";
import type { AgentActivityEventV1, IngestActivityInput } from "./types.ts";

export const ACTIVITY_STORAGE_KEY = "technocore_activity_v1";
export const MAX_ACTIVITY_EVENTS = 100;

// Safe in-memory fallback for environments without localStorage or with storage disabled
let inMemoryStore: AgentActivityEventV1[] = [];

/**
 * Generate a deterministic event ID to collapse repeated re-renders, hydration, and polling.
 */
export function generateDeterministicEventId(input: IngestActivityInput): string {
  if (input.id && input.id.trim()) {
    return input.id.trim();
  }

  const src = input.source.toLowerCase();
  const act = input.action.toLowerCase().replace(/[^a-z0-9]/g, "-");

  // If specific details exist, use them for stable identification
  if (input.details) {
    if (input.details.seq !== undefined && input.details.room) {
      return `${src}-${input.details.room}-seq${input.details.seq}-${act}`;
    }
    if (input.details.did) {
      const didFragment = String(input.details.did).slice(-8);
      return `${src}-${didFragment}-${act}`;
    }
    if (input.details.preset) {
      return `${src}-${input.details.preset}-${act}`;
    }
  }

  // Fallback to time-bucketed deterministic ID (by minute)
  const timeMs = typeof input.timestamp === "number" ? input.timestamp : Date.now();
  const minuteBucket = Math.floor(timeMs / 60000);
  return `${src}-${act}-${minuteBucket}`;
}

/**
 * Check whether an identical or near-duplicate event already exists.
 */
export function isDuplicateEvent(
  events: readonly AgentActivityEventV1[],
  candidate: AgentActivityEventV1,
): boolean {
  // 1. Direct ID match
  if (events.some((e) => e.id === candidate.id)) {
    return true;
  }

  // 2. Semantic deduplication: same source, action, summary within 30 seconds
  const candidateTime = new Date(candidate.timestamp).getTime();
  return events.some((e) => {
    if (e.source !== candidate.source || e.action !== candidate.action || e.summary !== candidate.summary) {
      return false;
    }
    const existingTime = new Date(e.timestamp).getTime();
    return Math.abs(candidateTime - existingTime) < 30000;
  });
}

/**
 * Load all recorded activity events from storage (newest first).
 */
export function loadAllActivities(): AgentActivityEventV1[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [...inMemoryStore];
  }

  try {
    const raw = window.localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const validated: AgentActivityEventV1[] = [];
    for (const item of parsed) {
      try {
        if (item && typeof item === "object") {
          const valid = validateAndSanitizeActivity(item, item.id || `evt-${Date.now()}`);
          validated.push(valid);
        }
      } catch {
        // Skip corrupted or unparseable item
      }
    }

    // Sort newest first
    validated.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return validated.slice(0, MAX_ACTIVITY_EVENTS);
  } catch {
    return [...inMemoryStore];
  }
}

/**
 * Save array of activity events to storage (bounded to MAX_ACTIVITY_EVENTS).
 */
function persistActivities(events: AgentActivityEventV1[]): void {
  // Enforce sort and capacity limit
  const bounded = [...events]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_ACTIVITY_EVENTS);

  inMemoryStore = bounded;

  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(bounded));
    // Dispatch local notification event
    window.dispatchEvent(new CustomEvent("technocore:activity:updated", { detail: { count: bounded.length } }));
  } catch (err) {
    console.warn("Unable to persist activity event to localStorage, utilizing in-memory cache:", err);
  }
}

/**
 * Shared Ingestion API: emit a safe factual activity event.
 * Validates, sanitizes, deduplicates, and saves.
 */
export function emitSafeActivityEvent(input: IngestActivityInput): AgentActivityEventV1 | null {
  try {
    const deterministicId = generateDeterministicEventId(input);
    const sanitized = validateAndSanitizeActivity(input, deterministicId);

    const existing = loadAllActivities();

    if (isDuplicateEvent(existing, sanitized)) {
      return null; // Collapsed duplicate
    }

    const updated = [sanitized, ...existing];
    persistActivities(updated);
    return sanitized;
  } catch (err) {
    console.warn("Failed to ingest activity event:", err);
    return null;
  }
}

/**
 * Delete a specific activity event by ID.
 */
export function deleteActivityEvent(id: string): boolean {
  const current = loadAllActivities();
  const filtered = current.filter((e) => e.id !== id);
  if (filtered.length !== current.length) {
    persistActivities(filtered);
    return true;
  }
  return false;
}

/**
 * Clear ONLY the activity history storage namespace.
 * Guarantees zero side effects on identity, backup, workspace, evidence, or network state.
 */
export function clearAllActivities(): void {
  inMemoryStore = [];
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(ACTIVITY_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("technocore:activity:updated", { detail: { count: 0 } }));
    } catch {
      // Ignore
    }
  }
}
