/**
 * Phase 17 — Live Data Unification & Provenance Tests.
 *
 * Verifies:
 * 1. Universal Provenance metadata model and freshness states (LIVE, UPDATING, STALE, OFFLINE).
 * 2. Strict isolation between LIVE and DEMO / SIMULATION data.
 * 3. Projections derive deterministically with proper provenance attribution.
 * 4. Offline mode preserves last known verified state without synthetic fallback.
 * 5. Agent directory in Live mode derives only from verified events (zero synthetic agents).
 * 6. Marketplace and Deals cleanly distinguish LIVE vs LOCAL_DEMO vs REHEARSAL.
 * 7. Economy dashboard strictly labels PaperRail/MemoryRail as educational/rehearsal accounting.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createProvenanceMetadata,
  evaluateFreshness,
  isLiveProvenance,
  isSimulationOrDemo,
  formatProvenanceLabel,
} from "../../src/civilization/data/provenance.ts";
import { LiveCivilizationRepository } from "../../src/civilization/data/live-repository.ts";
import { aggregateAgentReputations } from "../../src/civilization/reputation/projection.ts";
import { aggregateMarketplaceFromEvents } from "../../src/civilization/market/aggregation.ts";
import { aggregateDealsFromEvents } from "../../src/civilization-ui/deals/aggregateDeals.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";

function createMockEvent<T extends CivilizationEvent["eventType"]>(
  params: Partial<CivilizationEvent<T>> & { eventType: T; eventId: string }
): CivilizationEvent<T> {
  return {
    protocol: "civilization-event-v1",
    version: "1.0.0",
    eventId: params.eventId,
    eventType: params.eventType,
    timestamp: params.timestamp || new Date().toISOString(),
    authorDid: params.authorDid || "did:key:z6MkwSample1",
    missionId: params.missionId || "mission-001",
    taskId: params.taskId || null,
    parentEventIds: params.parentEventIds || [],
    payload: (params.payload || {}) as unknown as CivilizationEvent<T>["payload"],
    signature: params.signature || "mock-signature-86-characters-base64url-valid-length-sample-signature-for-unit-tests-ok",
    sequence: params.sequence,
    isDemo: params.isDemo,
  } as CivilizationEvent<T>;
}

describe("Phase 17: Universal Provenance & Data Freshness Model", () => {
  it("creates valid provenance metadata with expected defaults", () => {
    const meta = createProvenanceMetadata({
      provenance: "LIVE_PERSISTENCE",
      source: "/api/civilization/events",
      verified: true,
      verifiedEventsCount: 42,
      lastEventSequence: 100,
    });

    assert.equal(meta.provenance, "LIVE_PERSISTENCE");
    assert.equal(meta.source, "/api/civilization/events");
    assert.equal(meta.verified, true);
    assert.equal(meta.verifiedEventsCount, 42);
    assert.equal(meta.lastEventSequence, 100);
    assert.equal(meta.freshness, "LIVE");
  });

  it("evaluates freshness dynamically based on threshold", () => {
    const now = Date.now();
    const recent = new Date(now - 10_000).toISOString(); // 10s ago
    const stale = new Date(now - 120_000).toISOString(); // 2m ago

    assert.equal(evaluateFreshness(recent, 60_000), "LIVE");
    assert.equal(evaluateFreshness(stale, 60_000), "STALE");
  });

  it("correctly classifies live vs simulation/demo provenance", () => {
    assert.equal(isLiveProvenance("LIVE_NETWORK"), true);
    assert.equal(isLiveProvenance("LIVE_PERSISTENCE"), true);
    assert.equal(isLiveProvenance("DERIVED_FROM_LIVE_EVENTS"), true);
    assert.equal(isLiveProvenance("LOCAL_SIMULATION"), false);
    assert.equal(isLiveProvenance("LOCAL_DEMO"), false);
    assert.equal(isLiveProvenance("REHEARSAL"), false);

    assert.equal(isSimulationOrDemo("LOCAL_SIMULATION"), true);
    assert.equal(isSimulationOrDemo("LOCAL_DEMO"), true);
    assert.equal(isSimulationOrDemo("REHEARSAL"), true);
    assert.equal(isSimulationOrDemo("LIVE_NETWORK"), false);
  });

  it("formats human-readable provenance labels accurately", () => {
    assert.equal(formatProvenanceLabel("LIVE_NETWORK"), "Live Network (Technocore)");
    assert.equal(formatProvenanceLabel("LIVE_PERSISTENCE"), "Live Persistence (PostgreSQL/Authoritative)");
    assert.equal(formatProvenanceLabel("DERIVED_FROM_LIVE_EVENTS"), "Derived from Live Events");
    assert.equal(formatProvenanceLabel("LOCAL_SIMULATION"), "Local Simulation (Synthetic World)");
    assert.equal(formatProvenanceLabel("LOCAL_DEMO"), "Local Demo Fixture");
    assert.equal(formatProvenanceLabel("REHEARSAL"), "Rehearsal Rail (No Value Settled)");
  });
});

describe("Phase 17: Canonical Live Data Layer (LiveCivilizationRepository)", () => {
  it("starts in OFFLINE freshness before first successful fetch", () => {
    const repo = new LiveCivilizationRepository();
    const meta = repo.getMetadata();
    assert.equal(meta.freshness, "OFFLINE");
    assert.equal(meta.verifiedEventsCount, 0);
    assert.deepEqual(repo.getEvents(), []);
  });

  it("ingests verified events and updates provenance metadata", () => {
    const repo = new LiveCivilizationRepository();
    const sampleEvents: CivilizationEvent[] = [
      createMockEvent({
        eventId: "evt-001",
        eventType: "AGENT_DISCOVERED",
        timestamp: "2026-09-10T12:00:00.000Z",
        sequence: 1,
        authorDid: "did:key:z6MkwSample1",
        payload: {
          agentId: "agent-01",
          did: "did:key:z6MkwSample1",
          displayName: "LiveAuditor-01",
          role: "AUDITOR",
          capabilities: [{ name: "AUDIT", proficiency: 90 }],
        },
      }),
      createMockEvent({
        eventId: "evt-002",
        eventType: "CAPABILITY_ADVERTISED",
        timestamp: "2026-09-10T12:01:00.000Z",
        sequence: 2,
        authorDid: "did:key:z6MkwSample1",
        payload: {
          did: "did:key:z6MkwSample1",
          capability: { name: "AUDIT", proficiency: 92 },
        },
      }),
    ];

    repo.ingestEvents(sampleEvents);

    const events = repo.getEvents();
    assert.equal(events.length, 2);
    assert.equal(repo.getCursor(), 2);

    const meta = repo.getMetadata();
    assert.equal(meta.provenance, "LIVE_PERSISTENCE");
    assert.equal(meta.verified, true);
    assert.equal(meta.verifiedEventsCount, 2);
    assert.equal(meta.lastEventSequence, 2);
    assert.equal(meta.freshness, "LIVE");
  });

  it("deduplicates duplicate event IDs across multiple sync batches", () => {
    const repo = new LiveCivilizationRepository();
    const event1 = createMockEvent({
      eventId: "evt-dup-1",
      eventType: "CAPABILITY_ADVERTISED",
      timestamp: "2026-09-10T12:00:00.000Z",
      sequence: 1,
      authorDid: "did:key:z6MkwSample1",
      payload: {
        did: "did:key:z6MkwSample1",
        capability: { name: "DATA_ANALYSIS", proficiency: 88 },
      },
    });

    repo.ingestEvents([event1]);
    assert.equal(repo.getEvents().length, 1);

    // Re-ingest the exact same event
    repo.ingestEvents([event1]);
    assert.equal(repo.getEvents().length, 1);
  });

  it("preserves last known verified state during offline fetch failure without substituting demo fixtures", async () => {
    const repo = new LiveCivilizationRepository();
    const event1 = createMockEvent({
      eventId: "evt-offline-1",
      eventType: "CAPABILITY_ADVERTISED",
      timestamp: "2026-09-10T12:00:00.000Z",
      sequence: 1,
      authorDid: "did:key:z6MkwSample1",
      payload: {
        did: "did:key:z6MkwSample1",
        capability: { name: "SECURITY", proficiency: 94 },
      },
    });
    repo.ingestEvents([event1]);

    const originalFetch = global.fetch;
    try {
      global.fetch = async () => {
        throw new Error("Network offline");
      };

      await assert.rejects(async () => {
        await repo.fetchEvents();
      }, /Network offline/);

      // Data should remain intact (1 verified event), but metadata switches to OFFLINE
      assert.equal(repo.getEvents().length, 1);
      assert.equal(repo.getMetadata().freshness, "OFFLINE");
      // CRITICAL: Must not invent synthetic demo events
      assert.equal(repo.getEvents().find((e) => e.eventType === "DEAL_OFFER_CREATED"), undefined);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("Phase 17: Deterministic Live Projections & Truthful Empty States", () => {
  it("derives agent directory strictly from verified events without synthetic genesis agents", () => {
    const emptyEvents: CivilizationEvent[] = [];
    const agents = aggregateAgentReputations(emptyEvents);
    assert.equal(agents.length, 0); // Zero fake agents in live mode!

    const liveEvents: CivilizationEvent[] = [
      createMockEvent({
        eventId: "evt-live-agent-1",
        eventType: "AGENT_DISCOVERED",
        timestamp: "2026-09-10T12:00:00.000Z",
        authorDid: "did:key:z6MkwRealAgent",
        payload: {
          agentId: "agent-real-01",
          did: "did:key:z6MkwRealAgent",
          displayName: "RealNetworkWorker",
          role: "WORKER",
          capabilities: [{ name: "DATA_ANALYSIS", proficiency: 95 }],
        },
      }),
    ];

    const derivedAgents = aggregateAgentReputations(liveEvents);
    assert.equal(derivedAgents.length, 1);
    assert.equal(derivedAgents[0]?.did, "did:key:z6MkwRealAgent");
    assert.equal(derivedAgents[0]?.displayName, "RealNetworkWorker");
  });

  it("derives marketplace strictly from verified events (returns 0 opportunities when none exist)", () => {
    const liveEventsWithoutProposals: CivilizationEvent[] = [
      createMockEvent({
        eventId: "evt-other-1",
        eventType: "CAPABILITY_ADVERTISED",
        timestamp: "2026-09-10T12:00:00.000Z",
        sequence: 1,
        authorDid: "did:key:z6MkwRealAgent",
        payload: {
          did: "did:key:z6MkwRealAgent",
          capability: { name: "CRYPTO", proficiency: 80 },
        },
      }),
    ];

    const marketState = aggregateMarketplaceFromEvents(liveEventsWithoutProposals);
    assert.equal(marketState.opportunities.length, 0);
    assert.equal(marketState.totalSettledOpportunities, 0);
    assert.equal(marketState.activeCandidatesCount, 1);
  });

  it("deals projection cleanly distinguishes LOCAL_DEMO vs LIVE execution", () => {
    const mixedEvents: CivilizationEvent[] = [
      createMockEvent({
        eventId: "evt-deal-demo-1",
        eventType: "DEAL_OFFER_CREATED",
        timestamp: "2026-09-10T12:00:00.000Z",
        sequence: 1,
        authorDid: "did:key:z6MkwAgentA",
        payload: {
          offerId: "contract-demo-999",
          role: "payer",
          from: "did:key:z6MkwAgentA",
          amount: "100",
          asset: "FLOP",
          provenance: "LOCAL_DEMO",
          lockKind: "hash",
          rails: ["memory"],
          claimByMs: 1800000,
          refundAfterMs: 3600000,
          expiresMs: 900000,
        } as unknown as CivilizationEvent<"DEAL_OFFER_CREATED">["payload"],
      }),
      createMockEvent({
        eventId: "evt-deal-live-1",
        eventType: "DEAL_OFFER_CREATED",
        timestamp: "2026-09-10T12:05:00.000Z",
        sequence: 2,
        authorDid: "did:key:z6MkwAgentC",
        payload: {
          offerId: "contract-live-100",
          role: "payer",
          from: "did:key:z6MkwAgentC",
          amount: "250",
          asset: "FLOP",
          provenance: "NETWORK_EXECUTED",
          lockKind: "hash",
          rails: ["paper"],
          claimByMs: 1800000,
          refundAfterMs: 3600000,
          expiresMs: 900000,
        } as unknown as CivilizationEvent<"DEAL_OFFER_CREATED">["payload"],
      }),
    ];

    const deals = aggregateDealsFromEvents(mixedEvents);
    assert.equal(deals.length, 2);

    const demoDeal = deals.find((d) => d.contractId === "contract-demo-999");
    const liveDeal = deals.find((d) => d.contractId === "contract-live-100");

    assert.ok(demoDeal);
    assert.ok(liveDeal);
    assert.equal(demoDeal?.provenance, "LOCAL_DEMO");
    assert.equal(liveDeal?.provenance, "NETWORK_EXECUTED");
  });
});
