/**
 * Technocore Agent Activity Center — Safe Activity Export Engine
 *
 * Formats local activity records into a downloadable JSON package.
 * Disclaims non-official, local-only status clearly.
 */

import { computeActivityStats } from "./filter.ts";
import type { AgentActivityEventV1 } from "./types.ts";

export const EXPORT_DISCLAIMER = "Local activity history generated from verified application events.";

export interface ActivityExportPayload {
  readonly schema: "technocore-activity-export-v1";
  readonly exportedAt: string;
  readonly disclaimer: string;
  readonly stats: {
    readonly totalEvents: number;
    readonly successful: number;
    readonly attention: number;
    readonly informational: number;
    readonly failed: number;
    readonly verified: number;
  };
  readonly events: readonly AgentActivityEventV1[];
}

/**
 * Format activity events into a canonical export JSON string.
 */
export function formatActivityJsonExport(events: readonly AgentActivityEventV1[]): string {
  const stats = computeActivityStats(events);

  const payload: ActivityExportPayload = {
    schema: "technocore-activity-export-v1",
    exportedAt: new Date().toISOString(),
    disclaimer: EXPORT_DISCLAIMER,
    stats: {
      totalEvents: stats.totalEvents,
      successful: stats.successCount,
      attention: stats.attentionCount,
      informational: stats.infoCount,
      failed: stats.failedCount,
      verified: stats.verifiedCount,
    },
    events,
  };

  return JSON.stringify(payload, null, 2);
}
