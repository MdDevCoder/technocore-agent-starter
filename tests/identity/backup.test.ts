/**
 * Encrypted backup: create, restore, tamper-detection, and parsing untrusted files.
 *
 * These tests use `PBKDF2_MIN_ITERATIONS` rather than the production 600,000 so the suite stays fast.
 * The iteration count is an envelope field, not a behaviour, and `kdf.test.ts` covers the floor.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AeadError } from "../../src/crypto/aead.ts";
import { fromBase64Url, toBase64Url, toHex } from "../../src/crypto/bytes.ts";
import { generateKeyPair, SEED_BYTES } from "../../src/crypto/ed25519.ts";
import { PBKDF2_MIN_ITERATIONS } from "../../src/crypto/kdf.ts";
import {
  BACKUP_SCHEMA,
  backupFileName,
  BackupFormatError,
  BackupIdentityMismatchError,
  createBackup,
  parseBackupFile,
  restoreBackup,
  serializeBackupFile,
  type BackupEnvelope,
} from "../../src/identity/backup.ts";
import { didFingerprint, publicKeyToDid } from "../../src/identity/did.ts";
import { MALFORMED_DIDS, RFC_VECTOR_1, RFC_VECTOR_2 } from "../vectors.ts";

const PASSPHRASE = "correct horse battery staple 7";
const ITERATIONS = PBKDF2_MIN_ITERATIONS;

const makeBackup = (seed = RFC_VECTOR_1.seed, did = RFC_VECTOR_1.did) =>
  createBackup(seed, did, PASSPHRASE, ITERATIONS);

/** Structural clone with a patch applied, since envelopes are deeply readonly. */
function patched(envelope: BackupEnvelope, patch: Record<string, unknown>): BackupEnvelope {
  return { ...structuredClone(envelope), ...patch } as BackupEnvelope;
}

