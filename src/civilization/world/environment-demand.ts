/**
 * Endogenous Dynamic Environment Demand Model.
 *
 * Demand pressures evolve dynamically and causally from:
 * 1. Capability Supply Deficits: When the civilization has fewer qualified specialists in a domain,
 *    demand weight increases to test and incentivize market capacity.
 * 2. Market Scarcity Multipliers & Price Signals: High-priced / scarce skills naturally attract
 *    higher mission budgets and emergent requirements.
 * 3. Mission Bottlenecks & Failures: Domains with failed tasks or disputed reviews generate
 *    targeted quality assurance / audit / hardening demand.
 * 4. Completed Work Satisfaction & Advancement: Successfully delivered domains expand into
 *    higher-complexity multi-disciplinary mission requirements.
 * 5. Seeded Environmental Perturbations: Stochastic market variance driven strictly by SeededPrng.
 *
 * NO HARDCODED TICK RANGES (e.g. tick < 25). Zero predetermined generation schedules.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationMission, MissionRequirement } from "../types/mission.ts";
import type { SeededPrng } from "./clock.ts";
import type { AgentProfile } from "../types/agent.ts";
import type { CapabilityPriceSignal } from "../economy/types.ts";
import { normalizeCapabilityName } from "../agent/capability.ts";

export interface DomainPressure {
  readonly domain: string;
  readonly baseProficiency: number;
  readonly baseComplexity: number;
  readonly defaultWeight: number;
}

export const CAPABILITY_DOMAINS: readonly DomainPressure[] = [
  { domain: "typescript", baseProficiency: 80, baseComplexity: 2, defaultWeight: 1.0 },
  { domain: "node-backend", baseProficiency: 80, baseComplexity: 2, defaultWeight: 1.0 },
  { domain: "postgresql", baseProficiency: 85, baseComplexity: 3, defaultWeight: 1.0 },
  { domain: "cryptography", baseProficiency: 90, baseComplexity: 4, defaultWeight: 1.0 },
  { domain: "security-audit", baseProficiency: 85, baseComplexity: 4, defaultWeight: 1.0 },
  { domain: "load-testing", baseProficiency: 80, baseComplexity: 3, defaultWeight: 1.0 },
  { domain: "architecture", baseProficiency: 85, baseComplexity: 4, defaultWeight: 1.0 },
  { domain: "protocol-analysis", baseProficiency: 85, baseComplexity: 5, defaultWeight: 1.0 },
  { domain: "database-performance", baseProficiency: 85, baseComplexity: 3, defaultWeight: 1.0 },
  { domain: "smart-contracts", baseProficiency: 85, baseComplexity: 4, defaultWeight: 1.0 },
];

export class DynamicEnvironmentDemandModel {
  private readonly domainWeights: Map<string, number> = new Map();
  private readonly historicalDomainMissions: Map<string, number> = new Map();

  constructor() {
    for (const d of CAPABILITY_DOMAINS) {
      this.domainWeights.set(d.domain, d.defaultWeight);
      this.historicalDomainMissions.set(d.domain, 0);
    }
  }

  /**
   * Updates environmental demand pressures purely based on live civilization state.
   * Eliminates any hardcoded tick thresholds.
   */
  updateEnvironmentState(params: {
    readonly tick: number;
    readonly population: ReadonlyMap<DidString, { profile: AgentProfile }>;
    readonly completedMissions: readonly CivilizationMission[];
    readonly failedMissions?: readonly CivilizationMission[];
    readonly priceSignals: readonly CapabilityPriceSignal[];
    readonly prng: SeededPrng;
  }): void {
    const { population, completedMissions, failedMissions = [], priceSignals, prng } = params;
    const popList = Array.from(population.values());

    // 1. Endogenous Supply Deficit Calculation
    // For each capability domain, calculate how many active agents possess proficiency >= 70
    for (const domainConfig of CAPABILITY_DOMAINS) {
      const normDomain = normalizeCapabilityName(domainConfig.domain);
      const qualifiedSpecialists = popList.filter((a) =>
        a.profile.capabilities.some(
          (c) => normalizeCapabilityName(c.name) === normDomain && c.proficiency >= 70,
        ),
      ).length;

      // Scarcity ratio: if 0 specialists, ratio is 2.5; if 1 specialist, ratio is 1.6; if >= 4, ratio drops to 0.7
      const supplyFactor =
        qualifiedSpecialists === 0
          ? 2.2
          : qualifiedSpecialists === 1
            ? 1.5
            : qualifiedSpecialists === 2
              ? 1.1
              : qualifiedSpecialists >= 4
                ? 0.75
                : 1.0;

      // Reset to base modulated by supply
      this.domainWeights.set(domainConfig.domain, domainConfig.defaultWeight * supplyFactor);
    }

    // 2. Dynamic Market Price Signal & Scarcity Feedback
    // Price signals with elevated scarcity multipliers push demand higher
    for (const signal of priceSignals) {
      const normSig = normalizeCapabilityName(signal.capability);
      const matchedDomain = CAPABILITY_DOMAINS.find((d) => normalizeCapabilityName(d.domain) === normSig);
      if (matchedDomain) {
        const currentWeight = this.domainWeights.get(matchedDomain.domain) ?? 1.0;
        const scarcityBoost = Math.max(0.6, Math.min(2.5, signal.scarcityMultiplier));
        this.domainWeights.set(matchedDomain.domain, currentWeight * scarcityBoost);
      }
    }

    // 3. Bottleneck & Failure Feedback
    // If missions failed or struggled in certain domains, boost testing and audit demand
    for (const failed of failedMissions) {
      for (const req of failed.requirements) {
        const normReq = normalizeCapabilityName(req.capability);
        const matched = CAPABILITY_DOMAINS.find((d) => normalizeCapabilityName(d.domain) === normReq);
        if (matched) {
          // Boost diagnostic/remediation domains
          this.adjustWeight("security-audit", 1.25);
          this.adjustWeight("load-testing", 1.25);
        }
      }
    }

    // 4. Completed Work Advancements
    // When a domain has high completed volume, demand naturally expands to advanced composite domains
    const domainCompletionCounts = new Map<string, number>();
    for (const m of completedMissions) {
      for (const req of m.requirements) {
        const norm = normalizeCapabilityName(req.capability);
        domainCompletionCounts.set(norm, (domainCompletionCounts.get(norm) ?? 0) + 1);
      }
    }

    for (const [normDomain, count] of domainCompletionCounts.entries()) {
      if (count >= 3) {
        // High core competency unlocks advanced architecture and protocol analysis
        if (normDomain.includes("backend") || normDomain.includes("sql") || normDomain.includes("type")) {
          this.adjustWeight("architecture", 1.15);
          this.adjustWeight("database-performance", 1.15);
        }
        if (normDomain.includes("crypto") || normDomain.includes("security")) {
          this.adjustWeight("protocol-analysis", 1.2);
          this.adjustWeight("smart-contracts", 1.15);
        }
      }
    }

    // 5. Bounded Seeded Environmental Perturbations (Smooth market variance)
    if (prng.nextFloat() < 0.25) {
      const surgeDomain = prng.pick(CAPABILITY_DOMAINS).domain;
      const surgeFactor = 1.0 + prng.nextFloat() * 0.35;
      this.adjustWeight(surgeDomain, surgeFactor);
    }
  }

  /**
   * Generates an emergent mission responsive to current endogenous demand.
   */
  generateEmergentMission(params: {
    readonly creatorDid: DidString;
    readonly timestamp: IsoUtcTimestamp;
    readonly tick: number;
    readonly prng: SeededPrng;
    readonly population: ReadonlyMap<DidString, { profile: AgentProfile }>;
  }): CivilizationMission {
    const { creatorDid, timestamp, tick, prng } = params;

    // Pick domain weighted by current endogenous pressure
    const weightedDomains: string[] = [];
    for (const [domain, weight] of this.domainWeights.entries()) {
      const tickets = Math.max(1, Math.round(weight * 10));
      for (let i = 0; i < tickets; i++) {
        weightedDomains.push(domain);
      }
    }

    const primaryDomain = prng.pick(weightedDomains.length > 0 ? weightedDomains : CAPABILITY_DOMAINS.map((d) => d.domain));
    const domainConfig = CAPABILITY_DOMAINS.find((d) => d.domain === primaryDomain) ?? CAPABILITY_DOMAINS[0]!;

    const requirements: MissionRequirement[] = [
      {
        capability: primaryDomain,
        minProficiency: Math.max(70, Math.min(92, domainConfig.baseProficiency + prng.nextInt(-8, 5))),
        requiredCount: 1,
      },
    ];

    // 40% chance of a complementary secondary capability for collaborative multi-agent synergy
    if (prng.nextFloat() > 0.6) {
      const remainingDomains = CAPABILITY_DOMAINS.filter((d) => d.domain !== primaryDomain);
      const secondaryDomain = prng.pick(remainingDomains).domain;
      const secConfig = CAPABILITY_DOMAINS.find((d) => d.domain === secondaryDomain) ?? CAPABILITY_DOMAINS[0]!;

      requirements.push({
        capability: secondaryDomain,
        minProficiency: Math.max(70, Math.min(90, secConfig.baseProficiency + prng.nextInt(-8, 5))),
        requiredCount: 1,
      });
    }

    const missionId = prng.generateId("msn_emg", 6);
    const complexity = domainConfig.baseComplexity + (requirements.length > 1 ? 1 : 0);
    const baseBudget = 3000 * complexity;
    const budgetAmount = Math.round(baseBudget + prng.nextInt(-200, 800));

    // Deadline scales with complexity (2 to 5 virtual hours)
    const deadlineHours = Math.max(2, complexity);
    const deadline = new Date(new Date(timestamp).getTime() + deadlineHours * 3600 * 1000).toISOString();

    // Track history
    this.historicalDomainMissions.set(primaryDomain, (this.historicalDomainMissions.get(primaryDomain) ?? 0) + 1);

    return {
      missionId,
      creatorDid,
      genesisAgentDid: creatorDid,
      title: `${primaryDomain.toUpperCase().replace(/-/g, " ")} Subsystem Engineering #${tick}`,
      objective: `Execute, verify, and deliver production subsystems requiring verified ${requirements.map((r) => r.capability).join(" & ")}.`,
      requirements: Object.freeze(requirements),
      constraints: Object.freeze([
        {
          type: "deadline",
          value: deadline,
          description: `Must be completed within ${deadlineHours} virtual hours.`,
        },
        {
          type: "budget",
          value: budgetAmount,
          description: `Total escrow budget locked: ${budgetAmount} FLOP.`,
        },
      ]),
      deadline,
      budget: { token: "FLOP", amount: budgetAmount },
      status: "team_forming",
      teamDids: Object.freeze([]),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  /**
   * Returns current snapshot of domain weights for inspection and testing.
   */
  getDomainWeights(): ReadonlyMap<string, number> {
    return new Map(this.domainWeights);
  }

  private adjustWeight(domain: string, multiplier: number): void {
    const current = this.domainWeights.get(domain) ?? 1.0;
    this.domainWeights.set(domain, Math.max(0.2, Math.min(4.0, current * multiplier)));
  }
}
