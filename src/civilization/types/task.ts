/**
 * Task, deliverable, and dispute models supporting dynamic delegation.
 *
 * Tasks may be created without an initially assigned agent, enabling the swarm to
 * negotiate and match capabilities dynamically.
 */

import type { DidString, IsoUtcTimestamp } from "./common.ts";

export type TaskStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "submitted"
  | "reviewing"
  | "approved"
  | "disputed"
  | "completed"
  | "cancelled";

export type DeliverableType =
  | "code"
  | "document"
  | "architecture_spec"
  | "audit_report"
  | "test_suite"
  | "verification_proof";

export interface TaskDependency {
  readonly taskId: string;
  readonly type: "blocks" | "depends_on";
}

export interface DeliverableRef {
  readonly deliverableId: string;
  readonly type: DeliverableType;
  readonly contentHash: string; // SHA-256 hex of deliverable content
  readonly summary: string;
  readonly uri?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface CivilizationTask {
  readonly taskId: string;
  readonly missionId: string;
  readonly creatorDid: DidString;
  readonly assignedAgentDid: DidString | null; // Nullable until an agent accepts
  readonly title: string;
  readonly objective: string;
  readonly requiredCapabilities: readonly string[];
  readonly dependencies: readonly TaskDependency[];
  readonly status: TaskStatus;
  readonly deliverable?: DeliverableRef;
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
  readonly completedAt?: IsoUtcTimestamp;
}

export type DisputeStatus = "opened" | "voting" | "verdict_reached" | "dismissed";

export interface CivilizationDispute {
  readonly disputeId: string;
  readonly missionId: string;
  readonly taskId?: string;
  readonly plaintiffDid: DidString;
  readonly defendantDid: DidString;
  readonly reason: string;
  readonly evidenceEventIds: readonly string[];
  readonly status: DisputeStatus;
  readonly judgeDids: readonly DidString[];
  readonly votes: Readonly<Record<DidString, string>>;
  readonly verdict?: {
    readonly winningParty: "plaintiff" | "defendant" | "split" | "inconclusive";
    readonly explanation: string;
    readonly majorityVotes: number;
    readonly totalJudges: number;
    readonly timestamp: IsoUtcTimestamp;
  };
  readonly createdAt: IsoUtcTimestamp;
  readonly updatedAt: IsoUtcTimestamp;
}
