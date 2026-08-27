/**
 * Step 2 orchestration: protect the identity.
 *
 * The gate is the subject here. Losing the key means losing the identity permanently, so the step advances
 * only once the file the user actually saved has been decrypted back to the seed in memory — not once a
 * download button has been clicked. These tests exercise that gate through the flow wrappers, and check the
 * two adjacent promises: that the exported file carries no plaintext key material, and that the suggested
 * filename never shadows the CLI's plaintext `agent_key.json`.
 *
 * PBKDF2 runs at the production iteration count here, so this file is deliberately short: each case that
 * derives a key costs real time, and repeating that to make a point already made would be waste.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  exportBackupFile,
  hardenSession,
  importBackupFile,
  summarizeBackupFile,
  verifyBackupFile,
  WeakPassphraseError,
} from "../../src/flow/backup.ts";
import { BackupFormatError, parseBackupFile, serializeBackupFile } from "../../src/identity/backup.ts";
import { MIN_PASSPHRASE_LENGTH } from "../../src/identity/passphrase.ts";
import { BackupNotVerifiedError, createIdentitySession } from "../../src/identity/session.ts";

const PASSPHRASE = "correct horse battery staple";

describe("exportBackupFile", () => {
  it("produces a saveable file, and reports what protects it", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);

    assert.equal(backup.text.endsWith("\n"), true);
    assert.deepEqual(parseBackupFile(backup.text), backup.envelope);
    assert.equal(backup.envelope.did, session.identity.did);
    assert.equal(backup.iterations, backup.envelope.kdf.iterations);
    assert.equal(backup.iterations >= 600_000, true, String(backup.iterations));
    assert.equal(session.backupState, "exported");
  });

  it("names the file so it can never be mistaken for the CLI's plaintext key", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);

    assert.equal(backup.fileName.includes("agent_key"), false, backup.fileName);
    assert.equal(/^[A-Za-z0-9._-]+\.json$/.test(backup.fileName), true, backup.fileName);
  });

  it("puts no plaintext key material in the file, and no DID-adjacent secret either", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);

    assert.equal(backup.text.includes(PASSPHRASE), false);
    // The public key is derivable from the DID and is public; the seed is not, and must not be present in
    // any encoding. The envelope stores ciphertext, salt and IV, so a search for the passphrase and for
    // the words a leak would carry is the check available at this layer.
    for (const word of ["seed", "private", "secret"]) {
      assert.equal(backup.text.toLowerCase().includes(word), false, word);
    }
  });

  it("refuses a passphrase too short to be worth trusting the identity to", async () => {
    const session = await createIdentitySession();
    await assert.rejects(
      () => exportBackupFile(session, "a".repeat(MIN_PASSPHRASE_LENGTH - 1)),
      WeakPassphraseError,
    );
    assert.equal(session.backupState, "none", "a refused export must not advance the gate");
  });
});

describe("verifyBackupFile", () => {
  it("opens the saved file, confirms it restores this seed, then hardens the session", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);

    const result = await verifyBackupFile(session, backup.text, PASSPHRASE);

    assert.deepEqual(result, { status: "verified", hardened: true });
    assert.equal(session.backupState, "verified");
    assert.equal(session.hardened, true);
    assert.equal(session.canExportBackup, false);
  });

  it("still signs after hardening, which is what makes dropping the seed safe", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);
    await verifyBackupFile(session, backup.text, PASSPHRASE);

    const signature = await session.handle.signToBase64Url(new Uint8Array([9]));
    assert.equal(signature.length, 86);
  });

  it("reports another identity's backup as such, without deriving a key", async () => {
    // The DID in the file's plaintext header answers this question, so a wrong passphrase is irrelevant:
    // reaching the answer must not cost the user 600,000 iterations.
    const session = await createIdentitySession();
    const other = await createIdentitySession();
    const otherBackup = await exportBackupFile(other, PASSPHRASE);

    const result = await verifyBackupFile(session, otherBackup.text, "not the passphrase");

    assert.deepEqual(result, { status: "other-identity", did: other.identity.did });
    assert.equal(session.hardened, false, "the session must not harden on someone else's file");
  });

  it("does not harden when the passphrase is wrong", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);

    await assert.rejects(() => verifyBackupFile(session, backup.text, `${PASSPHRASE} nope`));
    assert.equal(session.hardened, false);
    assert.equal(session.backupState, "exported");
  });

  it("rejects a file that is not a backup with an instruction rather than a stack trace", async () => {
    const session = await createIdentitySession();
    for (const text of ["", "not json", "{}", '{"schema":"unknown"}']) {
      await assert.rejects(
        () => verifyBackupFile(session, text, PASSPHRASE),
        BackupFormatError,
        JSON.stringify(text),
      );
    }
  });
});

describe("hardenSession", () => {
  it("refuses before the backup has been proved to restore", async () => {
    const session = await createIdentitySession();
    assert.throws(() => hardenSession(session), BackupNotVerifiedError);
    assert.equal(session.hardened, false);
  });

  it("reports whether it changed anything, so the UI can describe rather than assert", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);
    await session.verifyBackupRestores(parseBackupFile(backup.text), PASSPHRASE);

    assert.equal(hardenSession(session), true);
    assert.equal(hardenSession(session), false);
  });
});

describe("importBackupFile", () => {
  it("restores the identity, arriving hardened and already verified", async () => {
    const original = await createIdentitySession();
    const backup = await exportBackupFile(original, PASSPHRASE);

    const restored = await importBackupFile(serializeBackupFile(backup.envelope), PASSPHRASE);

    assert.equal(restored.identity.did, original.identity.did);
    assert.equal(restored.origin, "imported");
    assert.equal(restored.backupState, "verified");
    assert.equal(restored.hardened, true);
    assert.equal(restored.canExportBackup, false);
  });

  it("retains the ability to re-export only when explicitly asked", async () => {
    const original = await createIdentitySession();
    const backup = await exportBackupFile(original, PASSPHRASE);

    const restored = await importBackupFile(backup.text, PASSPHRASE, { retainExportCapability: true });

    assert.equal(restored.canExportBackup, true);
    assert.equal(restored.hardened, false);
  });
});

describe("summarizeBackupFile", () => {
  it("reads the plaintext header without attempting to decrypt", async () => {
    const session = await createIdentitySession();
    const backup = await exportBackupFile(session, PASSPHRASE);

    assert.deepEqual(summarizeBackupFile(backup.text), {
      did: backup.envelope.did,
      createdAt: backup.envelope.created_at,
      iterations: backup.envelope.kdf.iterations,
    });
  });

  it("rejects a file that is not a backup rather than reporting an empty summary", () => {
    assert.throws(() => summarizeBackupFile("{}"), BackupFormatError);
  });
});
