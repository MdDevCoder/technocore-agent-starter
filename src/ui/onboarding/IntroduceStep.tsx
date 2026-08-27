"use client";

/**
 * Step 3 — Introduce.
 *
 * The first step that touches the network, so it is the first step that can genuinely fail. Three things
 * follow from that.
 *
 * **Signing and sending are shown as separate phases**, because they are separate operations with
 * different failure modes: a signing failure means the key handle is unusable, a sending failure means the
 * signature exists but was never delivered. Collapsing them into one spinner would hide the distinction
 * that tells the user whether a retry is safe.
 *
 * **The directory entry is not the check-in.** It is an optional side-effecting write into a key–value
 * store with a known capacity ceiling, and `publishDid` returns `unconfirmed` rather than throwing. An
 * unconfirmed directory entry is reported as exactly that, next to a check-in that succeeded — never as
 * "setup failed", which would be false.
 *
 * **The previewed payload is not the signed payload.** The nonce is drawn when the message is planned, and
 * `runIntroduction` re-plans internally so a retry never reuses one. The inspector says so rather than
 * showing a nonce that will not be the one signed.
 */

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import {
  previewCheckIn,
  retryDirectoryEntry,
  runIntroduction,
  type IntroducePhase,
} from "../../flow/introduce.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { serializeRoomMessage } from "../../technocore/envelope.ts";
import { registryReadPath, registrySetPath, roomPostPath } from "../../technocore/profile.ts";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { Disclosure } from "../Disclosure.tsx";
import { EgressLedger, type EgressEntry } from "../EgressLedger.tsx";
import { Callout, ErrorNotice, PhaseTrail, type PhaseState, type PhaseTrailItem } from "../feedback.tsx";
import { formatDuration, formatGrouped, formatUtc } from "../format.ts";
import { PayloadInspector } from "../PayloadInspector.tsx";
import { DataList, ReadoutPanel, SignatureReadout } from "../readouts.tsx";
import { StepActions } from "./StepShell.tsx";

/** The order the flow reports phases in. `posted` is the terminal signal, not a row of its own. */
const TRAIL: readonly IntroducePhase[] = ["directory", "signing", "sending"];

const PHASE_LABEL: Record<IntroducePhase, string> = {
  directory: "Adding your DID to the public directory",
  signing: "Signing the check-in in this tab",
  sending: "Posting the signed message",
  posted: "Posted",
};

