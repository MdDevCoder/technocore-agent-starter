/**
 * The share text a person publishes as human-readable evidence of their contribution.
 *
 * This is the only part of the flow that touches a third-party site, and it does so in the weakest way
 * available: it builds a URL that the person clicks, if they choose to. Nothing is posted on anyone's
 * behalf, no account is connected, and no script from any social platform is loaded anywhere in this app.
 *
 * What leaves the browser if they click: the DID, the topic, the link, and the room and sequence number —
 * all of which are already public, because they were just posted to a public room. The signing key is not
 * in the share text and could not be, since the text is assembled from the record fields only. Copying to
 * the clipboard is offered first and is the recommended path, because it involves no third party at all.
 */

import { ROOMS } from "../technocore/profile.ts";
import { shareProofText, type ShareProofInput } from "../technocore/templates.ts";

export interface ShareProof {
  /** The exact six-line text, matching the CLI's output byte for byte. */
  readonly text: string;
  /** A pre-filled compose URL. Opening it is entirely the user's choice. */
  readonly composeUrl: string;
  readonly room: string;
  readonly sequence: number;
}

export function buildShareProof(input: ShareProofInput): ShareProof {
  const text = shareProofText(input);
  const params = new URLSearchParams({ text });
  return {
    text,
    composeUrl: `https://x.com/intent/post?${params.toString()}`,
    room: ROOMS.contribution,
    sequence: input.sequence,
  };
}

/**
 * Whether a share proof can be produced yet.
 *
 * The proof asserts a specific room and sequence number, so it cannot be assembled before Technocore has
 * acknowledged the post and returned that number. The CLI substitutes the literal `N/A` in that case,
 * publishing a claim about a record that may not exist; this reports "not yet" instead.
 */
export function canShare(sequence: number | null | undefined): sequence is number {
  return typeof sequence === "number" && Number.isInteger(sequence) && sequence >= 0;
}
