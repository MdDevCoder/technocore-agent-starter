/**
 * Encrypted identity backup — the only artifact in this product that contains a private key, and it
 * is never readable without the passphrase.
 *
 * This is a deliberate departure from the CLI, which writes `agent_key.json` with the seed in
 * plaintext hex and relies on `chmod 0600`. A file like that is readable by any process running as
 * the user, survives in backups and sync folders, and is trivially exfiltrated. Here the seed is
 * sealed with AES-256-GCM under a PBKDF2-600k key, and the envelope is bound to its DID as additional
 * authenticated data.
 *
 * Envelope shape (`technocore-agent-backup-v1`):
 *
 * ```json
 * {
 *   "schema": "technocore-agent-backup-v1",
 *   "did": "did:key:z6Mk…",
 *   "created_at": "2026-08-26T12:00:00Z",
 *   "kdf":    { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<base64url>" },
 *   "cipher": { "name": "AES-256-GCM", "iv": "<base64url>", "ciphertext": "<base64url>" },
 *   "note":   "…"
 * }
 * ```
 *
 * Only the 32-byte seed is encrypted. The public key is not stored: it is *derived* from the seed on
 * restore, and the resulting DID is compared against the envelope's. A backup therefore cannot claim
 * an identity whose key it does not hold.
 */

import { unseal, seal, type SealedBox } from "../crypto/aead.ts";
import { fromBase64Url, toBase64Url, utf8, wipe } from "../crypto/bytes.ts";
import { publicKeyFromSeed, SEED_BYTES } from "../crypto/ed25519.ts";
import { deriveBackupKey, newSalt, PBKDF2_ITERATIONS, PBKDF2_MIN_ITERATIONS } from "../crypto/kdf.ts";
import { isoSecondsUtc } from "../util/time.ts";
import { didFingerprint, isValidDid, publicKeyToDid } from "./did.ts";

export const BACKUP_SCHEMA = "technocore-agent-backup-v1";

export const BACKUP_NOTE =
  "Encrypted Technocore agent identity. The passphrase is required to restore it and cannot be " +
  "recovered or reset by anyone. Store this file and the passphrase separately.";

export interface BackupEnvelope {
  readonly schema: typeof BACKUP_SCHEMA;
  readonly did: string;
  readonly created_at: string;
  readonly kdf: {
    readonly name: "PBKDF2";
    readonly hash: "SHA-256";
    readonly iterations: number;
    readonly salt: string;
  };
  readonly cipher: {
    readonly name: "AES-256-GCM";
    readonly iv: string;
    readonly ciphertext: string;
  };
  readonly note: string;
}

export class BackupFormatError extends Error {
  override readonly name = "BackupFormatError";
}

export class BackupIdentityMismatchError extends Error {
  override readonly name = "BackupIdentityMismatchError";
  constructor() {
    super("This backup decrypted, but its key does not match the DID it claims. It has been altered.");
  }
}

/** AAD binds both the format version and the identity, so neither can be swapped after the fact. */
const additionalData = (did: string): Uint8Array => utf8(`${BACKUP_SCHEMA}|${did}`);

