/**
 * Agent Capability Model, Normalization, and Verification.
 *
 * Implements standard naming normalization (e.g., "Security Audit" -> "security-audit"),
 * proficiency validation (safe integers 0-100), and maintains the distinction between
 * self-asserted capability claims and verified historical performance.
 */

import type { AgentCapability } from "../types/agent.ts";

/**
 * Normalizes a capability name to a canonical hyphen-separated lowercase format.
 *
 * Example:
 *   "Security Audit" -> "security-audit"
 *   "TypeScript_v5" -> "typescript-v5"
 *   "  API Architecture " -> "api-architecture"
 */
export function normalizeCapabilityName(name: string): string {
  if (typeof name !== "string") return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface CreateCapabilityParams {
  readonly name: string;
  readonly proficiency: number; // Safe integer 0 to 100
  readonly version?: string;
  readonly specialization?: string;
  readonly evidenceReferences?: readonly string[];
}

/**
 * Validates and creates a canonical AgentCapability object.
 */
export function createAgentCapability(params: CreateCapabilityParams): AgentCapability {
  const normalizedName = normalizeCapabilityName(params.name);
  if (!normalizedName) {
    throw new Error(`Invalid capability name: "${params.name}"`);
  }

  if (
    typeof params.proficiency !== "number" ||
    !Number.isSafeInteger(params.proficiency) ||
    params.proficiency < 0 ||
    params.proficiency > 100
  ) {
    throw new Error(
      `Capability proficiency for "${normalizedName}" must be a safe integer between 0 and 100 (got ${String(params.proficiency)})`,
    );
  }

  return {
    name: normalizedName,
    proficiency: params.proficiency,
    version: params.version?.trim() || undefined,
    specialization: params.specialization ? normalizeCapabilityName(params.specialization) : undefined,
    evidenceReferences: params.evidenceReferences ? [...params.evidenceReferences] : undefined,
  };
}

/**
 * Checks if a claimed capability matches a required specification.
 */
export function matchesCapabilityRequirement(
  claimed: AgentCapability,
  requiredName: string,
  minProficiency = 0,
  requiredSpecialization?: string,
): boolean {
  const normRequired = normalizeCapabilityName(requiredName);
  const normClaimed = normalizeCapabilityName(claimed.name);

  if (normClaimed !== normRequired) {
    return false;
  }

  if (claimed.proficiency < minProficiency) {
    return false;
  }

  if (requiredSpecialization) {
    const normSpec = normalizeCapabilityName(requiredSpecialization);
    if (!claimed.specialization || normalizeCapabilityName(claimed.specialization) !== normSpec) {
      return false;
    }
  }

  return true;
}

/**
 * Distinguishes an unverified agent claim from peer-attested or proven evidence.
 */
export interface CapabilityAssessment {
  readonly capabilityName: string;
  readonly claimedProficiency: number;
  readonly verifiedProficiencyScore: number;
  readonly completedTasksCount: number;
  readonly acceptedDeliverablesCount: number;
  readonly disputeWinRate: number;
  readonly confidenceScore: number; // 0 to 100 based on weight of signed historical evidence
}

/**
 * Computes an initial assessment comparing self-advertised claim with historical metrics.
 */
export function assessCapabilityConfidence(
  claimed: AgentCapability,
  reputationMetrics?: {
    readonly completedTasks: number;
    readonly acceptedReviews: number;
    readonly rejectedReviews: number;
    readonly disputesWon: number;
  },
): CapabilityAssessment {
  if (!reputationMetrics || reputationMetrics.completedTasks === 0) {
    return {
      capabilityName: claimed.name,
      claimedProficiency: claimed.proficiency,
      verifiedProficiencyScore: Math.min(claimed.proficiency, 50), // Unverified default capped at 50
      completedTasksCount: 0,
      acceptedDeliverablesCount: 0,
      disputeWinRate: 0,
      confidenceScore: 20, // Low initial confidence on unverified claims
    };
  }

  const { completedTasks, acceptedReviews, rejectedReviews, disputesWon } = reputationMetrics;
  const totalReviews = acceptedReviews + rejectedReviews;
  const acceptanceRate = totalReviews > 0 ? acceptedReviews / totalReviews : 0.8;

  // Higher confidence with more completed tasks
  const experienceMultiplier = Math.min(1.0, completedTasks / 10);
  const confidenceScore = Math.round(experienceMultiplier * (acceptanceRate * 80 + 20));

  const verifiedScore = Math.round(
    claimed.proficiency * 0.4 + (acceptanceRate * 100) * 0.4 + (Math.min(disputesWon * 10, 20)),
  );

  return {
    capabilityName: claimed.name,
    claimedProficiency: claimed.proficiency,
    verifiedProficiencyScore: Math.min(100, Math.max(0, verifiedScore)),
    completedTasksCount: completedTasks,
    acceptedDeliverablesCount: acceptedReviews,
    disputeWinRate: disputesWon,
    confidenceScore: Math.min(100, Math.max(0, confidenceScore)),
  };
}
