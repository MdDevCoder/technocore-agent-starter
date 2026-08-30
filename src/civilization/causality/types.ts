/**
 * Causal Lineage & Evolutionary Provenance Types.
 *
 * Defines typed graph representations for backward-causal explainability:
 * Why did an agent specialize? Why is a capability scarce? Why was a verdict reached?
 * Every node and edge is backed strictly by cryptographically signed civilization events.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEventType } from "../types/events.ts";

export type CausalNodeType =
  | "MISSION_DEMAND"
  | "CAPABILITY_GAP"
  | "LEARNING_INVESTMENT"
  | "BENCHMARK_VERIFICATION"
  | "ATTESTATION"
  | "ADVERTISEMENT"
  | "WORK_EXECUTION"
  | "PEER_REVIEW"
  | "COURT_DISPUTE"
  | "JUDICIAL_VERDICT"
  | "ECONOMIC_SETTLEMENT"
  | "STRATEGY_SHIFT";

export interface CausalNode {
  readonly id: string;
  readonly nodeType: CausalNodeType;
  readonly sourceEventId: string;
  readonly eventType: CivilizationEventType;
  readonly title: string;
  readonly summary: string;
  readonly actorDid: DidString;
  readonly timestamp: IsoUtcTimestamp;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface CausalEdge {
  readonly sourceNodeId: string;
  readonly targetNodeId: string;
  readonly relationship:
    | "CAUSED_BY"
    | "RESOLVED_BY"
    | "JUSTIFIED_BY"
    | "ATTESTED_BY"
    | "EVALUATED_AGAINST"
    | "CONSEQUENT_OF";
  readonly description: string;
}

export interface CausalLineageGraph {
  readonly entityId: string;
  readonly entityType: "agent" | "capability" | "mission" | "dispute" | "price";
  readonly rootNodeId: string;
  readonly nodes: readonly CausalNode[];
  readonly edges: readonly CausalEdge[];
  readonly narrativeSummary: string;
  readonly derivedAt: IsoUtcTimestamp;
}

export interface AgentEvolutionLineage {
  readonly agentDid: DidString;
  readonly displayName: string;
  readonly initialCapabilities: readonly { name: string; proficiency: number }[];
  readonly currentCapabilities: readonly { name: string; proficiency: number }[];
  readonly acquiredCapabilities: readonly {
    readonly capability: string;
    readonly verifiedProficiency: number;
    readonly attestationId: string;
    readonly verifierDid: DidString;
    readonly gapOrigin: string;
    readonly benchmarkProofId: string;
    readonly timestamp: IsoUtcTimestamp;
    readonly causalEventChain: readonly string[];
  }[];
  readonly completedMissionsCount: number;
  readonly totalEarnings: number;
  readonly strategyEvolutionCount: number;
  readonly disputeInvolvementCount: number;
}

export interface CapabilityScarcityLineage {
  readonly capability: string;
  readonly historicalDemandCount: number;
  readonly currentSupplyCount: number;
  readonly initialMarketPrice: number;
  readonly peakMarketPrice: number;
  readonly currentMarketPrice: number;
  readonly priceEvents: readonly {
    readonly tick: number;
    readonly price: number;
    readonly scarcityMultiplier: number;
    readonly supply: number;
    readonly demand: number;
    readonly catalystEventId?: string;
  }[];
  readonly emergentSpecialistDids: readonly DidString[];
}

export interface DisputeCausalLineage {
  readonly disputeId: string;
  readonly missionId: string;
  readonly claimantDid: DidString;
  readonly respondentDid: DidString;
  readonly deliverableHash: string;
  readonly objectionReason: string;
  readonly juryDids: readonly DidString[];
  readonly voteSplit: { upheld: number; rejected: number };
  readonly verdictSummary: string;
  readonly penaltyAmount: number;
  readonly causalEventChain: readonly string[];
}
