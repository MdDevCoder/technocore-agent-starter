/**
 * The detached contribution proof — a portable, offline-verifiable signature over a published artifact.
 *
 * This is the *second* of the two contribution paths in the protocol, and the two are independent (see
 * `docs/PROTOCOL.md` §6). The room record is a signed sentence posted to Technocore; this is a small JSON
 * document that anybody can verify with no network access at all, because everything needed — the DID,
 * the signed fields, and the signature — travels inside the file.
 *
 * The signed bytes are canonical JSON over exactly three keys:
 *
 * ```
 * payload = utf8(json.dumps({"artifact_url":…,"commit":…,"schema":"technocore-contribution-v1"},
 *                           sort_keys=True, ensure_ascii=False, separators=(",",":")))
 * ```
 *
 * Two properties of that construction are worth stating because they are easy to break:
 *
 * - **The signed record and the proof wrapper are different objects.** The wrapper adds `did` and
 *   `signature`; the signed record does not contain them. Signing the wrapper instead would be
 *   self-referential and would not verify.
 * - **`commit` is lower-cased before signing.** So a proof carrying an upper-case commit still verifies:
 *   the verifier rebuilds the payload through the same lower-casing path. Reproduced deliberately.
 */

import { canonicalBytes, prettyJsonAsciiSorted, type JsonValue } from "../crypto/canonical.ts";
import type { SigningHandle } from "../identity/keystore.ts";
import { isValidDid } from "../identity/did.ts";
import {
  CONTRIBUTION_PROOF_SCHEMA,
  CONTRIBUTION_RECORD_SCHEMA,
  COMMIT_PATTERN,
  SIGNATURE,
} from "../technocore/profile.ts";
import { verifyDetachedSignature, type VerificationFailure } from "../technocore/verify.ts";
import { checkContributionUrl } from "./urlPolicy.ts";

/** The three fields that are actually signed. Key order here is already the canonical order. */
export interface ContributionRecord {
  readonly artifact_url: string;
  readonly commit: string;
  readonly schema: typeof CONTRIBUTION_RECORD_SCHEMA;
}

/** The proof document. `schema` distinguishes it from the record it wraps. */
export interface ContributionProof {
  readonly schema: typeof CONTRIBUTION_PROOF_SCHEMA;
  readonly did: string;
  readonly artifact_url: string;
  readonly commit: string;
  readonly signature: string;
}

export type ContributionField = "artifact_url" | "commit";

export class ContributionInputError extends Error {
  override readonly name = "ContributionInputError";
  readonly field: ContributionField;
  constructor(field: ContributionField, message: string) {
    super(message);
    this.field = field;
  }
}

export class ProofFormatError extends Error {
  override readonly name = "ProofFormatError";
}

/**
 * Validate and normalize a commit hash: 40 hex (SHA-1) or 64 hex (SHA-256), returned lower-case.
 *
 * `toLowerCase()` rather than `toLocaleLowerCase()` — the latter is locale-sensitive and would be a
 * genuine bug for a user with a Turkish locale, even though hex digits happen to be unaffected.
 */
