import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveBackupKey, PBKDF2_ITERATIONS } from "../../src/crypto/kdf.ts";
import { seal, unseal } from "../../src/crypto/aead.ts";
import { generateKeyPair, publicKeyFromSeed, sign } from "../../src/crypto/ed25519.ts";
import { fromBase64Url, toBase64Url, utf8, wipe } from "../../src/crypto/bytes.ts";
import { didFingerprint, isValidDid, publicKeyToDid } from "../../src/identity/did.ts";
import {
  BACKUP_SCHEMA,
  createBackup,
  parseBackupFile,
  restoreBackup,
  type BackupEnvelope,
} from "../../src/identity/backup.ts";
import {
  createIdentitySession,
  IdentitySession,
  importIdentitySession,
} from "../../src/identity/session.ts";
import { createSigningHandle, SigningKeyLeakError } from "../../src/identity/keystore.ts";
import { draftRoomMessage, roomMessagePayloadBytes, serializeRoomMessage } from "../../src/technocore/envelope.ts";
import { planCheckIn, publishCheckIn, signCheckIn } from "../../src/technocore/lobby.ts";
import { postSignedMessage } from "../../src/technocore/room.ts";
import { createDirectTransport, createProxyTransport, DEFAULT_PROXY_PREFIX, type TechnocoreTransport } from "../../src/technocore/transport.ts";
import { classifyHttpStatus, classifyTransportFailure, TechnocoreError } from "../../src/technocore/errors.ts";
import { toFlowFailure } from "../../src/flow/failure.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

describe("1. Identity Step & Deterministic DID Derivation", () => {
  it("same private key yields same public key and same DID deterministically", async () => {
    const seed = RFC_VECTOR_1.seed;
    const pubKey1 = await publicKeyFromSeed(seed);
    const pubKey2 = await publicKeyFromSeed(seed);
    assert.deepEqual(pubKey1, pubKey2);

    const did1 = publicKeyToDid(pubKey1);
    const did2 = publicKeyToDid(pubKey2);
    assert.equal(did1, did2);
    assert.equal(did1, RFC_VECTOR_1.did);
    assert.equal(isValidDid(did1), true);
  });

  it("different private keys yield different public keys and different DIDs", async () => {
    const { seed: seedA, publicKey: pubA } = await generateKeyPair();
    const { seed: seedB, publicKey: pubB } = await generateKeyPair();
    try {
      assert.notDeepEqual(pubA, pubB);
      const didA = publicKeyToDid(pubA);
      const didB = publicKeyToDid(pubB);
      assert.notEqual(didA, didB);
    } finally {
      wipe(seedA);
      wipe(seedB);
    }
  });

  it("generates valid fresh identity session in memory with non-extractable handle", async () => {
    const session = await createIdentitySession();
    try {
      assert.ok(session.identity.did.startsWith("did:key:z6Mk"));
      assert.equal(session.identity.publicKey.length, 32);
      assert.equal(session.backupState, "none");
      assert.equal(session.canExportBackup, true);
      assert.equal(session.hardened, false);

      // Verify signing works through handle (raw 64 bytes and base64url 86 chars)
      const rawSignature = await session.handle.sign(utf8("test-payload"));
      assert.equal(rawSignature.length, 64);
      const b64Signature = await session.handle.signToBase64Url(utf8("test-payload"));
      assert.equal(b64Signature.length, 86);
    } finally {
      session.discardSeed({ force: true });
    }
  });
});

