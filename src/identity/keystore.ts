/**
 * The signing handle: an opaque, non-serializable wrapper around a private key.
 *
 * Everything about this class exists to make one class of bug impossible rather than merely
 * discouraged. A private key that is reachable as a plain value will eventually end up in a `fetch`
 * body, a `console.log`, a React devtools dump, or a serialized error — not through malice, but
 * because `JSON.stringify(state)` is a thing people write.
 *
 * So the private key here is:
 *
 * - held in a `#private` class field, invisible to `Object.keys`, spread, and `JSON.stringify`;
 * - a WebCrypto `CryptoKey` imported with `extractable: false`, so even code holding the field
 *   cannot read the bytes out;
 * - behind a `toJSON()` that **throws**, so an accidental serialization fails loudly at the call
 *   site instead of quietly shipping the key;
 * - behind a `toString()` that returns a redaction marker, so string interpolation is safe too.
 *
 * The `toJSON` guarantee is covered by tests rather than left as a convention.
 */

import { toBase64Url, utf8 } from "../crypto/bytes.ts";
import {
  importSigningKey,
  SIGNATURE_B64URL_LENGTH,
  SIGNATURE_BYTES,
  sign as signRaw,
  verify as verifyRaw,
} from "../crypto/ed25519.ts";
import { publicKeyToDid } from "./did.ts";

const REDACTED = "[SigningHandle — private key withheld]";

export class SigningKeyLeakError extends Error {
  override readonly name = "SigningKeyLeakError";
  constructor() {
    super(
      "A signing handle cannot be serialized. This is a guard, not a bug: the private key must never " +
        "leave the browser. Serialize the public identity instead.",
    );
  }
}

export class SignatureEncodingError extends Error {
  override readonly name = "SignatureEncodingError";
}

export class SelfTestFailedError extends Error {
  override readonly name = "SelfTestFailedError";
  constructor() {
    super("The imported signing key did not produce a signature its own public key verifies.");
  }
}

export class SigningHandle {
  /** Public DID. Safe everywhere. */
  readonly did: string;
  /** 32-byte public key. Safe everywhere. */
  readonly publicKey: Uint8Array;

  #key: CryptoKey;

  constructor(key: CryptoKey, publicKey: Uint8Array, did: string) {
    if (key.extractable) {
      throw new Error("SigningHandle refuses an extractable key — import with extractable: false");
    }
    this.#key = key;
    this.publicKey = publicKey;
    this.did = did;
    Object.freeze(this);
  }

  /** Raw 64-byte Ed25519 signature over `message`. */
  async sign(message: Uint8Array): Promise<Uint8Array> {
    return signRaw(this.#key, message);
  }

  /**
   * The wire encoding: unpadded base64url, which is exactly 86 characters for a 64-byte signature.
   *
   * The length assertion is not decoration. `flop_agent.py` asserts it too, and it is the cheapest
   * possible check that the encoder did not pad, use the standard base64 alphabet, or truncate.
   */
  async signToBase64Url(message: Uint8Array): Promise<string> {
    const signature = await this.sign(message);
    if (signature.length !== SIGNATURE_BYTES) {
      throw new SignatureEncodingError(`expected ${SIGNATURE_BYTES} signature bytes`);
    }
    const encoded = toBase64Url(signature);
    if (encoded.length !== SIGNATURE_B64URL_LENGTH) {
      throw new SignatureEncodingError(`expected ${SIGNATURE_B64URL_LENGTH} base64url characters`);
    }
    return encoded;
  }

  /**
   * Prove the handle actually controls the DID it claims.
   *
   * WebCrypto already rejects a JWK whose `d` and `x` disagree, so this is defence in depth against
   * a future refactor that changes how keys are imported. It costs one signature.
   */
  async selfTest(): Promise<void> {
    const probe = utf8(`technocore-self-test|${this.did}`);
    const signature = await this.sign(probe);
    if (!(await verifyRaw(this.publicKey, signature, probe))) throw new SelfTestFailedError();
  }

  toJSON(): never {
    throw new SigningKeyLeakError();
  }

  toString(): string {
    return REDACTED;
  }

  get [Symbol.toStringTag](): string {
    return "SigningHandle";
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED;
  }
}

/**
 * Build a handle from raw key material, then immediately verify it works.
 *
 * The seed is only read here; the resulting `CryptoKey` is non-extractable, so the handle cannot give
 * the seed back afterwards. Callers are responsible for wiping their own copy of the seed — see
 * `IdentitySession`.
 */
export async function createSigningHandle(seed: Uint8Array, publicKey: Uint8Array): Promise<SigningHandle> {
  const key = await importSigningKey(seed, publicKey, false);
  const handle = new SigningHandle(key, publicKey, publicKeyToDid(publicKey));
  await handle.selfTest();
  return handle;
}
