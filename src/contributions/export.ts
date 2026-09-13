/**
 * Technocore Contribution Center — Safe JSON Export Engine
 *
 * Exports factual contribution metadata with mandatory disclaimers and zero secrets.
 */

import type { ContributionItemV1 } from "./types.ts";
import { containsForbiddenSecrets } from "../activity/schema.ts";

export const CONTRIBUTION_EXPORT_DISCLAIMER =
  "Local contribution record generated from verified application events.";

export interface ContributionExportPackageV1 {
  readonly format: "technocore-contribution-export-v1";
  readonly exportedAt: string;
  readonly disclaimer: string;
  readonly contributionsCount: number;
  readonly contributions: readonly ContributionItemV1[];
}

/**
 * Format contributions into a safe, non-secret JSON export package.
 */
export function exportContributionsToJson(contributions: ContributionItemV1[]): string {
  const safeItems = contributions.filter((c) => !containsForbiddenSecrets(c));

  const pkg: ContributionExportPackageV1 = {
    format: "technocore-contribution-export-v1",
    exportedAt: new Date().toISOString(),
    disclaimer: CONTRIBUTION_EXPORT_DISCLAIMER,
    contributionsCount: safeItems.length,
    contributions: safeItems,
  };

  return JSON.stringify(pkg, null, 2);
}
