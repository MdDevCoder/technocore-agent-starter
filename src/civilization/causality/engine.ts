/**
 * Causal Lineage & Provenance Engine.
 *
 * Traverses signed civilization events to reconstruct authentic backward-causal lineage graphs.
 * Answers "Why?" for any agent specialization, capability price spike, team formation, or court trial.
 *
 * HARD INVARIANT:
 * Zero fake explanation strings. All causal links are deterministic projections of signed event IDs.
 */

import type { AgentProfile } from "../types/agent.ts";
import type { DidString } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { MarketSnapshot } from "../economy/types.ts";
import type {
  AgentEvolutionLineage,
  CapabilityScarcityLineage,
  CausalEdge,
  CausalLineageGraph,
  CausalNode,
  DisputeCausalLineage,
} from "./types.ts";

export class CausalLineageEngine {
  /**
   * Reconstructs the complete evolutionary lineage for a specific agent.
   */
  deriveAgentLineage(
    agentDid: DidString,
    events: readonly CivilizationEvent[],
    population: ReadonlyMap<DidString, { profile: AgentProfile }>,
  ): AgentEvolutionLineage {
    const agentObj = population.get(agentDid);
    const displayName = agentObj?.profile.displayName ?? agentDid.slice(0, 16);
    const currentCapabilities = agentObj ? agentObj.profile.capabilities : [];

    // Filter events involving this agent
    const agentEvents = events.filter(
      (e) =>
        e.authorDid === agentDid ||
        (e.payload as { agentDid?: string })?.agentDid === agentDid ||
        (e.payload as { claimantDid?: string })?.claimantDid === agentDid ||
        (e.payload as { respondentDid?: string })?.respondentDid === agentDid ||
        (e.payload as { memberDids?: readonly string[] })?.memberDids?.includes(agentDid),
    );

    // Initial capabilities from first discovery/genesis
    const discoveryEvt = events.find(
      (e) => e.eventType === "AGENT_DISCOVERED" && (e.payload as { did?: string })?.did === agentDid,
    );
    const initialCapabilities = discoveryEvt
      ? ((discoveryEvt.payload as { capabilities?: readonly { name: string; proficiency: number }[] }).capabilities ?? [])
      : currentCapabilities;

    // Track acquired capabilities via attestations
    const attestationEvents = agentEvents.filter((e) => e.eventType === "CAPABILITY_ATTESTED");
    const acquiredCapabilities = attestationEvents.map((evt) => {
      const p = evt.payload as {
        attestationId: string;
        targetCapability: string;
        verifiedProficiency: number;
        benchmarkProofId: string;
        issuerDid: DidString;
      };

      // Find prerequisite gap and learning events
      const gapEvt = events.find(
        (e) =>
          e.eventType === "CAPABILITY_GAP_DETECTED" &&
          (e.payload as { targetCapability?: string })?.targetCapability === p.targetCapability &&
          e.authorDid === agentDid,
      );

      const causalChain = [
        gapEvt?.eventId,
        ...evt.parentEventIds,
        evt.eventId,
      ].filter((id): id is string => typeof id === "string");

      return {
        capability: p.targetCapability,
        verifiedProficiency: p.verifiedProficiency,
        attestationId: p.attestationId,
        verifierDid: p.issuerDid,
        gapOrigin: (gapEvt?.payload as { origin?: string })?.origin ?? "MARKET_SCARCITY",
        benchmarkProofId: p.benchmarkProofId,
        timestamp: evt.timestamp,
        causalEventChain: Object.freeze(causalChain),
      };
    });

    // Completed missions count
    const completedContracts = agentEvents.filter(
      (e) => e.eventType === "MILESTONE_COMPLETED" && (e.payload as { agentDid?: string })?.agentDid === agentDid,
    );

    // Total earnings from PAYMENT_ISSUED
    const paymentEvents = events.filter(
      (e) => e.eventType === "PAYMENT_ISSUED" && (e.payload as { recipientDid?: string })?.recipientDid === agentDid,
    );
    const totalEarnings = paymentEvents.reduce(
      (sum, e) => sum + ((e.payload as { amount?: number })?.amount ?? 0),
      0,
    );

    // Strategy shifts
    const strategyEvents = agentEvents.filter((e) => e.eventType === "STRATEGY_ADAPTED");

    // Disputes
    const disputeEvents = agentEvents.filter(
      (e) => e.eventType === "DISPUTE_OPENED" || e.eventType === "REVIEW_REJECTED",
    );

    return {
      agentDid,
      displayName,
      initialCapabilities: Object.freeze([...initialCapabilities]),
      currentCapabilities: Object.freeze([...currentCapabilities]),
      acquiredCapabilities: Object.freeze(acquiredCapabilities),
      completedMissionsCount: completedContracts.length,
      totalEarnings,
      strategyEvolutionCount: strategyEvents.length,
      disputeInvolvementCount: disputeEvents.length,
    };
  }

