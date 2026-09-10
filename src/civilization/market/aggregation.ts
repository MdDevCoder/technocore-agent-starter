/**
 * Pure Event-Sourced Marketplace & Competitive Procurement Projection Engine.
 *
 * Scans the append-only CivilizationEvent stream to project open and settled
 * market opportunities, multi-agent bidding proposals, deterministic arbitration
 * outcomes (Policy 15A-v1), candidate rankings, and capability demand summaries.
 */

import { aggregateAgentReputations } from "../reputation/projection.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type {
  CandidateEvaluation,
  CounterpartyRankingPolicy,
  MarketOpportunity,
  MarketplaceState,
  OpportunityStatus,
  ProcurementArbitrationResult,
  ProcurementProposal,
} from "./types.ts";
import { rankCandidatesForOpportunity } from "./ranking.ts";
import { arbitrateProcurement } from "./arbitration.ts";

export function aggregateMarketplaceFromEvents(
  events: readonly CivilizationEvent[],
  evaluationTimestamp: IsoUtcTimestamp = new Date().toISOString(),
  policy?: CounterpartyRankingPolicy,
): MarketplaceState {
  // 1. Deduplicate events for idempotency
  const seenEventIds = new Set<string>();
  const uniqueEvents: CivilizationEvent[] = [];
  for (const event of events) {
    if (event && event.eventId && !seenEventIds.has(event.eventId)) {
      seenEventIds.add(event.eventId);
      uniqueEvents.push(event);
    }
  }

  // 2. Project Agent Reputations across the event stream
  const summaries = aggregateAgentReputations(uniqueEvents, evaluationTimestamp);
  const reputationMap = new Map<DidString, import("../reputation/types.ts").AgentReputationSummary>();
  for (const s of summaries) {
    reputationMap.set(s.did, s);
  }

  // 3. Track all discovered candidates and pairwise historical interactions
  const allCandidateDids = new Set<DidString>();
  const pairwiseInteractions = new Map<string, number>(); // key: `${creatorDid}_${candidateDid}`

  const opportunityMap = new Map<string, MarketOpportunity>();
  const contractToOpportunityMap = new Map<string, string>(); // contractId -> opportunityId
  const proposalsMap = new Map<string, Map<string, ProcurementProposal>>(); // oppId -> (propId -> proposal)

  for (const event of uniqueEvents) {
    if (!event || typeof event !== "object") continue;

    if (event.authorDid) {
      allCandidateDids.add(event.authorDid);
    }

    // Accumulate discovered candidates
    if (event.eventType === "AGENT_DISCOVERED") {
      const p = event.payload as { did?: string };
      const did = p?.did || event.authorDid;
      if (did) allCandidateDids.add(did);
    }

    // ── Track Pairwise Interactions ──────────────────────────────────────────
    if (event.eventType === "DEAL_OFFER_ACCEPTED" || event.eventType === "DEAL_RECEIPT_ISSUED") {
      const p = event.payload as { payerDid?: string; payeeDid?: string };
      if (p?.payerDid && p?.payeeDid) {
        const key1 = `${p.payerDid}_${p.payeeDid}`;
        const key2 = `${p.payeeDid}_${p.payerDid}`;
        pairwiseInteractions.set(key1, (pairwiseInteractions.get(key1) ?? 0) + 1);
        pairwiseInteractions.set(key2, (pairwiseInteractions.get(key2) ?? 0) + 1);
      }
    }

    // ── Track Opportunities from MISSION_CREATED ────────────────────────────
    if (event.eventType === "MISSION_CREATED") {
      const p = event.payload as {
        title?: string;
        objective?: string;
        requirements?: Array<{ capability: string; minProficiency?: number }>;
        budget?: { totalAmount: number; currency: string };
        constraints?: { deadline?: string; maxDurationHours?: number };
      };
      const oppId = event.missionId || `opp_${event.eventId}`;
      const primaryReq = p?.requirements?.[0]?.capability || "general";
      const minProf = p?.requirements?.[0]?.minProficiency || 70;
      const budgetStr = p?.budget?.totalAmount ? String(p.budget.totalAmount) : "1000";
      const asset = p?.budget?.currency || "FLOP";
      const deadline = p?.constraints?.deadline || new Date(Date.now() + 86400000).toISOString();
      const biddingDeadline = new Date(Date.now() + 43200000).toISOString();

      opportunityMap.set(oppId, {
        opportunityId: oppId,
        title: p?.title || `Mission ${oppId}`,
        description: p?.objective || "Civilization Mission Requirement",
        requiredCapability: primaryReq,
        requiredCapabilities: p?.requirements?.map((r) => r.capability) || [primaryReq],
        minProficiency: minProf,
        budget: budgetStr,
        asset,
        creatorDid: event.authorDid,
        deadline,
        biddingDeadline,
        createdAt: event.timestamp,
        status: "OPEN",
        sourceEventId: event.eventId,
        missionId: event.missionId,
      });
    }

    // ── Track Opportunities from TASK_PROPOSED ───────────────────────────────
    if (event.eventType === "TASK_PROPOSED") {
      const p = event.payload as {
        taskId?: string;
        title?: string;
        objective?: string;
        requiredCapabilities?: string[];
      };
      if (p?.taskId) {
        const primaryCap = p.requiredCapabilities?.[0] || "general";
        opportunityMap.set(p.taskId, {
          opportunityId: p.taskId,
          title: p.title || `Task ${p.taskId}`,
          description: p.objective || "Autonomous task requirement",
          requiredCapability: primaryCap,
          requiredCapabilities: p.requiredCapabilities || [primaryCap],
          minProficiency: 70,
          budget: "1000",
          asset: "FLOP",
          creatorDid: event.authorDid,
          deadline: new Date(Date.now() + 86400000).toISOString(),
          biddingDeadline: new Date(Date.now() + 43200000).toISOString(),
          createdAt: event.timestamp,
          status: "OPEN",
          sourceEventId: event.eventId,
          missionId: event.missionId,
          taskId: p.taskId,
        });
      }
    }

    // ── Track Opportunities from DEAL_OFFER_CREATED ──────────────────────────
    if (event.eventType === "DEAL_OFFER_CREATED") {
      const p = event.payload as {
        offerId?: string;
        from?: string;
        amount?: string;
        asset?: string;
        role?: string;
        claimByMs?: number;
      };
      if (p?.offerId) {
        const oppId = event.missionId || `opp_${p.offerId}`;
        const deadline = p.claimByMs ? new Date(p.claimByMs).toISOString() : new Date(Date.now() + 86400000).toISOString();
        const existing = opportunityMap.get(oppId);
        if (!existing) {
          opportunityMap.set(oppId, {
            opportunityId: oppId,
            title: `Deal Offer ${p.offerId.slice(0, 8)}`,
            description: `Autonomous TCLK deal contract offer for ${p.amount || "0"} ${p.asset || "FLOP"}`,
            requiredCapability: "typescript",
            requiredCapabilities: ["typescript"],
            minProficiency: 75,
            budget: p.amount || "1000",
            asset: p.asset || "FLOP",
            creatorDid: p.from || event.authorDid,
            deadline,
            biddingDeadline: deadline,
            createdAt: event.timestamp,
            status: "OPEN",
            sourceEventId: event.eventId,
            missionId: event.missionId,
          });
        }
      }
    }

    // ── Track Proposals from PROPOSAL_SUBMITTED ──────────────────────────────
    if (event.eventType === "PROPOSAL_SUBMITTED") {
      const p = event.payload as {
        proposalId?: string;
        role?: string;
        responsibility?: string;
        proposedCapabilities?: Array<{ name: string; proficiency?: number }>;
        estimatedEffortMinutes?: number;
        requestedReward?: { token: string; amount: number };
        ttlSeconds?: number;
        expiresAt?: string;
        declaredProficiency?: number;
      };

      const oppId = event.missionId || "default_opp";
      const propId = p?.proposalId || `prop_${event.eventId}`;
      const proposerDid = event.authorDid;
      const price = p?.requestedReward?.amount ? String(p.requestedReward.amount) : "800";
      const asset = p?.requestedReward?.token || "FLOP";
      const caps = p?.proposedCapabilities?.map((c) => c.name) || ["general"];
      const effortMins = p?.estimatedEffortMinutes || 60;
      const etaMs = new Date(event.timestamp).getTime() + effortMins * 60 * 1000;
      const expiresAt = p?.expiresAt || new Date(new Date(event.timestamp).getTime() + (p?.ttlSeconds || 3600) * 1000).toISOString();

      if (!proposalsMap.has(oppId)) {
        proposalsMap.set(oppId, new Map());
      }

      proposalsMap.get(oppId)!.set(propId, {
        proposalId: propId,
        opportunityId: oppId,
        proposerDid,
        proposedPrice: price,
        proposedAsset: asset,
        estimatedCompletionTimeMs: etaMs,
        capabilityClaims: caps,
        declaredProficiency: p?.declaredProficiency ?? 85,
        expiresAt,
        createdAt: event.timestamp,
        status: "valid",
        sourceEventId: event.eventId,
      });

      // Update opportunity status to PROPOSALS_ACCEPTED if currently OPEN
      const opp = opportunityMap.get(oppId);
      if (opp && opp.status === "OPEN") {
        opportunityMap.set(oppId, {
          ...opp,
          status: "PROPOSALS_ACCEPTED",
        });
      }
    }

    // ── Track Proposals from COUNTER_PROPOSAL_SUBMITTED ──────────────────────
    if (event.eventType === "COUNTER_PROPOSAL_SUBMITTED") {
      const p = event.payload as {
        counterProposalId?: string;
        originalProposalId?: string;
        proposerDid?: string;
        modifiedRole?: string;
        modifiedResponsibility?: string;
        modifiedEffortMinutes?: number;
        modifiedRequestedReward?: { token: string; amount: number };
        reason?: string;
        ttlSeconds?: number;
        expiresAt?: string;
      };

      const oppId = event.missionId || "default_opp";
      const propId = p?.counterProposalId || `counter_${event.eventId}`;
      const proposerDid = p?.proposerDid || event.authorDid;
      const price = p?.modifiedRequestedReward?.amount ? String(p.modifiedRequestedReward.amount) : "850";
      const asset = p?.modifiedRequestedReward?.token || "FLOP";
      const effortMins = p?.modifiedEffortMinutes || 45;
      const etaMs = new Date(event.timestamp).getTime() + effortMins * 60 * 1000;
      const expiresAt = p?.expiresAt || new Date(new Date(event.timestamp).getTime() + (p?.ttlSeconds || 3600) * 1000).toISOString();

      if (!proposalsMap.has(oppId)) {
        proposalsMap.set(oppId, new Map());
      }

      proposalsMap.get(oppId)!.set(propId, {
        proposalId: propId,
        opportunityId: oppId,
        proposerDid,
        proposedPrice: price,
        proposedAsset: asset,
        estimatedCompletionTimeMs: etaMs,
        capabilityClaims: ["typescript", "security"],
        declaredProficiency: 85,
        expiresAt,
        createdAt: event.timestamp,
        status: "countered",
        parentProposalId: p?.originalProposalId,
        counterReason: p?.reason,
        sourceEventId: event.eventId,
      });
    }

    // ── Track Status Changes from PROPOSAL_ACCEPTED ──────────────────────────
    if (event.eventType === "PROPOSAL_ACCEPTED") {
      const p = event.payload as { proposalId?: string; acceptedByDid?: string };
      const oppId = event.missionId;
      if (oppId && p?.proposalId && proposalsMap.has(oppId)) {
        const prop = proposalsMap.get(oppId)!.get(p.proposalId);
        if (prop) {
          proposalsMap.get(oppId)!.set(p.proposalId, {
            ...prop,
            status: "selected",
          });
        }
        const opp = opportunityMap.get(oppId);
        if (opp) {
          opportunityMap.set(oppId, {
            ...opp,
            status: "SELECTED",
            selectedProposalId: p.proposalId,
            selectedCandidateDid: prop?.proposerDid || event.authorDid,
          });
        }
      }
    }

    // ── Track Status Changes from PROPOSAL_REJECTED ──────────────────────────
    if (event.eventType === "PROPOSAL_REJECTED") {
      const p = event.payload as { proposalId?: string; reason?: string };
      const oppId = event.missionId;
      if (oppId && p?.proposalId && proposalsMap.has(oppId)) {
        const prop = proposalsMap.get(oppId)!.get(p.proposalId);
        if (prop) {
          proposalsMap.get(oppId)!.set(p.proposalId, {
            ...prop,
            status: "rejected",
            invalidReason: p.reason,
          });
        }
      }
    }

    // ── Track Status Changes from PROPOSAL_WITHDRAWN ─────────────────────────
    if (event.eventType === "PROPOSAL_WITHDRAWN") {
      const p = event.payload as { proposalId?: string; reason?: string };
      const oppId = event.missionId;
      if (oppId && p?.proposalId && proposalsMap.has(oppId)) {
        const prop = proposalsMap.get(oppId)!.get(p.proposalId);
        if (prop) {
          proposalsMap.get(oppId)!.set(p.proposalId, {
            ...prop,
            status: "withdrawn",
            invalidReason: p.reason,
          });
        }
      }
    }

    // ── Update Opportunities on DEAL_OFFER_ACCEPTED ──────────────────────────
    if (event.eventType === "DEAL_OFFER_ACCEPTED") {
      const p = event.payload as {
        contractId?: string;
        offerId?: string;
        payerDid?: string;
        payeeDid?: string;
      };
      if (p?.contractId) {
        let existing = event.missionId ? opportunityMap.get(event.missionId) : undefined;
        if (!existing && p.offerId) {
          existing = opportunityMap.get(`opp_${p.offerId}`) || opportunityMap.get(p.offerId);
        }
        if (existing) {
          contractToOpportunityMap.set(p.contractId, existing.opportunityId);
          opportunityMap.set(existing.opportunityId, {
            ...existing,
            status: "MATCHED",
            selectedCandidateDid: p.payeeDid || event.authorDid,
            linkedContractId: p.contractId,
          });
        }
      }
    }

    // ── Update Opportunities on DEAL_FUNDS_LOCKED ───────────────────────────
    if (event.eventType === "DEAL_FUNDS_LOCKED") {
      const p = event.payload as { contractId?: string };
      const oppId = (p?.contractId ? contractToOpportunityMap.get(p.contractId) : undefined) || event.missionId;
      const existing = oppId ? opportunityMap.get(oppId) : undefined;
      if (existing) {
        opportunityMap.set(existing.opportunityId, {
          ...existing,
          status: "IN_PROGRESS",
        });
      }
    }

    // ── Update Opportunities on DEAL_RECEIPT_ISSUED ─────────────────────────
    if (event.eventType === "DEAL_RECEIPT_ISSUED") {
      const p = event.payload as { contractId?: string; outcome?: string };
      const oppId = (p?.contractId ? contractToOpportunityMap.get(p.contractId) : undefined) || event.missionId;
      const existing = oppId ? opportunityMap.get(oppId) : undefined;
      if (existing) {
        const finalStatus: OpportunityStatus = p?.outcome === "claimed" ? "SETTLED" : "CANCELLED";
        opportunityMap.set(existing.opportunityId, {
          ...existing,
          status: finalStatus,
          linkedReceiptEventId: event.eventId,
        });
      }
    }

    // ── Update Opportunities on DEAL_REFUND_CLAIMED ─────────────────────────
    if (event.eventType === "DEAL_REFUND_CLAIMED") {
      const p = event.payload as { contractId?: string };
      const oppId = (p?.contractId ? contractToOpportunityMap.get(p.contractId) : undefined) || event.missionId;
      const existing = oppId ? opportunityMap.get(oppId) : undefined;
      if (existing) {
        opportunityMap.set(existing.opportunityId, {
          ...existing,
          status: "EXPIRED",
        });
      }
    }

    // ── Update Opportunities on DEAL_CANCELLED ──────────────────────────────
    if (event.eventType === "DEAL_CANCELLED") {
      const p = event.payload as { contractId?: string };
      const oppId = (p?.contractId ? contractToOpportunityMap.get(p.contractId) : undefined) || event.missionId;
      const existing = oppId ? opportunityMap.get(oppId) : undefined;
      if (existing) {
        opportunityMap.set(existing.opportunityId, {
          ...existing,
          status: "CANCELLED",
        });
      }
    }
  }

  // 4. Rank candidates and arbitrate proposals for every opportunity
  const candidatesList = Array.from(allCandidateDids);
  const evaluationsMap = new Map<string, readonly CandidateEvaluation[]>();
  const outputProposalsMap = new Map<string, readonly ProcurementProposal[]>();
  const arbitrationResultsMap = new Map<string, ProcurementArbitrationResult>();

  const opportunities = Array.from(opportunityMap.values());
  const currentTimeMs = new Date(evaluationTimestamp).getTime();

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i]!;

    // Pairwise interaction map for this creator
    const creatorInteractions = new Map<DidString, number>();
    for (const c of candidatesList) {
      const count = pairwiseInteractions.get(`${opp.creatorDid}_${c}`) ?? 0;
      creatorInteractions.set(c, count);
    }

    // 4a. Candidate ranking (Phase 14B)
    const candidatePool = candidatesList.filter((c) => c !== opp.creatorDid);
    const rankings = rankCandidatesForOpportunity(opp, candidatePool, reputationMap, {
      policy,
      historicalInteractionsMap: creatorInteractions,
    });
    evaluationsMap.set(opp.opportunityId, rankings);

    // 4b. Multi-Offer Procurement Arbitration (Phase 15)
    const oppProposals = Array.from(proposalsMap.get(opp.opportunityId)?.values() || []);
    outputProposalsMap.set(opp.opportunityId, oppProposals);

    const arbResult = arbitrateProcurement(opp, oppProposals, reputationMap, {
      policy,
      currentTimeMs,
      historicalInteractionsMap: creatorInteractions,
    });
    arbitrationResultsMap.set(opp.opportunityId, arbResult);

    // Update opportunity with proposals count & arbitration result
    const updatedOpp: MarketOpportunity = {
      ...opp,
      proposalsCount: oppProposals.length,
      arbitrationResult: arbResult,
      selectedCandidateDid: opp.selectedCandidateDid || arbResult.winningProposerDid,
      selectedProposalId: opp.selectedProposalId || arbResult.winningProposalId,
    };
    opportunities[i] = updatedOpp;
  }

  // 5. Capability Demand Summary
  const demandMap = new Map<string, { count: number; totalBudget: number }>();
  for (const opp of opportunities) {
    const cur = demandMap.get(opp.requiredCapability) ?? { count: 0, totalBudget: 0 };
    demandMap.set(opp.requiredCapability, {
      count: cur.count + 1,
      totalBudget: cur.totalBudget + (Number(opp.budget) || 0),
    });
  }

  const capabilityDemandSummary = Array.from(demandMap.entries()).map(([cap, data]) => ({
    capability: cap,
    openCount: data.count,
    averageBudget: data.count > 0 ? Math.round(data.totalBudget / data.count) : 0,
  }));

  const totalSettledOpportunities = opportunities.filter((o) => o.status === "SETTLED").length;

  return {
    opportunities: opportunities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    evaluations: evaluationsMap,
    proposals: outputProposalsMap,
    arbitrationResults: arbitrationResultsMap,
    activeCandidatesCount: candidatesList.length,
    totalSettledOpportunities,
    capabilityDemandSummary,
    projectedAt: evaluationTimestamp,
  };
}

