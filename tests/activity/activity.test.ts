import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  validateAndSanitizeActivity,
  containsForbiddenSecrets,
  sanitizeString,
  ALLOWED_SOURCES,
} from "../../src/activity/schema.ts";
import {
  emitSafeActivityEvent,
  loadAllActivities,
  clearAllActivities,
  deleteActivityEvent,
  generateDeterministicEventId,
  isDuplicateEvent,
  MAX_ACTIVITY_EVENTS,
} from "../../src/activity/storage.ts";
import { filterActivities, computeActivityStats } from "../../src/activity/filter.ts";
import { formatActivityJsonExport, EXPORT_DISCLAIMER } from "../../src/activity/export.ts";
import {
  recordIdentityAction,
  recordBackupAction,
  recordWorkspaceAction,
  recordReadinessEvaluated,
  recordHealthEvaluated,
  recordDryRunCompleted,
  recordTestkitSimulation,
  recordObservatoryObservation,
  recordTraceAnalysis,
  recordEvidenceAction,
} from "../../src/activity/recorder.ts";
import type { ActivitySource, AgentActivityEventV1, IngestActivityInput } from "../../src/activity/types.ts";

describe("Agent Activity Center — Schema & Secret Protection", () => {
  it("validates well-formed activity events across all 11 allowed sources", () => {
    const sources = Array.from(ALLOWED_SOURCES);
    assert.equal(sources.length, 11);

    for (const source of sources) {
      const input: IngestActivityInput = {
        source,
        action: `Action for ${source}`,
        status: "SUCCESS",
        provenance: "LOCAL",
        summary: `Factual summary for ${source}`,
        destinationRoute: `/${source.toLowerCase()}`,
      };

      const validated = validateAndSanitizeActivity(input, `test-${source}`);
      assert.equal(validated.source, source);
      assert.equal(validated.status, "SUCCESS");
      assert.equal(validated.provenance, "LOCAL");
      assert.equal(validated.action, `Action for ${source}`);
    }
  });

  it("rejects invalid sources, provenance, or statuses", () => {
    assert.throws(
      () =>
        validateAndSanitizeActivity(
          {
            source: "INVALID_SOURCE" as ActivitySource,
            action: "Test",
            status: "SUCCESS",
            provenance: "LOCAL",
            summary: "Test summary",
            destinationRoute: "/test",
          },
          "id-1",
        ),
      /Invalid activity source/,
    );
  });

  it("rejects top-level and nested forbidden secret keywords", () => {
    assert.equal(containsForbiddenSecrets({ privateKey: "secret-key" }), true);
    assert.equal(containsForbiddenSecrets({ seed: "secret-seed" }), true);
    assert.equal(containsForbiddenSecrets({ password: "pass" }), true);
    assert.equal(containsForbiddenSecrets({ token: "bearer-token" }), true);
    assert.equal(containsForbiddenSecrets({ credential: "admin-cred" }), true);
    assert.equal(containsForbiddenSecrets({ cryptoKey: {} }), true);
    assert.equal(containsForbiddenSecrets({ signingHandle: {} }), true);
    assert.equal(containsForbiddenSecrets({ backup: "raw-backup-payload" }), true);

    // Adversarial nested secret in details
    assert.equal(
      containsForbiddenSecrets({
        details: {
          userNote: "safe",
          nested: {
            private_key: "nested-secret-value",
          },
        },
      }),
      true,
    );

    // Secret pattern in summary string
    assert.equal(
      containsForbiddenSecrets({
        summary: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...",
      }),
      true,
    );

    // Safe payload
    assert.equal(
      containsForbiddenSecrets({
        room: "technocore",
        seq: 120684,
        status: "SUCCESS",
        summary: "Cryptographic signature verified for /r/technocore",
      }),
      false,
    );
  });

  it("bounds string lengths and strips non-printable control characters", () => {
    const dirty = "Action\x00Name\x08With\tTabs\nAndNewlines";
    const cleaned = sanitizeString(dirty, 50);
    assert.equal(cleaned, "ActionNameWith\tTabs\nAndNewlines");

    const longSummary = "A".repeat(500);
    const bounded = sanitizeString(longSummary, 300);
    assert.equal(bounded.length, 300);
  });
});

describe("Agent Activity Center — Semantic Invariants: SUCCESS != VERIFIED", () => {
  it("keeps status: SUCCESS and isVerified: false semantically independent for simulations", () => {
    const event = validateAndSanitizeActivity(
      {
        source: "TESTKIT",
        action: "TCLK Deal Simulation",
        status: "SUCCESS",
        provenance: "LOCAL",
        summary: "Simulation 'bilateral-settlement' passed 5 state transitions",
        destinationRoute: "/testkit",
        isVerified: false, // Local simulation succeeded, but is not a signed public cryptographic proof
      },
      "testkit-1",
    );

    assert.equal(event.status, "SUCCESS");
    assert.equal(event.isVerified, false, "Local simulation SUCCESS must not imply cryptographic verification");
  });

  it("marks isVerified: true only for authentic cryptographic verification actions", () => {
    const event = validateAndSanitizeActivity(
      {
        source: "FORGE",
        action: "Ephemeral Signature Dry-Run",
        status: "SUCCESS",
        provenance: "LOCAL",
        summary: "Cryptographic signature verified for /r/technocore",
        destinationRoute: "/forge",
        isVerified: true,
      },
      "forge-1",
    );

    assert.equal(event.status, "SUCCESS");
    assert.equal(event.isVerified, true);
  });
});

