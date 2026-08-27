/**
 * Passphrase-based key derivation for encrypted identity backups.
 *
 * PBKDF2-HMAC-SHA-256 at 600,000 iterations, which is OWASP's 2023 recommendation for PBKDF2-SHA256
 * and takes roughly 0.3–1 s in a current browser. Argon2id would resist GPU attack better, but the
 * only implementations are third-party WebAssembly and this build keeps the key-handling path free of
 * dependencies. That is a deliberate trade, recorded in `docs/ARCHITECTURE.md` §7 rather than hidden:
 * a weak passphrase remains brute-forceable offline against a stolen backup file.
 *
 * The iteration count is stored in the backup envelope, so it can be raised for new backups without
 * breaking old ones.
 */

import { randomBytes, toBufferSource } from "./bytes.ts";

export const PBKDF2_ITERATIONS = 600_000;

/** Minimum accepted on import, so an attacker cannot hand back a 1-iteration envelope. */
export const PBKDF2_MIN_ITERATIONS = 100_000;

export const SALT_BYTES = 16;
export const AES_KEY_BITS = 256;

export class KdfError extends Error {
  override readonly name = "KdfError";
}

export const newSalt = (): Uint8Array => randomBytes(SALT_BYTES);

/**
 * Normalize passphrase text before it becomes key material.
 *
 * Two visually identical passphrases can be different byte sequences (composed vs decomposed
 * accents), which would make a backup undecryptable on a different keyboard or OS. NFC is applied on
 * both encrypt and decrypt, so the pair is self-consistent.
 */
export const normalizePassphrase = (passphrase: string): string => passphrase.normalize("NFC");

/**
 * Derive a non-extractable AES-256-GCM key from a passphrase.
 *
 * `extractable: false` means the derived key cannot be read back out of the handle — not a large win
 * on its own, but it costs nothing and keeps the pattern consistent across the codebase.
 */
export async function deriveBackupKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (!Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS) {
    throw new KdfError(`iteration count must be an integer of at least ${PBKDF2_MIN_ITERATIONS}`);
  }
  if (salt.length < SALT_BYTES) {
    throw new KdfError(`salt must be at least ${SALT_BYTES} bytes`);
  }

  const material = await crypto.subtle.importKey(
    "raw",
    toBufferSource(new TextEncoder().encode(normalizePassphrase(passphrase))),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toBufferSource(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: AES_KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}
