/**
 * The lobby check-in — "introduce your agent".
 *
 * Split into three explicit phases so the interface can be honest at each one:
 *
 * 1. `planCheckIn` builds the payload. Nothing is signed and nothing is sent, so the exact bytes can
 *    be shown and approved first.
 * 2. `signCheckIn` produces the signature, in the browser, from the non-extractable handle.
 * 3. `publishCheckIn` sends the already-signed message.
 *
 * Keeping them separate is what makes it possible to render real cryptographic output — a real payload,
 * then a real signature — instead of a progress animation standing in for work that has not happened.
 */

import type { SigningHandle } from "../identity/keystore.ts";
import type { PublicIdentity } from "../types/identity.ts";
import { draftRoomMessage, signRoomMessage, type RoomMessageDraft, type SignedRoomMessage } from "./envelope.ts";
import { ROOMS } from "./profile.ts";
import { postSignedMessage, type PostedRecord } from "./room.ts";
import { lobbyCheckInText } from "./templates.ts";
import type { TechnocoreTransport } from "./transport.ts";

export interface CheckInPlan {
  readonly room: string;
  readonly draft: RoomMessageDraft;
}

/** Build the check-in payload. Pure: no signing, no network. */
export function planCheckIn(identity: PublicIdentity, room: string = ROOMS.lobby): CheckInPlan {
  return { room, draft: draftRoomMessage(room, lobbyCheckInText(identity.did)) };
}

export async function signCheckIn(handle: SigningHandle, plan: CheckInPlan): Promise<SignedRoomMessage> {
  return signRoomMessage(handle, plan.draft);
}

export async function publishCheckIn(
  transport: TechnocoreTransport,
  plan: CheckInPlan,
  message: SignedRoomMessage,
  options: { readonly signal?: AbortSignal } = {},
): Promise<PostedRecord> {
  return postSignedMessage(transport, plan.room, message, options);
}
