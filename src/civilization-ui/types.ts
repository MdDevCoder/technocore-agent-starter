/**
 * Civilization Observatory UI Types & View Models.
 *
 * Defines strongly typed models for UI selection, filters, view modes,
 * and historical state deltas. All data originates from the underlying
 * CivilizationWorldEngine and event-sourced projections.
 */

import type { AgentProfile, AgentReputation } from "../civilization/types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../civilization/types/common.ts";
import type { DisputePackage } from "../civilization/court/types.ts";
import type { CivilizationEventType } from "../civilization/types/events.ts";
import type { CivilizationMission } from "../civilization/types/mission.ts";
import type { DynamicTeamState } from "../civilization/world/types.ts";

export type ObservatoryViewMode =
  | "NETWORK"
  | "MAP"
  | "AGENTS"
  | "MARKET"
  | "TRUST_GRAPH"
  | "CAPABILITY_MARKET"
  | "MACHINE_ECONOMY"
  | "DEALS"
  | "EVOLUTION"
  | "GENERATIONS";


export type EventCategoryFilter =
  | "ALL"
  | "MISSIONS"
  | "AGENTS"
  | "TEAMS"
  | "NEGOTIATIONS"
  | "DELIVERABLES"
  | "COURT"
  | "REPUTATION"
  | "ECONOMY"
  | "DEALS"
  | "EVOLUTION"
  | "SYSTEM";

export type SelectionTarget =
  | { readonly type: "none" }
  | { readonly type: "agent"; readonly did: DidString }
  | { readonly type: "mission"; readonly missionId: string }
  | { readonly type: "court"; readonly disputeId: string }
  | { readonly type: "event"; readonly eventId: string }
  | { readonly type: "evidence"; readonly deliverableId: string }
  | { readonly type: "escrow"; readonly escrowId: string }
  | { readonly type: "proof"; readonly proofId: string }
  | { readonly type: "attestation"; readonly attestationId: string }
  | { readonly type: "deal"; readonly contractId: string }
  | { readonly type: "opportunity"; readonly opportunityId: string }
  | {
      readonly type: "lineage";
      readonly entityType: "agent" | "capability" | "dispute" | "mission";
      readonly entityId: string;
    };

export interface WhatChangedDelta {
  readonly fromTick: number;
  readonly toTick: number;
  readonly newAgentsCount: number;
  readonly newMissionsCount: number;
  readonly completedMissionsCount: number;
  readonly activeTeamsCount: number;
  readonly resolvedDisputesCount: number;
  readonly eventDeltaCount: number;
  readonly avgReputationShift: number;
  readonly healthStatusShift: {
    readonly from: string;
    readonly to: string;
  };
}

export interface EmergentNarrativeItem {
  readonly id: string;
  readonly timestamp: IsoUtcTimestamp;
  readonly headline: string;
  readonly detail: string;
  readonly eventType: CivilizationEventType;
  readonly sourceEventId: string;
  readonly actorDid?: DidString;
  readonly severity: "info" | "success" | "warning" | "court";
}

export interface MapGraphNode {
  readonly id: string;
  readonly type: "agent" | "mission" | "team" | "dispute";
  readonly label: string;
  readonly sublabel: string;
  readonly x: number;
  readonly y: number;
  readonly status: string;
  readonly data: {
    readonly agentProfile?: AgentProfile;
    readonly agentReputation?: AgentReputation;
    readonly mission?: CivilizationMission;
    readonly team?: DynamicTeamState;
    readonly dispute?: DisputePackage;
  };
}

export interface MapGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly type: "collaboration" | "proposal" | "review" | "dispute" | "trust" | "assignment";
  readonly label?: string;
  readonly strength: number; // 0 to 1
  readonly active: boolean;
}

export type NetworkExecutionMode = "SIMULATION" | "REMOTE_AGENT" | "PERSISTENT_NETWORK";

export interface RemoteAgentTelemetry {
  readonly did: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly connected: boolean;
  readonly lastSeen: IsoUtcTimestamp;
  readonly submittedEventsCount: number;
  readonly acknowledgedSequence: number;
  readonly syncLag: number;
  readonly signatureVerificationStatus: "VERIFIED" | "PENDING" | "FAILED";
}

