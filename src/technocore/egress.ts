/**
 * The egress guard: the last check before anything leaves the browser.
 *
 * Every outbound request passes through here. It is an **allow-list**, not a scan for secrets, and
 * that choice is deliberate. A blacklist ("refuse if the body contains the private key") would have to
 * hold a copy of the key material in order to compare against it — extending the lifetime of the very
 * thing it is protecting — and it would still miss any encoding the author of the bug happened to use.
 *
 * An allow-list has neither problem. It retains no secrets, and it fails closed: a request shape that
 * was not anticipated is refused rather than permitted. Combined with `SigningHandle.toJSON()` and
 * `IdentitySession.toJSON()` throwing, there are two independent mechanisms standing between a coding
 * mistake and a leaked key, and neither one needs to know what the key is.
 *
 * The only request body this application ever produces is a signed room message, whose four fields are
 * all public by construction: a DID, a signature, a nonce, and the message text.
 */

import { isValidDid } from "../identity/did.ts";
import { TechnocoreError } from "./errors.ts";
import { isValidNonce } from "./nonce.ts";
import { isAllowedPath, SIGNATURE } from "./profile.ts";

/** Exactly the fields of a signed room message. Nothing else may be sent. */
const PERMITTED_BODY_FIELDS = ["did", "sig", "nonce", "text"] as const;

export interface EgressCandidate {
  readonly method: string;
  readonly path: string;
  readonly body?: string | undefined;
}

export class EgressRefusedError extends TechnocoreError {
  readonly why: string;
  constructor(why: string) {
    super("EGRESS_REFUSED", { excerpt: why });
    this.why = why;
  }
}

/**
 * Throw unless this request is one of the shapes the protocol actually needs.
 *
 * Checks, in order: the path is on the allow-list; a GET carries no body; a POST body is a JSON object
 * with exactly the four permitted string fields; and each field matches its expected shape.
 */
export function assertEgressPermitted(candidate: EgressCandidate): void {
  if (!isAllowedPath(candidate.path)) {
    throw new EgressRefusedError("request path is not on the Technocore allow-list");
  }

  if (candidate.method === "GET") {
    if (candidate.body !== undefined) throw new EgressRefusedError("a GET request must not carry a body");
    return;
  }

  if (candidate.method !== "POST") {
    throw new EgressRefusedError(`method ${candidate.method} is not used by this protocol`);
  }
  if (candidate.body === undefined) throw new EgressRefusedError("a POST request must carry a body");

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.body);
  } catch {
    throw new EgressRefusedError("request body is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new EgressRefusedError("request body is not a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);

  const unexpected = keys.filter((key) => !PERMITTED_BODY_FIELDS.includes(key as (typeof PERMITTED_BODY_FIELDS)[number]));
  if (unexpected.length > 0) {
    // Do not echo the values — only the field names, which are not secret.
    throw new EgressRefusedError(`request body carries unexpected field(s): ${unexpected.join(", ")}`);
  }
  for (const field of PERMITTED_BODY_FIELDS) {
    if (typeof record[field] !== "string") {
      throw new EgressRefusedError(`request body field "${field}" is missing or not a string`);
    }
  }

  if (!isValidDid(record["did"] as string)) throw new EgressRefusedError('field "did" is not a valid did:key');
  if (!SIGNATURE.pattern.test(record["sig"] as string)) {
    throw new EgressRefusedError('field "sig" is not an 86-character unpadded base64url signature');
  }
  if (!isValidNonce(record["nonce"] as string)) throw new EgressRefusedError('field "nonce" is not a decimal nonce');
  if ((record["text"] as string).length === 0) throw new EgressRefusedError('field "text" is empty');
}
