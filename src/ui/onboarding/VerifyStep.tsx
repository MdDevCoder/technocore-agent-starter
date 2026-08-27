"use client";

/**
 * Step 5 — Verify.
 *
 * This screen exists to keep two claims apart, because merging them is the most misleading thing the app
 * could do.
 *
 * The **local check** is cryptography: the signature, the DID's public key and the exact `room|nonce|text`
 * bytes, checked in this tab. It is the only thing in this product allowed to use the word "verified", the
 * only thing rendered in the verified colour, and it either passed or it did not.
 *
 * The **read-back** is a network observation: the record is fetched from the room and compared field by
 * field. It can be confirmed, absent, indeterminate or unavailable, and none of those four says anything
 * about the signature. So it lives in its own panel, in achromatic chrome, under its own heading — a
 * failed read never turns a verified signature into a failure, and a successful read is never presented as
 * proof.
 *
 * The read-back is separately retryable. A rate limit or a dropped connection is a reason to ask again,
 * not a reason to re-run a cryptographic check whose answer cannot change.
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import {
  readBackRecord,
  runVerification,
  VERIFY_READ_LIMIT,
  type ReadBack,
  type VerifyPhase,
} from "../../flow/verify.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { ROOM_READ_LIMITS, roomReadPath } from "../../technocore/profile.ts";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { ByteLattice } from "../ByteLattice.tsx";
import { Disclosure } from "../Disclosure.tsx";
import { EgressLedger, type EgressEntry } from "../EgressLedger.tsx";
import { Callout, ErrorNotice, PhaseTrail, type PhaseState } from "../feedback.tsx";
import { formatDuration, formatGrouped, formatUtc } from "../format.ts";
import { DataList, ReadoutPanel } from "../readouts.tsx";
import { StepActions } from "./StepShell.tsx";

const TRAIL: readonly VerifyPhase[] = ["local", "reading"];

const PHASE_LABEL: Record<VerifyPhase, string> = {
  local: "Checking the signature in this tab",
  reading: "Reading the record back from the room",
  settled: "Settled",
};

export function VerifyStep() {
  const { identity, transport, transportFailure, artifacts, setVerification, log } = useAgentSession();

  const [phase, setPhase] = useState<VerifyPhase | null>(null);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const [rereading, setRereading] = useState(false);

  const contribution = artifacts.contribution;
  const outcome = artifacts.verification;
  // Deliberately not conditioned on `outcome === null`: a failed verification leaves an outcome in place,
  // and the "check again" button on that branch still has to be able to report that it is working.
  const running = phase !== null && phase !== "settled";

  const room = contribution?.record.room ?? null;
  const sequence = contribution?.record.sequence ?? null;

  const ledger = useMemo<readonly EgressEntry[]>(() => {
    if (room === null || sequence === null) return [];
    // The same call `readBackRecord` makes, built from the same inputs, so the path shown is the path used.
    const path =
      sequence >= 1
        ? roomReadPath(room, { limit: VERIFY_READ_LIMIT, since: sequence - 1 })
        : roomReadPath(room, { limit: ROOM_READ_LIMITS.maxLimit });
    return [
      {
        method: "GET",
        path,
        purpose: "Read the room back and look for your record. Nothing is sent — this is a read.",
      },
    ];
  }, [room, sequence]);

  const run = useCallback(async () => {
    if (transport === null || contribution === null) return;
    setFailure(null);
    setPhase(null);
    try {
      const result = await runVerification({
        transport,
        room: contribution.record.room,
        message: contribution.message,
        sequence: contribution.record.sequence,
        onPhase: setPhase,
      });

      setVerification(result);
      log(
        result.local.verified
          ? {
              kind: "verification-passed",
              summary: "Signature verified in this browser",
              detail: {
                room: result.room,
                sequence: result.sequence,
                signature: contribution.record.signature,
                note: readBackNote(result.readBack),
              },
            }
          : {
              kind: "verification-failed",
              summary: result.local.reason ?? "Signature did not verify",
              detail: {
                room: result.room,
                sequence: result.sequence,
                signature: contribution.record.signature,
                ...(result.local.failure === undefined ? {} : { note: result.local.failure }),
              },
            },
      );
    } catch (error) {
      // `runVerification` reports both a failed signature and a failed read as results rather than
      // exceptions, so reaching here means something unexpected — reported as itself, not as a verdict.
      setPhase(null);
      setFailure(toFlowFailure(error));
    }
  }, [transport, contribution, setVerification, log]);

  const retryReadBack = useCallback(async () => {
    if (transport === null || contribution === null || outcome === null) return;
    setRereading(true);
    try {
      const readBack = await readBackRecord({
        transport,
        room: outcome.room,
        sequence: outcome.sequence,
        message: contribution.message,
      });
      // Only the read-back is replaced. The local result is untouched, because nothing about a network
      // read can change what the signature check already answered.
      setVerification({ ...outcome, readBack });
    } finally {
      setRereading(false);
    }
  }, [transport, contribution, outcome, setVerification]);

  if (identity === null || contribution === null) {
    return (
      <Callout tone="fault" title="There is no record to verify">
        Post a contribution record first — verification checks that record&apos;s signature.
      </Callout>
    );
  }

  /* ---------- After verifying ---------- */

  if (outcome !== null) {
    const local = outcome.local;

    return (
      <>
        {local.verified ? (
          <Callout tone="verified" title="Signature verified in this browser">
            The signature over{" "}
            <code className="mono text-ink text-[0.8125rem]">room|nonce|text</code> checks out against the
            public key inside your DID. No server was asked to vouch for it.
          </Callout>
        ) : (
          <Callout tone="fault" title="This signature did not verify" role="alert">
            <p>{local.reason ?? "The signature does not match this record."}</p>
            <p className="mt-3">
              Nothing here is being marked as verified. The record may still exist in the room, but this
              browser cannot confirm that your key produced it, so the summary step stays closed.
            </p>
          </Callout>
        )}

        <ReadoutPanel
          title="Local verification"
          aside={<span className="text-faint mono text-[0.6875rem]">{formatUtc(outcome.at)}</span>}
        >
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] sm:items-start">
            <DataList
              rows={[
                { label: "Room", value: outcome.room, mono: true },
                { label: "Sequence", value: `#${formatGrouped(outcome.sequence)}`, mono: true },
                {
                  label: "Result",
                  value: local.verified ? "Signature valid" : "Signature not valid",
                  note: local.verified
                    ? "Ed25519 over the exact bytes shown in the inspector below."
                    : (local.failure ?? "Verification did not pass."),
                },
                {
                  label: "Checked by",
                  value: "This browser",
                  note: "WebCrypto, offline. The result does not depend on this page being honest — the same check runs anywhere.",
                },
              ]}
            />
            <ByteLattice
              label="Signature bytes"
              bytes={outcome.signatureBytes}
              state={local.verified ? "verified" : "fault"}
              restingRows={8}
            />
          </div>
        </ReadoutPanel>

        <ReadBackPanel
          readBack={outcome.readBack}
          room={outcome.room}
          sequence={outcome.sequence}
          busy={rereading}
          onRetry={local.verified ? () => void retryReadBack() : undefined}
        />

        {local.verified ? (
          <StepActions
            primary={
              <Link href="/onboarding/complete" className={buttonClasses("primary", "lg")}>
                See your record
              </Link>
            }
            note="The summary collects your DID, the sequence Technocore returned, and the share text — all of it public."
          />
        ) : (
          <StepActions
            primary={
              <Button variant="primary" size="lg" busy={running} disabled={running} onClick={() => void run()}>
                {running ? "Checking" : "Check again"}
              </Button>
            }
            secondary={
              <Link href="/onboarding/contribute" className={buttonClasses("secondary", "lg")}>
                Post a new record
              </Link>
            }
            note="Re-running the check cannot change the answer for this record. A new record is signed fresh."
          />
        )}

        {failure === null ? null : <ErrorNotice failure={failure} onRetry={() => void run()} />}

        <Disclosure summary="Technical details">
          <div className="flex flex-col gap-5">
            <DataList
              rows={[
                { label: "Algorithm", value: "Ed25519 via WebCrypto", mono: true },
                {
                  label: "Signed bytes",
                  value: "room|nonce|text",
                  mono: true,
                  note: "Positional and unescaped, exactly as the protocol defines it. A signature valid in one room is not valid in another.",
                },
                {
                  label: "Public key source",
                  value: "Decoded from your DID",
                  note: "The multicodec prefix and payload length are both checked before the key is used.",
                },
                {
                  label: "Read cursor",
                  value: "since is exclusive",
                  mono: true,
                  note: `Reading back sequence N asks for since = N − 1 with a limit of ${formatGrouped(VERIFY_READ_LIMIT)}.`,
                },
              ]}
            />
            <EgressLedger entries={ledger} transport={transport} />
          </div>
        </Disclosure>
      </>
    );
  }

  /* ---------- Before verifying ---------- */

  return (
    <>
      {transportFailure === null ? null : <ErrorNotice failure={transportFailure} />}

      <section className="panel flex flex-col gap-5 rounded-lg p-5 sm:p-6">
        <DataList
          rows={[
            {
              label: "Check 1 — local",
              value: "Verify the signature in this tab",
              note: "Cryptographic. Runs offline against the public key inside your DID.",
            },
            {
              label: "Check 2 — network",
              value: `Read record #${formatGrouped(contribution.record.sequence)} back from ${contribution.record.room}`,
              note: "An observation, not a proof. It is reported separately and can be unavailable without affecting check 1.",
            },
          ]}
        />

        {running ? (
          <PhaseTrail
            items={TRAIL.map((item) => ({
              id: item,
              label: PHASE_LABEL[item],
              state: phaseStateOf(item, phase),
            }))}
          />
        ) : null}

        <StepActions
          primary={
            <Button
              variant="primary"
              size="lg"
              busy={running}
              disabled={running || transport === null}
              onClick={() => void run()}
            >
              {running ? "Checking" : "Verify the record"}
            </Button>
          }
          note="No signing and no posting happens here. The only request is a read."
        />
      </section>

      {failure === null ? null : <ErrorNotice failure={failure} onRetry={() => void run()} />}

      <Disclosure summary="Technical details">
        <EgressLedger entries={ledger} transport={transport} />
      </Disclosure>
    </>
  );
}