export async function createBackup(
  seed: Uint8Array,
  did: string,
  passphrase: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<BackupEnvelope> {
  if (seed.length !== SEED_BYTES) throw new BackupFormatError(`seed must be ${SEED_BYTES} bytes`);
  if (!isValidDid(did)) throw new BackupFormatError("cannot back up an invalid DID");

  const salt = newSalt();
  const key = await deriveBackupKey(passphrase, salt, iterations);
  const box = await seal(key, seed, additionalData(did));

  return {
    schema: BACKUP_SCHEMA,
    did,
    created_at: isoSecondsUtc(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64Url(salt) },
    cipher: { name: "AES-256-GCM", iv: toBase64Url(box.iv), ciphertext: toBase64Url(box.ciphertext) },
    note: BACKUP_NOTE,
  };
}

export interface RestoredIdentity {
  /** 32-byte seed. Secret. The caller owns it and must wipe it. */
  readonly seed: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly did: string;
}

export async function restoreBackup(envelope: BackupEnvelope, passphrase: string): Promise<RestoredIdentity> {
  const salt = decodeField(envelope.kdf.salt, "kdf.salt");
  const box: SealedBox = {
    iv: decodeField(envelope.cipher.iv, "cipher.iv"),
    ciphertext: decodeField(envelope.cipher.ciphertext, "cipher.ciphertext"),
  };

  const key = await deriveBackupKey(passphrase, salt, envelope.kdf.iterations);
  const seed = await unseal(key, box, additionalData(envelope.did));

  if (seed.length !== SEED_BYTES) {
    wipe(seed);
    throw new BackupFormatError("decrypted payload is not a 32-byte Ed25519 seed");
  }

  // Derive rather than trust: the DID in the file is checked against the key it actually contains.
  const publicKey = await publicKeyFromSeed(seed);
  const derivedDid = publicKeyToDid(publicKey);
  if (derivedDid !== envelope.did) {
    wipe(seed);
    throw new BackupIdentityMismatchError();
  }

  return { seed, publicKey, did: derivedDid };
}

function decodeField(value: string, field: string): Uint8Array {
  try {
    return fromBase64Url(value);
  } catch {
    throw new BackupFormatError(`${field} is not valid base64url`);
  }
}

/**
 * Parse and validate an untrusted backup file.
 *
 * Every field is checked before anything touches the crypto layer, because this is the one place the
 * app ingests a file a user could have received from someone else. Nothing here is rendered as HTML,
 * and no field is used to build a URL.
 */
export function parseBackupFile(text: string): BackupEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupFormatError("This file is not valid JSON. Choose the .backup.json file you saved.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BackupFormatError("This file does not contain a backup object.");
  }
  const record = parsed as Record<string, unknown>;

  if (record["schema"] !== BACKUP_SCHEMA) {
    throw new BackupFormatError(
      `Unrecognised backup format. Expected "${BACKUP_SCHEMA}". This app cannot read plaintext key ` +
        "files, and never asks for a raw private key. If this is a WSL/Linux CLI identity (\"agent_key.json\"), use the WSL/Linux Migration tab on the Import page to securely protect it.",
    );
  }

  const did = record["did"];
  if (typeof did !== "string" || !isValidDid(did)) {
    throw new BackupFormatError("The DID in this backup is missing or malformed.");
  }

  const kdf = asObject(record["kdf"], "kdf");
  if (kdf["name"] !== "PBKDF2" || kdf["hash"] !== "SHA-256") {
    throw new BackupFormatError("Unsupported key-derivation parameters.");
  }
  const iterations = kdf["iterations"];
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS) {
    throw new BackupFormatError(
      `Key-derivation cost is missing or below the ${PBKDF2_MIN_ITERATIONS.toLocaleString("en-US")} ` +
        "iteration floor this app accepts.",
    );
  }
  const salt = requireString(kdf["salt"], "kdf.salt");

  const cipher = asObject(record["cipher"], "cipher");
  if (cipher["name"] !== "AES-256-GCM") {
    throw new BackupFormatError("Unsupported cipher.");
  }

  const createdAt = record["created_at"];
  const note = record["note"];

  return {
    schema: BACKUP_SCHEMA,
    did,
    created_at: typeof createdAt === "string" ? createdAt : "",
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt },
    cipher: {
      name: "AES-256-GCM",
      iv: requireString(cipher["iv"], "cipher.iv"),
      ciphertext: requireString(cipher["ciphertext"], "cipher.ciphertext"),
    },
    note: typeof note === "string" ? note : BACKUP_NOTE,
  };
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackupFormatError(`Backup field "${field}" is missing.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BackupFormatError(`Backup field "${field}" is missing.`);
  }
  return value;
}

export function serializeBackupFile(envelope: BackupEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * Filename for the download.
 *
 * Intentionally *not* `agent_key.json`. That name belongs to the CLI's plaintext key file, and a
 * download that shadows it could overwrite a real key or be mistaken for one.
 */
export async function backupFileName(did: string): Promise<string> {
  return `technocore-agent-${await didFingerprint(did)}.backup.json`;
}
