/**
 * The identity session lifecycle, and the one-way door.
 *
 * The gate that matters here is `discardSeed`: it must refuse to run until the user has demonstrated
 * that the backup file they saved actually decrypts. Losing an Ed25519 seed is unrecoverable, so a
 * checkbox is not good enough and neither is "we offered a download".
 *
 * `exportBackup` runs PBKDF2 at the production 600,000 iterations, so these tests are deliberately
 * economical about how often they call it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspect } from "node:util";

import { toHex } from "../../src/crypto/bytes.ts";
import { PBKDF2_ITERATIONS } from "../../src/crypto/kdf.ts";
import { createBackup, restoreBackup } from "../../src/identity/backup.ts";
import { isValidDid } from "../../src/identity/did.ts";
import { SigningKeyLeakError } from "../../src/identity/keystore.ts";
import {
  BackupNotVerifiedError,
  createIdentitySession,
  importIdentitySession,
  SeedUnavailableError,
} from "../../src/identity/session.ts";
import { RFC_VECTOR_1 } from "../vectors.ts";

const PASSPHRASE = "a reasonable backup passphrase 42";

describe("createIdentitySession", () => {
  it("produces a valid public identity and a working handle", async () => {
    const session = await createIdentitySession();
    assert.equal(isValidDid(session.identity.did), true);
    assert.equal(session.identity.did, session.handle.did);
    assert.equal(session.identity.publicKey.length, 32);
    assert.match(session.identity.fingerprint, /^[0-9a-f]{16}$/);
    assert.match(session.identity.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(session.origin, "generated");
  });

  it("starts able to export, unhardened, and with no backup yet", async () => {
    const session = await createIdentitySession();
    assert.equal(session.backupState, "none");
    assert.equal(session.canExportBackup, true);
    assert.equal(session.hardened, false);
  });

  it("produces a distinct identity every time", async () => {
    const a = await createIdentitySession();
    const b = await createIdentitySession();
    assert.notEqual(a.identity.did, b.identity.did);
    assert.notEqual(a.identity.fingerprint, b.identity.fingerprint);
  });
});

describe("the backup gate", () => {
  it("refuses to discard the seed before a backup has been verified", async () => {
    const session = await createIdentitySession();

    assert.throws(() => session.discardSeed(), BackupNotVerifiedError);
    assert.equal(session.hardened, false, "a refused discard must not have wiped anything");

    const envelope = await session.exportBackup(PASSPHRASE);
    assert.equal(session.backupState, "exported");
    // Exporting is not enough. The file might never have reached disk.
    assert.throws(() => session.discardSeed(), BackupNotVerifiedError);
    assert.equal(session.hardened, false);

    assert.equal(await session.verifyBackupRestores(envelope, PASSPHRASE), true);
    assert.equal(session.backupState, "verified");

    session.discardSeed();
    assert.equal(session.hardened, true);
    assert.equal(session.canExportBackup, false);
  });

  it("exports at the production iteration count", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(PASSPHRASE);
    assert.equal(envelope.kdf.iterations, PBKDF2_ITERATIONS);
    assert.equal(envelope.did, session.identity.did);
  });

  it("does not mark a backup verified when the passphrase is wrong", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(PASSPHRASE);
    await assert.rejects(() => session.verifyBackupRestores(envelope, "not the passphrase"));
    assert.equal(session.backupState, "exported");
    assert.throws(() => session.discardSeed(), BackupNotVerifiedError);
  });

  it("does not mark a backup verified when the file belongs to another identity", async () => {
    // The realistic mistake: the user re-uploads an older backup of a different agent.
    const session = await createIdentitySession();
    await session.exportBackup(PASSPHRASE);
    const foreign = await createBackup(RFC_VECTOR_1.seed, RFC_VECTOR_1.did, PASSPHRASE);

    assert.equal(await session.verifyBackupRestores(foreign, PASSPHRASE), false);
    assert.equal(session.backupState, "exported");
    assert.throws(() => session.discardSeed(), BackupNotVerifiedError);
  });

  it("can still sign after the seed is gone", async () => {
    // This is the whole point of hardening: signing capability survives, exfiltration capability does not.
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(PASSPHRASE);
    await session.verifyBackupRestores(envelope, PASSPHRASE);
    session.discardSeed();

    const signature = await session.handle.signToBase64Url(new TextEncoder().encode("lobby|1|hello"));
    assert.equal(signature.length, 86);
  });

  it("refuses to export a new backup once the seed is discarded", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(PASSPHRASE);
    await session.verifyBackupRestores(envelope, PASSPHRASE);
    session.discardSeed();

    await assert.rejects(() => session.exportBackup(PASSPHRASE), SeedUnavailableError);
    await assert.rejects(() => session.verifyBackupRestores(envelope, PASSPHRASE), SeedUnavailableError);
  });

  it("treats a second discard as a no-op rather than an error", async () => {
    const session = await createIdentitySession();
    const envelope = await session.exportBackup(PASSPHRASE);
    await session.verifyBackupRestores(envelope, PASSPHRASE);
    session.discardSeed();
    session.discardSeed();
    assert.equal(session.hardened, true);
  });

  it("allows a forced discard, for the import path where a backup already exists", async () => {
    const session = await createIdentitySession();
    session.discardSeed({ force: true });
    assert.equal(session.hardened, true);
    assert.equal(session.backupState, "none");
  });
});

describe("importIdentitySession", () => {
  it("restores the identity from an encrypted backup", async () => {
    const envelope = await createBackup(RFC_VECTOR_1.seed, RFC_VECTOR_1.did, PASSPHRASE);
    const session = await importIdentitySession(envelope, PASSPHRASE);

    assert.equal(session.identity.did, RFC_VECTOR_1.did);
    assert.equal(toHex(session.identity.publicKey), toHex(RFC_VECTOR_1.publicKey));
    assert.equal(session.origin, "imported");
  });

  it("arrives already hardened and already verified", async () => {
    // The user demonstrably holds a working backup — they just decrypted it — so there is no reason to
    // keep the seed in memory, and no reason to make them export a new file.
    const envelope = await createBackup(RFC_VECTOR_1.seed, RFC_VECTOR_1.did, PASSPHRASE);
    const session = await importIdentitySession(envelope, PASSPHRASE);

    assert.equal(session.hardened, true);
    assert.equal(session.canExportBackup, false);
    assert.equal(session.backupState, "verified");
    await assert.rejects(() => session.exportBackup(PASSPHRASE), SeedUnavailableError);
  });

  it("can retain export capability when explicitly asked", async () => {
    const envelope = await createBackup(RFC_VECTOR_1.seed, RFC_VECTOR_1.did, PASSPHRASE);
    const session = await importIdentitySession(envelope, PASSPHRASE, { retainExportCapability: true });

    assert.equal(session.canExportBackup, true);
    assert.equal(session.hardened, false);
    const reexported = await session.exportBackup("a different passphrase entirely");
    assert.equal(reexported.did, RFC_VECTOR_1.did);
    assert.equal(toHex((await restoreBackup(reexported, "a different passphrase entirely")).seed), toHex(RFC_VECTOR_1.seed));
  });

  it("preserves the original creation date rather than resetting it", async () => {
    const envelope = await createBackup(RFC_VECTOR_1.seed, RFC_VECTOR_1.did, PASSPHRASE);
    const session = await importIdentitySession(envelope, PASSPHRASE);
    assert.equal(session.identity.createdAt, envelope.created_at);
  });

  it("rejects the wrong passphrase", async () => {
    const envelope = await createBackup(RFC_VECTOR_1.seed, RFC_VECTOR_1.did, PASSPHRASE);
    await assert.rejects(() => importIdentitySession(envelope, "wrong"));
  });

  it("produces a handle that signs under the restored DID", async () => {
    const envelope = await createBackup(RFC_VECTOR_1.seed, RFC_VECTOR_1.did, PASSPHRASE);
    const session = await importIdentitySession(envelope, PASSPHRASE);
    // RFC 8032 vector 1 signs the empty message — deterministic, so this is a known answer.
    assert.equal(toHex(await session.handle.sign(new Uint8Array())), toHex(RFC_VECTOR_1.signature));
  });
});

describe("IdentitySession containment", () => {
  it("throws on serialization instead of exposing the seed", async () => {
    const session = await createIdentitySession();
    assert.throws(() => JSON.stringify(session), SigningKeyLeakError);
    assert.throws(() => JSON.stringify({ app: { session } }), SigningKeyLeakError);
  });

  it("renders as the DID only, under interpolation and inspection", async () => {
    const session = await createIdentitySession();
    assert.equal(`${session}`, `[IdentitySession ${session.identity.did}]`);
    const rendered = inspect(session, { depth: 10, showHidden: true });
    assert.ok(rendered.includes(session.identity.did));
    assert.ok(!rendered.toLowerCase().includes("cryptokey"));
    assert.ok(!/#seed/.test(rendered));
  });

  it("exposes no seed-bearing own properties", async () => {
    const session = await createIdentitySession();
    assert.deepEqual(Object.keys(session).sort(), ["handle", "identity", "origin"]);
  });
});
