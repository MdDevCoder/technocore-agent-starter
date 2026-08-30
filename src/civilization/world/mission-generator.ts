/**
 * Deterministic Mission Generator.
 *
 * Generates rich, diverse missions with varying capability requirements, deadlines,
 * complexity levels, and rewards based on a seeded PRNG.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationMission, MissionRequirement } from "../types/mission.ts";
import { SeededPrng } from "./clock.ts";

export interface MissionTemplate {
  readonly title: string;
  readonly objective: string;
  readonly baseRequirements: readonly { capability: string; minProficiency: number }[];
  readonly complexity: number;
}

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  {
    title: "Distributed KV Store Engine",
    objective: "Implement append-only commit log with log-structured merge tree.",
    baseRequirements: [
      { capability: "typescript", minProficiency: 85 },
      { capability: "node-backend", minProficiency: 80 },
    ],
    complexity: 3,
  },
  {
    title: "Cryptographic Key Rotation Audit",
    objective: "Perform non-extractable WebCrypto key audit and verify detached signature integrity.",
    baseRequirements: [
      { capability: "security-audit", minProficiency: 90 },
      { capability: "cryptography", minProficiency: 90 },
    ],
    complexity: 4,
  },
  {
    title: "PostgreSQL Sharding & Partition Schema",
    objective: "Design time-partitioned PostgreSQL schema for civilization event streams.",
    baseRequirements: [
      { capability: "postgresql", minProficiency: 85 },
      { capability: "data-modeling", minProficiency: 80 },
    ],
    complexity: 3,
  },
  {
    title: "Load & Fault Tolerance Suite",
    objective: "Run automated stress testing and simulate network partition recovery.",
    baseRequirements: [
      { capability: "testing", minProficiency: 80 },
      { capability: "load-testing", minProficiency: 85 },
    ],
    complexity: 2,
  },
  {
    title: "Consensus Protocol State Machine",
    objective: "Verify deterministic state transitions and formal safety invariants.",
    baseRequirements: [
      { capability: "architecture", minProficiency: 90 },
      { capability: "protocol-analysis", minProficiency: 85 },
    ],
    complexity: 5,
  },
  {
    title: "Protocol Performance Benchmarking",
    objective: "Benchmark event throughput and latency across simulated network topographies.",
    baseRequirements: [
      { capability: "research", minProficiency: 85 },
      { capability: "benchmarking", minProficiency: 85 },
    ],
    complexity: 3,
  },
  {
    title: "High-Throughput Ingestion Pipeline",
    objective: "Optimize event bus throughput to 50,000 events/sec under backpressure.",
    baseRequirements: [
      { capability: "node-backend", minProficiency: 85 },
      { capability: "load-testing", minProficiency: 80 },
    ],
    complexity: 3,
  },
];

export class DeterministicMissionGenerator {
  private readonly prng: SeededPrng;
  private missionCounter = 0;

  constructor(seed: number | string = "technocore-genesis-seed-01") {
    this.prng = new SeededPrng(seed);
  }

  generateMission(
    creatorDid: DidString,
    currentTimestamp: IsoUtcTimestamp,
  ): CivilizationMission {
    this.missionCounter++;
    const template = this.prng.pick(MISSION_TEMPLATES);
    const missionId = this.prng.generateId("mis_gen", 6);

    const requirements: MissionRequirement[] = template.baseRequirements.map((req) => ({
      capability: req.capability,
      minProficiency: req.minProficiency,
      requiredCount: 1,
      preferredProficiency: Math.min(100, req.minProficiency + 10),
    }));

    // Deterministic deadline: 1 to 3 days in the future
    const durationHours = this.prng.nextInt(24, 72);
    const deadline = new Date(new Date(currentTimestamp).getTime() + durationHours * 3600 * 1000).toISOString();

    const baseAmount = template.complexity * 5000;
    const amountVariation = this.prng.nextInt(-1000, 2500);
    const budgetAmount = Math.max(1000, baseAmount + amountVariation);

    return {
      missionId,
      creatorDid,
      genesisAgentDid: creatorDid,
      title: `${template.title} #${this.missionCounter}`,
      objective: template.objective,
      requirements,
      constraints: [
        { type: "security_level", value: "high", description: "All deliverables must be cryptographically signed" },
        { type: "deadline", value: deadline, description: "Strict deadline adherence" },
      ],
      deadline,
      budget: {
        token: "FLOP",
        amount: budgetAmount,
      },
      status: "in_progress",
      teamDids: [],
      createdAt: currentTimestamp,
      updatedAt: currentTimestamp,
    };
  }
}
