/**
 * Public identity types. Deliberately serializable and deliberately free of key material.
 *
 * The private counterpart is `SigningHandle` in `src/identity/keystore.ts`, which is a class whose
 * `toJSON()` throws. That asymmetry is the point: anything in this file is safe to log, persist, or
 * put in a request body, and anything that is not lives behind a handle that refuses to serialize.
 */

export interface PublicIdentity {
  /** `did:key:z6Mk…` — 56 characters. Public. */
  readonly did: string;
  /** 32-byte Ed25519 public key. Public. */
  readonly publicKey: Uint8Array;
  /** First 16 hex characters of `sha256(utf8(did))`. The registry key. Public. */
  readonly fingerprint: string;
  /** ISO-8601 UTC, second precision, matching the CLI's `%Y-%m-%dT%H:%M:%SZ`. */
  readonly createdAt: string;
}

export interface IdentityOrigin {
  /** Whether this identity was generated in this browser or restored from an encrypted backup. */
  readonly source: "generated" | "imported";
}
