/**
 * Fixed message templates, transcribed verbatim from `flop_agent.py` and held under differential test
 * (`verification/templates.test.mjs`, 21/21 byte-identical).
 *
 * These strings are part of the compatibility surface, not copy to be improved. The check-in and
 * contribution texts *become* the signed payload, and the share proof is what a person publishes as
 * evidence. A reworded record still verifies cryptographically, but anything reading the room for the
 * template shape will not recognise it — so the UI says that at the point of editing rather than
 * letting the wording drift silently.
 *
 * Each template is returned with **authorship spans**: which characters came from the fixed template,
 * which from the user, and which from their identity. That is how the payload inspector can show
 * exactly what is about to be signed and mark who wrote each part — the honest reading of "separate
 * user-editable fields from the canonical record", given that the user's words genuinely are inside
 * the signature.
 */

import { pythonStrip } from "./text.ts";
import { ROOMS } from "./profile.ts";

export type SpanSource = "template" | "user" | "identity";

export interface TextSpan {
  readonly source: SpanSource;
  readonly text: string;
  /** Field name for user-supplied spans, e.g. `link` or `topic`. */
  readonly label?: string;
}

export interface ComposedText {
  readonly text: string;
  readonly spans: readonly TextSpan[];
}

const template = (text: string): TextSpan => ({ source: "template", text });
const identity = (text: string): TextSpan => ({ source: "identity", text, label: "DID" });
const authored = (text: string, label: string): TextSpan => ({ source: "user", text, label });

function compose(parts: readonly TextSpan[]): ComposedText {
  return {
    text: parts.map((part) => part.text).join(""),
    spans: parts.filter((part) => part.text.length > 0),
  };
}

/**
 * Lobby check-in — `cmd_run_all` step 3, posted to `lobby`.
 *
 * `Agent online. DID: {did}. Participating in the FLOP network.`
 */
export function lobbyCheckInText(did: string): ComposedText {
  return compose([
    template("Agent online. DID: "),
    identity(did),
    template(". Participating in the FLOP network."),
  ]);
}

/**
 * Contribution record — `cmd_contribute`, posted to `technocore`.
 *
 * `I published a Technocore contribution: {url}. It helps people understand {topic}.`
 *
 * The CLI collects exactly these two inputs and `.strip()`s both before interpolation. There is no
 * type, title, or description field anywhere in the protocol, so none is invented here.
 */
export function contributionRecordText(rawUrl: string, rawTopic: string): ComposedText {
  return compose([
    template("I published a Technocore contribution: "),
    authored(pythonStrip(rawUrl), "link"),
    template(". It helps people understand "),
    authored(pythonStrip(rawTopic), "topic"),
    template("."),
  ]);
}

export class MissingSequenceError extends Error {
  override readonly name = "MissingSequenceError";
  constructor() {
    super(
      "A share proof needs the sequence number Technocore returned for the recorded message. Post the " +
        "contribution record first.",
    );
  }
}

export interface ShareProofInput {
  readonly topic: string;
  readonly url: string;
  readonly did: string;
  /** The sequence number Technocore returned. Required — see the note below. */
  readonly sequence: number;
}

/**
 * The six-line X share proof, exactly as the CLI emits it. The `=====` rules around it in the CLI are
 * console decoration and are not part of the text.
 *
 * One deliberate divergence, and the only one in this file: the CLI substitutes the literal string
 * `N/A` when the response carries no `seq`, which publishes a proof asserting a record that may not
 * exist. This refuses to render at all without a real sequence number.
 */
export function shareProofText(input: ShareProofInput): string {
  if (!Number.isInteger(input.sequence) || input.sequence < 0) throw new MissingSequenceError();
  return [
    "I published a contribution for Technocore by @flop_labs.",
    `It helps people understand ${pythonStrip(input.topic)}.`,
    "",
    `Contribution: ${pythonStrip(input.url)}`,
    `Agent DID: ${input.did}`,
    `Signed Technocore record: room ${ROOMS.contribution}, sequence ${input.sequence}`,
  ].join("\n");
}