export function IntroduceStep() {
  const {
    session,
    identity,
    config,
    transport,
    transportFailure,
    artifacts,
    setIntroduction,
    setRegistry,
    log,
  } = useAgentSession();

  const [phase, setPhase] = useState<IntroducePhase | null>(null);
  const [failedAt, setFailedAt] = useState<IntroducePhase | null>(null);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const [retryingDirectory, setRetryingDirectory] = useState(false);

  const room = config.lobbyRoom;
  const outcome = artifacts.introduction;
  const registry = artifacts.registry;
  const running = phase !== null && failedAt === null && outcome === null;
  /** Already in the capacity-limited directory, so the write is not repeated and its row is not shown. */
  const skipDirectory = registry?.status === "published";

  /**
   * A preview, drawn once per identity. Safe to compute during render because this component only reaches
   * the branch that uses it when an identity exists, and an in-memory identity cannot exist during a
   * server render — so there is no first-paint nonce for hydration to disagree with.
   */
  const preview = useMemo(
    () => (identity === null ? null : previewCheckIn(identity, room)),
    [identity, room],
  );

  const ledger = useMemo<readonly EgressEntry[]>(() => {
    if (identity === null) return [];
    return [
      {
        method: "GET",
        path: registrySetPath(identity.fingerprint, identity.did),
        purpose: "Record your DID in the public directory, keyed by its fingerprint",
        optional: true,
      },
      {
        method: "GET",
        path: registryReadPath(identity.fingerprint),
        purpose: "Read the entry back, which is how publication is confirmed",
        optional: true,
      },
      {
        method: "POST",
        path: roomPostPath(room),
        purpose: "Post the signed check-in — did, sig, nonce and text, and nothing else",
      },
    ];
  }, [identity, room]);

  const run = useCallback(async () => {
    if (session === null || identity === null || transport === null) return;
    setFailure(null);
    setFailedAt(null);
    setPhase(null);

    // Already in the directory: repeating the write would spend a note on the capacity-limited store for
    // an entry that is demonstrably there.
    let reached: IntroducePhase | null = null;
    try {
      const result = await runIntroduction({
        transport,
        identity,
        handle: session.handle,
        room,
        skipDirectory,
        onPhase: (next) => {
          reached = next;
          setPhase(next);
        },
      });

      setIntroduction(result);
      log({
        kind: "checkin-posted",
        summary: `Check-in posted to ${result.record.room}`,
        detail: {
          room: result.record.room,
          sequence: result.record.sequence,
          nonce: result.record.nonce,
          signature: result.record.signature,
          durationMs: result.record.durationMs,
        },
      });

      if (result.registry !== null) {
        log(
          result.registry.status === "published"
            ? {
                kind: "registry-published",
                summary: "DID published to the public directory",
                detail: { fingerprint: result.registry.fingerprint, durationMs: result.registry.durationMs },
              }
            : {
                kind: "registry-unconfirmed",
                summary: "Directory entry could not be confirmed",
                detail: {
                  fingerprint: result.registry.fingerprint,
                  durationMs: result.registry.durationMs,
                  note: "The check-in itself was posted. The directory is optional.",
                },
              },
        );
      }
    } catch (error) {
      setFailedAt(reached);
      setFailure(toFlowFailure(error));
    }
  }, [session, identity, transport, room, skipDirectory, setIntroduction, log]);

  const retryDirectory = useCallback(async () => {
    if (identity === null || transport === null) return;
    setRetryingDirectory(true);
    try {
      const result = await retryDirectoryEntry(transport, identity);
      setRegistry(result);
      log(
        result.status === "published"
          ? {
              kind: "registry-published",
              summary: "DID published to the public directory",
              detail: { fingerprint: result.fingerprint, durationMs: result.durationMs },
            }
          : {
              kind: "registry-unconfirmed",
              summary: "Directory entry still could not be confirmed",
              detail: { fingerprint: result.fingerprint, durationMs: result.durationMs },
            },
      );
    } catch (error) {
      // `retryDirectoryEntry` resolves to `unconfirmed` rather than throwing, so reaching here means the
      // transport itself refused. That is worth reporting in the same place as any other failure.
      setFailure(toFlowFailure(error));
    } finally {
      setRetryingDirectory(false);
    }
  }, [identity, transport, setRegistry, log]);

  if (identity === null || session === null) {
    return (
      <Callout tone="fault" title="No identity in this tab">
        Create or import an identity before introducing it.
      </Callout>
    );
  }

  const trailItems: readonly PhaseTrailItem[] = TRAIL.filter(
    (item) => item !== "directory" || !skipDirectory,
  ).map((item) => ({
    id: item,
    label: PHASE_LABEL[item],
    state: phaseStateOf(item, phase, failedAt),
  }));

  /* ---------- Posted ---------- */

  if (outcome !== null) {
    return (
      <>
        <Callout tone="verified" title={`Check-in posted to ${outcome.record.room}`}>
          Technocore accepted the signed message and returned sequence{" "}
          <span className="mono text-ink">#{formatGrouped(outcome.record.sequence)}</span>. That number is
          the room&apos;s own receipt — it came from the server, not from this page.
        </Callout>

        <ReadoutPanel
          title="Posted record"
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
              { label: "Nonce", value: outcome.record.nonce, mono: true, note: "Nanoseconds since the epoch, drawn at signing time." },
              { label: "Observed", value: formatUtc(outcome.record.observedAt), mono: true },
            ]}
          />
          <div className="mt-5">
            <SignatureReadout signature={outcome.record.signature} />
          </div>
        </ReadoutPanel>

        {registry === null ? null : registry.status === "published" ? (
          <Callout tone="neutral" title="Directory entry confirmed">
            Your DID was written to the public directory and read back successfully, under fingerprint{" "}
            <span className="mono text-ink">{registry.fingerprint}</span>.
          </Callout>
        ) : (
          <Callout
            tone="attention"
            title="Directory entry not confirmed — your check-in still posted"
            actions={
              <Button
                variant="secondary"
                size="sm"
                busy={retryingDirectory}
                disabled={retryingDirectory}
                onClick={() => void retryDirectory()}
              >
                Retry directory entry
              </Button>
            }
          >
            <p>
              The directory is a separate, optional key–value store with a fixed note capacity, and it is
              known to refuse new entries once full. Nothing about your identity, your signature or the
              record you just posted depends on it.
            </p>
            {registry.error === undefined ? null : (
              <p className="mono text-faint mt-3 text-[0.6875rem] tracking-wide">{registry.error.code}</p>
            )}
          </Callout>
        )}

        <StepActions
          primary={
            <Link href="/onboarding/contribute" className={buttonClasses("primary", "lg")}>
              Record a contribution
            </Link>
          }
          note="Step 4 signs a contribution record — a link and a topic — and posts it to the technocore room."
        />

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

  return (
    <>
      {transportFailure === null ? null : (
        <ErrorNotice failure={transportFailure} className="mb-1" />
      )}

      <section className="panel flex flex-col gap-5 rounded-lg p-5 sm:p-6">
        <div>
          <h2 className="text-ink text-[0.9375rem] font-medium">
            Sign a check-in and post it to {room}
          </h2>
          <p className="text-muted mt-2 max-w-[52ch] text-[0.8125rem] leading-relaxed">
            One short message announcing that your agent is online, signed by your key. You can read the
            exact bytes below before anything is sent.
          </p>
        </div>

        {running || failedAt !== null ? <PhaseTrail items={trailItems} /> : null}

        <StepActions
          primary={
            <Button
              variant="primary"
              size="lg"
              busy={running}
              disabled={running || transport === null}
              onClick={() => void run()}
            >
              {running ? "Working" : failedAt === null ? "Sign and post check-in" : "Try again"}
            </Button>
          }
          note="Four fields leave this tab: your DID, the signature, the nonce and the message text. The key itself stays here."
        />
      </section>

      {failure === null ? null : (
        <ErrorNotice failure={failure} onRetry={() => void run()} retryLabel="Try again">
          {failedAt === "sending" ? (
            <span className="text-faint self-center text-[0.75rem]">
              A fresh nonce is drawn on each attempt, so retrying cannot replay the previous message.
            </span>
          ) : null}
        </ErrorNotice>
      )}

      <Disclosure summary="Technical details">
        <div className="flex flex-col gap-5">
          {preview === null ? null : (
            <>
              <PayloadInspector draft={preview.draft} />
              <p className="text-faint text-[0.75rem] leading-relaxed">
                The nonce shown above is a preview. A new one is drawn at the moment of signing, so each
                attempt produces a distinct payload and no message can be replayed.
              </p>
            </>
          )}
          <EgressLedger entries={ledger} transport={transport} />
        </div>
      </Disclosure>
    </>
  );
}

/**
 * Map a reported phase onto a row state.
 *
 * `failedAt` is the last phase the flow announced before throwing, which is the phase that failed — the
 * flow announces a phase when it starts the work, not when it finishes.
 */
function phaseStateOf(
  item: IntroducePhase,
  current: IntroducePhase | null,
  failedAt: IntroducePhase | null,
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