export function normalizeCommit(input: string): string | null {
  const trimmed = input.trim();
  return COMMIT_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

/**
 * Build the record that gets signed.
 *
 * Validation order matches the CLI: URL prefix first, then commit. The URL is additionally held to this
 * app's stricter link policy (no credentials, no private hosts) — a superset of the CLI's check, so
 * every record this produces is one the CLI would also accept.
 */
export function contributionRecord(artifactUrl: string, commit: string): ContributionRecord {
  const url = checkContributionUrl(artifactUrl);
  if (!url.ok) throw new ContributionInputError("artifact_url", url.message);

  const normalized = normalizeCommit(commit);
  if (normalized === null) {
    throw new ContributionInputError(
      "commit",
      "A commit hash is 40 characters (SHA-1) or 64 characters (SHA-256) of hex.",
    );
  }

  return { artifact_url: url.raw, commit: normalized, schema: CONTRIBUTION_RECORD_SCHEMA };
}

/** The exact bytes signed. The single source of this construction. */
export function contributionPayload(artifactUrl: string, commit: string): Uint8Array {
  return canonicalBytes(contributionRecord(artifactUrl, commit) as unknown as JsonValue);
}

/** Sign a contribution record. The signature is produced in the browser from a non-extractable key. */
export async function createContributionProof(
  handle: SigningHandle,
  input: { readonly artifactUrl: string; readonly commit: string },
): Promise<ContributionProof> {
  const record = contributionRecord(input.artifactUrl, input.commit);
  return {
    schema: CONTRIBUTION_PROOF_SCHEMA,
    did: handle.did,
    artifact_url: record.artifact_url,
    commit: record.commit,
    signature: await handle.signToBase64Url(canonicalBytes(record as unknown as JsonValue)),
  };
}

/**
 * Serialize a proof to its on-disk form.
 *
 * `indent=2, sort_keys=True` plus a trailing newline, byte-identical to what the CLI writes — so a proof
 * downloaded here and one produced by the CLI are the same file, and diff cleanly against each other.
 */
export function serializeProofFile(proof: ContributionProof): string {
  return `${prettyJsonAsciiSorted(proof as unknown as JsonValue)}\n`;
}

export function proofFileName(proof: ContributionProof): string {
  return `technocore-contribution-${proof.commit.slice(0, 12)}.proof.json`;
}

/**
 * Parse a proof file. Every field of the input is untrusted.
 *
 * The CLI's `verify_proof` checks `isinstance(str)` on the four required fields; this additionally
 * checks the DID and signature *shapes*, so a structurally hopeless proof is reported as malformed
 * rather than as a signature mismatch. Those are different problems and deserve different messages.
 */
export function parseContributionProof(text: string): ContributionProof {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failParse("That file is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return failParse("A proof file contains a single JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  if (record["schema"] !== CONTRIBUTION_PROOF_SCHEMA) {
    return failParse(`Unsupported proof schema. Expected "${CONTRIBUTION_PROOF_SCHEMA}".`);
  }
  for (const field of ["did", "artifact_url", "commit", "signature"] as const) {
    if (typeof record[field] !== "string") return failParse(`Missing required field: ${field}`);
  }

  const did = record["did"] as string;
  const signature = record["signature"] as string;
  if (!isValidDid(did)) return failParse("The did field is not a valid did:key identifier.");
  if (!SIGNATURE.pattern.test(signature)) {
    return failParse(`The signature field must be ${SIGNATURE.length} unpadded base64url characters.`);
  }

  return {
    schema: CONTRIBUTION_PROOF_SCHEMA,
    did,
    artifact_url: record["artifact_url"] as string,
    commit: record["commit"] as string,
    signature,
  };
}

function failParse(message: string): never {
  throw new ProofFormatError(message);
}

export type ProofVerificationFailure = VerificationFailure | "malformed-record";

export interface ProofVerificationResult {
  readonly verified: boolean;
  readonly failure?: ProofVerificationFailure;
  readonly reason?: string;
  /** The canonical bytes the signature was checked against, so the UI can show them. */
  readonly payload?: Uint8Array;
}

/**
 * Verify a proof offline: rebuild the canonical payload from its own fields, then check the signature
 * against the public key encoded in its DID. No network, no server, no trust in this app.
 */
export async function verifyContributionProof(proof: ContributionProof): Promise<ProofVerificationResult> {
  let payload: Uint8Array;
  try {
    payload = contributionPayload(proof.artifact_url, proof.commit);
  } catch (error) {
    return {
      verified: false,
      failure: "malformed-record",
      reason:
        error instanceof ContributionInputError
          ? error.message
          : "The signed fields in this proof are not valid.",
    };
  }

  const result = await verifyDetachedSignature(proof.did, proof.signature, payload);
  return result.verified
    ? { verified: true, payload }
    : {
        verified: false,
        ...(result.failure === undefined ? {} : { failure: result.failure }),
        ...(result.reason === undefined ? {} : { reason: result.reason }),
        payload,
      };
}