describe("createBackup", () => {
  it("produces an envelope that carries no plaintext key material", async () => {
    const envelope = await makeBackup();
    const serialized = serializeBackupFile(envelope);

    assert.equal(envelope.schema, BACKUP_SCHEMA);
    assert.equal(envelope.did, RFC_VECTOR_1.did);
    assert.equal(envelope.kdf.name, "PBKDF2");
    assert.equal(envelope.kdf.hash, "SHA-256");
    assert.equal(envelope.cipher.name, "AES-256-GCM");

    // The seed must not appear in any encoding anywhere in the file.
    const seedHex = toHex(RFC_VECTOR_1.seed);
    assert.ok(!serialized.includes(seedHex));
    assert.ok(!serialized.includes(seedHex.toUpperCase()));
    assert.ok(!serialized.includes(toBase64Url(RFC_VECTOR_1.seed)));
    assert.ok(!serialized.includes(Buffer.from(RFC_VECTOR_1.seed).toString("base64")));
  });

  it("stores the public key nowhere — it is derived on restore instead", async () => {
    const serialized = serializeBackupFile(await makeBackup());
    assert.ok(!serialized.includes(toBase64Url(RFC_VECTOR_1.publicKey)));
    assert.ok(!serialized.includes(toHex(RFC_VECTOR_1.publicKey)));
  });

  it("seals 32 plaintext bytes plus a 16-byte GCM tag", async () => {
    const envelope = await makeBackup();
    assert.equal(fromBase64Url(envelope.cipher.ciphertext).length, SEED_BYTES + 16);
    assert.equal(fromBase64Url(envelope.cipher.iv).length, 12);
    assert.equal(fromBase64Url(envelope.kdf.salt).length, 16);
  });

  it("uses a fresh salt and IV every time, so two backups of one seed differ", async () => {
    const a = await makeBackup();
    const b = await makeBackup();
    assert.notEqual(a.kdf.salt, b.kdf.salt);
    assert.notEqual(a.cipher.iv, b.cipher.iv);
    assert.notEqual(a.cipher.ciphertext, b.cipher.ciphertext);
  });

  it("refuses a seed of the wrong length", async () => {
    await assert.rejects(() => createBackup(new Uint8Array(31), RFC_VECTOR_1.did, PASSPHRASE, ITERATIONS), BackupFormatError);
  });

  it("refuses an invalid DID", async () => {
    for (const [label, did] of MALFORMED_DIDS.slice(0, 6)) {
      await assert.rejects(
        () => createBackup(RFC_VECTOR_1.seed, did, PASSPHRASE, ITERATIONS),
        BackupFormatError,
        label,
      );
    }
  });

  it("records an ISO-8601 UTC timestamp to the second", async () => {
    const envelope = await makeBackup();
    assert.match(envelope.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe("restoreBackup", () => {
  it("round-trips the seed, public key, and DID", async () => {
    const envelope = await makeBackup();
    const restored = await restoreBackup(envelope, PASSPHRASE);
    assert.equal(toHex(restored.seed), toHex(RFC_VECTOR_1.seed));
    assert.equal(toHex(restored.publicKey), toHex(RFC_VECTOR_1.publicKey));
    assert.equal(restored.did, RFC_VECTOR_1.did);
  });

  it("round-trips a freshly generated identity", async () => {
    const { seed, publicKey } = await generateKeyPair();
    const did = publicKeyToDid(publicKey);
    const restored = await restoreBackup(await createBackup(seed, did, PASSPHRASE, ITERATIONS), PASSPHRASE);
    assert.equal(restored.did, did);
    assert.equal(toHex(restored.seed), toHex(seed));
  });

  it("rejects the wrong passphrase without saying which part failed", async () => {
    const envelope = await makeBackup();
    // A distinguishing error message here would be a validation oracle. Every failure is the same class.
    await assert.rejects(() => restoreBackup(envelope, "wrong passphrase!"), AeadError);
    await assert.rejects(() => restoreBackup(envelope, `${PASSPHRASE} `), AeadError);
    await assert.rejects(() => restoreBackup(envelope, ""), AeadError);
  });

  it("rejects an edited DID, because the DID is authenticated as AAD", async () => {
    const envelope = await makeBackup();
    const relabelled = patched(envelope, { did: RFC_VECTOR_2.did });
    // Not an identity mismatch — GCM authentication fails first, so the ciphertext is never even trusted
    // enough to decrypt. This is the property that stops a valid backup being re-attributed.
    await assert.rejects(() => restoreBackup(relabelled, PASSPHRASE), AeadError);
  });

  it("rejects edited ciphertext", async () => {
    const envelope = await makeBackup();
    const bytes = fromBase64Url(envelope.cipher.ciphertext);
    const firstByte = bytes[0];
    // `noUncheckedIndexedAccess` types this as `number | undefined`, so the bit flip reads through a
    // checked local rather than `bytes[0] ^= 1`. A `?? 0` fallback would be shorter and wrong: against
    // an empty ciphertext it would let this test pass while testing nothing.
    if (firstByte === undefined) throw new Error("precondition: ciphertext must not be empty");
    bytes[0] = firstByte ^ 0x01;
    const edited = structuredClone(envelope) as { cipher: { ciphertext: string } };
    edited.cipher.ciphertext = toBase64Url(bytes);
    await assert.rejects(() => restoreBackup(edited as BackupEnvelope, PASSPHRASE), AeadError);
  });

  it("rejects an edited IV, salt, or iteration count", async () => {
    const envelope = await makeBackup();
    const swapIv = structuredClone(envelope) as { cipher: { iv: string } };
    swapIv.cipher.iv = toBase64Url(new Uint8Array(12));
    await assert.rejects(() => restoreBackup(swapIv as BackupEnvelope, PASSPHRASE), AeadError);

    const swapSalt = structuredClone(envelope) as { kdf: { salt: string } };
    swapSalt.kdf.salt = toBase64Url(new Uint8Array(16));
    await assert.rejects(() => restoreBackup(swapSalt as BackupEnvelope, PASSPHRASE), AeadError);

    const swapIterations = structuredClone(envelope) as { kdf: { iterations: number } };
    swapIterations.kdf.iterations = ITERATIONS + 1;
    await assert.rejects(() => restoreBackup(swapIterations as BackupEnvelope, PASSPHRASE), AeadError);
  });

  it("reports a mismatch when a backup claims a DID whose key it does not hold", async () => {
    // Constructed the only way this is reachable: seal seed A, but under the AAD for DID B. That takes
    // the passphrase, so it models a malicious backup handed to a user, not a network attacker.
    const forged = await sealUnderForeignDid(RFC_VECTOR_1.seed, RFC_VECTOR_2.did);
    await assert.rejects(() => restoreBackup(forged, PASSPHRASE), BackupIdentityMismatchError);
  });

  it("rejects a decrypted payload that is not 32 bytes", async () => {
    const short = await sealPlaintext(new Uint8Array(16), RFC_VECTOR_1.did);
    await assert.rejects(() => restoreBackup(short, PASSPHRASE), BackupFormatError);
  });

  it("rejects fields that are not base64url", async () => {
    const envelope = await makeBackup();
    const bad = structuredClone(envelope) as { cipher: { ciphertext: string } };
    bad.cipher.ciphertext = "not base64url!!";
    await assert.rejects(() => restoreBackup(bad as BackupEnvelope, PASSPHRASE), BackupFormatError);
  });
});

describe("parseBackupFile", () => {
  it("accepts a file this app wrote", async () => {
    const envelope = await makeBackup();
    const parsed = parseBackupFile(serializeBackupFile(envelope));
    assert.deepEqual(parsed, envelope);
  });

  it("survives a full write-read-restore cycle", async () => {
    const envelope = await makeBackup();
    const restored = await restoreBackup(parseBackupFile(serializeBackupFile(envelope)), PASSPHRASE);
    assert.equal(restored.did, RFC_VECTOR_1.did);
  });

  it("rejects invalid JSON with an instruction, not a stack trace", async () => {
    assert.throws(() => parseBackupFile("not json"), BackupFormatError);
    assert.throws(() => parseBackupFile(""), BackupFormatError);
    assert.throws(() => parseBackupFile("{"), BackupFormatError);
  });

  it("rejects JSON that is not an object", () => {
    for (const text of ["[]", '"string"', "42", "null", "true"]) {
      assert.throws(() => parseBackupFile(text), BackupFormatError, text);
    }
  });

  it("rejects a plaintext CLI key file and says so", () => {
    // A user who drags in agent_key.json should get an explanation, not a crash — and the app must not
    // quietly start reading raw private keys out of files.
    const cliShaped = JSON.stringify({ did: RFC_VECTOR_1.did, private_key_hex: toHex(RFC_VECTOR_1.seed) });
    assert.throws(() => parseBackupFile(cliShaped), (error: unknown) => {
      assert.ok(error instanceof BackupFormatError);
      assert.match(error.message, /cannot read plaintext key files/i);
      assert.match(error.message, /never asks for a raw private key/i);
      return true;
    });
  });

  it("rejects an unknown or downgraded schema", async () => {
    const envelope = await makeBackup();
    for (const schema of ["technocore-agent-backup-v0", "", "TECHNOCORE-AGENT-BACKUP-V1", null, 1]) {
      assert.throws(() => parseBackupFile(JSON.stringify(patched(envelope, { schema }))), BackupFormatError);
    }
  });

  it("rejects a malformed DID before anything touches the crypto layer", async () => {
    const envelope = await makeBackup();
    for (const [label, did] of MALFORMED_DIDS) {
      assert.throws(
        () => parseBackupFile(JSON.stringify(patched(envelope, { did }))),
        BackupFormatError,
        label,
      );
    }
  });

  it("rejects an iteration count below the floor", async () => {
    const envelope = await makeBackup();
    for (const iterations of [1, 1000, PBKDF2_MIN_ITERATIONS - 1, 0, -600_000, 1.5, "600000", null]) {
      const file = JSON.stringify(patched(envelope, { kdf: { ...envelope.kdf, iterations } }));
      assert.throws(() => parseBackupFile(file), BackupFormatError, String(iterations));
    }
  });

  it("rejects unsupported KDF or cipher parameters", async () => {
    const envelope = await makeBackup();
    const cases: Array<Record<string, unknown>> = [
      { kdf: { ...envelope.kdf, name: "scrypt" } },
      { kdf: { ...envelope.kdf, hash: "SHA-1" } },
      { cipher: { ...envelope.cipher, name: "AES-128-CBC" } },
      { cipher: { ...envelope.cipher, name: "none" } },
    ];
    for (const patch of cases) {
      assert.throws(() => parseBackupFile(JSON.stringify(patched(envelope, patch))), BackupFormatError);
    }
  });

  it("rejects missing sections and empty required strings", async () => {
    const envelope = await makeBackup();
    const cases: Array<Record<string, unknown>> = [
      { kdf: undefined },
      { kdf: null },
      { kdf: [] },
      { cipher: undefined },
      { cipher: "AES" },
      { kdf: { ...envelope.kdf, salt: "" } },
      { cipher: { ...envelope.cipher, iv: "" } },
      { cipher: { ...envelope.cipher, ciphertext: undefined } },
    ];
    for (const patch of cases) {
      assert.throws(
        () => parseBackupFile(JSON.stringify(patched(envelope, patch))),
        BackupFormatError,
        JSON.stringify(patch),
      );
    }
  });

  it("tolerates a missing note and timestamp, which are not load-bearing", async () => {
    const envelope = await makeBackup();
    const parsed = parseBackupFile(JSON.stringify(patched(envelope, { note: undefined, created_at: 42 })));
    assert.equal(parsed.created_at, "");
    assert.ok(parsed.note.length > 0);
    assert.equal((await restoreBackup(parsed, PASSPHRASE)).did, RFC_VECTOR_1.did);
  });

  it("ignores unknown extra fields rather than failing on them", async () => {
    // Forward compatibility: a future field must not make today's build reject a valid backup. The
    // parser rebuilds the envelope from known fields, so extras are dropped, not trusted.
    const envelope = await makeBackup();
    const parsed = parseBackupFile(JSON.stringify({ ...envelope, future_field: { anything: true } }));
    assert.deepEqual(Object.keys(parsed).sort(), Object.keys(envelope).sort());
  });
});

describe("serializeBackupFile", () => {
  it("writes indented JSON with a trailing newline", async () => {
    const text = serializeBackupFile(await makeBackup());
    assert.ok(text.endsWith("}\n"));
    assert.ok(text.includes('\n  "did":'));
  });
});

describe("backupFileName", () => {
  it("is derived from the fingerprint and never shadows the CLI key file", async () => {
    const name = await backupFileName(RFC_VECTOR_1.did);
    assert.equal(name, `technocore-agent-${await didFingerprint(RFC_VECTOR_1.did)}.backup.json`);
    assert.notEqual(name, "agent_key.json");
    assert.match(name, /^[a-z0-9.-]+$/);
  });

  it("contains no path separators or traversal, since it lands in a download attribute", async () => {
    const name = await backupFileName(RFC_VECTOR_1.did);
    assert.ok(!name.includes("/") && !name.includes("\\") && !name.includes(".."));
  });
});

// ---------------------------------------------------------------------------
// Helpers that build envelopes the library itself would never produce.
// ---------------------------------------------------------------------------

async function sealPlaintext(plaintext: Uint8Array, did: string): Promise<BackupEnvelope> {
  const { seal } = await import("../../src/crypto/aead.ts");
  const { deriveBackupKey, newSalt } = await import("../../src/crypto/kdf.ts");
  const { utf8 } = await import("../../src/crypto/bytes.ts");

  const salt = newSalt();
  const key = await deriveBackupKey(PASSPHRASE, salt, ITERATIONS);
  const box = await seal(key, plaintext, utf8(`${BACKUP_SCHEMA}|${did}`));
  return {
    schema: BACKUP_SCHEMA,
    did,
    created_at: "2026-01-01T00:00:00Z",
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: toBase64Url(salt) },
    cipher: { name: "AES-256-GCM", iv: toBase64Url(box.iv), ciphertext: toBase64Url(box.ciphertext) },
    note: "test fixture",
  };
}

/** Seal `seed` but label the envelope with someone else's DID, matching the AAD so GCM passes. */
const sealUnderForeignDid = (seed: Uint8Array, did: string) => sealPlaintext(seed, did);