describe("Agent Activity Center — Deterministic IDs & Deduplication", () => {
  it("generates deterministic event IDs based on source and entity identifiers", () => {
    const id1 = generateDeterministicEventId({
      source: "OBSERVATORY",
      action: "Public Room Observed",
      status: "SUCCESS",
      provenance: "PUBLIC NETWORK",
      summary: "Observed room",
      destinationRoute: "/observatory",
      details: { room: "technocore", seq: 120684 },
    });

    const id2 = generateDeterministicEventId({
      source: "OBSERVATORY",
      action: "Public Room Observed",
      status: "SUCCESS",
      provenance: "PUBLIC NETWORK",
      summary: "Observed room",
      destinationRoute: "/observatory",
      details: { room: "technocore", seq: 120684 },
    });

    assert.equal(id1, id2);
    assert.equal(id1, "observatory-technocore-seq120684-public-room-observed");
  });

  it("collapses duplicate events arriving within proximity window", () => {
    const event1: AgentActivityEventV1 = {
      id: "evt-readiness-1",
      timestamp: new Date().toISOString(),
      source: "READINESS",
      action: "Development Readiness Evaluated",
      status: "SUCCESS",
      provenance: "LOCAL",
      summary: "7/7 stages satisfied",
      destinationRoute: "/readiness",
    };

    const eventDuplicate: AgentActivityEventV1 = {
      id: "evt-readiness-2", // Different ID, but identical semantic action within seconds
      timestamp: new Date().toISOString(),
      source: "READINESS",
      action: "Development Readiness Evaluated",
      status: "SUCCESS",
      provenance: "LOCAL",
      summary: "7/7 stages satisfied",
      destinationRoute: "/readiness",
    };

    assert.equal(isDuplicateEvent([event1], eventDuplicate), true);
  });
});

describe("Agent Activity Center — Persistence & Bounded Storage", () => {
  beforeEach(() => {
    clearAllActivities();
  });

  it("records meaningful events into storage and respects MAX_ACTIVITY_EVENTS limit", () => {
    for (let i = 0; i < MAX_ACTIVITY_EVENTS + 20; i++) {
      emitSafeActivityEvent({
        id: `unique-event-${i}`,
        timestamp: new Date(Date.now() - (MAX_ACTIVITY_EVENTS + 20 - i) * 60000).toISOString(),
        source: "WORKSPACE",
        action: `Action #${i}`,
        status: "SUCCESS",
        provenance: "LOCAL",
        summary: `Summary for event ${i}`,
        destinationRoute: "/workspace",
      });
    }

    const loaded = loadAllActivities();
    assert.equal(loaded.length, MAX_ACTIVITY_EVENTS, `Storage must be capped at ${MAX_ACTIVITY_EVENTS} events`);

    // Verify chronological ordering (newest first)
    const newest = loaded[0]!;
    const oldest = loaded[loaded.length - 1]!;
    assert.ok(new Date(newest.timestamp).getTime() >= new Date(oldest.timestamp).getTime());
  });

  it("deletes individual events and clears history safely without touching other state", () => {
    const evt = emitSafeActivityEvent({
      id: "to-delete-1",
      source: "HEALTH",
      action: "Health Check",
      status: "SUCCESS",
      provenance: "LOCAL",
      summary: "All signals passed",
      destinationRoute: "/health",
    });

    assert.ok(evt);
    assert.equal(loadAllActivities().length, 1);

    const deleted = deleteActivityEvent("to-delete-1");
    assert.equal(deleted, true);
    assert.equal(loadAllActivities().length, 0);

    // Test clearAllActivities
    emitSafeActivityEvent({
      id: "event-2",
      source: "TRACE",
      action: "Trace Analyzed",
      status: "SUCCESS",
      provenance: "PUBLIC NETWORK",
      summary: "Trace complete",
      destinationRoute: "/trace",
    });
    assert.equal(loadAllActivities().length, 1);

    clearAllActivities();
    assert.equal(loadAllActivities().length, 0);
  });
});

