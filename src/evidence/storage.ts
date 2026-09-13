/**
 * Technocore Contribution Evidence Vault — Local Storage Repository
 *
 * Persists evidence records to localStorage under a dedicated versioned namespace.
 * Enforces strict capacity bounds (max 50 records, max 200KB), allowlists, and memory fallback.
 */

import { validateEvidenceSchema } from "./schema.ts";
import type { ContributionEvidenceV1, EvidenceStorageSummary } from "./types.ts";

export const EVIDENCE_STORAGE_KEY = "technocore_evidence_v1";
export const MAX_STORED_EVIDENCE_RECORDS = 50;
export const MAX_STORAGE_BYTES = 200 * 1024; // 200 KB

let memoryStore: ContributionEvidenceV1[] = [];

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const testKey = "__evidence_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load all stored evidence records, validating each against the strict schema.
 */
export function loadAllEvidence(): ContributionEvidenceV1[] {
  if (!isLocalStorageAvailable()) {
    return [...memoryStore];
  }

  try {
    const raw = window.localStorage.getItem(EVIDENCE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const sanitized: ContributionEvidenceV1[] = [];
    for (const item of parsed) {
      try {
        const valid = validateEvidenceSchema(item);
        sanitized.push(valid);
      } catch {
        // Skip corrupted or tampered record
      }
    }
    return sanitized;
  } catch {
    return [];
  }
}

/**
 * Save an evidence record to the local repository.
 */
export function saveEvidence(item: ContributionEvidenceV1): { success: boolean; reason?: string } {
  try {
    const valid = validateEvidenceSchema(item);
    const existing = loadAllEvidence();

    // Check for duplicate by evidenceSha256
    const filtered = existing.filter((e) => e.evidenceSha256 !== valid.evidenceSha256);

    if (filtered.length >= MAX_STORED_EVIDENCE_RECORDS) {
      return {
        success: false,
        reason: `Vault capacity reached (maximum ${MAX_STORED_EVIDENCE_RECORDS} records). Please export or delete older records.`,
      };
    }

    const updated = [valid, ...filtered];
    const serialized = JSON.stringify(updated);

    if (serialized.length > MAX_STORAGE_BYTES) {
      return {
        success: false,
        reason: `Storage size limit exceeded (${Math.round(serialized.length / 1024)} KB / ${MAX_STORAGE_BYTES / 1024} KB limit).`,
      };
    }

    if (isLocalStorageAvailable()) {
      window.localStorage.setItem(EVIDENCE_STORAGE_KEY, serialized);
    } else {
      memoryStore = updated;
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, reason: msg };
  }
}

/**
 * Delete a specific evidence record by its integrity hash.
 */
export function deleteEvidence(evidenceSha256: string): boolean {
  try {
    const existing = loadAllEvidence();
    const updated = existing.filter((e) => e.evidenceSha256 !== evidenceSha256);

    if (updated.length === existing.length) return false;

    if (isLocalStorageAvailable()) {
      window.localStorage.setItem(EVIDENCE_STORAGE_KEY, JSON.stringify(updated));
    } else {
      memoryStore = updated;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all evidence from the local repository.
 */
export function clearAllEvidence(): void {
  if (isLocalStorageAvailable()) {
    window.localStorage.removeItem(EVIDENCE_STORAGE_KEY);
  }
  memoryStore = [];
}

/**
 * Get storage capacity summary.
 */
export function getStorageSummary(): EvidenceStorageSummary {
  const records = loadAllEvidence();
  const raw = isLocalStorageAvailable()
    ? window.localStorage.getItem(EVIDENCE_STORAGE_KEY) || "[]"
    : JSON.stringify(memoryStore);

  return {
    count: records.length,
    maxCapacity: MAX_STORED_EVIDENCE_RECORDS,
    totalBytes: raw.length,
    maxBytes: MAX_STORAGE_BYTES,
  };
}