/**
 * The network read-back, in its own panel.
 *
 * Deliberately achromatic even when the record is found: a matching copy on a server is corroboration, and
 * dressing it in the verified colour would let a reader mistake "the server has it" for "the signature is
 * good". The four statuses are given four different words, and none of them is "verified".
 */
function ReadBackPanel({
  readBack,
  room,
  sequence,
  busy,
  onRetry,
}: {
  readonly readBack: ReadBack;
  readonly room: string;
  readonly sequence: number;
  readonly busy: boolean;
  readonly onRetry?: (() => void) | undefined;
}) {
  const retry =
    onRetry === undefined ? null : (
      <Button variant="secondary" size="sm" busy={busy} disabled={busy} onClick={onRetry}>
        Read the room again
      </Button>
    );

  if (readBack.status === "unavailable") {
    return (
      <ReadoutPanel title="Network read-back — unavailable">
        <p className="text-muted text-[0.8125rem] leading-relaxed">
          The room could not be read just now, so the record was not compared. This is not a verification
          failure: the signature check above ran entirely in this browser and does not depend on it.
        </p>
        <div className="mt-4">
          <ErrorNotice failure={readBack.failure} />
        </div>
        {retry === null ? null : <div className="mt-4">{retry}</div>}
      </ReadoutPanel>
    );
  }

  if (readBack.status === "absent") {
    return (
      <ReadoutPanel
        title="Network read-back — not found"
        aside={<span className="text-faint mono text-[0.6875rem]">{formatDuration(readBack.durationMs)}</span>}
      >
        <p className="text-muted text-[0.8125rem] leading-relaxed">
          Record <span className="mono text-ink">#{formatGrouped(sequence)}</span> was not in the window
          returned for <span className="mono text-ink">{room}</span>. Rooms are append-only and windows are
          bounded, so a busy room can move a record out of range between posting and reading.
        </p>
        <div className="mt-4">
          <DataList
            dense
            rows={[
              {
                label: "Room's last sequence",
                value: readBack.lastSequence === null ? "not reported" : `#${formatGrouped(readBack.lastSequence)}`,
                mono: true,
              },
            ]}
          />
        </div>
        {retry === null ? null : <div className="mt-4">{retry}</div>}
      </ReadoutPanel>
    );
  }

  if (readBack.status === "indeterminate") {
    return (
      <ReadoutPanel title="Network read-back — inconclusive">
        <p className="text-muted text-[0.8125rem] leading-relaxed">{readBack.note}</p>
        {retry === null ? null : <div className="mt-4">{retry}</div>}
      </ReadoutPanel>
    );
  }

  const fields = [
    { label: "DID", ok: readBack.matches.did },
    { label: "Nonce", ok: readBack.matches.nonce },
    { label: "Signature", ok: readBack.matches.signature },
    { label: "Message text", ok: readBack.matches.text },
  ];

  return (
    <ReadoutPanel
      title={readBack.identical ? "Network read-back — record found" : "Network read-back — fields differ"}
      aside={<span className="text-faint mono text-[0.6875rem]">{formatDuration(readBack.durationMs)}</span>}
    >
      <p className="text-muted text-[0.8125rem] leading-relaxed">
        {readBack.identical
          ? `Sequence #${formatGrouped(sequence)} in ${room} matches the message this tab signed, field for field. Corroboration, not proof — the proof is the signature check above.`
          : `Sequence #${formatGrouped(sequence)} in ${room} is not identical to what this tab signed. The differing fields are listed below.`}
      </p>
      <div className="mt-4">
        <DataList
          dense
          rows={[
            ...fields.map((field) => ({
              label: field.label,
              value: field.ok ? "identical" : "differs",
              mono: true,
              ...(field.ok ? {} : { note: "The stored copy does not match the value that was signed." }),
            })),
            {
              label: "Room's last sequence",
              value: readBack.lastSequence === null ? "not reported" : `#${formatGrouped(readBack.lastSequence)}`,
              mono: true,
            },
          ]}
        />
      </div>
      {retry === null ? null : <div className="mt-4">{retry}</div>}
    </ReadoutPanel>
  );
}

/** A one-line summary of the read-back for the activity log. Never implies the signature was checked. */
function readBackNote(readBack: ReadBack): string {
  switch (readBack.status) {
    case "confirmed":
      return readBack.identical ? "Read back and identical" : "Read back with differing fields";
    case "absent":
      return "Not found in the window read";
    case "indeterminate":
      return "Read-back inconclusive";
    case "unavailable":
      return "Read-back unavailable";
  }
}

function phaseStateOf(item: VerifyPhase, current: VerifyPhase | null): PhaseState {
  if (current === null) return "pending";
  const position = TRAIL.indexOf(item);
  const currentPosition = current === "settled" ? TRAIL.length : TRAIL.indexOf(current);
  if (position < currentPosition) return "done";
  return position === currentPosition ? "active" : "pending";
}
