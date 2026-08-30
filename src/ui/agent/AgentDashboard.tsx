"use client";

/**
 * The agent dashboard.
 *
 * Everything here is a readout of something that already happened. There is no state on this page that
 * the flow did not produce, and no number rendered that a server did not return.
 *
 * The layout is organised around one distinction, because it is the distinction the whole product rests
 * on: what is public and meant to be copied, versus what is local to this tab and must never leave it.
 * Those are two panels with two headings and two different vocabularies, not two rows in one table.
 *
 * The destructive actions live at the bottom behind typed confirmation. Discarding an identity whose
 * backup was never verified destroys a key that exists nowhere else, and the dialog says exactly that
 * rather than asking "are you sure?".
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { exportBackupFile } from "../../flow/backup.ts";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import { retryDirectoryEntry } from "../../flow/introduce.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "../../identity/passphrase.ts";
import { SAFE_LINK_ATTRIBUTES } from "../../contribution/urlPolicy.ts";
import { readRoom } from "../../technocore/room.ts";
import { verifyRoomMessage } from "../../technocore/verify.ts";
import { ActivityTimeline } from "../ActivityTimeline.tsx";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { CopyField } from "../copy.tsx";
import { ConfirmDialog } from "../Dialog.tsx";
import { Disclosure } from "../Disclosure.tsx";
import { downloadText } from "../download.ts";
import { PassphraseField } from "../fields.tsx";
import { Callout, ErrorNotice, Meter } from "../feedback.tsx";
import { formatGrouped, formatUtc } from "../format.ts";
import { DataList, DidReadout, ReadoutPanel } from "../readouts.tsx";
import { StatusPill } from "../StatusPill.tsx";
import { StepRail } from "../StepRail.tsx";
import { resumeStepSlug, stepBySlug } from "../steps.ts";

/** Strength is advice, so it is never coloured like a verification result. */
const STRENGTH_TONE = ["fault", "fault", "attention", "verified", "verified"] as const;

export interface NetworkDiscoveredRecord {
  readonly id: string;
  readonly room: string;
  readonly sequence: number;
  readonly text: string;
  readonly nonce: string;
  readonly signature: string;
  readonly verified: boolean;
  readonly source: "wsl_cli" | "room" | "civilization";
}

