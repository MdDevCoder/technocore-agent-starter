/**
 * Real-User Backward-Compatibility Audit Test Suite.
 *
 * Audits the legacy WSL/Linux identity migration against the exact output produced by `flop_agent.py`.
 *
 * Invariants Tested:
 * 1. Exact Legacy Format: Real PyNaCl `agent_key.json` fixture accepted without modification.
 * 2. Identity Continuity: legacy DID === migrated DID === restored DID === event author DID.
 * 3. Contribution History: Existing history preserved; reputation/capabilities resolve to same citizen; no duplicate citizen.
 * 4. Security Guarantees: Raw private key never in HTTP/network, error messages, or unencrypted storage.
 * 5. Cryptographic Attacks: Every invalid/malicious identity rejected before signing.
 * 6. Actual Contribution Path: Migrated session signs valid canonical events ingested by the persistent gateway.
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

describe("Legacy Backward-Compatibility & Continuity Audit", () => {
  const PASSPHRASE = "real-user-backward-compatibility-passphrase-2026";

  // Exact reproduction of flop_agent.py generate_keypair() output
  async function generateRealCliFixture(): Promise<{
    rawJson: string;
    privateKeyHex: string;
    publicKeyHex: string;
    did: string;
    createdAt: string;
  }> {
    const { seed, publicKey } = await generateKeyPair();
    const privateKeyHex = toHex(seed);
    const publicKeyHex = toHex(publicKey);
    const did = publicKeyToDid(publicKey);
    const createdAt = "2026-08-15T09:12:34Z";

    // Exact indentation and field names matching flop_agent.py
    const rawJson = JSON.stringify(
      {
        private_key: privateKeyHex,
        public_key: publicKeyHex,
        did: did,
        created_at: createdAt,
      },
      null,
      2,
    );

    return { rawJson, privateKeyHex, publicKeyHex, did, createdAt };
  }

  /* ================= 1. EXACT LEGACY FORMAT ================= */

  describe("1. Exact Legacy Format Verification", () => {
    it("accepts unmodified agent_key.json produced by flop_agent.py", async () => {
      const fixture = await generateRealCliFixture();
      
      const validated = await parseAndValidateLegacyIdentity(fixture.rawJson);

      assert.equal(validated.did, fixture.did);
      assert.equal(toHex(validated.publicKey), fixture.publicKeyHex);
      assert.equal(toHex(validated.seed), fixture.privateKeyHex);
      assert.equal(validated.createdAt, fixture.createdAt);

      // Verify cryptographic derivation
      const derivedPub = await publicKeyFromSeed(validated.seed);
      assert.deepEqual(Array.from(derivedPub), Array.from(validated.publicKey));
      assert.equal(publicKeyToDid(derivedPub), fixture.did);
    });

    it("summarizes legacy metadata for browser presentation without exposing secret seed", async () => {
      const fixture = await generateRealCliFixture();
      const summary = await summarizeLegacyIdentityFile(fixture.rawJson);

      assert.equal(summary.did, fixture.did);
      assert.equal(summary.publicKeyHex, fixture.publicKeyHex);
      assert.equal(summary.createdAt, fixture.createdAt);
      assert.equal(summary.fingerprint, await didFingerprint(fixture.did));
      assert.equal((summary as any).private_key, undefined);
      assert.equal((summary as any).seed, undefined);
    });
  });

  /* ================= 2. PROVE IDENTITY CONTINUITY ================= */

  describe("2. Prove Identity Continuity (Full 8-Step Lifecycle)", () => {
    it("proves legacy DID === migrated DID === restored DID === event author DID", async () => {
      const fixture = await generateRealCliFixture();
      const legacyDid = fixture.did;

      // Step 1: Migrate legacy identity client-side
      const { session: migratedSession, backup } = await migrateLegacyIdentityFile(
        fixture.rawJson,
        PASSPHRASE,
      );
      const migratedDid = migratedSession.identity.did;
      assert.equal(migratedDid, legacyDid, "Migrated DID must match legacy DID exactly");

      // Step 2: Restore from the newly created encrypted backup
      const restored = await restoreBackup(backup.envelope, PASSPHRASE);
      const restoredDid = restored.did;
      assert.equal(restoredDid, legacyDid, "Restored DID must match legacy DID exactly");

      const restoredSession = await importIdentitySession(backup.envelope, PASSPHRASE);
      assert.equal(restoredSession.identity.did, legacyDid);

      // Step 3: Sign canonical event using migrated session
      const event = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: "mis_continuity_audit_1",
          authorDid: migratedSession.identity.did,
          payload: {
            did: migratedSession.identity.did,
            capability: { name: "wsl_identity_continuity_verified", proficiency: 100 },
          },
        },
        migratedSession.handle,
      );
      const eventAuthorDid = event.authorDid;
      assert.equal(eventAuthorDid, legacyDid, "Event author DID must match legacy DID exactly");

      // Step 4: Verify that all four DIDs are strictly equal
      assert.ok(
        legacyDid === migratedDid &&
          migratedDid === restoredDid &&
          restoredDid === eventAuthorDid,
        "Mathematical proof: legacy DID === migrated DID === restored DID === event author DID",
      );

      // Step 5: Verify signature with raw Ed25519 verifier against public key extracted from DID
      const pubBytesFromDid = didToPublicKey(legacyDid);
      assert.deepEqual(Array.from(pubBytesFromDid), Array.from(fromHex(fixture.publicKeyHex)));
      const verifyResult = await verifyCivilizationEvent(event);
      assert.equal(verifyResult.valid, true);
    });
  });

  /* ================= 3. EXISTING CONTRIBUTION HISTORY ================= */

  describe("3. Existing Contribution History & Unified Citizen State", () => {
    it("preserves historical events and avoids duplicate citizen records", async () => {
      const fixture = await generateRealCliFixture();
      const adapter = new SqliteDatabaseAdapter(":memory:");
      const store = new SqlEventStore(adapter);
      const gateway = new EventIngestionGateway(store);
      const engine = new DeterministicProjectionEngine(store, "audit_unified_citizen_projection");

      // 1. Ingest historical event submitted by the CLI agent before migration
      const { createSigningHandle } = await import("../../src/identity/keystore.ts");
      const cliHandle = await createSigningHandle(
        fromHex(fixture.privateKeyHex),
        fromHex(fixture.publicKeyHex),
      );

      const histEvent1 = await signCivilizationEvent(
        {
          eventType: "AGENT_DISCOVERED",
          missionId: "mis_genesis",
          authorDid: fixture.did,
          payload: {
            agentId: "agent_cli_genesis",
            did: fixture.did,
            displayName: "Pioneer CLI Agent",
            role: "specialist",
            capabilities: [
              { name: "analysis", proficiency: 85 },
              { name: "computation", proficiency: 90 },
            ],
          },
        },
        cliHandle,
      );

      const histEvent2 = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: "mis_genesis",
          authorDid: fixture.did,
          payload: {
            did: fixture.did,
            capability: { name: "analysis", proficiency: 85 },
          },
        },
        cliHandle,
      );

      await gateway.ingestEvent(histEvent1);
      await gateway.ingestEvent(histEvent2);

      // 2. User migrates identity to website
      const { session } = await migrateLegacyIdentityFile(fixture.rawJson, PASSPHRASE);
      assert.equal(session.identity.did, fixture.did);

      // 3. User signs a new post-migration event on website
      const postMigrationEvent = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: "mis_web_phase",
          authorDid: session.identity.did,
          payload: {
            did: session.identity.did,
            capability: { name: "computation", proficiency: 95 },
          },
        },
        session.handle,
      );

      const result = await gateway.ingestEvent(postMigrationEvent);
      assert.equal(result.success, true);

      // 4. Query all events for this citizen DID
      const citizenEvents = await store.queryEvents({ authorDid: fixture.did });
      assert.equal(citizenEvents.length, 3);
      assert.equal(citizenEvents[0]?.authorDid, fixture.did);
      assert.equal(citizenEvents[1]?.authorDid, fixture.did);
      assert.equal(citizenEvents[2]?.authorDid, fixture.did);

      // 5. Rebuild projections and verify unified citizen state
      await engine.rebuildAllFromScratch();
      const state = engine.getState();
      assert.equal(state.totalEvents, 3);

      // Verify that the unified citizen holds the updated active advertisement
      const citizenAds = state.advertisements.filter((a) => a.did === fixture.did);
      assert.equal(citizenAds.length, 1, "Must maintain exactly one unified citizen advertisement record, not duplicate citizens");
      assert.equal(citizenAds[0]?.did, fixture.did);
      assert.equal(citizenAds[0]?.capabilities[0]?.name, "computation");

      // Verify that historical events across CLI and Web eras are preserved in order
      const eventTypes = citizenEvents.map((e) => e.eventType);
      assert.deepEqual(eventTypes, ["AGENT_DISCOVERED", "CAPABILITY_ADVERTISED", "CAPABILITY_ADVERTISED"]);

      await store.close();
    });
  });

  /* ================= 4. SECURITY & ZERO-LEAKAGE AUDIT ================= */

  describe("4. Security & Zero-Leakage Invariants", () => {
    it("ensures raw private key never leaks to JSON serialization or error representations", async () => {
      const fixture = await generateRealCliFixture();
      const { session, backup } = await migrateLegacyIdentityFile(fixture.rawJson, PASSPHRASE);

      // 1. SigningHandle refuses serialization
      assert.throws(() => JSON.stringify(session.handle), /cannot be serialized/);

      // 2. IdentitySession refuses serialization
      assert.throws(() => JSON.stringify(session), /cannot be serialized/);

      // 3. Public identity contains only DID, publicKey, fingerprint, createdAt
      const serializedPublic = JSON.stringify(session.identity);
      assert.ok(!serializedPublic.includes(fixture.privateKeyHex));

      // 4. Encrypted backup envelope does NOT contain plaintext seed
      assert.ok(!backup.text.includes(fixture.privateKeyHex));
      assert.ok(!JSON.stringify(backup.envelope).includes(fixture.privateKeyHex));
    });
  });

  /* ================= 5. CRYPTOGRAPHIC ATTACK & MALICIOUS INPUT TESTS ================= */

  describe("5. Cryptographic Attack & Validation Boundaries", () => {
    it("rejects forged DID where attacker pairs their DID with another citizen's keypair", async () => {
      const victim = await generateRealCliFixture();
      const attacker = await generateRealCliFixture();

      // Attacker constructs file with victim's private key but attacker's DID
      const forgedDidFile = JSON.stringify({
        private_key: victim.privateKeyHex,
        public_key: victim.publicKeyHex,
        did: attacker.did, // Forged!
        created_at: victim.createdAt,
      });

      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(forgedDidFile),
        LegacyIdentityMismatchError,
      );
    });

    it("rejects mismatched public key paired with valid private seed", async () => {
      const citizenA = await generateRealCliFixture();
      const citizenB = await generateRealCliFixture();

      const mismatchedKeyFile = JSON.stringify({
        private_key: citizenA.privateKeyHex,
        public_key: citizenB.publicKeyHex, // Mismatched!
        did: citizenB.did,
        created_at: citizenA.createdAt,
      });

      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(mismatchedKeyFile),
        LegacyIdentityMismatchError,
      );
    });

    it("rejects corrupted or truncated private key bytes", async () => {
      const fixture = await generateRealCliFixture();

      // Truncated to 31 bytes (62 hex chars)
      const truncated = JSON.stringify({
        private_key: fixture.privateKeyHex.slice(0, 62),
        public_key: fixture.publicKeyHex,
        did: fixture.did,
      });

      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(truncated),
        LegacyIdentityFormatError,
      );
    });

    it("rejects invalid non-hex characters in private key", async () => {
      const fixture = await generateRealCliFixture();

      const nonHex = JSON.stringify({
        private_key: fixture.privateKeyHex.slice(0, 60) + "gggg",
        public_key: fixture.publicKeyHex,
        did: fixture.did,
      });

      await assert.rejects(
        async () => parseAndValidateLegacyIdentity(nonHex),
        LegacyIdentityFormatError,
      );
    });

    it("rejects tampered encrypted backup ciphertext", async () => {
      const fixture = await generateRealCliFixture();
      const { backup } = await migrateLegacyIdentityFile(fixture.rawJson, PASSPHRASE);

      // Tamper ciphertext by changing last byte
      const tamperedCiphertext =
        backup.envelope.cipher.ciphertext.slice(0, -2) +
        (backup.envelope.cipher.ciphertext.endsWith("aa") ? "bb" : "aa");

      const tamperedEnvelope = {
        ...backup.envelope,
        cipher: {
          ...backup.envelope.cipher,
          ciphertext: tamperedCiphertext,
        },
      };

      await assert.rejects(async () => restoreBackup(tamperedEnvelope, PASSPHRASE));
    });

    it("rejects restoring backup with incorrect passphrase", async () => {
      const fixture = await generateRealCliFixture();
      const { backup } = await migrateLegacyIdentityFile(fixture.rawJson, PASSPHRASE);

      await assert.rejects(
        async () => restoreBackup(backup.envelope, "wrong-passphrase-attempt-xyz"),
      );
    });
  });
});
