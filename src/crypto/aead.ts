/**
 * Authenticated encryption for identity backups: AES-256-GCM with additional authenticated data.
 *
 * The AAD is what makes the backup envelope tamper-evident as a whole rather than just its
 * ciphertext. Binding the schema string and the DID means an attacker cannot take a valid ciphertext
 * and re-label it as belonging to a different identity, or downgrade the envelope to an older format:
 * either edit makes the AAD disagree and GCM authentication fails outright.
 */

import { randomBytes, toBufferSource } from "./bytes.ts";

export const IV_BYTES = 12;
export const TAG_BITS = 128;

export class AeadError extends Error {
  override readonly name = "AeadError";
}

export interface SealedBox {
  /** 96-bit IV. Random per encryption, never reused with the same key. */
  readonly iv: Uint8Array;
  /** Ciphertext with the 128-bit GCM tag appended, as WebCrypto returns it. */
  readonly ciphertext: Uint8Array;
}

export async function seal(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<SealedBox> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBufferSource(iv), additionalData: toBufferSource(aad), tagLength: TAG_BITS },
      key,
      toBufferSource(plaintext),
    ),
  );
  return { iv, ciphertext };
}

/**
 * Decrypt and authenticate.
 *
 * Throws `AeadError` for every failure mode — wrong passphrase, edited ciphertext, edited DID,
 * truncated file — deliberately without distinguishing them. Telling a caller *which* part failed
 * would hand an attacker a validation oracle, and the user-facing remedy is the same in every case.
 */
export async function unseal(key: CryptoKey, box: SealedBox, aad: Uint8Array): Promise<Uint8Array> {
  if (box.iv.length !== IV_BYTES) throw new AeadError("backup is not readable");
  if (box.ciphertext.length <= TAG_BITS / 8) throw new AeadError("backup is not readable");
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toBufferSource(box.iv), additionalData: toBufferSource(aad), tagLength: TAG_BITS },
        key,
        toBufferSource(box.ciphertext),
      ),
    );
  } catch {
    throw new AeadError("backup could not be decrypted with that passphrase");
  }
}
