/**
 * Technocore Agent Activity Center — Filtering & Summary Calculations
 */

import type {
  ActivityFilterState,
  ActivitySummaryStats,
  AgentActivityEventV1,
} from "./types.ts";

/**
 * Filter an activity list according to current user filter selections.
 */
export function filterActivities(
  events: readonly AgentActivityEventV1[],
  filter: ActivityFilterState,
): AgentActivityEventV1[] {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  return events.filter((evt) => {
    // 1. Provenance / Badge Category filter
    if (filter.provenance === "VERIFIED") {
      if (!evt.isVerified) return false;
    } else if (filter.provenance === "ATTENTION") {
      if (evt.status !== "ATTENTION" && evt.status !== "FAILED") return false;
    } else if (filter.provenance !== "ALL") {
      if (evt.provenance !== filter.provenance) return false;
    }

    // 2. Source filter
    if (filter.source !== "ALL" && evt.source !== filter.source) {
      return false;
    }

    // 3. Time range filter
    if (filter.timeRange !== "ALL_TIME") {
      const evtTime = new Date(evt.timestamp).getTime();
      const ageMs = now - evtTime;

      if (filter.timeRange === "TODAY") {
        if (ageMs > oneDayMs) return false;
      } else if (filter.timeRange === "7_DAYS") {
        if (ageMs > 7 * oneDayMs) return false;
      } else if (filter.timeRange === "30_DAYS") {
        if (ageMs > 30 * oneDayMs) return false;
      }
    }

    // 4. Search query filter
    if (filter.searchQuery && filter.searchQuery.trim()) {
      const q = filter.searchQuery.toLowerCase().trim();
      const matchAction = evt.action.toLowerCase().includes(q);
      const matchSummary = evt.summary.toLowerCase().includes(q);
      const matchSource = evt.source.toLowerCase().includes(q);
      const matchRoute = evt.destinationRoute.toLowerCase().includes(q);
      const matchDetails = evt.details
        ? Object.entries(evt.details).some(
            ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q),
          )
        : false;

      if (!matchAction && !matchSummary && !matchSource && !matchRoute && !matchDetails) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Compute factual summary counts over an activity dataset.
 */
export function computeActivityStats(events: readonly AgentActivityEventV1[]): ActivitySummaryStats {
  let successCount = 0;
  let attentionCount = 0;
  let infoCount = 0;
  let failedCount = 0;
  let verifiedCount = 0;

  for (const evt of events) {
    if (evt.status === "SUCCESS") successCount++;
    else if (evt.status === "ATTENTION") attentionCount++;
    else if (evt.status === "INFO") infoCount++;
    else if (evt.status === "FAILED") failedCount++;

    if (evt.isVerified) verifiedCount++;
  }

  return {
    totalEvents: events.length,
    successCount,
    attentionCount,
    infoCount,
    failedCount,
    verifiedCount,
  };
}
