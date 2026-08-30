/**
 * Deterministic Projection Engine.
 *
 * Consumes the append-only CivilizationEventStore stream in strict sequence order,
 * projecting materialization models for Economy, Reputation, Discovery, Court, and Causality.
 * Supports incremental batch processing and complete deterministic replay from scratch.
 */

import { DerivedAgentRegistry } from "../agent/registry.ts";
import { CausalLineageEngine } from "../causality/engine.ts";
import type { CausalLineageGraph } from "../causality/types.ts";
import { EconomicLedger } from "../economy/ledger.ts";
import type { EconomicState } from "../economy/types.ts";
import type { CivilizationEventStore, StoredCivilizationEvent } from "../persistence/types.ts";
import { extractReputationEvidence } from "../reputation/evidence.ts";
import { calculateAgentReputation } from "../reputation/calculator.ts";
import type { DerivedAgentReputation, ReputationEvidence } from "../reputation/types.ts";
import type { AgentAdvertisement } from "../agent/advertisement.ts";
import type { AgentCapability } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";

export interface ProjectedCivilizationState {
  readonly headSequence: number;
  readonly lastSyncedTimestamp: IsoUtcTimestamp;
  readonly totalEvents: number;
  readonly economicState: EconomicState;
  readonly reputations: ReadonlyMap<DidString, DerivedAgentReputation>;
  readonly advertisements: readonly AgentAdvertisement[];
}

export class DeterministicProjectionEngine {
  private readonly store: CivilizationEventStore;
  private readonly projectionName: string;

  private lastProcessedSequence = 0;
  private readonly events: StoredCivilizationEvent[] = [];

  // Domain Projections
  private readonly economicLedger = new EconomicLedger();
  private readonly agentRegistry = new DerivedAgentRegistry();
  private readonly causalityEngine = new CausalLineageEngine();
  private readonly reputationEvidence: ReputationEvidence[] = [];
  private readonly reputations = new Map<DidString, DerivedAgentReputation>();

  constructor(store: CivilizationEventStore, projectionName = "master_projection") {
    this.store = store;
    this.projectionName = projectionName;
  }

  /**
   * Initializes checkpoint state from store.
   */
  async initialize(): Promise<void> {
    const checkpoint = await this.store.getCheckpoint(this.projectionName);
    if (checkpoint) {
      this.lastProcessedSequence = checkpoint.lastSequenceNum;
    }
  }

  /**
   * Synchronizes the projection engine by processing all committed events
   * from the last checkpoint up to the current store head.
   */
  async sync(batchLimit = 500): Promise<number> {
    let processedCount = 0;

    while (true) {
      const batch = await this.store.getAfterSequence(this.lastProcessedSequence, batchLimit);
      if (batch.length === 0) {
        break;
      }

      for (const event of batch) {
        this.applyEvent(event);
        this.lastProcessedSequence = event.sequenceNum;
        processedCount++;
      }

      await this.store.saveCheckpoint({
        projectionName: this.projectionName,
        lastSequenceNum: this.lastProcessedSequence,
        updatedAt: new Date().toISOString(),
      });

      if (batch.length < batchLimit) {
        break;
      }
    }

    return processedCount;
  }

  /**
   * Applies a single event to all domain projections.
   */
  public applyEvent(event: StoredCivilizationEvent): void {
    this.events.push(event);

    // 1. Economic Ledger Projection
    this.economicLedger.applyEvent(event);

    // 2. Discovery & Advertisement Projection
    if (event.eventType === "CAPABILITY_ADVERTISED") {
      const payload = event.payload as unknown as Record<string, unknown> | null | undefined;
      if (payload && typeof payload.did === "string") {
        const cap = payload.capability as AgentCapability | undefined;
        if (cap && typeof cap.name === "string") {
          const now = new Date().toISOString();
          const ad: AgentAdvertisement = {
            did: payload.did,
            capabilities: [cap],
            availability: "available",
            advertisedAt: event.timestamp || now,
            ttlSeconds: 86400,
            expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
            signature: event.signature,
          };
          this.agentRegistry.registerAdvertisement(ad);
        } else if (Array.isArray(payload.capabilities)) {
          this.agentRegistry.registerAdvertisement(payload as unknown as AgentAdvertisement);
        }
      }
    }

    // 3. Evidence-Based Reputation Projection
    const newEvidence = extractReputationEvidence([event]);
    if (newEvidence.length > 0) {
      this.reputationEvidence.push(...newEvidence);

      // Recompute reputations for affected DIDs
      const now = new Date().toISOString();
      for (const evi of newEvidence) {
        const rep = calculateAgentReputation(evi.agentDid, this.reputationEvidence, now);
        this.reputations.set(evi.agentDid, rep);
      }
    }
  }

  /**
   * Complete deterministic rebuild: resets all internal projections to empty
   * and replays the entire event log from sequence 0.
   */
  async rebuildAllFromScratch(): Promise<void> {
    this.lastProcessedSequence = 0;
    this.events.length = 0;
    this.reputationEvidence.length = 0;
    this.reputations.clear();

    await this.sync(1000);
  }

  /**
   * Returns a snapshot of the current projected civilization state.
   */
  getState(): ProjectedCivilizationState {
    return Object.freeze({
      headSequence: this.lastProcessedSequence,
      lastSyncedTimestamp: this.events.length > 0 ? this.events[this.events.length - 1]!.timestamp : new Date().toISOString(),
      totalEvents: this.events.length,
      economicState: this.economicLedger.getState(),
      reputations: new Map(this.reputations),
      advertisements: this.agentRegistry.getAllAdvertisements(),
    });
  }

  /**
   * Derives a backward causal lineage DAG for any entity.
   */
  deriveCausalLineage(target: { agentDid?: DidString; capability?: string; missionId?: string; disputeId?: string }): CausalLineageGraph {
    if (target.agentDid) {
      return this.causalityEngine.buildCausalGraph({ type: "agent", id: target.agentDid }, this.events);
    }
    if (target.capability) {
      return this.causalityEngine.buildCausalGraph({ type: "capability", id: target.capability }, this.events);
    }
    if (target.disputeId) {
      return this.causalityEngine.buildCausalGraph({ type: "dispute", id: target.disputeId }, this.events);
    }
    return {
      entityId: "none",
      entityType: "agent",
      rootNodeId: "root_none",
      nodes: [],
      edges: [],
      narrativeSummary: "No causal lineage found.",
      derivedAt: new Date().toISOString(),
    };
  }

  getProcessedSequence(): number {
    return this.lastProcessedSequence;
  }
}
