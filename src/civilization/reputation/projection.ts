/**
 * Derived Reputation Projection & Trust Graph Engine.
 *
 * Provides deterministic read-projections over verified civilization event logs,
 * computing swarm-wide reputation matrices and multi-agent interaction trust graphs.
 */

import type { CivilizationEvent } from "../types/events.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import { calculateAgentReputation } from "./calculator.ts";
import { extractReputationEvidence } from "./evidence.ts";
import type {
  DerivedAgentReputation,
  ReputationCalculationWeights,
  TrustGraph,
  TrustInteractionEdge,
} from "./types.ts";

export class ReputationProjectionEngine {
  /**
   * Projects complete evidence-based reputation map from an event stream.
   */
  static projectFromEvents(
    events: readonly CivilizationEvent[],
    evaluationTimestamp: IsoUtcTimestamp = new Date().toISOString(),
    weights?: ReputationCalculationWeights,
  ): Map<DidString, DerivedAgentReputation> {
    const evidenceList = extractReputationEvidence(events);
    const repMap = new Map<DidString, DerivedAgentReputation>();

    // Discover all unique DIDs participating in events or evidence
    const allDids = new Set<DidString>();
    for (const evt of events) {
      allDids.add(evt.authorDid);
      if (evt.payload && typeof evt.payload === "object" && "did" in evt.payload) {
        allDids.add((evt.payload as { did: DidString }).did);
      }
    }
    for (const evi of evidenceList) {
      allDids.add(evi.agentDid);
    }

    for (const did of allDids) {
      const rep = calculateAgentReputation(did, evidenceList, evaluationTimestamp, weights);
      repMap.set(did, rep);
    }

    return repMap;
  }

  /**
   * Derives the directed multi-agent trust interaction graph.
   */
  static deriveTrustGraph(events: readonly CivilizationEvent[]): TrustGraph {
    const nodes = new Set<DidString>();
    const edges: TrustInteractionEdge[] = [];

    for (const event of events) {
      nodes.add(event.authorDid);

      switch (event.eventType) {
        case "TEAM_FORMED": {
          const payload = event.payload as import("../types/events.ts").TeamFormedPayload;
          for (const member of payload.memberDids) {
            nodes.add(member);
          }
          // Add collaborative edges between all pairs
          for (let i = 0; i < payload.memberDids.length; i++) {
            for (let j = i + 1; j < payload.memberDids.length; j++) {
              const a = payload.memberDids[i]!;
              const b = payload.memberDids[j]!;
              edges.push({
                sourceDid: a,
                targetDid: b,
                interactionType: "collaborated",
                missionId: event.missionId,
                timestamp: event.timestamp,
                outcome: "positive",
              });
            }
          }
          break;
        }

        case "REVIEW_ACCEPTED": {
          const payload = event.payload as import("../types/events.ts").ReviewAcceptedPayload;
          nodes.add(payload.reviewerDid);
          edges.push({
            sourceDid: payload.reviewerDid,
            targetDid: event.authorDid,
            interactionType: "reviewed",
            missionId: event.missionId,
            timestamp: event.timestamp,
            outcome: "positive",
          });
          break;
        }

        case "REVIEW_REJECTED": {
          const payload = event.payload as import("../types/events.ts").ReviewRejectedPayload;
          nodes.add(payload.reviewerDid);
          edges.push({
            sourceDid: payload.reviewerDid,
            targetDid: event.authorDid,
            interactionType: "reviewed",
            missionId: event.missionId,
            timestamp: event.timestamp,
            outcome: "negative",
          });
          break;
        }

        case "DISPUTE_OPENED": {
          const payload = event.payload as import("../types/events.ts").DisputeOpenedPayload;
          nodes.add(payload.defendantDid);
          edges.push({
            sourceDid: event.authorDid,
            targetDid: payload.defendantDid,
            interactionType: "disputed",
            missionId: event.missionId,
            timestamp: event.timestamp,
            outcome: "neutral",
          });
          break;
        }

        case "REPUTATION_ATTESTED": {
          const payload = event.payload as import("../types/events.ts").ReputationAttestedPayload;
          nodes.add(payload.targetDid);
          edges.push({
            sourceDid: event.authorDid,
            targetDid: payload.targetDid,
            interactionType: "attested",
            missionId: event.missionId,
            timestamp: event.timestamp,
            outcome: payload.deltaScore >= 0 ? "positive" : "negative",
          });
          break;
        }
      }
    }

    return {
      nodes: Array.from(nodes),
      edges,
    };
  }
}