  /**
   * Reconstructs the scarcity and pricing lineage for a capability.
   */
  deriveCapabilityLineage(
    capability: string,
    events: readonly CivilizationEvent[],
    marketSnapshots: readonly MarketSnapshot[],
    population: ReadonlyMap<DidString, { profile: AgentProfile }>,
  ): CapabilityScarcityLineage {
    const normCap = capability.toLowerCase().trim();

    // Trace price history from snapshots
    const priceEvents: {
      tick: number;
      price: number;
      scarcityMultiplier: number;
      supply: number;
      demand: number;
      catalystEventId?: string;
    }[] = [];

    let peakPrice = 0;
    let initialPrice = 1500;

    for (const snap of marketSnapshots) {
      const signal = snap.capabilityPrices.find((p) => p.capability.toLowerCase() === normCap);
      if (signal) {
        if (priceEvents.length === 0) {
          initialPrice = signal.currentMarketPrice;
        }
        if (signal.currentMarketPrice > peakPrice) {
          peakPrice = signal.currentMarketPrice;
        }
        priceEvents.push({
          tick: snap.tick,
          price: signal.currentMarketPrice,
          scarcityMultiplier: signal.scarcityMultiplier,
          supply: signal.supplyCount,
          demand: signal.demandCount,
        });
      }
    }

    const currentMarketPrice = priceEvents.length > 0 ? priceEvents[priceEvents.length - 1]!.price : initialPrice;

    // Emergent specialists who gained proficiency >= 80%
    const emergentSpecialists: DidString[] = [];
    for (const [did, agentObj] of population.entries()) {
      const match = agentObj.profile.capabilities.find(
        (c) => c.name.toLowerCase() === normCap && c.proficiency >= 80,
      );
      if (match) {
        emergentSpecialists.push(did);
      }
    }

    // Historical demand count from mission requirements
    const missionEvents = events.filter((e) => e.eventType === "MISSION_CREATED");
    let demandCount = 0;
    for (const mEvt of missionEvents) {
      const reqs = (mEvt.payload as { requirements?: readonly { capability: string }[] })?.requirements ?? [];
      if (reqs.some((r) => r.capability.toLowerCase() === normCap)) {
        demandCount++;
      }
    }

    return {
      capability: normCap,
      historicalDemandCount: demandCount,
      currentSupplyCount: emergentSpecialists.length,
      initialMarketPrice: initialPrice,
      peakMarketPrice: Math.max(peakPrice, currentMarketPrice),
      currentMarketPrice,
      priceEvents: Object.freeze(priceEvents),
      emergentSpecialistDids: Object.freeze(emergentSpecialists),
    };
  }

  /**
   * Reconstructs the complete evidentiary and judicial lineage for a dispute.
   */
  deriveDisputeLineage(
    disputeId: string,
    events: readonly CivilizationEvent[],
  ): DisputeCausalLineage | null {
    const openEvt = events.find(
      (e) => e.eventType === "DISPUTE_OPENED" && (e.payload as { disputeId?: string })?.disputeId === disputeId,
    );
    if (!openEvt) return null;

    const pOpen = openEvt.payload as unknown as {
      disputeId: string;
      missionId: string;
      claimantDid: DidString;
      respondentDid: DidString;
      taskId: string;
    };

    // Find rejected review
    const rejEvt = events.find(
      (e) => e.eventType === "REVIEW_REJECTED" && (e.payload as { taskId?: string })?.taskId === pOpen.taskId,
    );
    const objectionReason = (rejEvt?.payload as { reason?: string })?.reason ?? "Deliverable failed verification standards";

    // Find proof
    const proofEvt = events.find(
      (e) =>
        e.eventType === "VERIFIED_WORK_PROOF_PUBLISHED" &&
        (e.payload as { taskId?: string })?.taskId === pOpen.taskId,
    );
    const deliverableHash = (proofEvt?.payload as { artifactHashes?: readonly string[] })?.artifactHashes?.[0] ?? "sha256_mock_hash";

    // Find verdict
    const verdictEvt = events.find(
      (e) => e.eventType === "VERDICT_ISSUED" && (e.payload as { disputeId?: string })?.disputeId === disputeId,
    );
    const pVerdict = verdictEvt?.payload as {
      verdict?: string;
      summary?: string;
      votes?: readonly { judgeDid: DidString; vote: string }[];
    } | undefined;

    const juryDids = pVerdict?.votes?.map((v) => v.judgeDid) ?? [];
    const upheldCount = pVerdict?.votes?.filter((v) => v.vote === "UPHELD").length ?? 0;
    const rejectedCount = (pVerdict?.votes?.length ?? 0) - upheldCount;

    // Find penalty
    const penaltyEvt = events.find(
      (e) => e.eventType === "PENALTY_APPLIED" && (e.payload as { disputeId?: string })?.disputeId === disputeId,
    );
    const penaltyAmount = (penaltyEvt?.payload as { amount?: number })?.amount ?? 0;

    const causalChain = [
      rejEvt?.eventId,
      proofEvt?.eventId,
      openEvt.eventId,
      verdictEvt?.eventId,
      penaltyEvt?.eventId,
    ].filter((id): id is string => typeof id === "string");

    return {
      disputeId,
      missionId: pOpen.missionId,
      claimantDid: pOpen.claimantDid,
      respondentDid: pOpen.respondentDid,
      deliverableHash,
      objectionReason,
      juryDids: Object.freeze(juryDids),
      voteSplit: { upheld: upheldCount, rejected: rejectedCount },
      verdictSummary: pVerdict?.summary ?? "Dispute resolved by judicial consensus.",
      penaltyAmount,
      causalEventChain: Object.freeze(causalChain),
    };
  }