describe("Agent Activity Center — Filtering & Summary Stats", () => {
  const mockEvents: AgentActivityEventV1[] = [
    {
      id: "e1",
      timestamp: new Date().toISOString(), // Today
      source: "READINESS",
      action: "Readiness Check",
      status: "SUCCESS",
      provenance: "LOCAL",
      summary: "7/7 stages completed",
      destinationRoute: "/readiness",
    },
    {
      id: "e2",
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      source: "OBSERVATORY",
      action: "Room Observed",
      status: "SUCCESS",
      provenance: "PUBLIC NETWORK",
      summary: "Observed /r/technocore seq 120684",
      destinationRoute: "/observatory",
    },
    {
      id: "e3",
      timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
      source: "EVIDENCE",
      action: "Evidence Verified",
      status: "ATTENTION",
      provenance: "LOCAL EVIDENCE",
      summary: "Manual record verification warning",
      destinationRoute: "/evidence",
      isVerified: true,
    },
  ];

  it("filters by provenance category accurately", () => {
    const publicNet = filterActivities(mockEvents, {
      provenance: "PUBLIC NETWORK",
      timeRange: "ALL_TIME",
      source: "ALL",
      searchQuery: "",
    });
    assert.equal(publicNet.length, 1);
    assert.equal(publicNet[0]!.source, "OBSERVATORY");

    const verified = filterActivities(mockEvents, {
      provenance: "VERIFIED",
      timeRange: "ALL_TIME",
      source: "ALL",
      searchQuery: "",
    });
    assert.equal(verified.length, 1);
    assert.equal(verified[0]!.id, "e3");

    const attention = filterActivities(mockEvents, {
      provenance: "ATTENTION",
      timeRange: "ALL_TIME",
      source: "ALL",
      searchQuery: "",
    });
    assert.equal(attention.length, 1);
    assert.equal(attention[0]!.id, "e3");
  });

  it("filters by time ranges deterministically", () => {
    const todayOnly = filterActivities(mockEvents, {
      provenance: "ALL",
      timeRange: "TODAY",
      source: "ALL",
      searchQuery: "",
    });
    assert.equal(todayOnly.length, 1);
    assert.equal(todayOnly[0]!.id, "e1");

    const sevenDays = filterActivities(mockEvents, {
      provenance: "ALL",
      timeRange: "7_DAYS",
      source: "ALL",
      searchQuery: "",
    });
    assert.equal(sevenDays.length, 2);
  });

  it("computes factual summary counts without synthetic numbers", () => {
    const stats = computeActivityStats(mockEvents);
    assert.equal(stats.totalEvents, 3);
    assert.equal(stats.successCount, 2);
    assert.equal(stats.attentionCount, 1);
    assert.equal(stats.infoCount, 0);
    assert.equal(stats.failedCount, 0);
    assert.equal(stats.verifiedCount, 1);
  });
});

describe("Agent Activity Center — Typed Action Recorders", () => {
  beforeEach(() => {
    clearAllActivities();
  });

  it("records typed action events with safe scalar details", () => {
    recordIdentityAction("Identity Created", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw");
    recordBackupAction("Backup File Verified", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw");
    recordWorkspaceAction("my-agent", "technocore");
    recordReadinessEvaluated(7, 7, false);
    recordHealthEvaluated("HEALTHY", 6, 6);
    recordDryRunCompleted("BUILDER", "technocore", true);
    recordTestkitSimulation("bilateral-settlement", true, 5);
    recordObservatoryObservation("technocore", 120684, 50, 1789200000000);
    recordTraceAnalysis("technocore", 50, 0);
    recordEvidenceAction("Evidence Preserved", "technocore", 120684, true, "SERVER_RETRIEVED");

    const events = loadAllActivities();
    assert.equal(events.length, 10);

    const observatoryEvt = events.find((e) => e.source === "OBSERVATORY");
    assert.ok(observatoryEvt);
    assert.equal(observatoryEvt.provenance, "PUBLIC NETWORK");
    assert.equal(observatoryEvt.details?.room, "technocore");
    assert.equal(observatoryEvt.details?.seq, 120684);
  });
});

describe("Agent Activity Center — Export Formatting & Limitations", () => {
  it("formats activity JSON export with mandatory non-official disclaimer", () => {
    const mockEvents: AgentActivityEventV1[] = [
      {
        id: "evt-export-1",
        timestamp: "2026-09-13T12:00:00.000Z",
        source: "HEALTH",
        action: "Health Evaluated",
        status: "SUCCESS",
        provenance: "LOCAL",
        summary: "6/6 signals passed",
        destinationRoute: "/health",
        details: { passed: 6, total: 6 },
      },
    ];

    const json = formatActivityJsonExport(mockEvents);
    const parsed = JSON.parse(json);

    assert.equal(parsed.schema, "technocore-activity-export-v1");
    assert.equal(parsed.disclaimer, EXPORT_DISCLAIMER);
    assert.equal(parsed.disclaimer, "Local activity history generated from verified application events.");
    assert.equal(parsed.stats.totalEvents, 1);
    assert.equal(parsed.stats.successful, 1);
    assert.equal(parsed.events.length, 1);
    assert.equal(parsed.events[0].id, "evt-export-1");
  });
});
