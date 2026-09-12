"use client";

/**
 * The completion screen.
 *
 * Not a sixth step — an outcome. Everything on it already exists: a DID that was generated, a sequence
 * number Technocore returned, a signature this browser verified. Nothing is computed here except the share
 * text, and that is assembled from those same fields.
 *
 * Two rules shape the copy. First, there is no claim of reward: the record is a verifiable contribution
 * record, and eligibility is not this app's to promise. Second, the identity is still only in this tab, so
 * the encrypted backup is restated as the thing that carries it forward rather than being treated as a step
 * the user has finished with.
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { buildShareText } from "../../flow/contribute.ts";
import { SAFE_LINK_ATTRIBUTES } from "../../contribution/urlPolicy.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { CopyButton } from "../copy.tsx";
import { Disclosure } from "../Disclosure.tsx";
import { downloadText } from "../download.ts";
import { Callout } from "../feedback.tsx";
import { formatGrouped, formatUtc } from "../format.ts";
import { DataList, DidReadout, ReadoutPanel } from "../readouts.tsx";
import { StepActions } from "./StepShell.tsx";

export function CompleteStep() {
  const { identity, artifacts, hardened } = useAgentSession();
  const [proofBlocked, setProofBlocked] = useState(false);

  const contribution = artifacts.contribution;
  const verification = artifacts.verification;
  const proof = artifacts.proof;

  /**
   * Assembled only from a sequence number the server actually returned. `buildShareText` yields `null`
   * otherwise rather than substituting a placeholder into a public claim.
   */
  const share = useMemo(() => {
    if (identity === null || contribution === null) return null;
    return buildShareText({
      did: identity.did,
      url: contribution.plan.url.raw,
      topic: contribution.plan.topic,
      sequence: contribution.record.sequence,
    });
  }, [identity, contribution]);

  const saveProof = useCallback(() => {
    if (proof === null) return;
    setProofBlocked(!downloadText(proof.fileName, proof.text));
  }, [proof]);

  if (identity === null || contribution === null || verification === null) {
    return (
      <Callout tone="fault" title="There is nothing to summarize yet">
        This page collects a verified record. Run through the flow first.
      </Callout>
    );
  }

  return (
    <>
      <Callout tone="verified" title="Your contribution record is signed, posted and verified">
        Sequence <span className="mono text-ink">#{formatGrouped(contribution.record.sequence)}</span> in{" "}
        <span className="mono text-ink">{contribution.record.room}</span>, with a signature this browser
        checked against your own public key.
      </Callout>

      <ReadoutPanel
        title="Record"
        aside={<span className="text-faint mono text-[0.6875rem]">{formatUtc(verification.at)}</span>}
      >
        <DidReadout
          did={identity.did}
          hint="Public. This is what anyone verifying your record checks the signature against."
        />
        <div className="mt-5">
          <DataList
            rows={[
              { label: "Room", value: contribution.record.room, mono: true },
              {
                label: "Sequence",
                value: `#${formatGrouped(contribution.record.sequence)}`,
                mono: true,
                note: "Assigned by Technocore when it accepted the post.",
              },
              {
                label: "Link",
                value: (
                  <a
                    {...SAFE_LINK_ATTRIBUTES}
                    href={contribution.plan.url.href}
                    className="text-ink decoration-faint hover:decoration-ink underline decoration-dotted underline-offset-4 break-all"
                  >
                    {contribution.plan.url.raw}
                  </a>
                ),
              },
              { label: "Topic", value: contribution.plan.topic },
              {
                label: "Lobby check-in",
                value:
                  artifacts.introduction === null
                    ? "not posted from this tab"
                    : `#${formatGrouped(artifacts.introduction.record.sequence)} in ${artifacts.introduction.record.room}`,
                mono: true,
              },
            ]}
          />
        </div>
      </ReadoutPanel>

      {share === null ? (
        <Callout tone="attention" title="No share text yet">
          A share proof names a specific room and sequence number, so it cannot be assembled until
          Technocore has returned one.
        </Callout>
      ) : (
        <ReadoutPanel title="Share proof">
          <p className="mono border-hairline bg-void/60 text-ink rounded-md border p-3.5 text-[0.75rem] leading-relaxed whitespace-pre-wrap">
            {share.text}
          </p>
          <div className="mt-4">
            <StepActions
              primary={
                <CopyButton value={share.text} label="share proof" size="md">
                  Copy the share proof
                </CopyButton>
              }
              secondary={
                <a
                  {...SAFE_LINK_ATTRIBUTES}
                  href={share.composeUrl}
                  className={buttonClasses("ghost", "md")}
                >
                  Open a pre-filled post
                </a>
              }
              note="Copying involves no third party. The link opens X with this text filled in — nothing is posted on your behalf, no account is connected, and no script from any social platform runs on this site."
            />
          </div>
        </ReadoutPanel>
      )}

      {proof === null ? null : (
        <ReadoutPanel title="Detached proof file">
          <DataList
            dense
            rows={[
              { label: "File", value: proof.fileName, mono: true },
              { label: "Commit", value: proof.proof.commit, mono: true },
            ]}
          />
          <div className="mt-4">
            <StepActions
              primary={
                <button type="button" onClick={saveProof} className={buttonClasses("secondary", "md")}>
                  Save the proof file again
                </button>
              }
              note="Verifiable offline by anyone, with no network access and no trust in this page."
            />
          </div>
          {proofBlocked ? (
            <Callout tone="attention" title="The download did not start" role="alert" className="mt-4">
              Your browser blocked the file. Allow downloads for this page and try again.
            </Callout>
          ) : null}
        </ReadoutPanel>
      )}

      <Callout tone="attention" title="Your identity is still only in this tab">
        {hardened
          ? "Signing works through a key handle held in memory. Close this tab and the only way back is the encrypted backup you saved."
          : "Close this tab and the only way back is the encrypted backup you saved. Keep the file and the passphrase in two different places."}
      </Callout>

      {/* Developer Handoff Card */}
      <div className="border-hairline bg-panel/70 rounded-xl p-5 border shadow-sm space-y-4">
        <div>
          <p className="eyebrow text-signal">Next Developer Milestones</p>
          <p className="text-ink text-sm font-semibold mt-1">
            Transition your verified identity into active development
          </p>
          <p className="text-muted text-xs mt-0.5">
            Open the centralized Workspace to configure projects and generate safe tool handoffs, or run the 7-stage Readiness verification checklist.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <Link
            href="/workspace"
            className="border-hairline bg-void/80 hover:bg-void hover:border-signal/50 text-ink rounded-lg p-3.5 border transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between">
              <span className="mono text-xs font-bold text-signal group-hover:text-signal-bright">
                Open Workspace →
              </span>
              <span className="mono text-[0.625rem] text-faint border border-hairline px-1.5 py-0.5 rounded">
                /workspace
              </span>
            </div>
            <p className="text-muted text-xs mt-2 line-clamp-2">
              Manage projects, safe tool handoffs, and synchronized agent runtime state.
            </p>
          </Link>

          <Link
            href="/readiness"
            className="border-hairline bg-void/80 hover:bg-void hover:border-signal/50 text-ink rounded-lg p-3.5 border transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between">
              <span className="mono text-xs font-bold text-signal group-hover:text-signal-bright">
                Run Readiness Check →
              </span>
              <span className="mono text-[0.625rem] text-signal font-semibold bg-signal/10 px-1.5 py-0.5 rounded border border-signal/20">
                7-Stage
              </span>
            </div>
            <p className="text-muted text-xs mt-2 line-clamp-2">
              Guided end-to-end evidence checklist verifying your agent for production development.
            </p>
          </Link>
        </div>
      </div>

      <StepActions
        primary={
          <Link href="/agent" className={buttonClasses("primary", "lg")}>
            Open your agent dashboard
          </Link>
        }
        secondary={
          <Link href="/onboarding/contribute" className={buttonClasses("secondary", "lg")}>
            Record another contribution
          </Link>
        }
        note="The dashboard keeps your public activity for this DID, and can export or re-import the encrypted backup."
      />

      <Callout tone="neutral" title="What this record is, and what it is not">
        <p>
          You have created a verifiable Technocore contribution record. Participation does not guarantee a
          FLOP allocation — eligibility and reward rules are determined by the FLOP/Technocore team, and
          nothing on this site can promise an outcome on their behalf.
        </p>
      </Callout>

      <Disclosure summary="Technical details">
        <DataList
          rows={[
            {
              label: "Verified locally",
              value: formatUtc(verification.at),
              mono: true,
              note: "Ed25519 over room|nonce|text, checked in this browser against the public key in your DID.",
            },
            {
              label: "Read-back",
              value: verification.readBack.status,
              mono: true,
              note: "A network observation, reported separately from the signature check.",
            },
            {
              label: "Share text",
              value: "assembled in this tab",
              note: "Built from the record fields only. There is no key material in it and nothing is transmitted by copying it.",
            },
          ]}
        />
      </Disclosure>
    </>
  );
}