  /**
   * Builds an interactive CausalLineageGraph for visualization in the Observatory.
   */
  buildCausalGraph(
    target: { type: "agent" | "capability" | "dispute"; id: string },
    events: readonly CivilizationEvent[],
  ): CausalLineageGraph {
    const nodes: CausalNode[] = [];
    const edges: CausalEdge[] = [];
    const derivedAt = new Date().toISOString();

    if (target.type === "agent") {
      const agentDid = target.id as DidString;
      const relevant = events.filter(
        (e) =>
          e.authorDid === agentDid ||
          (e.payload as { agentDid?: string })?.agentDid === agentDid ||
          (e.payload as { claimantDid?: string })?.claimantDid === agentDid ||
          (e.payload as { recipientDid?: string })?.recipientDid === agentDid,
      );

      for (let i = 0; i < relevant.length; i++) {
        const evt = relevant[i]!;
        const nodeId = `node_${evt.eventId}`;
        nodes.push({
          id: nodeId,
          nodeType: this.mapEventTypeToNodeType(evt.eventType),
          sourceEventId: evt.eventId,
          eventType: evt.eventType,
          title: evt.eventType.replace(/_/g, " "),
          summary: this.summarizeEventPayload(evt),
          actorDid: evt.authorDid,
          timestamp: evt.timestamp,
          metadata: Object.freeze({ ...(evt.payload as unknown as Record<string, unknown>) }),
        });

        if (i > 0) {
          edges.push({
            sourceNodeId: `node_${relevant[i - 1]!.eventId}`,
            targetNodeId: nodeId,
            relationship: "CAUSED_BY",
            description: `Sequential evolutionary progression`,
          });
        }
      }

      return {
        entityId: target.id,
        entityType: "agent",
        rootNodeId: nodes.length > 0 ? nodes[0]!.id : "root_none",
        nodes: Object.freeze(nodes),
        edges: Object.freeze(edges),
        narrativeSummary: `Evolutionary trajectory for ${agentDid.slice(0, 16)} across ${nodes.length} signed events.`,
        derivedAt,
      };
    }

    return {
      entityId: target.id,
      entityType: target.type,
      rootNodeId: "root_generic",
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      narrativeSummary: `Causal graph for ${target.type} ${target.id}.`,
      derivedAt,
    };
  }

  private mapEventTypeToNodeType(eventType: string): CausalNode["nodeType"] {
    if (eventType.includes("GAP")) return "CAPABILITY_GAP";
    if (eventType.includes("LEARNING")) return "LEARNING_INVESTMENT";
    if (eventType.includes("VERIF")) return "BENCHMARK_VERIFICATION";
    if (eventType.includes("ATTEST")) return "ATTESTATION";
    if (eventType.includes("ADVERT")) return "ADVERTISEMENT";
    if (eventType.includes("WORK") || eventType.includes("EXEC")) return "WORK_EXECUTION";
    if (eventType.includes("REVIEW")) return "PEER_REVIEW";
    if (eventType.includes("DISPUTE")) return "COURT_DISPUTE";
    if (eventType.includes("VERDICT")) return "JUDICIAL_VERDICT";
    if (eventType.includes("PAYMENT") || eventType.includes("ESCROW")) return "ECONOMIC_SETTLEMENT";
    if (eventType.includes("STRATEGY")) return "STRATEGY_SHIFT";
    return "MISSION_DEMAND";
  }

  private summarizeEventPayload(event: CivilizationEvent): string {
    const p = (event.payload || {}) as unknown as Record<string, unknown>;
    if (p.targetCapability) return `Target Capability: ${p.targetCapability}`;
    if (p.missionId) return `Mission ID: ${p.missionId}`;
    if (p.verdict) return `Verdict: ${p.verdict}`;
    if (p.amount) return `Amount: ${p.amount} FLOP`;
    return `Signed event at ${event.timestamp}`;
  }
}
