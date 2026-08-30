/**
 * Legacy WSL/Linux Identity Migration Module.
 *
 * Imports, validates, and migrates existing Technocore identities created via the original
 * Python CLI / Linux / WSL tooling (`agent_key.json` format: private_key, public_key, did, created_at).
 *
 * Security Invariants:
 * 1. The raw legacy JSON and private key are parsed and verified 100% in the client/browser.
 * 2. Raw private key material is NEVER sent over HTTP, logged, or stored unencrypted.
 * 3. The exact original DID is preserved byte-for-byte without generating a new identity.
 * 4. The raw key is immediately converted into the standard encrypted backup format (PBKDF2-SHA256 + AES-256-GCM)
 *    under a user-chosen passphrase, and the raw seed is wiped from memory.
 */

import { fromHex, timingSafeEqual, wipe } from "../crypto/bytes.ts";
import { publicKeyFromSeed, PUBLIC_KEY_BYTES, SEED_BYTES } from "../crypto/ed25519.ts";
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "./passphrase.ts";
import { backupFileName, createBackup, serializeBackupFile, type BackupEnvelope } from "./backup.ts";
import { didFingerprint, didToPublicKey, isValidDid, publicKeyToDid } from "./did.ts";
import { createSigningHandle } from "./keystore.ts";
import { IdentitySession } from "./session.ts";
import type { PublicIdentity } from "../types/identity.ts";
import { isoSecondsUtc } from "../util/time.ts";
import type { ExportedBackup } from "../flow/backup.ts";

export class LegacyIdentityFormatError extends Error {
  override readonly name = "LegacyIdentityFormatError";
}

export class LegacyIdentityMismatchError extends Error {
  override readonly name = "LegacyIdentityMismatchError";
}

export class WeakPassphraseError extends Error {
  override readonly name = "WeakPassphraseError";
}

export interface ValidatedLegacyIdentity {
  /** 32-byte seed. Secret. Wiped on migration completion. */
  readonly seed: Uint8Array;
  /** 32-byte public key. Safe to publish. */
  readonly publicKey: Uint8Array;
  /** Canonical did:key. Exact match of legacy file. */
  readonly did: string;
  /** ISO timestamp from legacy file or fallback. */
  readonly createdAt: string;
}

export interface LegacyIdentitySummary {
  readonly did: string;
  readonly fingerprint: string;
  readonly createdAt: string;
  readonly publicKeyHex: string;
}

/**
 * Normalizes hex string by trimming and stripping optional leading 0x/0X.
 */
function cleanHex(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LegacyIdentityFormatError(`Missing or empty "${fieldName}" in legacy identity file.`);
  }
  let hex = value.trim();
  if (hex.startsWith("0x") || hex.startsWith("0X")) {
    hex = hex.slice(2);
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new LegacyIdentityFormatError(`Invalid hex encoding in "${fieldName}".`);
  }
  return hex;
}

/**
 * Parses and validates an unencrypted legacy WSL/Linux identity JSON file entirely client-side.
 *
 * Verifies:
 * - JSON structure
 * - 32-byte seed / 64-byte keypair private_key
 * - 32-byte public_key
 * - Cryptographic correspondence: derived public key from seed == supplied public_key
 * - DID correspondence: derived did:key from public key == supplied did
 * - Valid created_at date (if present)
 */
