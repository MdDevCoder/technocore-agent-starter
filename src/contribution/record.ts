/**
 * The contribution room record — the first of the two contribution paths.
 *
 * A signed sentence posted to the `technocore` room, using the CLI's fixed template. The user's link and
 * topic are interpolated *inside* the signed text, which is worth being precise about: they are not
 * metadata attached to a record, they are part of the payload the signature covers. The interface
 * therefore shows the assembled payload with authorship marked, rather than implying the signature
 * covers only some protocol-owned subset.
 *
 * Split into plan → sign → publish for the same reason as the lobby check-in: each step can be shown
 * truthfully, and nothing is signed before the user has seen the bytes.
 */

import type { SigningHandle } from "../identity/keystore.ts";
import { draftRoomMessage, signRoomMessage, type RoomMessageDraft, type SignedRoomMessage } from "../technocore/envelope.ts";
import { MAX_MESSAGE_CODE_POINTS, ROOMS } from "../technocore/profile.ts";
import { postSignedMessage, type PostedRecord } from "../technocore/room.ts";
import { contributionRecordText } from "../technocore/templates.ts";
import { pythonStrip } from "../technocore/text.ts";
import type { TechnocoreTransport } from "../technocore/transport.ts";
import { checkContributionUrl, type AcceptedUrl } from "./urlPolicy.ts";

export type TopicRejection = "empty" | "too-long";

export interface TopicVerdict {
  readonly ok: boolean;
  readonly reason?: TopicRejection;
  readonly message?: string;
  /** Code points the topic may still use before the message exceeds the server limit. */
  readonly remaining: number;
}

/**
 * How long the topic may be.
 *
 * Derived, not invented: the server accepts 4,096 code points of message text, so the topic's budget is
 * whatever the template and the link leave over. Measured by composing the real template with an empty
 * topic instead of counting the literal by hand, so the number cannot drift out of sync with the string.
 */
export function topicBudget(url: string): number {
  const withoutTopic = contributionRecordText(url, "").text;
  return MAX_MESSAGE_CODE_POINTS - [...withoutTopic].length;
}

export function checkTopic(topic: string, url: string): TopicVerdict {
  const budget = topicBudget(url);
  const trimmed = pythonStrip(topic);
  const length = [...trimmed].length;
  const remaining = budget - length;

  if (length === 0) {
    return { ok: false, reason: "empty", message: "Say in a few words what your contribution helps with.", remaining: budget };
  }
  if (remaining < 0) {
    return {
      ok: false,
      reason: "too-long",
      message: `That is ${Math.abs(remaining).toLocaleString("en-US")} characters over what Technocore accepts.`,
      remaining,
    };
  }
  return { ok: true, remaining };
}

export interface ContributionPlan {
  readonly room: string;
  readonly draft: RoomMessageDraft;
  /** The accepted link. `raw` is inside the signed text; `href` is for anchors only. */
  readonly url: AcceptedUrl;
  readonly topic: string;
}

export class ContributionDraftError extends Error {
  override readonly name = "ContributionDraftError";
  readonly field: "link" | "topic";
  constructor(field: "link" | "topic", message: string) {
    super(message);
    this.field = field;
  }
}

/** Build the record. Pure: nothing signed, nothing sent. */
export function planContribution(
  rawUrl: string,
  rawTopic: string,
  room: string = ROOMS.contribution,
): ContributionPlan {
  const url = checkContributionUrl(rawUrl);
  if (!url.ok) throw new ContributionDraftError("link", url.message);

  const topic = checkTopic(rawTopic, url.raw);
  if (!topic.ok) throw new ContributionDraftError("topic", topic.message ?? "That topic cannot be used.");

  const stripped = pythonStrip(rawTopic);
  return {
    room,
    draft: draftRoomMessage(room, contributionRecordText(url.raw, stripped)),
    url,
    topic: stripped,
  };
}

export async function signContribution(
  handle: SigningHandle,
  plan: ContributionPlan,
): Promise<SignedRoomMessage> {
  return signRoomMessage(handle, plan.draft);
}

export async function publishContribution(
  transport: TechnocoreTransport,
  plan: ContributionPlan,
  message: SignedRoomMessage,
  options: { readonly signal?: AbortSignal } = {},
): Promise<PostedRecord> {
  return postSignedMessage(transport, plan.room, message, options);
}
