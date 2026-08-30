import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalEventBytes,
  canonicalEventString,
  createAgentSigner,
  createMissionEvent,
  signCivilizationEvent,
  verifyCivilizationEvent,
} from "../../src/civilization/index.ts";
import { generateKeyPair } from "../../src/crypto/ed25519.ts";

describe("Civilization Event Protocol (civilization-event-v1)", () => {
  it("signs and verifies a valid MISSION_CREATED event", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    const event = await createMissionEvent(
      "mis_11223344",
      handle.did,
      {
        title: "Build Decentralized Task API",
        objective: "Autonomous microservice with Ed25519 authentication",
        requirements: [{ capability: "typescript", minProficiency: 80, requiredCount: 1 }],
        constraints: [{ type: "deadline", value: "2026-09-01T00:00:00Z" }],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 10000 },
        genesisAgentDid: handle.did,
      },
      handle,
    );

    assert.equal(event.protocol, "civilization-event-v1");
    assert.equal(event.version, "1.0.0");
    assert.equal(event.eventType, "MISSION_CREATED");
    assert.equal(event.authorDid, handle.did);
    assert.ok(event.signature.length === 86);

    const result = await verifyCivilizationEvent(event);
    assert.equal(result.valid, true);
    assert.equal(result.reason, undefined);
  });

  it("produces deterministic canonical bytes across runs", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    const event = await createMissionEvent(
      "mis_fixed_test",
      handle.did,
      {
        title: "Test Mission",
        objective: "Test Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 500 },
        genesisAgentDid: handle.did,
      },
      handle,
    );

    const bytes1 = canonicalEventBytes(event);
    const bytes2 = canonicalEventBytes(event);
    assert.deepEqual(bytes1, bytes2);

    const str = canonicalEventString(event);
    assert.ok(str.includes('"protocol":"civilization-event-v1"'));
    assert.ok(!str.includes('"signature"')); // Signature MUST NOT be in signed bytes
  });

  it("rejects event if payload is tampered after signing", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    const event = await createMissionEvent(
      "mis_tamper_test",
      handle.did,
      {
        title: "Original Mission Title",
        objective: "Original Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: handle.did,
      },
      handle,
    );

    // Tamper with title in payload
    const tamperedEvent = {
      ...event,
      payload: {
        ...event.payload,
        title: "Malicious Tampered Title",
      },
    };

    const result = await verifyCivilizationEvent(tamperedEvent);
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("Cryptographic signature verification failed"));
  });

  it("rejects event if authorDid is tampered", async () => {
    const keyPair1 = await generateKeyPair();
    const handle1 = await createAgentSigner(keyPair1.seed);
    const keyPair2 = await generateKeyPair();
    const handle2 = await createAgentSigner(keyPair2.seed);

    const event = await createMissionEvent(
      "mis_tamper_author",
      handle1.did,
      {
        title: "Mission",
        objective: "Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: handle1.did,
      },
      handle1,
    );

    const tamperedEvent = {
      ...event,
      authorDid: handle2.did,
    };

    const result = await verifyCivilizationEvent(tamperedEvent);
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("signature"));
  });

  it("rejects event if eventType is tampered", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    const event = await createMissionEvent(
      "mis_tamper_type",
      handle.did,
      {
        title: "Mission",
        objective: "Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: handle.did,
      },
      handle,
    );

    const tamperedEvent = {
      ...event,
      eventType: "MISSION_COMPLETED" as any,
    };

    const result = await verifyCivilizationEvent(tamperedEvent);
    assert.equal(result.valid, false);
  });

  it("rejects event if parentEventIds are altered", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    const event = await createMissionEvent(
      "mis_tamper_parents",
      handle.did,
      {
        title: "Mission",
        objective: "Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: handle.did,
      },
      handle,
      ["evt_parent_1", "evt_parent_2"],
    );

    const tamperedEvent = {
      ...event,
      parentEventIds: ["evt_parent_1", "evt_parent_injected"],
    };

    const result = await verifyCivilizationEvent(tamperedEvent);
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("Cryptographic signature verification failed"));
  });

  it("rejects event if timestamp is altered", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    const event = await createMissionEvent(
      "mis_tamper_time",
      handle.did,
      {
        title: "Mission",
        objective: "Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: handle.did,
      },
      handle,
    );

    const tamperedEvent = {
      ...event,
      timestamp: "2026-08-01T00:00:00.000Z",
    };

    const result = await verifyCivilizationEvent(tamperedEvent);
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("signature"));
  });

  it("rejects event if signature bits are flipped", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    const event = await createMissionEvent(
      "mis_flip_sig",
      handle.did,
      {
        title: "Mission",
        objective: "Objective",
        requirements: [],
        constraints: [],
        deadline: "2026-09-01T00:00:00Z",
        budget: { token: "FLOP", amount: 100 },
        genesisAgentDid: handle.did,
      },
      handle,
    );

    // Flip first char of signature
    const flippedSig = (event.signature[0] === "a" ? "b" : "a") + event.signature.slice(1);
    const tamperedEvent = {
      ...event,
      signature: flippedSig,
    };

    const result = await verifyCivilizationEvent(tamperedEvent);
    assert.equal(result.valid, false);
    assert.ok(result.reason?.includes("signature"));
  });

  it("fails early on invalid schema before signing", async () => {
    const keyPair = await generateKeyPair();
    const handle = await createAgentSigner(keyPair.seed);

    await assert.rejects(
      async () => {
        await signCivilizationEvent(
          {
            eventType: "MISSION_CREATED",
            missionId: "mis_invalid",
            authorDid: handle.did,
            payload: {
              title: "", // empty title violates schema
              objective: "Obj",
              requirements: [],
              constraints: [],
              deadline: "2026-09-01T00:00:00Z",
              budget: { token: "FLOP", amount: 10 },
              genesisAgentDid: handle.did,
            },
          },
          handle,
        );
      },
      /title must be a non-empty string/,
    );
  });
});