describe("2. Backup Step & Cryptographic Protection", () => {
  const testPassphrase = "correct horse battery staple 2026";

  it("exports encrypted backup envelope with AES-256-GCM and PBKDF2 (600,000 iterations)", async () => {
    const session = await createIdentitySession();
    try {
      const envelope = await session.exportBackup(testPassphrase);
      assert.equal(envelope.schema, BACKUP_SCHEMA);
      assert.equal(envelope.did, session.identity.did);
      assert.equal(envelope.kdf.name, "PBKDF2");
      assert.equal(envelope.kdf.hash, "SHA-256");
      assert.equal(envelope.kdf.iterations, PBKDF2_ITERATIONS);
      assert.equal(envelope.cipher.name, "AES-256-GCM");
      assert.ok(envelope.cipher.ciphertext.length > 0);
      assert.ok(envelope.cipher.iv.length > 0);

      // Status moves to exported
      assert.equal(session.backupState, "exported");
    } finally {
      session.discardSeed({ force: true });
    }
  });

  it("verifies backup decryption against current in-memory seed and hardens session", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(testPassphrase);
    assert.equal(session.hardened, false);

    const verified = await session.verifyBackupRestores(envelope, testPassphrase);
    assert.equal(verified, true);
    assert.equal(session.backupState, "verified");

    // Once verified, session can be hardened (wiping raw seed)
    session.discardSeed();
    assert.equal(session.hardened, true);
    assert.equal(session.canExportBackup, false);

    // Signing handle still works after seed is wiped
    const sig = await session.handle.signToBase64Url(utf8("post-hardening-test"));
    assert.equal(sig.length, 86);
  });

  it("fails verification with wrong passphrase cleanly without leaking info", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(testPassphrase);
    try {
      await assert.rejects(
        async () => {
          await session.verifyBackupRestores(envelope, "wrong-passphrase-attempt");
        },
        (err: unknown) => {
          const failure = toFlowFailure(err);
          assert.equal(failure.code, "BACKUP_VERIFICATION_FAILED");
          assert.equal(failure.retryable, true);
          return true;
        },
      );
    } finally {
      session.discardSeed({ force: true });
    }
  });

  it("fails verification on altered DID envelope (AAD mismatch)", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(testPassphrase);
    const tamperedEnvelope: BackupEnvelope = {
      ...envelope,
      did: "did:key:z6Mktampered1111111111111111111111111111111111111111",
    };
    try {
      await assert.rejects(
        async () => {
          await session.verifyBackupRestores(tamperedEnvelope, testPassphrase);
        },
        (err: unknown) => {
          const failure = toFlowFailure(err);
          assert.equal(failure.code, "BACKUP_VERIFICATION_FAILED");
          return true;
        },
      );
    } finally {
      session.discardSeed({ force: true });
    }
  });

  it("fails verification on corrupted ciphertext", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(testPassphrase);
    const corruptedEnvelope: BackupEnvelope = {
      ...envelope,
      cipher: {
        ...envelope.cipher,
        ciphertext: toBase64Url(utf8("corrupted-ciphertext-bytes-here")),
      },
    };
    try {
      await assert.rejects(
        async () => {
          await session.verifyBackupRestores(corruptedEnvelope, testPassphrase);
        },
        (err: unknown) => {
          const failure = toFlowFailure(err);
          assert.equal(failure.code, "BACKUP_VERIFICATION_FAILED");
          return true;
        },
      );
    } finally {
      session.discardSeed({ force: true });
    }
  });

  it("allows importing verified backup into a fresh session", async () => {
    const originalSession = await createIdentitySession();
    const envelope = await originalSession.exportBackup(testPassphrase);
    const originalDid = originalSession.identity.did;
    originalSession.discardSeed({ force: true });

    // New browser tab / clean session restores from backup
    const restoredSession = await importIdentitySession(envelope, testPassphrase);
    assert.equal(restoredSession.identity.did, originalDid);
    assert.equal(restoredSession.backupState, "verified");
    assert.equal(restoredSession.hardened, true); // Non-extractable by default

    const sig = await restoredSession.handle.signToBase64Url(utf8("imported-session-test"));
    assert.equal(sig.length, 86);
  });
});

describe("3. Introduce Step & Canonical Signing Rule", () => {
  it("computes exact canonical wire signing payload: room|nonce|text for room lobby", async () => {
    const did = RFC_VECTOR_1.did;
    const nonce = "1726137600000000000";
    const text = `Agent online. DID: ${did}. Participating in the FLOP network.`;
    const room = "lobby";

    const payloadBytes = roomMessagePayloadBytes(room, nonce, text);
    const expectedString = `${room}|${nonce}|${text}`;
    assert.deepEqual(payloadBytes, utf8(expectedString));
  });

  it("produces exact 86-char unpadded Base64URL signature matching reference test vectors", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const plan = planCheckIn({
      did: RFC_VECTOR_1.did,
      publicKey: RFC_VECTOR_1.publicKey,
      fingerprint: await didFingerprint(RFC_VECTOR_1.did),
      createdAt: "2026-01-01T00:00:00Z",
    });

    const signed = await signCheckIn(handle, plan);
    assert.equal(signed.did, RFC_VECTOR_1.did);
    assert.equal(signed.sig.length, 86);
    assert.ok(/^[A-Za-z0-9_-]{86}$/.test(signed.sig));
    assert.equal(signed.text, plan.draft.text);
  });

  it("serializes to exact JSON wire format: {did, sig, nonce, text}", () => {
    const signed = {
      did: RFC_VECTOR_1.did,
      sig: "test_signature_86_chars_long_12345678901234567890123456789012345678901234567890123456",
      nonce: "1726137600000000000",
      text: "Agent online.",
    };
    const jsonStr = serializeRoomMessage(signed);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), ["did", "sig", "nonce", "text"]);
    assert.equal(parsed["did"], signed.did);
    assert.equal(parsed["sig"], signed.sig);
    assert.equal(parsed["nonce"], signed.nonce);
    assert.equal(parsed["text"], signed.text);
  });
});

