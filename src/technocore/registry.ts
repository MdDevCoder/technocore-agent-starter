/**
 * The public DID directory.
 *
 * Two things about this step are unusual and both are faithfully reproduced: the write is a
 * side-effecting `GET` into a key–value store, and the key is `sha256(utf8(did))` truncated to 16 hex
 * characters — a hash of the DID *string*, not of the public key bytes.
 *
 * **This step is optional and its failure is not a failure of anything else.** The directory has a
 * fixed note capacity (reported at 40,960) and rejects new entries once full. An identity is valid
 * without a directory entry, signed messages still post, and a contribution record is unaffected. The
 * UI models this as an explicit non-failure — never as "setup failed".
 *
 * How publication is confirmed: by reading the entry back and checking the DID is present, which is
 * the CLI's own presence test. The alternative — parsing an error string out of the write response — is
 * not used, because the exact wording the server emits at capacity has not been observed from an
 * authoritative source, and guessing at it would mean classifying failures by a string we invented.
 * Read-back is evidence; a matched error message would be an assumption.
 */

import type { PublicIdentity } from "../types/identity.ts";
import { didFingerprint, isValidDid } from "../identity/did.ts";
import { TechnocoreError } from "./errors.ts";
import { registryReadPath, registrySetPath } from "./profile.ts";
import { excerptOf, type TechnocoreTransport } from "./transport.ts";

export interface RegistryPublishResult {
  /**
   * `published` — the entry was written and read back successfully.
   * `unconfirmed` — the write did not take effect, or could not be confirmed. Non-blocking.
   */
  readonly status: "published" | "unconfirmed";
  readonly fingerprint: string;
  /** Present when `unconfirmed`, so the UI can explain rather than merely report. */
  readonly error?: TechnocoreError;
  readonly durationMs: number;
}

export interface RegistryLookupResult {
  readonly present: boolean;
  readonly fingerprint: string;
  /** Response text, capped and control-stripped. Rendered as text only. */
  readonly excerpt: string;
}

/**
 * Write the DID to the directory, then read it back to confirm.
 *
 * Never throws for a directory problem — the caller gets `unconfirmed` and continues. It throws only
 * if asked to publish something that is not a valid DID, which would be a bug in the caller.
 */
export async function publishDid(
  transport: TechnocoreTransport,
  identity: PublicIdentity,
  options: { readonly signal?: AbortSignal } = {},
): Promise<RegistryPublishResult> {
  if (!isValidDid(identity.did)) {
    throw new TechnocoreError("EGRESS_REFUSED", { excerpt: "refusing to publish an invalid DID" });
  }
  const fingerprint = identity.fingerprint || (await didFingerprint(identity.did));
  const signal = options.signal;
  let durationMs = 0;

  try {
    const write = await transport.send({
      method: "GET",
      path: registrySetPath(fingerprint, identity.did),
      ...(signal === undefined ? {} : { signal }),
    });
    durationMs += write.durationMs;

    // A non-OK write is informative but not decisive; the read-back below is what we trust.
    const lookup = await lookupDid(transport, identity.did, { ...(signal === undefined ? {} : { signal }) });

    if (lookup.present) return { status: "published", fingerprint, durationMs };

    return {
      status: "unconfirmed",
      fingerprint,
      error: new TechnocoreError("REGISTRY_UNCONFIRMED", {
        status: write.status,
        excerpt: excerptOf(write),
        step: "publish DID",
      }),
      durationMs,
    };
  } catch (error) {
    return {
      status: "unconfirmed",
      fingerprint,
      error:
        error instanceof TechnocoreError
          ? error
          : new TechnocoreError("REGISTRY_UNCONFIRMED", { step: "publish DID" }),
      durationMs,
    };
  }
}

/** Is this DID present in the directory? Substring presence, matching the CLI's own check. */
export async function lookupDid(
  transport: TechnocoreTransport,
  did: string,
  options: { readonly signal?: AbortSignal } = {},
): Promise<RegistryLookupResult> {
  const fingerprint = await didFingerprint(did);
  const response = await transport.send({
    method: "GET",
    path: registryReadPath(fingerprint),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  return {
    present: response.ok && response.text.includes(did),
    fingerprint,
    excerpt: excerptOf(response),
  };
}
