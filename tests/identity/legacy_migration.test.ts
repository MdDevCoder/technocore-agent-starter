/**
 * Legacy WSL/Linux Identity Migration & Backward Compatibility Test Suite.
 *
 * Verifies:
 * 1. Valid WSL/Linux CLI JSON imports successfully with exact DID and public key preserved.
 * 2. Variant formats (snake_case, camelCase, 0x prefix, 64-byte keypair) handled cleanly.
 * 3. Invalid / malicious legacy files rejected (malformed JSON, bad hex, mismatched keys, forged DIDs, bad dates).
 * 4. Zero secret leakage: raw private key never serialized or sent over HTTP.
 * 5. Full migration to encrypted Technocore backup (PBKDF2 + AES-256-GCM) and subsequent restoration.
 * 6. Identity continuity: Legacy identity -> Migrated session -> Signed event -> Gateway verification.
 * 7. History continuity: Existing historical events and contributions for the DID remain valid.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseAndValidateLegacyIdentity,
  summarizeLegacyIdentityFile,
  migrateLegacyIdentityFile,
  LegacyIdentityFormatError,
  LegacyIdentityMismatchError,
  WeakPassphraseError,
} from "../../src/identity/legacy.ts";
import { restoreBackup } from "../../src/identity/backup.ts";
import { importIdentitySession } from "../../src/identity/session.ts";
import { toHex, fromHex } from "../../src/crypto/bytes.ts";
import { generateKeyPair, publicKeyFromSeed } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid, didToPublicKey, didFingerprint } from "../../src/identity/did.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { verifyCivilizationEvent } from "../../src/civilization/events/verifier.ts";
import { SqliteDatabaseAdapter } from "../../src/civilization/persistence/sqlite-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import { EventIngestionGateway } from "../../src/civilization/gateway/ingestion.ts";
import { DeterministicProjectionEngine } from "../../src/civilization/projections/engine.ts";

describe("Legacy WSL/Linux Identity Migration", () => {
  const PASSPHRASE = "correct horse battery staple 2026 legacy test";

  // Generate a reproducible known keypair for testing
  async function createSampleLegacyIdentity(): Promise<{
    rawJson: string;
    seedHex: string;
    pubHex: string;
    did: string;
    createdAt: string;
  }> {
    const { seed, publicKey } = await generateKeyPair();
    const seedHex = toHex(seed);
    const pubHex = toHex(publicKey);
    const did = publicKeyToDid(publicKey);
    const createdAt = "2026-08-20T14:30:00Z";

    const rawJson = JSON.stringify({
      private_key: seedHex,
      public_key: pubHex,
      did,
      created_at: createdAt,
    });

    return { rawJson, seedHex, pubHex, did, createdAt };
  }

  /* ================= 1. LEGACY COMPATIBILITY ================= */

  describe("1. Legacy Compatibility", () => {
    it("imports a valid WSL/Linux agent_key.json and preserves the exact DID and public key", async () => {
      const sample = await createSampleLegacyIdentity();
      const validated = await parseAndValidateLegacyIdentity(sample.rawJson);

      assert.equal(validated.did, sample.did);
      assert.equal(toHex(validated.publicKey), sample.pubHex);
      assert.equal(validated.createdAt, sample.createdAt);
      assert.deepEqual(Array.from(validated.publicKey), Array.from(didToPublicKey(sample.did)));
    });

    it("summarizes legacy identity metadata without leaking private key", async () => {
      const sample = await createSampleLegacyIdentity();
      const summary = await summarizeLegacyIdentityFile(sample.rawJson);

      assert.equal(summary.did, sample.did);
      assert.equal(summary.createdAt, sample.createdAt);
      assert.equal(summary.publicKeyHex, sample.pubHex);
      assert.ok(summary.fingerprint.length > 0);
      assert.equal((summary as any).private_key, undefined);
      assert.equal((summary as any).seed, undefined);
    });

    it("supports camelCase property names (privateKey, publicKey, createdAt)", async () => {
      const sample = await createSampleLegacyIdentity();
      const camelJson = JSON.stringify({
        privateKey: sample.seedHex,
        publicKey: sample.pubHex,
        did: sample.did,
        createdAt: sample.createdAt,
      });

      const validated = await parseAndValidateLegacyIdentity(camelJson);
      assert.equal(validated.did, sample.did);
      assert.equal(toHex(validated.publicKey), sample.pubHex);
    });

    it("supports 0x hex prefixes and uppercase hex characters", async () => {
      const sample = await createSampleLegacyIdentity();
      const hex0xJson = JSON.stringify({
        private_key: `0x${sample.seedHex.toUpperCase()}`,
        public_key: `0X${sample.pubHex.toUpperCase()}`,
        did: sample.did,
        created_at: sample.createdAt,
      });

      const validated = await parseAndValidateLegacyIdentity(hex0xJson);
      assert.equal(validated.did, sample.did);
      assert.equal(toHex(validated.publicKey), sample.pubHex.toLowerCase());
    });

    it("supports 64-byte secret key pair format (where first 32 bytes are seed)", async () => {
      const sample = await createSampleLegacyIdentity();
      const keypair64Hex = sample.seedHex + sample.pubHex;
      const keypairJson = JSON.stringify({
        private_key: keypair64Hex,
        public_key: sample.pubHex,
        did: sample.did,
        created_at: sample.createdAt,
      });

      const validated = await parseAndValidateLegacyIdentity(keypairJson);
      assert.equal(validated.did, sample.did);
      assert.equal(toHex(validated.publicKey), sample.pubHex);
    });

    it("handles arbitrary extra fields safely without corruption", async () => {
      const sample = await createSampleLegacyIdentity();
      const extraJson = JSON.stringify({
        private_key: sample.seedHex,
        public_key: sample.pubHex,
        did: sample.did,
        created_at: sample.createdAt,
        name: "Legacy CLI Pioneer",
        agent_id: "ag_12345",
        custom_metadata: { version: 1, origin: "WSL Ubuntu 24.04" },
        malicious_attempt: "<script>alert(1)</script>",
      });

      const validated = await parseAndValidateLegacyIdentity(extraJson);
      assert.equal(validated.did, sample.did);
      assert.equal(toHex(validated.publicKey), sample.pubHex);
    });
  });

  /* ================= 2. REJECTION OF INVALID LEGACY FILES ================= */

  describe("2. Rejection of Invalid Legacy Files", () => {
    it("rejects non-JSON files", async () => {
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity("not-json-content"),
        LegacyIdentityFormatError,
      );
    });

    it("rejects JSON arrays or primitives", async () => {
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity("[]"),
        LegacyIdentityFormatError,
      );
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity('"just a string"'),
        LegacyIdentityFormatError,
      );
    });

    it("rejects missing private_key", async () => {
      const sample = await createSampleLegacyIdentity();
      const bad = JSON.stringify({
        public_key: sample.pubHex,
        did: sample.did,
        created_at: sample.createdAt,
      });
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(bad),
        /Missing or empty "private_key"/,
      );
    });

    it("rejects missing public_key", async () => {
      const sample = await createSampleLegacyIdentity();
      const bad = JSON.stringify({
        private_key: sample.seedHex,
        did: sample.did,
        created_at: sample.createdAt,
      });
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(bad),
        /Missing or empty "public_key"/,
      );
    });

    it("rejects missing or malformed DID", async () => {
      const sample = await createSampleLegacyIdentity();
      const bad = JSON.stringify({
        private_key: sample.seedHex,
        public_key: sample.pubHex,
        created_at: sample.createdAt,
      });
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(bad),
        /Missing or malformed did:key identifier/,
      );

      const badDid = JSON.stringify({
        private_key: sample.seedHex,
        public_key: sample.pubHex,
        did: "did:invalid:123",
        created_at: sample.createdAt,
      });
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(badDid),
        /Missing or malformed did:key identifier/,
      );
    });

    it("rejects invalid hex characters in private_key or public_key", async () => {
      const sample = await createSampleLegacyIdentity();
      const badHex = JSON.stringify({
        private_key: "not-valid-hex-zzz!".repeat(4),
        public_key: sample.pubHex,
        did: sample.did,
      });
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(badHex),
        /Invalid hex encoding in "private_key"/,
      );
    });

    it("rejects odd-length hex strings", async () => {
      const sample = await createSampleLegacyIdentity();
      const badHex = JSON.stringify({
        private_key: sample.seedHex.slice(0, 63), // 63 chars instead of 64
        public_key: sample.pubHex,
        did: sample.did,
      });
      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(badHex),
        /fromHex: odd-length input/,
      );
    });

    it("rejects mismatched private_key and public_key", async () => {
      const sampleA = await createSampleLegacyIdentity();
      const sampleB = await createSampleLegacyIdentity();

      // Pair private key of A with public key of B
      const mismatched = JSON.stringify({
        private_key: sampleA.seedHex,
        public_key: sampleB.pubHex,
        did: sampleB.did,
        created_at: sampleA.createdAt,
      });

      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(mismatched),
        LegacyIdentityMismatchError,
      );
    });

    it("rejects forged DID that does not correspond to public key", async () => {
      const sampleA = await createSampleLegacyIdentity();
      const sampleB = await createSampleLegacyIdentity();

      // Pair keypair of A with claimed DID of B
      const forgedDid = JSON.stringify({
        private_key: sampleA.seedHex,
        public_key: sampleA.pubHex,
        did: sampleB.did, // Forged!
        created_at: sampleA.createdAt,
      });

      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(forgedDid),
        LegacyIdentityMismatchError,
      );
    });

    it("rejects invalid created_at date format", async () => {
      const sample = await createSampleLegacyIdentity();
      const badDate = JSON.stringify({
        private_key: sample.seedHex,
        public_key: sample.pubHex,
        did: sample.did,
        created_at: "not-a-valid-date-timestamp",
      });

      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(badDate),
        /The created_at field in this legacy file is not a valid date string/,
      );
    });
  });

  /* ================= 3. MIGRATION & ENCRYPTION SECURITY ================= */

  describe("3. Migration & Encryption Security", () => {
    it("converts legacy identity into an encrypted PBKDF2/AES-GCM backup", async () => {
      const sample = await createSampleLegacyIdentity();
      const { session, backup } = await migrateLegacyIdentityFile(sample.rawJson, PASSPHRASE);

      // Session checks
      assert.equal(session.identity.did, sample.did);
      assert.equal(session.origin, "imported");
      assert.equal(session.backupState, "verified");
      assert.equal(session.hardened, true); // Raw seed wiped from memory

      // Backup envelope checks
      assert.equal(backup.envelope.schema, "technocore-agent-backup-v1");
      assert.equal(backup.envelope.did, sample.did);
      assert.equal(backup.envelope.kdf.name, "PBKDF2");
      assert.equal(backup.envelope.kdf.iterations, 600000);
      assert.equal(backup.envelope.cipher.name, "AES-256-GCM");
      assert.ok(backup.fileName.startsWith("technocore-agent-"));
      assert.ok(backup.fileName.endsWith(".backup.json"));

      // Ensure raw seed does not appear anywhere in backup text
      assert.ok(!backup.text.includes(sample.seedHex));
    });

    it("restores the migrated backup using the correct passphrase", async () => {
      const sample = await createSampleLegacyIdentity();
      const { backup } = await migrateLegacyIdentityFile(sample.rawJson, PASSPHRASE);

      // Restore using standard restoreBackup
      const restored = await restoreBackup(backup.envelope, PASSPHRASE);
      assert.equal(restored.did, sample.did);
      assert.equal(toHex(restored.publicKey), sample.pubHex);
      assert.equal(toHex(restored.seed), sample.seedHex);

      // Restore as an active IdentitySession
      const restoredSession = await importIdentitySession(backup.envelope, PASSPHRASE);
      assert.equal(restoredSession.identity.did, sample.did);
      assert.equal(restoredSession.identity.fingerprint, await didFingerprint(sample.did));
    });

    it("rejects restoring the migrated backup with an incorrect passphrase", async () => {
      const sample = await createSampleLegacyIdentity();
      const { backup } = await migrateLegacyIdentityFile(sample.rawJson, PASSPHRASE);

      await assert.rejects(
        async () => restoreBackup(backup.envelope, "wrong-passphrase-attempt-1234"),
      );
    });

    it("rejects weak passphrases during migration", async () => {
      const sample = await createSampleLegacyIdentity();
      await assert.rejects(
        async () => migrateLegacyIdentityFile(sample.rawJson, "12345"),
        WeakPassphraseError,
      );
    });

    it("throws when attempting to serialize a SigningHandle to JSON", async () => {
      const sample = await createSampleLegacyIdentity();
      const { session } = await migrateLegacyIdentityFile(sample.rawJson, PASSPHRASE);

      assert.throws(() => JSON.stringify(session.handle), /A signing handle cannot be serialized/);
      assert.throws(() => JSON.stringify(session), /A signing handle cannot be serialized/);
    });
  });

  /* ================= 4. IDENTITY CONTINUITY & GATEWAY VERIFICATION ================= */

  describe("4. Identity Continuity & Gateway Verification", () => {
    it("proves complete lifecycle: WSL legacy -> Website migration -> Sign event -> Gateway verification", async () => {
      const sample = await createSampleLegacyIdentity();
      
      // 1. Migrate legacy identity in browser
      const { session } = await migrateLegacyIdentityFile(sample.rawJson, PASSPHRASE);
      assert.equal(session.identity.did, sample.did);

      // 2. Sign a canonical civilization event using the migrated handle
      const event = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: "mis_legacy_migration_1",
          authorDid: session.identity.did,
          payload: {
            did: session.identity.did,
            capability: { name: "wsl_legacy_continuity", proficiency: 100 },
          },
        },
        session.handle,
      );

      assert.equal(event.authorDid, sample.did);

      // 3. Verify event using standard Ed25519 verification
      const verifyResult = await verifyCivilizationEvent(event);
      assert.equal(verifyResult.valid, true);

      // 4. Ingest event into the persistent EventIngestionGateway
      const adapter = new SqliteDatabaseAdapter(":memory:");
      const store = new SqlEventStore(adapter);
      const gateway = new EventIngestionGateway(store);

      const result = await gateway.ingestEvent(event);
      assert.equal(result.success, true);
      assert.ok(result.receipt);
      assert.equal(result.receipt.sequenceNum, 1);
      assert.equal(result.receipt.eventId, event.eventId);

      // 5. Query store by authorDid and confirm identity continuity
      const authorEvents = await store.queryEvents({ authorDid: sample.did });
      assert.equal(authorEvents.length, 1);
      assert.equal(authorEvents[0]?.authorDid, sample.did);
      assert.equal(authorEvents[0]?.eventId, event.eventId);

      // 6. Project state through DeterministicProjectionEngine
      const engine = new DeterministicProjectionEngine(store, "legacy_test_projection");
      await engine.rebuildAllFromScratch();
      const state = engine.getState();
      assert.equal(state.totalEvents, 1);
      assert.equal(state.headSequence, 1);

      await store.close();
    });

    it("verifies that existing historical events associated with the legacy DID remain discoverable", async () => {
      const sample = await createSampleLegacyIdentity();
      const adapter = new SqliteDatabaseAdapter(":memory:");
      const store = new SqlEventStore(adapter);
      const gateway = new EventIngestionGateway(store);

      // Seed historical event from before website migration (as if submitted by legacy CLI)
      const seedBytes = fromHex(sample.seedHex);
      const pubBytes = fromHex(sample.pubHex);
      const { createSigningHandle } = await import("../../src/identity/keystore.ts");
      const legacyHandle = await createSigningHandle(seedBytes, pubBytes);

      const historicalEvent = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: "mis_historical_1",
          authorDid: sample.did,
          payload: {
            did: sample.did,
            capability: { name: "cli_early_adopter", proficiency: 90 },
          },
        },
        legacyHandle,
      );

      const histReceipt = await gateway.ingestEvent(historicalEvent);
      assert.equal(histReceipt.success, true);

      // Now user performs migration on website
      const { session } = await migrateLegacyIdentityFile(sample.rawJson, PASSPHRASE);
      assert.equal(session.identity.did, sample.did);

      // Submit new post-migration event from website
      const newEvent = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: "mis_historical_2",
          authorDid: session.identity.did,
          payload: {
            did: session.identity.did,
            capability: { name: "web_migrated_citizen", proficiency: 95 },
          },
        },
        session.handle,
      );

      const newReceipt = await gateway.ingestEvent(newEvent);
      assert.equal(newReceipt.success, true);

      // Query complete history for this DID
      const allEvents = await store.queryEvents({ authorDid: sample.did });
      assert.equal(allEvents.length, 2);
      assert.equal(allEvents[0]?.authorDid, sample.did);
      assert.equal(allEvents[1]?.authorDid, sample.did);

      await store.close();
    });
  });
});
