/**
 * Derived Reputation Projection & Trust Graph Engine.
 *
 * Provides deterministic read-projections over verified civilization event logs,
 * computing swarm-wide reputation matrices and multi-agent interaction trust graphs.
 */

import type { CivilizationEvent } from "../types/events.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import { calculateAgentReputation, calculateAgentSummary } from "./calculator.ts";
import { extractReputationEvidence } from "./evidence.ts";
import type {
  AgentReputationSummary,
  DerivedAgentReputation,
  ReputationCalculationWeights,
  TrustGraph,
  TrustInteractionEdge,
} from "./types.ts";

/**
 * Pure deterministic projection aggregating AgentReputationSummary records from public events.
 */
export function aggregateAgentReputations(
  events: readonly CivilizationEvent[],
  evaluationTimestamp: IsoUtcTimestamp = new Date().toISOString(),
): AgentReputationSummary[] {
  // Deduplicate events by eventId for strict idempotency
  const seenEventIds = new Set<string>();
  const uniqueEvents: CivilizationEvent[] = [];
  for (const event of events) {
    if (event && event.eventId && !seenEventIds.has(event.eventId)) {
      seenEventIds.add(event.eventId);
      uniqueEvents.push(event);
    }
  }

  const evidenceList = extractReputationEvidence(uniqueEvents);

  // Discover all unique DIDs participating in events or evidence
  const allDids = new Set<DidString>();
  const didProfileMap = new Map<DidString, { displayName?: string; role?: string; advertisedCapabilities?: { name: string; proficiency: number }[] }>();
  const didEventsMap = new Map<DidString, CivilizationEvent[]>();

  for (const evt of uniqueEvents) {
    if (!evt || typeof evt !== "object") continue;

    if (evt.authorDid) {
      allDids.add(evt.authorDid);
      if (!didEventsMap.has(evt.authorDid)) didEventsMap.set(evt.authorDid, []);
      didEventsMap.get(evt.authorDid)!.push(evt);
    }

    if (!evt.payload || typeof evt.payload !== "object") continue;

    // Check AGENT_DISCOVERED payload
    if (evt.eventType === "AGENT_DISCOVERED") {
      const p = evt.payload as { did?: string; displayName?: string; role?: string; capabilities?: { name: string; proficiency: number }[] };
      const targetDid = p.did || evt.authorDid;
      if (targetDid) {
        allDids.add(targetDid);
        didProfileMap.set(targetDid, {
          displayName: p.displayName,
          role: p.role,
          advertisedCapabilities: p.capabilities,
        });
      }
    }

    // Check DEAL payloads for participants
    if (evt.eventType?.startsWith("DEAL_")) {
      const p = evt.payload as { payerDid?: string; payeeDid?: string; from?: string };
      if (p.payerDid) {
        allDids.add(p.payerDid);
        if (!didEventsMap.has(p.payerDid)) didEventsMap.set(p.payerDid, []);
        didEventsMap.get(p.payerDid)!.push(evt);
      }
      if (p.payeeDid) {
        allDids.add(p.payeeDid);
        if (!didEventsMap.has(p.payeeDid)) didEventsMap.set(p.payeeDid, []);
        didEventsMap.get(p.payeeDid)!.push(evt);
      }
    }

    // Check TEAM payloads for members
    if (evt.eventType === "TEAM_FORMED") {
      const p = evt.payload as { memberDids?: string[] };
      if (Array.isArray(p.memberDids)) {
        for (const m of p.memberDids) {
          if (m) {
            allDids.add(m);
            if (!didEventsMap.has(m)) didEventsMap.set(m, []);
            didEventsMap.get(m)!.push(evt);
          }
        }
      }
    }

    // Check REVIEW payloads
    if (evt.eventType === "REVIEW_ACCEPTED" || evt.eventType === "REVIEW_REJECTED") {
      const p = evt.payload as { reviewerDid?: string };
      if (p.reviewerDid) {
        allDids.add(p.reviewerDid);
        if (!didEventsMap.has(p.reviewerDid)) didEventsMap.set(p.reviewerDid, []);
        didEventsMap.get(p.reviewerDid)!.push(evt);
      }
    }
  }

  for (const evi of evidenceList) {
    allDids.add(evi.agentDid);
  }

  const summaries: AgentReputationSummary[] = [];

  for (const did of allDids) {
    const profile = didProfileMap.get(did);
    const involved = didEventsMap.get(did) || [];
    const summary = calculateAgentSummary(did, evidenceList, involved, profile, evaluationTimestamp);
    summaries.push(summary);
  }

  // Sort deterministically by overall score descending, then by DID
  return summaries.sort((a, b) => {
    if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
    return a.did.localeCompare(b.did);
  });
}

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
   * Projects list of rich summaries.
   */
  static projectSummariesFromEvents(
    events: readonly CivilizationEvent[],
    evaluationTimestamp: IsoUtcTimestamp = new Date().toISOString(),
  ): AgentReputationSummary[] {
    return aggregateAgentReputations(events, evaluationTimestamp);
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

        case "DEAL_OFFER_ACCEPTED": {
          const payload = event.payload as import("../deals/tclk/types.ts").DealOfferAcceptedPayload;
          if (payload.payerDid && payload.payeeDid) {
            nodes.add(payload.payerDid);
            nodes.add(payload.payeeDid);
            edges.push({
              sourceDid: payload.payerDid,
              targetDid: payload.payeeDid,
              interactionType: "deal",
              contractId: payload.contractId,
              missionId: event.missionId,
              timestamp: event.timestamp,
              outcome: "positive",
            });
          }
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