export async function parseAndValidateLegacyIdentity(rawJson: string): Promise<ValidatedLegacyIdentity> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new LegacyIdentityFormatError("This file is not valid JSON. Select your existing agent_key.json file.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new LegacyIdentityFormatError("This file does not contain a legacy identity object.");
  }

  const record = parsed as Record<string, unknown>;

  // Extract private key hex (supporting snake_case and camelCase)
  const privKeyRaw = record["private_key"] ?? record["privateKey"];
  const privHex = cleanHex(privKeyRaw, "private_key");

  let privBytes: Uint8Array;
  try {
    privBytes = fromHex(privHex);
  } catch (error) {
    throw new LegacyIdentityFormatError(
      `Failed to parse private key hex: ${error instanceof Error ? error.message : "invalid hex"}`,
    );
  }

  let seed: Uint8Array;
  if (privBytes.length === SEED_BYTES) {
    seed = privBytes;
  } else if (privBytes.length === 64) {
    // 64-byte libsodium expanded keypair format (32-byte seed + 32-byte public key)
    seed = privBytes.slice(0, SEED_BYTES);
    wipe(privBytes);
  } else {
    wipe(privBytes);
    throw new LegacyIdentityFormatError(
      `Invalid private key length: expected ${SEED_BYTES} bytes (64 hex characters) or 64 bytes (128 hex characters), got ${privBytes.length} bytes.`,
    );
  }

  // Extract public key hex (supporting snake_case and camelCase)
  const pubKeyRaw = record["public_key"] ?? record["publicKey"];
  const pubHex = cleanHex(pubKeyRaw, "public_key");

  let pubBytes: Uint8Array;
  try {
    pubBytes = fromHex(pubHex);
  } catch (error) {
    wipe(seed);
    throw new LegacyIdentityFormatError(
      `Failed to parse public key hex: ${error instanceof Error ? error.message : "invalid hex"}`,
    );
  }

  if (pubBytes.length !== PUBLIC_KEY_BYTES) {
    wipe(seed);
    throw new LegacyIdentityFormatError(
      `Invalid public key length: expected ${PUBLIC_KEY_BYTES} bytes (64 hex characters), got ${pubBytes.length} bytes.`,
    );
  }

  // Extract DID
  const claimedDid = record["did"];
  if (typeof claimedDid !== "string" || !isValidDid(claimedDid)) {
    wipe(seed);
    throw new LegacyIdentityFormatError("Missing or malformed did:key identifier in legacy file.");
  }

  // Extract created_at (if present)
  const rawCreatedAt = record["created_at"] ?? record["createdAt"];
  let createdAt = isoSecondsUtc();
  if (typeof rawCreatedAt === "string" && rawCreatedAt.trim().length > 0) {
    const parsedTime = Date.parse(rawCreatedAt);
    if (isNaN(parsedTime)) {
      wipe(seed);
      throw new LegacyIdentityFormatError("The created_at field in this legacy file is not a valid date string.");
    }
    createdAt = rawCreatedAt.trim();
  }

  // 1. Cryptographic Correspondence Check: derived public key from seed MUST match supplied public key
  let derivedPublicKey: Uint8Array;
  try {
    derivedPublicKey = await publicKeyFromSeed(seed);
  } catch (error) {
    wipe(seed);
    throw new LegacyIdentityFormatError(
      `Failed to derive public key from private seed: ${error instanceof Error ? error.message : "WebCrypto error"}`,
    );
  }

  if (!timingSafeEqual(derivedPublicKey, pubBytes)) {
    wipe(seed);
    throw new LegacyIdentityMismatchError(
      "Mismatched keypair: The supplied public_key does not correspond to the private_key in this file.",
    );
  }

  // 2. DID Correspondence Check: derived DID from public key MUST match supplied DID
  let derivedDid: string;
  try {
    derivedDid = publicKeyToDid(pubBytes);
  } catch (error) {
    wipe(seed);
    throw new LegacyIdentityFormatError(
      `Failed to derive did:key from public key: ${error instanceof Error ? error.message : "DID derivation error"}`,
    );
  }

  if (derivedDid !== claimedDid) {
    wipe(seed);
    throw new LegacyIdentityMismatchError(
      `Mismatched DID: The DID in the file (${claimedDid}) does not match the DID derived from its public key (${derivedDid}).`,
    );
  }

  // Extra check: confirm didToPublicKey returns the exact public key
  try {
    const fromDidPub = didToPublicKey(claimedDid);
    if (!timingSafeEqual(fromDidPub, pubBytes)) {
      wipe(seed);
      throw new LegacyIdentityMismatchError("The DID encoding does not match the public key bytes.");
    }
  } catch (error) {
    wipe(seed);
    throw new LegacyIdentityMismatchError(
      `Invalid DID encoding: ${error instanceof Error ? error.message : "DID decode error"}`,
    );
  }

  return {
    seed,
    publicKey: pubBytes,
    did: derivedDid,
    createdAt,
  };
}

/**
 * Inspects a legacy file and produces a summary for display without retaining secret material.
 */
export async function summarizeLegacyIdentityFile(rawJson: string): Promise<LegacyIdentitySummary> {
  const validated = await parseAndValidateLegacyIdentity(rawJson);
  try {
    return {
      did: validated.did,
      fingerprint: await didFingerprint(validated.did),
      createdAt: validated.createdAt,
      publicKeyHex: Array.from(validated.publicKey)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    };
  } finally {
    wipe(validated.seed);
  }
}

/**
 * Migrates a validated legacy identity into an active IdentitySession and generates
 * an encrypted Technocore backup envelope protected by the user's passphrase.
 *
 * Immediately wipes the raw seed from memory after session creation.
 */
export async function migrateLegacyIdentity(
  validated: ValidatedLegacyIdentity,
  passphrase: string,
  options: { readonly retainExportCapability?: boolean } = {},
): Promise<{ session: IdentitySession; backup: ExportedBackup }> {
  const assessment = assessPassphrase(passphrase);
  if (!assessment.acceptable) {
    wipe(validated.seed);
    throw new WeakPassphraseError(
      `Use at least ${MIN_PASSPHRASE_LENGTH} characters. This passphrase encrypts and protects your migrated identity backup.`,
    );
  }

  // 1. Create encrypted backup envelope (PBKDF2 600,000 + AES-256-GCM)
  const envelope: BackupEnvelope = await createBackup(validated.seed, validated.did, passphrase);

  const backup: ExportedBackup = {
    envelope,
    fileName: await backupFileName(envelope.did),
    text: serializeBackupFile(envelope),
    iterations: envelope.kdf.iterations,
    createdAt: envelope.created_at,
  };

  // 2. Create non-extractable signing handle
  const handle = await createSigningHandle(validated.seed, validated.publicKey);

  const identity: PublicIdentity = {
    did: validated.did,
    publicKey: validated.publicKey,
    fingerprint: await didFingerprint(validated.did),
    createdAt: validated.createdAt,
  };

  // 3. Create active session and immediately wipe raw seed
  let session: IdentitySession;
  if (options.retainExportCapability) {
    session = new IdentitySession(identity, handle, validated.seed, "imported", "verified");
  } else {
    wipe(validated.seed);
    session = new IdentitySession(identity, handle, null, "imported", "verified");
  }

  return { session, backup };
}

/**
 * High-level orchestration for migrating a raw legacy JSON string.
 */
export async function migrateLegacyIdentityFile(
  rawJson: string,
  passphrase: string,
  options: { readonly retainExportCapability?: boolean } = {},
): Promise<{ session: IdentitySession; backup: ExportedBackup }> {
  const validated = await parseAndValidateLegacyIdentity(rawJson);
  return migrateLegacyIdentity(validated, passphrase, options);
}