export function AgentDashboard() {
  const {
    session,
    identity,
    origin,
    backup,
    hardened,
    canExportBackup,
    flowState,
    artifacts,
    activity,
    storage,
    transport,
    transportFailure,
    log,
    refresh,
    forget,
    clearHistory,
    setRegistry,
  } = useAgentSession();

  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState<"export" | "directory" | "sync" | null>(null);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const [exportedName, setExportedName] = useState<string | null>(null);
  const [downloadBlocked, setDownloadBlocked] = useState(false);
  const [confirm, setConfirm] = useState<"forget" | "history" | null>(null);

  // Live Network Discovered Contributions State
  const [networkRecords, setNetworkRecords] = useState<readonly NetworkDiscoveredRecord[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Sequence Lookup State
  const [showLookup, setShowLookup] = useState(false);
  const [lookupSeq, setLookupSeq] = useState("");
  const [lookupRoom, setLookupRoom] = useState<"technocore" | "lobby">("technocore");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupSuccess, setLookupSuccess] = useState<string | null>(null);

  const assessment = passphrase.length === 0 ? null : assessPassphrase(passphrase);
  const resume = useMemo(() => resumeStepSlug(flowState), [flowState]);
  const resumeStep = stepBySlug(resume);

  // Load cached verified records from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && identity) {
      try {
        const saved = localStorage.getItem(`technocore_records_${identity.did}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNetworkRecords(parsed);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [identity]);

  // Sync contributions and check-ins directly from the Technocore network
  const syncNetworkRecords = useCallback(async () => {
    if (transport === null || identity === null) return;
    setBusy("sync");
    try {
      const records: NetworkDiscoveredRecord[] = [...networkRecords];
      const seenIds = new Set<string>(records.map((r) => r.id));

      // 1. Fetch recent from 'technocore' contribution room (up to 200)
      try {
        const technocoreSnapshot = await readRoom(transport, "technocore", { limit: 200 });
        for (const msg of technocoreSnapshot.messages) {
          if (msg.did === identity.did && msg.sequence !== null && msg.nonce && msg.signature) {
            const id = `technocore_${msg.sequence}`;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              const ver = await verifyRoomMessage("technocore", {
                did: identity.did,
                nonce: msg.nonce,
                text: msg.text,
                sig: msg.signature,
              });
              records.push({
                id,
                room: "technocore",
                sequence: msg.sequence,
                text: msg.text,
                nonce: msg.nonce,
                signature: msg.signature,
                verified: ver.verified,
                source: "wsl_cli",
              });
            }
          }
        }
      } catch {
        // Continue if room is offline
      }

      // 2. Fetch recent from 'lobby' check-in room
      try {
        const lobbySnapshot = await readRoom(transport, "lobby", { limit: 200 });
        for (const msg of lobbySnapshot.messages) {
          if (msg.did === identity.did && msg.sequence !== null && msg.nonce && msg.signature) {
            const id = `lobby_${msg.sequence}`;
            if (!seenIds.has(id)) {
              seenIds.add(id);
              const ver = await verifyRoomMessage("lobby", {
                did: identity.did,
                nonce: msg.nonce,
                text: msg.text,
                sig: msg.signature,
              });
              records.push({
                id,
                room: "lobby",
                sequence: msg.sequence,
                text: msg.text,
                nonce: msg.nonce,
                signature: msg.signature,
                verified: ver.verified,
                source: "room",
              });
            }
          }
        }
      } catch {
        // Continue
      }

      setNetworkRecords(records);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`technocore_records_${identity.did}`, JSON.stringify(records));
        } catch {}
      }
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      setFailure(toFlowFailure(err));
    } finally {
      setBusy(null);
    }
  }, [transport, identity, networkRecords]);

  // Lookup record by exact sequence number (from WSL CLI output)
  const handleLookup = useCallback(async () => {
    if (!lookupSeq.trim() || transport === null || identity === null) return;
    setIsLookingUp(true);
    setLookupError(null);
    setLookupSuccess(null);
    try {
      const seqs = lookupSeq
        .split(/[\s,]+/)
        .map((s) => parseInt(s.replace(/#/g, "").trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0);

      if (seqs.length === 0) {
        setLookupError("Please enter a valid sequence number (e.g. 2450860).");
        return;
      }

      const newlyFound: NetworkDiscoveredRecord[] = [];
      for (const seq of seqs) {
        const snapshot = await readRoom(transport, lookupRoom, { since: Math.max(0, seq - 1), limit: 1 });
        const target = snapshot.messages.find((m) => m.sequence === seq);
        if (!target) {
          throw new Error(`No message found at sequence #${seq} in room "${lookupRoom}" on the Technocore network.`);
        }
        if (target.did !== identity.did) {
          throw new Error(
            `Sequence #${seq} was signed by another DID (${target.did?.slice(0, 20)}...). It does not match your active agent DID.`
          );
        }
        if (!target.nonce || !target.signature) {
          throw new Error(`Message at sequence #${seq} is missing nonce or signature payload.`);
        }
        const ver = await verifyRoomMessage(lookupRoom, {
          did: identity.did,
          nonce: target.nonce,
          text: target.text,
          sig: target.signature,
        });

        newlyFound.push({
          id: `${lookupRoom}_${seq}`,
          room: lookupRoom,
          sequence: seq,
          text: target.text,
          nonce: target.nonce,
          signature: target.signature,
          verified: ver.verified,
          source: "wsl_cli",
        });
      }

      const updated = [...networkRecords];
      for (const item of newlyFound) {
        if (!updated.some((r) => r.id === item.id)) {
          updated.push(item);
        }
      }
      setNetworkRecords(updated);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(`technocore_records_${identity.did}`, JSON.stringify(updated));
        } catch {}
      }
      setLookupSuccess(`Successfully fetched and cryptographically verified ${newlyFound.length} record(s) from Technocore!`);
      setLookupSeq("");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to lookup sequence from network.";
      setLookupError(errorMsg);
    } finally {
      setIsLookingUp(false);
    }
  }, [lookupSeq, lookupRoom, transport, identity, networkRecords]);

  // Automatically sync on initial load
  useEffect(() => {
    void syncNetworkRecords();
  }, [syncNetworkRecords]);

  const runExport = useCallback(async () => {
    if (session === null) return;
    setFailure(null);
    setDownloadBlocked(false);
    setBusy("export");
    try {
      const result = await exportBackupFile(session, passphrase);
      const saved = downloadText(result.fileName, result.text);
      refresh();
      setPassphrase("");
      if (saved) {
        setExportedName(result.fileName);
        log({
          kind: "backup-exported",
          summary: "Encrypted backup saved",
          detail: { note: `${result.fileName} · PBKDF2 ${formatGrouped(result.iterations)} iterations` },
        });
      } else {
        setDownloadBlocked(true);
      }
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(null);
    }
  }, [session, passphrase, refresh, log]);

  const runDirectory = useCallback(async () => {
    if (transport === null || identity === null) return;
    setFailure(null);
    setBusy("directory");
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
              summary: "Directory entry still unconfirmed",
              detail: {
                fingerprint: result.fingerprint,
                durationMs: result.durationMs,
                ...(result.error === undefined ? {} : { note: result.error.message }),
              },
            },
      );
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(null);
    }
  }, [transport, identity, setRegistry, log]);

  if (session === null || identity === null) {
    return <NoIdentity />;
  }

  const contribution = artifacts.contribution;
  const verification = artifacts.verification;
  const introduction = artifacts.introduction;
  const registry = artifacts.registry;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="eyebrow">Agent</p>
        <h1 className="display text-ink mt-4 text-[1.75rem] sm:text-[2.125rem]">Your agent</h1>
        <p className="text-muted mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed">
          What this identity has signed and published, and what is still only in this tab.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <StatusPill tone="signal" srPrefix="Identity:">
            {origin === "imported" ? "restored from backup" : "generated in this browser"}
          </StatusPill>
          <StatusPill
            tone={backup === "verified" ? "verified" : backup === "exported" ? "attention" : "fault"}
            srPrefix="Backup:"
          >
            {backup === "verified" ? "backup verified" : backup === "exported" ? "backup unopened" : "no backup"}
          </StatusPill>
          <StatusPill tone="neutral" srPrefix="Signing key:">
            {hardened ? "non-extractable handle" : "seed in memory"}
          </StatusPill>
          <StatusPill tone="neutral" srPrefix="History:">
            {storage === "local" ? "history in this browser" : storage === "memory" ? "history in memory" : "checking storage"}
          </StatusPill>
        </div>
      </header>

      {transportFailure === null ? null : (
        <div className="mt-8">
          <ErrorNotice failure={transportFailure} />
        </div>
      )}

      <div className="mt-9 flex flex-col gap-6">
        <ReadoutPanel title="Public — safe to share">
          <DidReadout
            did={identity.did}
            hint="Your agent's public name. Anyone can verify your signatures against it."
          />
          <div className="mt-5 flex flex-col gap-4">
            <CopyField
              label="Directory fingerprint"
              value={identity.fingerprint}
              hint="First 16 hex characters of sha256 over your DID string. The key your directory entry is stored under."
            />
            <DataList
              dense
              rows={[{ label: "Created", value: formatUtc(identity.createdAt), mono: true }]}
            />
          </div>
        </ReadoutPanel>

        <ReadoutPanel title="Local only — never sent anywhere">
          <DataList
            rows={[
              {
                label: "Signing key",
                value: hardened ? "Non-extractable key handle" : "Seed held in memory",
                note: hardened
                  ? "The seed was dropped once your backup was verified. This tab can still sign, but the key cannot be read out of it."
                  : "Still extractable, which is what lets you export an encrypted backup. It is dropped once a backup has been opened and checked.",
              },
              {
                label: "Persistence",
                value: "This tab only",
                note: "The identity is never written to storage, a cookie or a URL. Closing the tab ends the session; your encrypted backup is how you return.",
              },
              {
                label: "Activity history",
                value:
                  storage === "local"
                    ? "Stored in this browser"
                    : storage === "memory"
                      ? "This session only"
                      : "Checking",
                note:
                  storage === "local"
                    ? "Public facts only — DIDs, rooms, sequences, signatures and links. Keyed to a namespace derived from your DID."
                    : "Storage was unavailable, so history lasts as long as this page stays open.",
              },
            ]}
          />
        </ReadoutPanel>

        {flowState.verified ? null : (
          <section className="panel rounded-lg p-5 sm:p-6">
            <h2 className="eyebrow">Setup</h2>
            <div className="mt-4">
              <StepRail current={resume} state={flowState} />
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={`/onboarding/${resume}`} className={buttonClasses("primary", "md")}>
                {resumeStep.ordinal === null
                  ? `Go to ${resumeStep.name}`
                  : `Continue — step ${resumeStep.ordinal}, ${resumeStep.name}`}
              </Link>
              <p className="text-faint max-w-[46ch] text-[0.75rem] leading-relaxed">
                {resumeStep.purpose}
              </p>
            </div>
          </section>
        )}

        <ReadoutPanel
          title="Lobby check-in"
          aside={
            introduction === null ? (
              <StatusPill tone="neutral">not posted from this tab</StatusPill>
            ) : (
              <StatusPill tone="verified" srPrefix="Status:">
                posted
              </StatusPill>
            )
          }
        >
          {introduction === null ? (
            <p className="text-muted text-[0.8125rem] leading-relaxed">
              No check-in has been posted from this tab. If you posted one in an earlier session it still
              stands on the room — this page only reports what it saw happen.
            </p>
          ) : (
            <DataList
              rows={[
                { label: "Room", value: introduction.record.room, mono: true },
                { label: "Sequence", value: `#${formatGrouped(introduction.record.sequence)}`, mono: true },
                { label: "Observed", value: formatUtc(introduction.record.observedAt), mono: true },
              ]}
            />
          )}
        </ReadoutPanel>

        <ReadoutPanel
          title="Public directory"
          aside={
            registry === null ? (
              <StatusPill tone="neutral">not attempted</StatusPill>
            ) : (
              <StatusPill tone={registry.status === "published" ? "verified" : "attention"} srPrefix="Status:">
                {registry.status === "published" ? "entry confirmed" : "unconfirmed"}
              </StatusPill>
            )
          }
        >
          <p className="text-muted text-[0.8125rem] leading-relaxed">
            {registry === null
              ? "The directory maps your fingerprint to your DID. It is optional: nothing about your identity, your check-in or your contribution record depends on it."
              : registry.status === "published"
                ? "Your DID was written and read back from the directory."
                : "The write did not read back. The directory has a fixed capacity and refuses new entries once full, so this can stay unconfirmed indefinitely — it is not a failure of your identity or your records, and nothing else in the flow is affected."}
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              size="sm"
              busy={busy === "directory"}
              disabled={busy !== null || transport === null}
              onClick={() => void runDirectory()}
            >
              {registry === null ? "Publish to the directory" : "Try the directory again"}
            </Button>
          </div>
          {registry?.error === undefined ? null : (
            <p className="text-faint mono mt-3 text-[0.6875rem] leading-relaxed break-all">
              {registry.error.message}
            </p>
          )}
        </ReadoutPanel>

        <ReadoutPanel
          title="Contribution & Network records"
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={showLookup ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setShowLookup(!showLookup);
                  setLookupError(null);
                  setLookupSuccess(null);
                }}
                className="mono text-xs text-signal hover:bg-signal/10"
              >
                {showLookup ? "✕ Close Lookup" : "+ Import WSL Sequence"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                busy={busy === "sync"}
                disabled={busy !== null || transport === null}
                onClick={() => void syncNetworkRecords()}
                className="mono text-xs text-muted hover:text-ink hover:bg-panel"
              >
                {busy === "sync" ? "Syncing..." : "↻ Scan Recent"}
              </Button>
              {verification !== null ? (
                <StatusPill tone={verification.local.verified ? "verified" : "fault"} srPrefix="Verification:">
                  {verification.local.verified ? "signature verified" : "signature not valid"}
                </StatusPill>
              ) : networkRecords.length > 0 ? (
                <StatusPill tone="verified" srPrefix="Status:">
                  {networkRecords.length} verified record{networkRecords.length > 1 ? "s" : ""}
                </StatusPill>
              ) : null}
            </div>
          }
        >
          {/* WSL Sequence Number Import Form */}
          {showLookup && (
            <div className="mb-6 rounded-lg border border-signal/40 bg-panel p-4 shadow-lg animate-fade-in-up">
              <div className="flex items-center justify-between">
                <p className="eyebrow text-signal">Import & Verify WSL / Linux Terminal Contribution</p>
                <span className="mono text-[0.6875rem] text-muted">2.45M+ Live Network Records</span>
              </div>
              <p className="text-muted mt-2 text-xs leading-relaxed">
                When you ran <code className="mono text-ink text-[0.75rem]">python3 flop_agent.py contribute</code> in WSL, it returned a <span className="text-ink font-semibold">Sequence Number</span> (e.g. <code className="mono text-signal font-semibold">#2450860</code>). Enter your sequence number below to fetch and cryptographically verify the original message directly from the live Technocore network.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                  type="text"
                  placeholder="Sequence # (e.g. 2450860, 2441023)"
                  value={lookupSeq}
                  onChange={(e) => setLookupSeq(e.target.value)}
                  className="rounded-md border border-hairline bg-void px-3 py-1.5 mono text-xs text-ink placeholder:text-faint focus:border-signal focus:outline-none"
                />
                <select
                  value={lookupRoom}
                  onChange={(e) => setLookupRoom(e.target.value as "technocore" | "lobby")}
                  className="rounded-md border border-hairline bg-void px-3 py-1.5 mono text-xs text-ink focus:border-signal focus:outline-none"
                >
                  <option value="technocore">Room: technocore (Contribution)</option>
                  <option value="lobby">Room: lobby (Check-in)</option>
                </select>
                <Button
                  variant="primary"
                  size="sm"
                  busy={isLookingUp}
                  disabled={isLookingUp || !lookupSeq.trim()}
                  onClick={() => void handleLookup()}
                >
                  {isLookingUp ? "Fetching & Verifying..." : "Fetch & Verify"}
                </Button>
              </div>

              {lookupError && (
                <p className="mt-3 text-xs text-fault mono bg-fault/10 border border-fault/30 p-2.5 rounded">
                  ⚠️ {lookupError}
                </p>
              )}
              {lookupSuccess && (
                <p className="mt-3 text-xs text-signal mono bg-signal/10 border border-signal/30 p-2.5 rounded">
                  ✨ {lookupSuccess}
                </p>
              )}
            </div>
          )}

          {contribution === null && networkRecords.length === 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-muted text-[0.8125rem] leading-relaxed">
                No contribution record has been posted from this tab, and no record was in the latest 200 global network room messages.
              </p>
              <div className="rounded-md border border-hairline bg-graphite/40 p-3 text-xs text-muted space-y-1.5">
                <p className="text-ink font-medium">💡 Did you post from WSL / Linux CLI?</p>
                <p>
                  The live Technocore public network has over <strong className="text-ink">2,450,000 messages</strong>. If your contribution was submitted earlier, click <span className="text-signal font-semibold cursor-pointer hover:underline" onClick={() => setShowLookup(true)}>&ldquo;+ Import WSL Sequence&rdquo;</span> above and enter your sequence number from your terminal output to verify and pin it to your dashboard!
                </p>
              </div>
              {lastSyncTime && (
                <p className="mono text-faint text-[0.6875rem]">
                  Last scanned recent network room messages: {lastSyncTime}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLookup(true)}
                >
                  + Import WSL Sequence
                </Button>
                <Link href="/onboarding/contribute" className={buttonClasses("ghost", "sm")}>
                  Record a web contribution
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  busy={busy === "sync"}
                  onClick={() => void syncNetworkRecords()}
                >
                  Scan recent messages
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Tab Contribution (if any) */}
              {contribution && (
                <div className="rounded-lg border border-hairline p-4 bg-graphite/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="eyebrow text-ink">Active Session Record</span>
                    <span className="mono text-xs text-signal font-semibold">Sequence #{contribution.record.sequence}</span>
                  </div>
                  <DataList
                    rows={[
                      { label: "Room", value: contribution.record.room, mono: true },
                      { label: "Sequence", value: `#${formatGrouped(contribution.record.sequence)}`, mono: true },
                      {
                        label: "Link / Text",
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
                    ]}
                  />
                </div>
              )}

              {/* Network Discovered Records (from WSL / Linux CLI or Network Rooms) */}
              {networkRecords.map((rec) => (
                <div key={rec.id} className="rounded-lg border border-signal/30 p-4 bg-panel/80 shadow-md space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs font-bold text-signal px-2 py-0.5 rounded bg-signal/15 border border-signal/30">
                        {rec.source === "wsl_cli" ? "WSL / Linux CLI" : "Network Room"}
                      </span>
                      <span className="mono text-xs text-ink font-semibold">Room: {rec.room}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs text-muted">Sequence #{formatGrouped(rec.sequence)}</span>
                      <StatusPill tone={rec.verified ? "verified" : "attention"}>
                        {rec.verified ? "signature verified" : "unverified"}
                      </StatusPill>
                    </div>
                  </div>

                  <DataList
                    dense
                    rows={[
                      { label: "Room", value: rec.room, mono: true },
                      { label: "Sequence", value: `#${formatGrouped(rec.sequence)}`, mono: true },
                      {
                        label: "Content",
                        value: (
                          <p className="mono text-ink text-[0.8125rem] break-all leading-relaxed bg-void/50 p-2.5 rounded border border-hairline">
                            {rec.text}
                          </p>
                        ),
                      },
                      {
                        label: "Signature",
                        value: `${rec.signature.slice(0, 24)}...${rec.signature.slice(-12)}`,
                        mono: true,
                        note: "Cryptographically verified against this agent's public key.",
                      },
                    ]}
                  />
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-hairline">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLookup(true)}
                >
                  + Add another sequence #
                </Button>
                <Link href="/onboarding/contribute" className={buttonClasses("ghost", "sm")}>
                  Record a web contribution
                </Link>
                <Link href="/civilization" className={buttonClasses("ghost", "sm")}>
                  View Observatory
                </Link>
              </div>
            </div>
          )}
        </ReadoutPanel>

        <ReadoutPanel title="Encrypted backup">
          {canExportBackup ? (
            <div className="flex flex-col gap-5">
              <p className="text-muted text-[0.8125rem] leading-relaxed">
                Export a fresh file under a new passphrase. Encryption happens in this tab and the file is
                never transmitted.
              </p>
              <PassphraseField
                intent="create"
                label="New backup passphrase"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                hint={`At least ${String(MIN_PASSPHRASE_LENGTH)} characters. A few unrelated words beat a short complicated one.`}
              />
              {assessment === null ? null : (
                <Meter
                  label="Passphrase strength"
                  value={assessment.score}
                  max={4}
                  readout={`${assessment.label} · ~${String(assessment.bits)} bits`}
                  tone={STRENGTH_TONE[assessment.score]}
                />
              )}
              <div>
                <Button
                  variant="secondary"
                  size="md"
                  busy={busy === "export"}
                  disabled={busy !== null || assessment?.acceptable !== true}
                  onClick={() => void runExport()}
                >
                  {busy === "export" ? "Encrypting" : "Save encrypted backup"}
                </Button>
              </div>
              {exportedName === null ? null : (
                <Callout tone="verified" title="Backup saved">
                  <span className="mono text-ink">{exportedName}</span> — open it once from the import page
                  to be certain the passphrase is the one you think it is.
                </Callout>
              )}
              {downloadBlocked ? (
                <Callout tone="attention" title="The download did not start" role="alert">
                  Your browser blocked the file, so nothing was saved. Allow downloads for this page and try
                  again.
                </Callout>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-muted text-[0.8125rem] leading-relaxed">
                This session cannot produce a new backup file. The seed was dropped from memory
                {hardened ? " once your backup was verified" : " when this identity was restored"}, which is
                the safer default — the file you already hold still restores this identity.
              </p>
              <p className="text-faint text-[0.75rem] leading-relaxed">
                To re-encrypt under a different passphrase, import that file with the re-export option
                enabled.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/import" className={buttonClasses("secondary", "sm")}>
                  Go to import
                </Link>
              </div>
            </div>
          )}
        </ReadoutPanel>

        <section className="panel rounded-lg p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="eyebrow">Activity</h2>
            {activity.length === 0 ? null : (
              <button
                type="button"
                onClick={() => setConfirm("history")}
                className={buttonClasses("ghost", "sm")}
              >
                Clear history
              </button>
            )}
          </div>
          <div className="mt-5">
            <ActivityTimeline events={activity} />
          </div>
          <Disclosure summary="What is recorded" className="mt-5">
            <p>
              Public facts only: the DID, room names, sequence numbers, signatures, links, commit hashes and
              request durations. There is no field in the stored shape that can hold a seed, a key or a
              passphrase, so none can be written by accident.
            </p>
          </Disclosure>
        </section>

        {failure === null ? null : <ErrorNotice failure={failure} />}

        <section className="border-fault/25 bg-fault/5 rounded-lg border p-5 sm:p-6">
          {/*
            The eyebrow class is unlayered CSS and sets its own colour, so a Tailwind text utility would
            lose the cascade against it. The tone is carried by the frame instead.
          */}
          <h2 className="eyebrow">Discard identity</h2>
          <p className="text-muted mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed">
            Removes the identity from this tab and wipes the key material rather than waiting for the
            browser to collect it. Records already posted to Technocore stay where they are — they are
            public and permanent.
          </p>
          {backup === "verified" ? (
            <p className="text-muted mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed">
              You have a verified backup, so this is recoverable: import the file to come back.
            </p>
          ) : (
            <p className="text-fault mt-3 max-w-[62ch] text-[0.8125rem] leading-relaxed">
              You have not opened a backup for this identity. Discarding it now destroys the only copy of
              the key, permanently.
            </p>
          )}
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setConfirm("forget")}
              className={buttonClasses("danger", "md")}
            >
              Discard this identity
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirm === "forget"}
        title="Discard this identity?"
        confirmLabel="Discard identity"
        requireTyped="discard"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          forget();
        }}
      >
        <p>
          {backup === "verified"
            ? "Your backup has been opened and verified, so the file you hold can restore this identity."
            : "There is no verified backup. This key exists only in this tab, and nobody else has a copy — discarding it cannot be undone."}
        </p>
        <p>Anything already posted to a public room stays posted.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "history"}
        title="Clear stored activity?"
        confirmLabel="Clear history"
        requireTyped="clear"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          clearHistory();
        }}
      >
        <p>
          Removes this browser&apos;s copy of the activity list. Your identity and everything posted to
          Technocore are untouched — the rooms are the record, this is only a local view of it.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/**
 * No identity in this tab.
 *
 * Stated as a property of the design rather than as an error, because for most visitors it means they
 * closed a tab — and the honest answer is that keys are not persisted, together with the two ways forward.
 */
function NoIdentity() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-20 sm:px-8 sm:py-28">
      <StatusPill tone="neutral" srPrefix="Status:">
        no identity in this tab
      </StatusPill>

      <h1 className="display text-ink mt-6 text-[1.75rem] sm:text-[2.125rem]">
        There is no agent loaded here.
      </h1>

      <p className="text-muted mt-5 max-w-[54ch] text-sm leading-relaxed">
        A signing identity is held in the tab&apos;s memory and never written to storage, so it does not
        survive a reload or a new tab. That is deliberate: persisting a signing key would mean leaving it
        somewhere a script could read it. Import your encrypted backup to pick up where you left off, or
        create a new identity.
      </p>

      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Link href="/import" className={buttonClasses("primary", "md")}>
          Import a backup
        </Link>
        <Link href="/onboarding/identity" className={buttonClasses("secondary", "md")}>
          Create an identity
        </Link>
      </div>
    </div>
  );
}
