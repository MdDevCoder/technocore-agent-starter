import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildHandoffUrl,
  extractSafeHandoffParams,
  validateReceivedHandoff,
  getHandoffPreviewMetadata,
  sanitizeFieldValue,
  TOOL_ALLOWLISTS,
  FORBIDDEN_PARAM_KEYS,
} from "../../src/workspace/handoff.ts";

describe("Safe Workspace Handoff & Deep-Linking Security Tests", () => {
  describe("1. Strict Per-Tool Allowlists", () => {
    test("builder allowlist accepts only project, lang, archetype, room, did", () => {
      const url = buildHandoffUrl("builder", {
        project: "alpha-trader",
        lang: "TYPESCRIPT",
        archetype: "TCLK_TRADER",
        room: "tclk-offers",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        op: "forbidden-for-builder",
        text: "forbidden-text",
        nonce: "12345",
      });

      assert.ok(url.startsWith("/start?"));
      assert.ok(url.includes("project=alpha-trader"));
      assert.ok(url.includes("lang=TYPESCRIPT"));
      assert.ok(url.includes("archetype=TCLK_TRADER"));
      assert.ok(url.includes("room=tclk-offers"));
      assert.ok(url.includes("did=did%3Akey%3Az6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2"));
      assert.strictEqual(url.includes("forbidden-for-builder"), false);
      assert.strictEqual(url.includes("forbidden-text"), false);
    });

    test("forge allowlist accepts only project, lang, archetype, did, room, op", () => {
      const url = buildHandoffUrl("forge", {
        project: "forge-agent",
        lang: "PYTHON",
        archetype: "TELEMETRY_INDEXER",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        room: "events",
        op: "room-message",
        preset: "forbidden-preset",
      });

      assert.ok(url.startsWith("/forge?"));
      assert.ok(url.includes("project=forge-agent"));
      assert.ok(url.includes("lang=PYTHON"));
      assert.ok(url.includes("room=events"));
      assert.ok(url.includes("op=room-message"));
      assert.strictEqual(url.includes("forbidden-preset"), false);
    });

    test("observatory allowlist accepts ONLY room", () => {
      const url = buildHandoffUrl("observatory", {
        room: "market",
        project: "some-project",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        lang: "TYPESCRIPT",
      });

      assert.equal(url, "/observatory?room=market");
    });

    test("doctor allowlist accepts text, nonce, and sig in addition to room and did", () => {
      const sampleSig = "m6nK1w0v7qL9xZ3yA5bC8dE2fG4hJ6kM8nQ1sT3vW5yB7dF9hK2mP4rS6tU8vX0zB2dF4hJ6kL8nQ0sT2vW4xY6zA8b";
      const url = buildHandoffUrl("doctor", {
        room: "lobby",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        nonce: "1789200000000",
        text: "Agent check-in",
        sig: sampleSig,
        source: "PUBLIC_NETWORK",
        unauthorizedParam: "malicious",
      });

      assert.ok(url.startsWith("/doctor?"));
      assert.ok(url.includes("room=lobby"));
      assert.ok(url.includes("nonce=1789200000000"));
      assert.ok(url.includes("text=Agent+check-in") || url.includes("text=Agent%20check-in"));
      assert.ok(url.includes(`sig=${sampleSig}`));
      assert.ok(url.includes("source=PUBLIC_NETWORK"));
      assert.strictEqual(url.includes("unauthorizedParam"), false);
    });
  });

  describe("2. Secret Stripping & Malicious Payload Rejection", () => {
    test("rejects all sensitive keys: privateKey, seed, password, token, auth, credential, backup, jwk, signingHandle", () => {
      const attackParams = {
        project: "test",
        privateKey: "privkey12345",
        seed: "super_secret_seed",
        password: "my_passphrase",
        signingHandle: "internal_handle",
        credentials: "user:pass",
        backup: "encrypted_backup_blob",
        token: "bearer_xyz",
        auth: "basic_auth",
        jwk: '{"kty":"OKP"}',
        secret: "topsecret",
        signingKey: "raw_key",
      };

      const url = buildHandoffUrl("builder", attackParams);
      for (const secretKey of FORBIDDEN_PARAM_KEYS) {
        assert.strictEqual(url.includes(secretKey), false, `URL must not contain key ${secretKey}`);
      }
      assert.strictEqual(url.includes("privkey12345"), false);
      assert.strictEqual(url.includes("super_secret_seed"), false);
      assert.strictEqual(url.includes("my_passphrase"), false);
    });

    test("rejects secret content hidden inside permitted fields (e.g. project name or text containing 'seed' or 'privateKey')", () => {
      const sanitizedProject = sanitizeFieldValue("project", "my-seed-agent");
      assert.strictEqual(sanitizedProject, null, "Field containing 'seed' must be rejected");

      const sanitizedText = sanitizeFieldValue("text", "Here is my privateKey: 12345678");
      assert.strictEqual(sanitizedText, null, "Text containing 'privateKey' must be rejected");

      const sanitizedRoom = sanitizeFieldValue("room", "password-recovery");
      assert.strictEqual(sanitizedRoom, null, "Room containing 'password' must be rejected");
    });
  });

  describe("3. Field-Level Validation & Size Limits", () => {
    test("bounds project name to 64 alphanumeric characters", () => {
      const longName = "a".repeat(100);
      const sanitized = sanitizeFieldValue("project", longName);
      assert.equal(sanitized?.length, 64);

      const specialChars = sanitizeFieldValue("project", "my<script>alert(1)</script>agent!");
      assert.equal(specialChars, "myscriptalert1scriptagent");
    });

    test("validates public DID format strictly (did:key:z6Mk...)", () => {
      const validDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
      assert.equal(sanitizeFieldValue("did", validDid), validDid);

      assert.strictEqual(sanitizeFieldValue("did", "did:invalid:123"), null);
      assert.strictEqual(sanitizeFieldValue("did", "did:key:z6MkShort"), null);
      assert.strictEqual(sanitizeFieldValue("did", "did:key:z6Mk" + "0".repeat(50)), null); // '0' is invalid base58btc
    });

    test("bounds room identifier and strips leading /r/", () => {
      assert.equal(sanitizeFieldValue("room", "/r/tclk-offers"), "tclk-offers");
      assert.equal(sanitizeFieldValue("room", "events"), "events");
      assert.equal(sanitizeFieldValue("room", "/r/invalid/nested/path"), "invalidnestedpath");
    });

    test("bounds text to max 500 characters and rejects oversized text", () => {
      const validText = "Safe message content within bounds";
      assert.equal(sanitizeFieldValue("text", validText), validText);

      const oversizedText = "x".repeat(501);
      assert.strictEqual(sanitizeFieldValue("text", oversizedText), null);
    });

    test("validates nonce as numeric string up to 32 digits", () => {
      assert.equal(sanitizeFieldValue("nonce", "1789200000000"), "1789200000000");
      assert.strictEqual(sanitizeFieldValue("nonce", "17892abc"), null);
      assert.strictEqual(sanitizeFieldValue("nonce", "1".repeat(33)), null);
    });

    test("validates signature as base64url string between 43 and 128 characters", () => {
      const validSig = "m6nK1w0v7qL9xZ3yA5bC8dE2fG4hJ6kM8nQ1sT3vW5yB7dF9hK2mP4rS6tU8vX0zB2dF4hJ6kL8nQ0sT2vW4xY6zA8b";
      assert.equal(sanitizeFieldValue("sig", validSig), validSig);

      assert.strictEqual(sanitizeFieldValue("sig", "short"), null);
      assert.strictEqual(sanitizeFieldValue("sig", validSig + "+has+invalid+chars!"), null);
    });
  });

  describe("4. Deterministic Ordering & URL Bounds", () => {
    test("sorts query parameters alphabetically for canonical links", () => {
      const url = buildHandoffUrl("builder", {
        room: "tclk-offers",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        archetype: "TCLK_TRADER",
        project: "alpha",
        lang: "TYPESCRIPT",
      });

      const queryString = url.split("?")[1] || "";
      const keys = queryString.split("&").map((p) => p.split("=")[0]);
      assert.deepEqual(keys, ["archetype", "did", "lang", "project", "room"]);
    });

    test("enforces total URL length limit of 2,048 characters", () => {
      const validUrl = buildHandoffUrl("doctor", {
        room: "events",
        text: "a".repeat(400),
      });
      assert.ok(validUrl.length <= 2048);
    });
  });

  describe("5. Receiving Tool Validation & Preview Metadata", () => {
    test("validateReceivedHandoff extracts accepted parameters strictly", () => {
      const searchParams = new URLSearchParams({
        project: "rec-test",
        lang: "TYPESCRIPT",
        room: "events",
        did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        injectedAdmin: "true",
      });

      const { hasHandoff, acceptedFields, params } = validateReceivedHandoff("builder", searchParams);
      assert.equal(hasHandoff, true);
      assert.equal(acceptedFields.project, "rec-test");
      assert.equal(acceptedFields.lang, "TYPESCRIPT");
      assert.equal(acceptedFields.room, "events");
      assert.equal(acceptedFields.did, "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
      assert.strictEqual(acceptedFields.injectedAdmin, undefined);
      assert.strictEqual((params as Record<string, unknown>).injectedAdmin, undefined);
    });

    test("getHandoffPreviewMetadata returns rich breakdown with NOT SHARED invariants", () => {
      const meta = getHandoffPreviewMetadata(
        "forge",
        {
          project: "my-trader",
          lang: "TYPESCRIPT",
          archetype: "TCLK_TRADER",
          room: "tclk-offers",
          did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        },
        "https://technocore-agent-starter.vercel.app",
      );

      assert.equal(meta.destination, "forge");
      assert.equal(meta.toolTitle, "Payload Forge");
      assert.ok(meta.fullUrl.startsWith("https://technocore-agent-starter.vercel.app/forge?"));
      assert.equal(meta.sharedFields.length, 5);
      assert.ok(meta.notSharedFields.includes("Private keys"));
      assert.ok(meta.notSharedFields.includes("Entropy seeds"));
      assert.ok(meta.notSharedFields.includes("Decryption passwords"));
    });
  });

  describe("6. Edge Cases: Duplicates, Percent-Encoding, and Unicode", () => {
    test("handles duplicate query parameters deterministically by taking standard first occurrence", () => {
      const searchParams = new URLSearchParams();
      searchParams.append("project", "first-project");
      searchParams.append("project", "second-project");
      searchParams.append("room", "events");

      const { acceptedFields } = validateReceivedHandoff("builder", searchParams);
      assert.equal(acceptedFields.project, "first-project");
      assert.equal(acceptedFields.room, "events");
    });

    test("handles percent-encoding edge cases safely", () => {
      const encodedDid = encodeURIComponent("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
      const searchParams = new URLSearchParams(`did=${encodedDid}&project=alpha%2Dagent&room=tclk%2Doffers`);
      
      const { acceptedFields } = validateReceivedHandoff("builder", searchParams);
      assert.equal(acceptedFields.did, "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
      assert.equal(acceptedFields.project, "alpha-agent");
      assert.equal(acceptedFields.room, "tclk-offers");
    });

    test("sanitizes unusual Unicode, null bytes, and non-printable characters", () => {
      const unicodeProject = "Alpha\u0000Agent\u200B\uFEFF!@#";
      const sanitized = sanitizeFieldValue("project", unicodeProject);
      assert.equal(sanitized, "AlphaAgent");

      const unicodeRoom = "room\u0000\u001F_test";
      const sanitizedRoom = sanitizeFieldValue("room", unicodeRoom);
      assert.equal(sanitizedRoom, "room_test");
    });

    test("receiving-side rejects forged secrets and oversized parameters completely", () => {
      const attackParams = new URLSearchParams({
        project: "legit-project",
        seed: "secret-seed-value",
        privateKey: "priv-key-value",
        text: "x".repeat(600), // oversized
        sig: "short-bad-sig",
        did: "did:key:malformed",
      });

      const { acceptedFields } = validateReceivedHandoff("doctor", attackParams);
      assert.equal(acceptedFields.project, "legit-project");
      assert.strictEqual(acceptedFields.seed, undefined);
      assert.strictEqual(acceptedFields.privateKey, undefined);
      assert.strictEqual(acceptedFields.text, undefined);
      assert.strictEqual(acceptedFields.sig, undefined);
      assert.strictEqual(acceptedFields.did, undefined);
    });
  });
});



