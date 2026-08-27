/**
 * Step 3 orchestration: introduce the agent.
 *
 * Two independent network operations, run in the CLI's order and reported separately:
 *
 * 1. **Directory entry** — a side-effecting `GET` into the public DID key–value store. Optional. The
 *    directory has a fixed note capacity and is known to reject new entries when full, so this is
 *    modelled as `published | unconfirmed` rather than as success-or-throw. An unconfirmed directory
 *    entry invalidates nothing: the identity is real, the signature is real, and the lobby post still
 *    works.
 * 2. **Signed lobby check-in** — the operation that actually matters. This one can fail, and when it
 *    does the step has not succeeded.
 *
 * The payload is re-planned inside this function rather than accepted from the caller. That is a
 * correctness requirement, not tidiness: the nonce is drawn at plan time, and reusing a plan across a
 * retry would re-send an identical nonce. The UI previews a plan for reading, and is expected to say
 * that the nonce is renewed at signing time.
 */

import type { SigningHandle } from "../identity/keystore.ts";
import type { PublicIdentity } from "../types/identity.ts";
import type { SignedRoomMessage } from "../technocore/envelope.ts";
import {
  planCheckIn,
  publishCheckIn,
  signCheckIn,
  type CheckInPlan,
} from "../technocore/lobby.ts";
import { publishDid, type RegistryPublishResult } from "../technocore/registry.ts";
import type { PostedRecord } from "../technocore/room.ts";
import type { TechnocoreTransport } from "../technocore/transport.ts";

/**
 * `directory` → `signing` → `sending` → `posted`.
 *
 * Every phase corresponds to work that is actually happening when it is reported. There is no phase for
 * "preparing" and none for "finalizing", because neither would describe anything.
 */
export type IntroducePhase = "directory" | "signing" | "sending" | "posted";

export interface IntroduceOutcome {
  readonly plan: CheckInPlan;
  readonly message: SignedRoomMessage;
  readonly record: PostedRecord;
  /** Present unless the directory step was skipped. */
  readonly registry: RegistryPublishResult | null;
}

export interface IntroduceOptions {
  readonly transport: TechnocoreTransport;
  readonly identity: PublicIdentity;
  readonly handle: SigningHandle;
  readonly room: string;
  /** Skip the optional directory write — used when retrying only the lobby post. */
  readonly skipDirectory?: boolean;
  readonly signal?: AbortSignal;
  readonly onPhase?: (phase: IntroducePhase) => void;
}

/** Build the check-in for display. Pure: no signature, no request, no nonce commitment. */
export function previewCheckIn(identity: PublicIdentity, room: string): CheckInPlan {
  return planCheckIn(identity, room);
}

export async function runIntroduction(options: IntroduceOptions): Promise<IntroduceOutcome> {
  const { transport, identity, handle, room, signal, onPhase } = options;
  const announce = (phase: IntroducePhase): void => onPhase?.(phase);

  let registry: RegistryPublishResult | null = null;
  if (options.skipDirectory !== true) {
    announce("directory");
    // Never throws for a directory problem; returns `unconfirmed` and lets the flow continue.
    registry = await publishDid(transport, identity, { ...(signal === undefined ? {} : { signal }) });
  }

  announce("signing");
  const plan = planCheckIn(identity, room);
  const message = await signCheckIn(handle, plan);

  announce("sending");
  const record = await publishCheckIn(transport, plan, message, {
    ...(signal === undefined ? {} : { signal }),
  });

  announce("posted");
  return { plan, message, record, registry };
}

/** Retry only the directory entry. Offered from the dashboard, where the check-in already succeeded. */
export async function retryDirectoryEntry(
  transport: TechnocoreTransport,
  identity: PublicIdentity,
  options: { readonly signal?: AbortSignal } = {},
): Promise<RegistryPublishResult> {
  return publishDid(transport, identity, { ...(options.signal === undefined ? {} : { signal: options.signal }) });
}