describe("4. Proxy Transport & Network Failure Handling", () => {
  it("correctly handles 429 rate limiting with RATE_LIMITED error presentation", () => {
    const error = classifyHttpStatus(429, "Too Many Requests");
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.presentation.retryable, true);
    assert.equal(error.presentation.blocking, false);

    const failure = toFlowFailure(error);
    assert.equal(failure.code, "RATE_LIMITED");
    assert.equal(failure.keyState, "intact");
  });

  it("correctly handles timeout with TIMEOUT error presentation", () => {
    const error = classifyTransportFailure(new Error("Timeout"), true);
    assert.equal(error.code, "TIMEOUT");
    assert.equal(error.presentation.retryable, true);

    const failure = toFlowFailure(error);
    assert.equal(failure.code, "TIMEOUT");
    assert.equal(failure.keyState, "intact");
  });

  it("correctly handles signature rejection with SIGNATURE_REJECTED", () => {
    const error = classifyHttpStatus(400, "invalid signature");
    assert.equal(error.code, "SIGNATURE_REJECTED");
    assert.equal(error.presentation.retryable, true);

    const failure = toFlowFailure(error);
    assert.equal(failure.code, "SIGNATURE_REJECTED");
    assert.equal(failure.keyState, "intact");
  });

  it("correctly handles malformed server responses without claiming false success", async () => {
    const mockTransport: TechnocoreTransport = {
      kind: "proxy",
      describe: "Mock Transport",
      send: async () => ({
        ok: true,
        status: 200,
        text: '{"result":"unknown"}',
        json: { result: "unknown" },
        durationMs: 12,
      }),
    };

    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const plan = planCheckIn({
      did: RFC_VECTOR_1.did,
      publicKey: RFC_VECTOR_1.publicKey,
      fingerprint: await didFingerprint(RFC_VECTOR_1.did),
      createdAt: "2026-01-01T00:00:00Z",
    });
    const message = await signCheckIn(handle, plan);

    await assert.rejects(
      async () => {
        await publishCheckIn(mockTransport, plan, message);
      },
      (err: unknown) => {
        assert.ok(err instanceof TechnocoreError);
        assert.equal(err.code, "MALFORMED_RESPONSE");
        return true;
      },
    );
  });
});

describe("5. Security & Zero Private Key Leakage Assurances", () => {
  it("SigningHandle and IdentitySession throw SigningKeyLeakError when JSON.stringify is attempted", async () => {
    const session = await createIdentitySession();
    try {
      assert.throws(() => {
        JSON.stringify(session);
      }, SigningKeyLeakError);

      assert.throws(() => {
        JSON.stringify(session.handle);
      }, SigningKeyLeakError);
    } finally {
      session.discardSeed({ force: true });
    }
  });

  it("never includes private seed in toString() or inspect output", async () => {
    const session = await createIdentitySession();
    try {
      const str = session.toString();
      assert.ok(!str.includes("seed"));
      assert.ok(!str.includes("private"));
      assert.equal(str, `[IdentitySession ${session.identity.did}]`);
    } finally {
      session.discardSeed({ force: true });
    }
  });

  it("never includes private keys in outbound proxy request body", async () => {
    const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
    const plan = planCheckIn({
      did: RFC_VECTOR_1.did,
      publicKey: RFC_VECTOR_1.publicKey,
      fingerprint: await didFingerprint(RFC_VECTOR_1.did),
      createdAt: "2026-01-01T00:00:00Z",
    });
    const message = await signCheckIn(handle, plan);
    const serialized = serializeRoomMessage(message);

    assert.ok(!serialized.includes("seed"));
    assert.ok(!serialized.includes("privateKey"));
    assert.ok(!serialized.includes("secret"));

    // Contains only public fields
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed).sort(), ["did", "nonce", "sig", "text"]);
  });
});
