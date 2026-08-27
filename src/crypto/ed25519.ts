/**
 * Ed25519 via native WebCrypto. No third-party cryptography.
 *
 * Keeping this dependency-free is a deliberate security choice: the key-handling path carries no
 * supply-chain risk and adds nothing to the bundle. Verified against RFC 8032 §7.1 test vector 1
 * and, for signature bytes, against the CLI's libsodium output across 40 differential cases.
 */

import { toBase64Url, toBufferSource, wipe } from "./bytes.ts";

export const SIGNATURE_BYTES = 64;
export const PUBLIC_KEY_BYTES = 32;
export const SEED_BYTES = 32;

/** A 64-byte signature encoded as unpadded base64url is always exactly 86 characters. */
export const SIGNATURE_B64URL_LENGTH = 86;

const ALGORITHM = { name: "Ed25519" } as const;

export class CryptoUnsupportedError extends Error {
  override readonly name = "CryptoUnsupportedError";
  constructor() {
    super("This browser does not support Ed25519 in the Web Crypto API.");
  }
}

let capability: Promise<boolean> | null = null;

/**
 * Probe for Ed25519 support by actually generating a key, rather than sniffing the user agent.
 *
 * Requires Chrome/Edge 137+, Safari 17+, or Firefox 129+. An unsupported browser gets an explicit
 * error state — never a silent downgrade to weaker cryptography, and never a fabricated success.
 */
export function isEd25519Supported(): Promise<boolean> {
  capability ??= (async () => {
    try {
      if (typeof crypto === "undefined" || !crypto.subtle) return false;
      await crypto.subtle.generateKey(ALGORITHM, false, ["sign", "verify"]);
      return true;
    } catch {
      return false;
    }
  })();
  return capability;
}

export interface RawKeyPair {
  /** 32-byte private seed. Secret. Held only as long as it takes to encrypt a backup. */
  seed: Uint8Array;
  /** 32-byte public key. Safe to publish. */
  publicKey: Uint8Array;
}

export async function generateKeyPair(): Promise<RawKeyPair> {
  if (!(await isEd25519Supported())) throw new CryptoUnsupportedError();

  const pair = (await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d || !jwk.x) throw new Error("generateKeyPair: incomplete JWK export");

  const seed = base64UrlToBytes(jwk.d);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));

  if (seed.length !== SEED_BYTES) throw new Error(`generateKeyPair: seed must be ${SEED_BYTES} bytes`);
  if (publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`generateKeyPair: public key must be ${PUBLIC_KEY_BYTES} bytes`);
  }
  return { seed, publicKey };
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * RFC 8410 PrivateKeyInfo header for Ed25519. Fixed 16 bytes, followed by the 32-byte seed:
 *
 *   30 2e             SEQUENCE (46)
 *      02 01 00         INTEGER 0                    -- version
 *      30 05            SEQUENCE (5)
 *         06 03 2b 65 70  OID 1.3.101.112            -- id-Ed25519
 *      04 22            OCTET STRING (34)
 *         04 20           OCTET STRING (32)          -- CurvePrivateKey
 */
const PKCS8_ED25519_HEADER = Uint8Array.of(
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
);

/**
 * Recover the 32-byte public key from a seed alone.
 *
 * WebCrypto has no scalar-multiply primitive and cannot derive a public `CryptoKey` from a private
 * one, so this wraps the seed in PKCS#8 (which needs no public component), imports it, and reads the
 * `x` parameter back out of the JWK export.
 *
 * This is what lets an encrypted backup carry nothing but the seed. The DID recorded in the envelope
 * is then *checked* against the derived key rather than trusted — a backup cannot claim an identity
 * it does not hold the key for.
 */
export async function publicKeyFromSeed(seed: Uint8Array): Promise<Uint8Array> {
  if (!(await isEd25519Supported())) throw new CryptoUnsupportedError();
  if (seed.length !== SEED_BYTES) throw new Error(`publicKeyFromSeed: expected ${SEED_BYTES} bytes`);

  const pkcs8 = new Uint8Array(PKCS8_ED25519_HEADER.length + SEED_BYTES);
  pkcs8.set(PKCS8_ED25519_HEADER, 0);
  pkcs8.set(seed, PKCS8_ED25519_HEADER.length);
  try {
    const key = await crypto.subtle.importKey("pkcs8", toBufferSource(pkcs8), ALGORITHM, true, ["sign"]);
    const jwk = await crypto.subtle.exportKey("jwk", key);
    if (!jwk.x) throw new Error("publicKeyFromSeed: JWK export carried no public component");
    const publicKey = base64UrlToBytes(jwk.x);
    if (publicKey.length !== PUBLIC_KEY_BYTES) {
      throw new Error(`publicKeyFromSeed: derived key must be ${PUBLIC_KEY_BYTES} bytes`);
    }
    return publicKey;
  } finally {
    wipe(pkcs8);
  }
}

/**
 * Import a signing key from its seed and public key.
 *
 * `extractable` defaults to false, which makes the resulting handle unable to yield the private key
 * back to any script — including injected script. Only the backup step needs an extractable key.
 *
 * Verified behaviour worth knowing: WebCrypto rejects a JWK whose `d` and `x` disagree with a
 * `DataError`, so a tampered backup cannot produce a key that signs under a DID it does not own.
 */
export async function importSigningKey(
  seed: Uint8Array,
  publicKey: Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  if (!(await isEd25519Supported())) throw new CryptoUnsupportedError();
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "OKP",
      crv: "Ed25519",
      d: toBase64Url(seed),
      x: toBase64Url(publicKey),
      key_ops: ["sign"],
      ext: extractable,
    },
    ALGORITHM,
    extractable,
    ["sign"],
  );
}

export async function importVerifyKey(publicKey: Uint8Array): Promise<CryptoKey> {
  if (publicKey.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`importVerifyKey: expected ${PUBLIC_KEY_BYTES} bytes`);
  }
  return crypto.subtle.importKey("raw", toBufferSource(publicKey), ALGORITHM, false, ["verify"]);
}

/** Raw 64-byte signature over `message`. */
export async function sign(key: CryptoKey, message: Uint8Array): Promise<Uint8Array> {
  const signature = new Uint8Array(await crypto.subtle.sign(ALGORITHM, key, toBufferSource(message)));
  if (signature.length !== SIGNATURE_BYTES) throw new Error("sign: unexpected signature length");
  return signature;
}

/**
 * Verify a signature. Returns `false` for every kind of failure — never throws.
 *
 * That total contract is the point. A verifier that throws on a wrong-length key turns a "this does not
 * check out" result into an unhandled exception somewhere up the stack, and an unhandled exception in a
 * verification path is the failure mode most likely to be caught and mistaken for success. Anything that
 * is not a valid signature over these exact bytes by this exact key is `false`, including a malformed key,
 * a malformed signature, and a WebCrypto rejection we did not anticipate.
 */
export async function verify(
  publicKey: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  if (publicKey.length !== PUBLIC_KEY_BYTES) return false;
  if (signature.length !== SIGNATURE_BYTES) return false;
  try {
    const key = await importVerifyKey(publicKey);
    return await crypto.subtle.verify(ALGORITHM, key, toBufferSource(signature), toBufferSource(message));
  } catch {
    return false;
  }
}
