/**
 * Technocore Contribution Center — Storage & State Persistence
 *
 * Persists lightweight contribution items in localStorage under `technocore_contributions_v1`.
 *
 * STORAGE RULES:
 * - Max 25 contributions.
 * - LRU eviction when limit exceeded.
 * - Safe in-memory fallback for SSR and quota errors.
 * - ZERO secrets or private keys allowed.
 */

import type { ContributionItemV1, ContributionSummaryStats } from "./types.ts";
import { containsForbiddenSecrets } from "../activity/schema.ts";

export const CONTRIBUTIONS_STORAGE_KEY = "technocore_contributions_v1";
export const MAX_STORED_CONTRIBUTIONS = 25;

// In-memory fallback
let memoryStorage: ContributionItemV1[] = [];

function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    const testKey = "__contrib_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load all stored contributions from storage.
 */
export function loadAllContributions(): ContributionItemV1[] {
  if (!isLocalStorageAvailable()) {
    return [...memoryStorage];
  }

  try {
    const raw = window.localStorage.getItem(CONTRIBUTIONS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Filter out malformed entries or secret-tainted items
    const valid = parsed.filter((item): item is ContributionItemV1 => {
      return (
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.topic === "string" &&
        typeof item.contributionUrl === "string" &&
        !containsForbiddenSecrets(item)
      );
    });

    return valid;
  } catch {
    return [...memoryStorage];
  }
}

/**
 * Save or update a contribution item.
 * Enforces max 25 bounds with LRU pruning.
 */
export function saveContribution(item: ContributionItemV1): ContributionItemV1[] {
  if (containsForbiddenSecrets(item)) {
    throw new Error("Cannot save contribution containing forbidden secrets.");
  }

  const existing = loadAllContributions();
  const existingIdx = existing.findIndex((c) => c.id === item.id);

  let updatedList: ContributionItemV1[];

  const updatedItem: ContributionItemV1 = {
    ...item,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    // Replace and move to front
    updatedList = [
      updatedItem,
      ...existing.filter((_, idx) => idx !== existingIdx),
    ];
  } else {
    // Prepend new item
    updatedList = [updatedItem, ...existing];
  }

  // Enforce bounded limit with LRU pruning
  if (updatedList.length > MAX_STORED_CONTRIBUTIONS) {
    updatedList = updatedList.slice(0, MAX_STORED_CONTRIBUTIONS);
  }

  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.setItem(CONTRIBUTIONS_STORAGE_KEY, JSON.stringify(updatedList));
    } catch {
      memoryStorage = updatedList;
    }
  } else {
    memoryStorage = updatedList;
  }

  return updatedList;
}

/**
 * Get a single contribution by ID.
 */
export function getContributionById(id: string): ContributionItemV1 | undefined {
  const all = loadAllContributions();
  return all.find((c) => c.id === id);
}

/**
 * Delete a specific contribution by ID.
 */
export function deleteContribution(id: string): ContributionItemV1[] {
  const existing = loadAllContributions();
  const updatedList = existing.filter((c) => c.id !== id);

  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.setItem(CONTRIBUTIONS_STORAGE_KEY, JSON.stringify(updatedList));
    } catch {
      memoryStorage = updatedList;
    }
  } else {
    memoryStorage = updatedList;
  }

  return updatedList;
}

/**
 * Clear all contributions from storage.
 * Strictly affects ONLY `technocore_contributions_v1`.
 */
export function clearAllContributions(): void {
  memoryStorage = [];
  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.removeItem(CONTRIBUTIONS_STORAGE_KEY);
    } catch {
      // Ignored
    }
  }
}

/**
 * Compute summary statistics over contributions.
 */
export function computeContributionStats(items: ContributionItemV1[]): ContributionSummaryStats {
  let verifiedContributions = 0;
  let preservedContributions = 0;
  let completeContributions = 0;
  let pendingContributions = 0;

  for (const item of items) {
    if (item.status === "COMPLETE") {
      completeContributions++;
    } else if (item.status === "DRAFT" || item.status === "ARTIFACT_READY" || item.status === "RECORD_PENDING") {
      pendingContributions++;
    }

    if (item.isVerified) {
      verifiedContributions++;
    }
    if (item.isEvidencePreserved) {
      preservedContributions++;
    }
  }

  return {
    totalContributions: items.length,
    verifiedContributions,
    preservedContributions,
    completeContributions,
    pendingContributions,
  };
}
