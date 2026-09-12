import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseTranscriptInput,
  classifyProtocolPayload,
  reconstructTimeline,
  foldTclkState,
  detectAnomalies,
  explainWhy,
  buildEvidenceGraph,
  generateTraceReport,
} from "../../src/trace/engine.ts";
import {
  FIXTURE_TCLK_LIFECYCLE,
  FIXTURE_TAMPERED_SIGNATURE,
  FIXTURE_SEQUENCE_GAP_DUPLICATE,
  FIXTURE_DEADLINE_VIOLATION,
  FIXTURE_PUBLIC_OBSERVATORY,
  TRACE_PRESETS,
  getPresetById,
} from "../../src/trace/fixtures.ts";
import type { RawTraceRecord, ReconstructedEvent } from "../../src/trace/types.ts";

describe("Technocore Agent Trace Studio — Engine Tests", () => {
  describe("Transcript Parsing", () => {
    test("parses standard JSON array of records", () => {
      const input = JSON.stringify([
        { sequence: 1, text: "hello" },
        { sequence: 2, text: "world" },
      ]);
      const records = parseTranscriptInput(input);
      assert.equal(records.length, 2);
      assert.equal(records[0]?.sequence, 1);
      assert.equal(records[1]?.text, "world");
    });

    test("parses JSON object containing records or events array", () => {
      const input = JSON.stringify({
        records: [{ sequence: 10, text: "msg-1" }],
      });
      const records = parseTranscriptInput(input);
      assert.equal(records.length, 1);
      assert.equal(records[0]?.sequence, 10);
    });

    test("parses JSON Lines / NDJSON input", () => {
      const ndjson = `{"sequence": 1, "text": "line1"}\n{"sequence": 2, "text": "line2"}`;
      const records = parseTranscriptInput(ndjson);
      assert.equal(records.length, 2);
      assert.equal(records[0]?.sequence, 1);
      assert.equal(records[1]?.sequence, 2);
    });

    test("handles empty or malformed strings gracefully", () => {
      assert.equal(parseTranscriptInput("").length, 0);
      assert.equal(parseTranscriptInput("   ").length, 0);
    });
  });

  describe("Protocol Classification", () => {
    test("classifies TCLK frames correctly", () => {
      const offer = classifyProtocolPayload(
        '{"type":"offer","asset":"FLOP","amount":"100","lock":"hash"}',
        { type: "offer", asset: "FLOP", amount: "100", lock: "hash" },
      );
      assert.equal(offer.classification, "TCLK_OFFER");
      assert.ok(offer.tclkFrame);

      const accept = classifyProtocolPayload(
        '{"type":"accept","ref":"0x123","statement":"0x456"}',
        { type: "accept", ref: "0x123", statement: "0x456" },
      );
      assert.equal(accept.classification, "TCLK_ACCEPT");

      const lock = classifyProtocolPayload(
        '{"type":"lock","contract":"0x123","rail":"paper"}',
        { type: "lock", contract: "0x123", rail: "paper" },
      );
      assert.equal(lock.classification, "TCLK_LOCK");

      const reveal = classifyProtocolPayload(
        '{"type":"reveal","contract":"0x123","secret":"0xabc"}',
        { type: "reveal", contract: "0x123", secret: "0xabc" },
      );
      assert.equal(reveal.classification, "TCLK_REVEAL");
    });

    test("classifies Agent Heartbeat and Check-in", () => {
      const hb = classifyProtocolPayload('{"action":"heartbeat"}', { action: "heartbeat" });
      assert.equal(hb.classification, "AGENT_HEARTBEAT");

      const checkin = classifyProtocolPayload('{"action":"checkin"}', { action: "checkin" });
      assert.equal(checkin.classification, "AGENT_CHECKIN");
    });

    test("classifies raw text and structured JSON", () => {
      const raw = classifyProtocolPayload("Hello Technocore!", null);
      assert.equal(raw.classification, "CHAT_RAW_TEXT");

      const customJson = classifyProtocolPayload('{"data":123}', { data: 123 });
      assert.equal(customJson.classification, "STRUCTURED_JSON");
    });
  });

  describe("TCLK Deal State Folding", () => {
    test("folds a canonical 4-step TCLK lifecycle into completed status", async () => {
      const result = await reconstructTimeline(
        FIXTURE_TCLK_LIFECYCLE.records,
        FIXTURE_TCLK_LIFECYCLE.source,
        FIXTURE_TCLK_LIFECYCLE.defaultRoom,
      );

      assert.equal(result.events.length, 4);
      assert.equal(result.tclkFold.totalDealsObserved, 1);
      assert.equal(result.tclkFold.completedDealsCount, 1);
      assert.equal(result.tclkFold.failedDealsCount, 0);

      const contract = result.tclkFold.contracts[0]!;
      assert.equal(contract.currentStatus, "claimed");
      assert.equal(contract.amount, "500");
      assert.equal(contract.asset, "FLOP");
      assert.equal(contract.transitions.length, 4);
      assert.equal(contract.transitions[0]?.toStatus, "proposed");
      assert.equal(contract.transitions[1]?.toStatus, "accepted");
      assert.equal(contract.transitions[2]?.toStatus, "locked");
      assert.equal(contract.transitions[3]?.toStatus, "claimed");
    });

    test("handles refund and cancellation folding", () => {
      const mockEvents = [
        {
          id: "evt-1",
          originalIndex: 0,
          sequence: 1,
          room: "tclk-offers",
          serverTimestamp: "2026-09-12T10:00:00Z",
          authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
          nonce: "1",
          signature: null,
          text: '{"type":"offer","id":"0xcontract1","asset":"FLOP","amount":"100","from":"did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2"}',
          canonicalPayload: "tclk-offers|1|{}",
          rawBytesHex: "00",
          rawByteLength: 1,
          evidenceHash: "00",
          verificationState: "UNVERIFIABLE_UNSIGNED" as const,
          classification: "TCLK_OFFER" as const,
          parsedJson: { type: "offer", id: "0xcontract1" },
          tclkFrame: {
            type: "offer" as const,
            id: "0xcontract1",
            asset: "FLOP",
            amount: "100",
            lock: "hash" as const,
            from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
          },
          anomalyIds: [],
        },
        {
          id: "evt-2",
          originalIndex: 1,
          sequence: 2,
          room: "tclk-offers",
          serverTimestamp: "2026-09-12T10:05:00Z",
          authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
          nonce: "2",
          signature: null,
          text: '{"type":"cancel","contract":"0xcontract1","from":"did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2"}',
          canonicalPayload: "tclk-offers|2|{}",
          rawBytesHex: "00",
          rawByteLength: 1,
          evidenceHash: "00",
          verificationState: "UNVERIFIABLE_UNSIGNED" as const,
          classification: "TCLK_CANCEL" as const,
          parsedJson: { type: "cancel", contract: "0xcontract1" },
          tclkFrame: {
            type: "cancel" as const,
            contract: "0xcontract1",
            from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
          },
          anomalyIds: [],
        },
      ];

      const fold = foldTclkState(mockEvents as unknown as ReconstructedEvent[]);
      assert.equal(fold.totalDealsObserved, 1);
      assert.equal(fold.contracts[0]?.currentStatus, "cancelled");
      assert.equal(fold.failedDealsCount, 1);
    });
  });

  describe("Anomaly Detection Rules", () => {
    test("detects INVALID_SIGNATURE anomaly", async () => {
      const result = await reconstructTimeline(
        FIXTURE_TAMPERED_SIGNATURE.records,
        FIXTURE_TAMPERED_SIGNATURE.source,
      );

      const sigAnomaly = result.anomalies.find((a) => a.ruleKey === "INVALID_SIGNATURE" || a.ruleKey === "MALFORMED_FRAME");
      assert.ok(sigAnomaly, "Expected signature anomaly to be flagged");
      assert.equal(sigAnomaly.severity, "CRITICAL");
    });

    test("detects SEQUENCE_GAP and DUPLICATE_EVENT anomalies", async () => {
      const result = await reconstructTimeline(
        FIXTURE_SEQUENCE_GAP_DUPLICATE.records,
        FIXTURE_SEQUENCE_GAP_DUPLICATE.source,
      );

      const gapAnomaly = result.anomalies.find((a) => a.ruleKey === "SEQUENCE_GAP");
      assert.ok(gapAnomaly, "Expected SEQUENCE_GAP anomaly");
      assert.equal(gapAnomaly.severity, "WARNING");

      const dupAnomaly = result.anomalies.find((a) => a.ruleKey === "DUPLICATE_EVENT");
      assert.ok(dupAnomaly, "Expected DUPLICATE_EVENT anomaly");
    });

    test("detects DEADLINE_VIOLATION anomaly on premature refund", async () => {
      const result = await reconstructTimeline(
        FIXTURE_DEADLINE_VIOLATION.records,
        FIXTURE_DEADLINE_VIOLATION.source,
      );

      const deadlineAnomaly = result.anomalies.find((a) => a.ruleKey === "DEADLINE_VIOLATION");
      assert.ok(deadlineAnomaly, "Expected DEADLINE_VIOLATION anomaly");
      assert.equal(deadlineAnomaly.severity, "CRITICAL");
    });

    test("detects SENDER_MISMATCH anomaly", () => {
      const mockEvents = [
        {
          id: "evt-1",
          originalIndex: 0,
          sequence: 10,
          room: "lobby",
          serverTimestamp: "2026-09-12T10:00:00Z",
          authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
          nonce: "1",
          signature: null,
          text: '{"from":"did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG","msg":"spoofed"}',
          canonicalPayload: "lobby|1|{}",
          rawBytesHex: "00",
          rawByteLength: 1,
          evidenceHash: "00",
          verificationState: "UNVERIFIABLE_UNSIGNED" as const,
          classification: "STRUCTURED_JSON" as const,
          parsedJson: { from: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG" },
          tclkFrame: null,
          anomalyIds: [],
        },
      ];

      const fold = foldTclkState(mockEvents as unknown as ReconstructedEvent[]);
      const anomalies = detectAnomalies(mockEvents as unknown as ReconstructedEvent[], fold);
      const mismatch = anomalies.find((a) => a.ruleKey === "SENDER_MISMATCH");
      assert.ok(mismatch, "Expected SENDER_MISMATCH anomaly");
      assert.equal(mismatch.severity, "CRITICAL");
    });
  });

  describe("Why Explanation & Evidence Graph", () => {
    test("generates deterministic fact-based conditions checklist", async () => {
      const result = await reconstructTimeline(
        FIXTURE_TCLK_LIFECYCLE.records,
        FIXTURE_TCLK_LIFECYCLE.source,
      );

      const firstEvent = result.events[0]!;
      const why = explainWhy(firstEvent, result.events, result.tclkFold, result.anomalies);

      assert.equal(why.eventId, firstEvent.id);
      assert.ok(why.conditions.length >= 3);
      assert.ok(why.conditions.some((c) => c.label.includes("Signature")));
      assert.ok(why.conditions.some((c) => c.label.includes("Sender")));
      assert.ok(why.conditions.some((c) => c.label.includes("Sequence")));
    });

    test("builds complete evidence lineage graph", async () => {
      const result = await reconstructTimeline(
        FIXTURE_TCLK_LIFECYCLE.records,
        FIXTURE_TCLK_LIFECYCLE.source,
      );

      const graph = buildEvidenceGraph(result.events[0]!);
      assert.ok(graph.nodes.length >= 7);
      assert.ok(graph.edges.length >= 6);

      const nodeTypes = graph.nodes.map((n) => n.type);
      assert.ok(nodeTypes.includes("EVENT"));
      assert.ok(nodeTypes.includes("ROOM"));
      assert.ok(nodeTypes.includes("SENDER_DID"));
      assert.ok(nodeTypes.includes("PAYLOAD"));
      assert.ok(nodeTypes.includes("VERIFICATION"));
    });
  });

  describe("Deterministic Reports & Zero-Secret Safety", () => {
    test("generates JSON & Markdown reports with valid SHA-256 integrity hash", async () => {
      const result = await reconstructTimeline(
        FIXTURE_PUBLIC_OBSERVATORY.records,
        FIXTURE_PUBLIC_OBSERVATORY.source,
      );

      assert.equal(result.source, "PUBLIC_NETWORK");
      const report = await generateTraceReport(result);

      assert.ok(report.jsonReport);
      assert.ok(report.markdownReport);
      assert.equal(report.sha256Hash.length, 64);

      const parsed = JSON.parse(report.jsonReport);
      assert.equal(parsed.source, "PUBLIC_NETWORK");
      assert.equal(parsed.sha256ReportHash, report.sha256Hash);
      assert.ok(report.markdownReport.includes("SOURCE: PUBLIC_NETWORK"));
    });

    test("zero-secret guarantee: trace state and reports never expose secrets", async () => {
      const result = await reconstructTimeline(
        FIXTURE_TCLK_LIFECYCLE.records,
        FIXTURE_TCLK_LIFECYCLE.source,
      );

      const report = await generateTraceReport(result);
      const combined = report.jsonReport + report.markdownReport;

      // Ensure no private key variables or secret indicators
      assert.strictEqual(combined.includes("TECHNOCORE_AGENT_SEED_HEX"), false);
      assert.strictEqual(combined.includes("PRIVATE_KEY"), false);
      assert.strictEqual(combined.includes("BEGIN PRIVATE KEY"), false);
      assert.strictEqual(combined.includes("password"), false);
      assert.strictEqual(combined.includes("secret_seed"), false);
    });
  });

  describe("Presets Registry", () => {
    test("all 5 presets are registered and fetchable by ID", () => {
      assert.equal(TRACE_PRESETS.length, 5);
      for (const preset of TRACE_PRESETS) {
        const fetched = getPresetById(preset.id);
        assert.equal(fetched.id, preset.id);
        assert.ok(fetched.records.length > 0);
        assert.ok(fetched.source === "LOCAL_FIXTURE" || fetched.source === "PUBLIC_NETWORK");
      }
    });
  });
});
