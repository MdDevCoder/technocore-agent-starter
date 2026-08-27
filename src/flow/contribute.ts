/**
 * Step 4 orchestration: record a contribution.
 *
 * The CLI collects exactly two inputs — a link and a topic — and interpolates both into a fixed
 * sentence which then *becomes* the signed payload. There is no contribution type, no title, and no
 * description field anywhere in the protocol, so none is offered here. The signed text is not metadata
 * attached to a record; it is the record.
 *
 * The detached proof is the protocol's *second*, independent contribution path: a small JSON document
 * signed over canonical JSON of `{artifact_url, commit, schema}`, verifiable entirely offline. It needs
 * a commit hash, which many contributions do not have, so it is offered separately and its absence is
 * not a gap in the flow.
 */

import type { SigningHandle } from "../identity/keystore.ts";
import {
  createContributionProof,
  proofFileName,
  serializeProofFile,
  type ContributionProof,
} from "../contribution/proof.ts";
import {
  planContribution,
  publishContribution,
  signContribution,
  type ContributionPlan,
} from "../contribution/record.ts";
import { buildShareProof, canShare, type ShareProof } from "../contribution/shareText.ts";
import type { SignedRoomMessage } from "../technocore/envelope.ts";
import type { PostedRecord } from "../technocore/room.ts";
import type { TechnocoreTransport } from "../technocore/transport.ts";

export type ContributePhase = "signing" | "sending" | "posted";

export interface ContributeOutcome {
  readonly plan: ContributionPlan;
  readonly message: SignedRoomMessage;
  readonly record: PostedRecord;
}

export interface ContributeOptions {
  readonly transport: TechnocoreTransport;
  readonly handle: SigningHandle;
  readonly room: string;
  readonly url: string;
  readonly topic: string;
  readonly signal?: AbortSignal;
  readonly onPhase?: (phase: ContributePhase) => void;
}

/**
 * Build the record for display. Pure, and throws `ContributionDraftError` with a `field` for invalid
 * input so the UI can focus the offending control instead of showing a banner.
 */
export function previewContribution(url: string, topic: string, room: string): ContributionPlan {
  return planContribution(url, topic, room);
}

export async function runContribution(options: ContributeOptions): Promise<ContributeOutcome> {
  const { transport, handle, room, url, topic, signal, onPhase } = options;

  onPhase?.("signing");
  // Re-planned here so each attempt draws a fresh nonce; a retried plan would reuse the old one.
  const plan = planContribution(url, topic, room);
  const message = await signContribution(handle, plan);

  onPhase?.("sending");
  const record = await publishContribution(transport, plan, message, {
    ...(signal === undefined ? {} : { signal }),
  });

  onPhase?.("posted");
  return { plan, message, record };
}

export interface DetachedProof {
  readonly proof: ContributionProof;
  readonly fileName: string;
  /** Byte-identical to what the reference CLI writes, so the two files diff cleanly. */
  readonly text: string;
}

/**
 * Sign a detached contribution proof.
 *
 * Produced locally and never transmitted by this app — the file is the artifact, and anyone can verify
 * it without contacting Technocore or trusting this page.
 */
export async function createDetachedProof(
  handle: SigningHandle,
  input: { readonly artifactUrl: string; readonly commit: string },
): Promise<DetachedProof> {
  const proof = await createContributionProof(handle, input);
  return { proof, fileName: proofFileName(proof), text: serializeProofFile(proof) };
}

/**
 * Assemble the share text, but only from a sequence number Technocore actually returned.
 *
 * Returns `null` rather than substituting a placeholder. The CLI prints the literal `N/A` here, which
 * publishes a claim about a record that may not exist.
 */
export function buildShareText(input: {
  readonly did: string;
  readonly url: string;
  readonly topic: string;
  readonly sequence: number | null;
}): ShareProof | null {
  if (!canShare(input.sequence)) return null;
  return buildShareProof({
    did: input.did,
    url: input.url,
    topic: input.topic,
    sequence: input.sequence,
  });
}
