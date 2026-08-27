"use client";

/**
 * Step 4 — Contribute.
 *
 * Two inputs, because the protocol has two: a link and a topic. There is no contribution type, no title
 * and no description anywhere in `flop_agent.py`, so none is invented here — a field that does not reach
 * the wire would be a field that lies about what was recorded.
 *
 * The important thing this screen has to communicate is that the user's words are *inside* the signature,
 * not metadata beside it. The template interpolates both values into one sentence, and that sentence is
 * the signed payload. The inspector marks authorship span by span rather than implying the signature
 * covers only some protocol-owned subset.
 *
 * Validation runs as the user types and errors appear on blur, so the primary action is only ever enabled
 * on input that will actually plan. Nothing is focused programmatically after a failed submit, because
 * there is no failed submit to recover from.
 *
 * The sequence number is rendered from `record.sequence` and from nowhere else. If Technocore returns no
 * sequence, none is shown, and the share proof on the final step refuses to render rather than claiming a
 * record that may not exist.
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { COMMIT_PATTERN, roomPostPath } from "../../technocore/profile.ts";
import { checkTopic, ContributionDraftError, topicBudget } from "../../contribution/record.ts";
import { checkContributionUrl, SAFE_LINK_ATTRIBUTES } from "../../contribution/urlPolicy.ts";
import {
  createDetachedProof,
  previewContribution,
  runContribution,
  type ContributePhase,
} from "../../flow/contribute.ts";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { serializeRoomMessage } from "../../technocore/envelope.ts";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { CopyButton } from "../copy.tsx";
import { Disclosure } from "../Disclosure.tsx";
import { downloadText } from "../download.ts";
import { EgressLedger, type EgressEntry } from "../EgressLedger.tsx";
import { TextAreaField, TextField } from "../fields.tsx";
import { Callout, ErrorNotice, Meter, PhaseTrail, type PhaseState } from "../feedback.tsx";
import { formatDuration, formatGrouped, formatUtc, pluralize } from "../format.ts";
import { PayloadInspector } from "../PayloadInspector.tsx";
import { DataList, ReadoutPanel, SignatureReadout } from "../readouts.tsx";
import { StepActions } from "./StepShell.tsx";

const TRAIL: readonly ContributePhase[] = ["signing", "sending"];

const PHASE_LABEL: Record<ContributePhase, string> = {
  signing: "Signing the record in this tab",
  sending: "Posting the signed record",
  posted: "Posted",
};

export function ContributeStep() {
  const { session, identity, config, transport, transportFailure, artifacts, setContribution, setProof, log } =
    useAgentSession();

  const [link, setLink] = useState("");
  const [topic, setTopic] = useState("");
  const [touched, setTouched] = useState<{ link: boolean; topic: boolean }>({ link: false, topic: false });
  // `null` rather than an absent key: `exactOptionalPropertyTypes` makes assigning `undefined` to an
  // optional property an error, and clearing one field has to leave the other alone.
  const [fieldError, setFieldError] = useState<{
    readonly link: string | null;
    readonly topic: string | null;
  }>({ link: null, topic: null });
  const [phase, setPhase] = useState<ContributePhase | null>(null);
  const [failedAt, setFailedAt] = useState<ContributePhase | null>(null);
  const [failure, setFailure] = useState<FlowFailure | null>(null);

  const [commit, setCommit] = useState("");
  const [proofBusy, setProofBusy] = useState(false);
  const [proofFailure, setProofFailure] = useState<FlowFailure | null>(null);
  const [proofBlocked, setProofBlocked] = useState(false);

  const room = config.contributionRoom;
  const outcome = artifacts.contribution;
  const proof = artifacts.proof;
  const running = phase !== null && failedAt === null && outcome === null;

  const urlVerdict = useMemo(() => checkContributionUrl(link), [link]);
  const acceptedRaw = urlVerdict.ok ? urlVerdict.raw : "";
  const topicVerdict = useMemo(() => checkTopic(topic, acceptedRaw), [topic, acceptedRaw]);
  const budget = useMemo(() => topicBudget(acceptedRaw), [acceptedRaw]);
  const ready = urlVerdict.ok && topicVerdict.ok;

  /**
   * Live preview of the exact payload. Recomputed on every keystroke, which is affordable because
   * `previewContribution` is pure — no signature, no request. It draws a nonce, which is why the inspector
   * says the nonce is renewed at signing time.
   */
  const preview = useMemo(() => {
    if (!ready) return null;
    try {
      return previewContribution(link, topic, room);
    } catch {
      // The verdicts above already cover every rejection `planContribution` raises. If one slips through,
      // the preview is simply absent rather than the step being unusable.
      return null;
    }
  }, [ready, link, topic, room]);

  const ledger = useMemo<readonly EgressEntry[]>(
    () => [
      {
        method: "POST",
        path: roomPostPath(room),
        purpose: "Post the signed contribution record — did, sig, nonce and text, and nothing else",
      },
    ],
    [room],
  );

  const run = useCallback(async () => {
    if (session === null || transport === null || !ready) return;
    setFailure(null);
    setFieldError({ link: null, topic: null });
    setFailedAt(null);
    setPhase(null);

    let reached: ContributePhase | null = null;
    try {
      const result = await runContribution({
        transport,
        handle: session.handle,
        room,
        url: link,
        topic,
        onPhase: (next) => {
          reached = next;
          setPhase(next);
        },
      });

      setContribution(result);
      log({
        kind: "contribution-posted",
        summary: `Contribution recorded in ${result.record.room}`,
        detail: {
          room: result.record.room,
          sequence: result.record.sequence,
          nonce: result.record.nonce,
          signature: result.record.signature,
          url: result.plan.url.raw,
          durationMs: result.record.durationMs,
        },
      });
    } catch (error) {
      if (error instanceof ContributionDraftError) {
        // Reachable only if the live verdicts and `planContribution` ever disagree. Reported at the
        // offending field rather than as a banner, since that is where the fix is.
        setFieldError(
          error.field === "link"
            ? { link: error.message, topic: null }
            : { link: null, topic: error.message },
        );
        setTouched({ link: true, topic: true });
        setPhase(null);
        return;
      }
      setFailedAt(reached);
      setFailure(toFlowFailure(error));
    }
  }, [session, transport, ready, room, link, topic, setContribution, log]);

  const signProof = useCallback(async () => {
    if (session === null || outcome === null) return;
    setProofFailure(null);
    setProofBlocked(false);
    setProofBusy(true);
    try {
      const detached = await createDetachedProof(session.handle, {
        artifactUrl: outcome.plan.url.raw,
        commit: commit.trim(),
      });
      const saved = downloadText(detached.fileName, detached.text);
      setProof(detached);
      if (saved) {
        log({
          kind: "proof-created",
          summary: "Detached contribution proof signed",
          detail: { url: outcome.plan.url.raw, commit: detached.proof.commit },
        });
      } else {
        setProofBlocked(true);
      }
    } catch (error) {
      setProofFailure(toFlowFailure(error));
    } finally {
      setProofBusy(false);
    }
  }, [session, outcome, commit, setProof, log]);

  if (identity === null || session === null) {
    return (
      <Callout tone="fault" title="No identity in this tab">
        Create or import an identity before recording a contribution.
      </Callout>
    );
  }

  /* ---------- Posted ---------- */

  if (outcome !== null) {
    return (
      <>
        <Callout tone="verified" title={`Contribution recorded in ${outcome.record.room}`}>
          Technocore returned sequence{" "}
          <span className="mono text-ink">#{formatGrouped(outcome.record.sequence)}</span> for your signed
          record. Nothing on this page generated that number.
        </Callout>

        <ReadoutPanel
          title="Contribution record"
          aside={
            <span className="text-faint mono text-[0.6875rem]">
              {formatDuration(outcome.record.durationMs)}
            </span>
          }
        >
          <DataList
            rows={[
              { label: "Room", value: outcome.record.room, mono: true },
              { label: "Sequence", value: `#${formatGrouped(outcome.record.sequence)}`, mono: true },
              {
                label: "Link",
                value: (
                  <a
                    {...SAFE_LINK_ATTRIBUTES}
                    href={outcome.plan.url.href}
                    className="text-ink decoration-faint hover:decoration-ink underline decoration-dotted underline-offset-4 break-all"
                  >
                    {outcome.plan.url.raw}
                  </a>
                ),
                note: `Host: ${outcome.plan.url.host}. This page never fetches the link and never renders it as HTML.`,
              },
              { label: "Topic", value: outcome.plan.topic },
              { label: "Observed", value: formatUtc(outcome.record.observedAt), mono: true },
            ]}
          />
          <div className="mt-5">
            <SignatureReadout signature={outcome.record.signature} />
          </div>
        </ReadoutPanel>

        <StepActions
          primary={
            <Link href="/onboarding/verify" className={buttonClasses("primary", "lg")}>
              Verify the record
            </Link>
          }
          note="Step 5 checks the signature against your public key here in the browser, then reads the record back from the room."
        />

        <Disclosure summary="Detached proof file (optional)">
          <div className="flex flex-col gap-5">
            <p>
              A second, independent contribution path: a small JSON document signed over the canonical form
              of your link, a commit hash and a schema name. It verifies entirely offline, without Technocore
              and without this page. It needs a commit hash, so it only applies to work that has one.
            </p>

            {proof === null ? (
              <>
                <TextField
                  label="Commit hash"
                  mono
                  value={commit}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  onChange={(event) => setCommit(event.target.value)}
                  hint="40 or 64 hexadecimal characters — the full SHA-1 or SHA-256 commit, not a short hash."
                  error={
                    commit.length > 0 && !COMMIT_PATTERN.test(commit.trim())
                      ? "That is not a full 40- or 64-character commit hash."
                      : undefined
                  }
                />
                <StepActions
                  primary={
                    <Button
                      variant="secondary"
                      size="md"
                      busy={proofBusy}
                      disabled={proofBusy || !COMMIT_PATTERN.test(commit.trim())}
                      onClick={() => void signProof()}
                    >
                      {proofBusy ? "Signing" : "Sign and save proof file"}
                    </Button>
                  }
                  note="Signed and saved in this tab. This file is never transmitted by this app."
                />
              </>
            ) : (
              <DataList
                rows={[
                  { label: "File", value: proof.fileName, mono: true },
                  { label: "Schema", value: proof.proof.schema, mono: true },
                  { label: "Commit", value: proof.proof.commit, mono: true },
                  {
                    label: "Signature",
                    value: proof.proof.signature,
                    mono: true,
                    note: "Over canonical JSON of the artifact URL, commit and schema — not over the room message.",
                  },
                ]}
              />
            )}

            {proofBlocked ? (
              <Callout tone="attention" title="The download did not start" role="alert">
                Your browser blocked the file. Allow downloads for this page and sign it again — the proof is
                deterministic, so the second file is identical to the first.
              </Callout>
            ) : null}

            {proofFailure === null ? null : <ErrorNotice failure={proofFailure} />}
          </div>
        </Disclosure>

        <Disclosure summary="Technical details">
          <div className="flex flex-col gap-5">
            <PayloadInspector
              draft={outcome.plan.draft}
              body={serializeRoomMessage(outcome.message)}
              signature={outcome.message.sig}
            />
            <EgressLedger entries={ledger} transport={transport} />
          </div>
        </Disclosure>
      </>
    );
  }

  /* ---------- Before posting ---------- */

  const linkError = fieldError.link ?? (touched.link && !urlVerdict.ok ? urlVerdict.message : undefined);
  const topicError =
    fieldError.topic ?? (touched.topic && !topicVerdict.ok ? topicVerdict.message : undefined);
  const used = budget - topicVerdict.remaining;

  return (
    <>
      {transportFailure === null ? null : <ErrorNotice failure={transportFailure} />}

      <section className="panel flex flex-col gap-5 rounded-lg p-5 sm:p-6">
        <TextField
          label="Link to your contribution"
          mono
          type="url"
          inputMode="url"
          placeholder="https://"
          value={link}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(event) => {
            setLink(event.target.value);
            setFieldError((current) => ({ ...current, link: null }));
          }}
          onBlur={() => setTouched((current) => ({ ...current, link: true }))}
          hint="Must be an https link that other people can open. It is never fetched by this page."
          error={linkError}
        />

        <TextAreaField
          label="What it helps people understand"
          rows={3}
          value={topic}
          onChange={(event) => {
            setTopic(event.target.value);
            setFieldError((current) => ({ ...current, topic: null }));
          }}
          onBlur={() => setTouched((current) => ({ ...current, topic: true }))}
          hint="A few words. This goes inside the signed record, so write it as you want it published."
          meter={
            <span className="mono text-faint text-[0.6875rem]">
              {formatGrouped(Math.max(0, topicVerdict.remaining))}{" "}
              {pluralize(Math.max(0, topicVerdict.remaining), "character")} left
            </span>
          }
          error={topicError}
        />

        {/*
          A bar for a 4,000-character budget would sit at one percent and never move, so it appears only
          once the limit is close enough to be a real constraint.
        */}
        {used > budget / 2 ? (
          <Meter
            label="Message length"
            value={used}
            max={budget}
            readout={`${formatGrouped(used)} of ${formatGrouped(budget)}`}
            tone={topicVerdict.remaining < 0 ? "fault" : "neutral"}
          />
        ) : null}

        {running || failedAt !== null ? (
          <PhaseTrail
            items={TRAIL.map((item) => ({
              id: item,
              label: PHASE_LABEL[item],
              state: phaseStateOf(item, phase, failedAt),
            }))}
          />
        ) : null}

        <StepActions
          primary={
            <Button
              variant="primary"
              size="lg"
              busy={running}
              disabled={running || !ready || transport === null}
              onClick={() => void run()}
            >
              {running ? "Working" : failedAt === null ? "Sign and post record" : "Try again"}
            </Button>
          }
          note="Read the assembled sentence under Technical details first — that exact text is what your key signs."
        />
      </section>

      {failure === null ? null : <ErrorNotice failure={failure} onRetry={() => void run()} />}

      <Disclosure summary="Technical details">
        <div className="flex flex-col gap-5">
          {preview === null ? (
            <p className="text-muted text-[0.8125rem] leading-relaxed">
              The exact payload appears here once the link and topic are both valid.
            </p>
          ) : (
            <>
              <PayloadInspector draft={preview.draft} />
              <p className="text-faint text-[0.75rem] leading-relaxed">
                The nonce above is a preview; a fresh one is drawn at the moment of signing. The link is
                signed exactly as you typed it — it is never normalized first, because that would put a
                string you never wrote inside your own signature.
              </p>
              <CopyButton value={preview.draft.text} label="record text">
                Copy the message text
              </CopyButton>
            </>
          )}
          <EgressLedger entries={ledger} transport={transport} />
        </div>
      </Disclosure>
    </>
  );
}

function phaseStateOf(
  item: ContributePhase,
  current: ContributePhase | null,
  failedAt: ContributePhase | null,
): PhaseState {
  const position = TRAIL.indexOf(item);
  if (failedAt !== null) {
    const failedPosition = TRAIL.indexOf(failedAt);
    if (position === failedPosition) return "failed";
    return position < failedPosition ? "done" : "pending";
  }

  if (current === null) return "pending";
  const currentPosition = current === "posted" ? TRAIL.length : TRAIL.indexOf(current);
  if (position < currentPosition) return "done";
  return position === currentPosition ? "active" : "pending";
}
