/**
 * Technocore Public Network Observatory: Interactive Public Network Explorer & Diagnostic Console.
 *
 * Demonstrates live public-room discovery, incremental sequence cursoring, strict Ed25519
 * signature verification, wire observation preservation, and promotion firewall isolation.
 */

"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { verifyRoomMessage } from "../technocore/verify.ts";
import { isValidDid } from "../identity/did.ts";

interface ObservedMessage {
  readonly room: string;
  readonly sequence: number;
  readonly serverTimestamp: string | null;
  readonly authorDid: string | null;
  readonly nonce: string | null;
  readonly signature: string | null;
  readonly text: string;
  readonly verificationStatus: "VERIFIED" | "INVALID_SIGNATURE" | "UNVERIFIABLE_UNSIGNED" | "UNVERIFIABLE_UNKNOWN_DID";
  readonly verificationReason?: string;
  readonly classification: string;
}

const SAMPLE_PUBLIC_ROOMS = [
  "events",
  "general",
  "tclk-offers",
  "market",
  "civilization",
  "lobby",
  "meta",
  "technocore",
] as const;

export const TechnocoreObservatoryView: React.FC = () => {
  const [selectedRoom, setSelectedRoom] = useState<string>("events");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [messages, setMessages] = useState<readonly ObservedMessage[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ObservedMessage | null>(null);

  // Sandbox state for interactive developer verification
  const [sandboxRoom, setSandboxRoom] = useState<string>("events");
  const [sandboxDid, setSandboxDid] = useState<string>("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
  const [sandboxNonce, setSandboxNonce] = useState<string>("1789200001000");
  const [sandboxText, setSandboxText] = useState<string>('{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED"}');
  const [sandboxSig, setSandboxSig] = useState<string>("");
  const [sandboxResult, setSandboxResult] = useState<{
    readonly ran: boolean;
    readonly verified: boolean;
    readonly status: string;
    readonly reason: string;
    readonly payloadBytes?: string;
  }>({
    ran: false,
    verified: false,
    status: "IDLE",
    reason: "Enter payload parameters and click 'Run Verification Test'",
  });

  // Fetch live public room observations via local API proxy or Technocore directly
  const fetchRoomObservations = useCallback(async (room: string) => {
    setIsLoading(true);
    try {
      // Try local API proxy first, fallback to public technocore.chat endpoint
      let res = await fetch(`/api/civilization/network/messages?room=${encodeURIComponent(room)}&limit=30`);
      if (!res.ok) {
        res = await fetch(`https://technocore.chat/r/${encodeURIComponent(room)}?format=json&limit=30`);
      }

      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data.messages) ? data.messages : (Array.isArray(data) ? data : []);
        
        // Verify each message
        const verifiedList: ObservedMessage[] = [];
        for (const m of rawList) {
          const did = m.did || m.from || null;
          const sig = m.sig || m.signature || null;
          const nonce = m.nonce !== undefined && m.nonce !== null ? String(m.nonce) : null;
          const text = typeof m.text === "string" ? m.text : JSON.stringify(m.text || {});
          const seq = typeof m.seq === "number" ? m.seq : (typeof m.sequence === "number" ? m.sequence : 0);
          const serverTimestamp = m.ts || m.serverTimestamp || m.observedAt || null;

          let verificationStatus: ObservedMessage["verificationStatus"] = "UNVERIFIABLE_UNSIGNED";
          let verificationReason = "Unsigned public message";

          if (!did || !sig) {
            verificationStatus = "UNVERIFIABLE_UNSIGNED";
            verificationReason = "No DID or signature provided on wire";
          } else if (!isValidDid(did)) {
            verificationStatus = "UNVERIFIABLE_UNKNOWN_DID";
            verificationReason = "Malformed or unsupported DID string";
          } else {
            try {
              const verif = await verifyRoomMessage(room, {
                did,
                sig,
                nonce: nonce || "",
                text,
              });
              if (verif.verified) {
                verificationStatus = "VERIFIED";
                verificationReason = "Cryptographically valid Ed25519 signature over UTF-8(room|nonce|text)";
              } else {
                verificationStatus = "INVALID_SIGNATURE";
                verificationReason = verif.reason || "Signature mismatch over canonical payload bytes";
              }
            } catch (err) {
              verificationStatus = "INVALID_SIGNATURE";
              verificationReason = `Verification exception: ${err instanceof Error ? err.message : String(err)}`;
            }
          }

          let classification = "CHAT_RAW_TEXT";
          if (text.startsWith("tclk1 ") || text.startsWith("tclk ")) classification = "TCLK_CONTRACT_FRAME";
          else if (text.startsWith("{") && text.endsWith("}")) {
            try {
              const p = JSON.parse(text);
              if (p.protocol === "civilization-event-v1" || p.eventType) classification = "CIVILIZATION_EVENT";
              else if (p.type?.startsWith("sonnet.")) classification = "SONNET_CONTEST_FRAME";
              else classification = "STRUCTURED_JSON";
            } catch {
              classification = "RAW_TEXT";
            }
          }

          verifiedList.push({
            room,
            sequence: seq,
            serverTimestamp,
            authorDid: did,
            nonce,
            signature: sig,
            text,
            verificationStatus,
            verificationReason,
            classification,
          });
        }

        setMessages(verifiedList);
        setLastSyncAt(new Date().toISOString());
        if (verifiedList.length > 0 && verifiedList[0]) {
          setSelectedMessage(verifiedList[0]);
        }
      }
    } catch {
      // Offline fallback: keep existing messages
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoomObservations(selectedRoom);
  }, [selectedRoom, fetchRoomObservations]);

  // Filtered messages
  const filteredMessages = useMemo(() => {
    if (filterStatus === "ALL") return messages;
    return messages.filter((m) => m.verificationStatus === filterStatus);
  }, [messages, filterStatus]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = messages.length;
    const verified = messages.filter((m) => m.verificationStatus === "VERIFIED").length;
    const invalid = messages.filter((m) => m.verificationStatus === "INVALID_SIGNATURE").length;
    const unsigned = messages.filter((m) => m.verificationStatus === "UNVERIFIABLE_UNSIGNED" || m.verificationStatus === "UNVERIFIABLE_UNKNOWN_DID").length;
    const verifiedPct = total > 0 ? Math.round((verified / total) * 100) : 0;

    return { total, verified, invalid, unsigned, verifiedPct };
  }, [messages]);

  // Sandbox Verification Handler
  const handleRunSandboxVerification = useCallback(async () => {
    if (!sandboxDid.trim() || !sandboxSig.trim()) {
      setSandboxResult({
        ran: true,
        verified: false,
        status: "UNVERIFIABLE_UNSIGNED",
        reason: "Missing DID or Signature in sandbox input.",
      });
      return;
    }

    if (!isValidDid(sandboxDid.trim())) {
      setSandboxResult({
        ran: true,
        verified: false,
        status: "UNVERIFIABLE_UNKNOWN_DID",
        reason: `Invalid Ed25519 DID format: '${sandboxDid}'. Must be did:key:z6Mk...`,
      });
      return;
    }

    const payloadFormula = `${sandboxRoom}|${sandboxNonce}|${sandboxText}`;

    try {
      const res = await verifyRoomMessage(sandboxRoom, {
        did: sandboxDid.trim(),
        sig: sandboxSig.trim(),
        nonce: sandboxNonce.trim(),
        text: sandboxText,
      });

      if (res.verified) {
        setSandboxResult({
          ran: true,
          verified: true,
          status: "VERIFIED",
          reason: "Signature is cryptographically valid over the canonical UTF-8 bytes.",
          payloadBytes: payloadFormula,
        });
      } else {
        setSandboxResult({
          ran: true,
          verified: false,
          status: "INVALID_SIGNATURE",
          reason: res.reason || "Cryptographic Ed25519 signature mismatch.",
          payloadBytes: payloadFormula,
        });
      }
    } catch (err) {
      setSandboxResult({
        ran: true,
        verified: false,
        status: "INVALID_SIGNATURE",
        reason: `Verification error: ${err instanceof Error ? err.message : String(err)}`,
        payloadBytes: payloadFormula,
      });
    }
  }, [sandboxRoom, sandboxDid, sandboxSig, sandboxNonce, sandboxText]);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 min-h-screen bg-void text-ink font-sans">
      {/* Top Banner & Provenance Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-hairline bg-panel shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-3 w-3 rounded-full bg-signal animate-pulse" />
            <h1 className="text-lg font-bold tracking-tight uppercase text-ink">
              Technocore Public Network Observatory
            </h1>
            <span className="rounded bg-signal/15 border border-signal/30 px-2 py-0.5 text-xs font-bold text-signal mono">
              READ-ONLY PROVENANCE
            </span>
          </div>
          <p className="text-xs text-muted">
            Independent, real-time cryptographic audit & wire observation layer for the Technocore public network.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mono text-xs">
          <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-sky-400 font-semibold">
            ENDPOINT: https://technocore.chat
          </span>
          <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-emerald-400 font-semibold">
            ZERO MUTATIONS (100% READ-ONLY)
          </span>
          {lastSyncAt && (
            <span className="rounded bg-panel-high border border-hairline px-2.5 py-1 text-muted">
              SYNC: {new Date(lastSyncAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-1">
          <div className="text-xs mono uppercase text-muted font-semibold">Observed Public Messages</div>
          <div className="text-2xl font-extrabold text-ink mono">{metrics.total}</div>
          <div className="text-[11px] text-faint mono">Bounded window in current room</div>
        </div>

        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-1">
          <div className="text-xs mono uppercase text-emerald-400 font-semibold">Cryptographically Verified</div>
          <div className="text-2xl font-extrabold text-emerald-300 mono">{metrics.verified} ({metrics.verifiedPct}%)</div>
          <div className="text-[11px] text-emerald-400/70 mono">Valid Ed25519 signature</div>
        </div>

        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-1">
          <div className="text-xs mono uppercase text-amber-400 font-semibold">Invalid Signatures</div>
          <div className="text-2xl font-extrabold text-amber-300 mono">{metrics.invalid}</div>
          <div className="text-[11px] text-amber-400/70 mono">Signature mismatch on wire</div>
        </div>

        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-1">
          <div className="text-xs mono uppercase text-muted font-semibold">Unsigned / Unverifiable</div>
          <div className="text-2xl font-extrabold text-muted mono">{metrics.unsigned}</div>
          <div className="text-[11px] text-faint mono">Preserved raw, zero promotion</div>
        </div>
      </div>

      {/* Architecture & Truthfulness Dataflow Visualizer */}
      <div className="p-5 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-ink mono">
              Observatory Architecture & Promotion Firewall
            </h2>
            <p className="text-xs text-muted">
              How untrusted public network observations are safely verified, classified, and isolated from trusted state.
            </p>
          </div>
          <span className="rounded bg-signal/15 text-signal border border-signal/30 px-2 py-0.5 text-xs font-bold mono">
            SPECIFICATION COMPLIANT
          </span>
        </div>

        {/* 6-Stage Flow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 text-xs mono">
          <div className="p-3 rounded-lg border border-hairline bg-void/80 space-y-1.5">
            <div className="text-signal font-bold">1. Room Ingestion</div>
            <div className="text-muted text-[11px]">
              GET /r/&lt;room&gt; bounded polling. Auto-discovers public rooms; excludes private p-* namespaces.
            </div>
          </div>

          <div className="p-3 rounded-lg border border-hairline bg-void/80 space-y-1.5">
            <div className="text-signal font-bold">2. Sequence Cursors</div>
            <div className="text-muted text-[11px]">
              Persistent SQL checkpoints track since=&lt;seq&gt; per room to ensure zero duplicates and detect retention gaps.
            </div>
          </div>

          <div className="p-3 rounded-lg border border-hairline bg-void/80 space-y-1.5">
            <div className="text-signal font-bold">3. Raw Store</div>
            <div className="text-muted text-[11px]">
              Exact wire bytes, nonces, signatures, and SHA-256 raw hashes are immutably archived before verification.
            </div>
          </div>

          <div className="p-3 rounded-lg border border-hairline bg-void/80 space-y-1.5">
            <div className="text-signal font-bold">4. Ed25519 Verifier</div>
            <div className="text-muted text-[11px]">
              Decodes 0xed01 DID, reconstructs UTF-8(room|nonce|text), and tests 64-byte signature via WebCrypto.
            </div>
          </div>

          <div className="p-3 rounded-lg border border-hairline bg-void/80 space-y-1.5">
            <div className="text-signal font-bold">5. Classification</div>
            <div className="text-muted text-[11px]">
              Labels records as VERIFIED, INVALID_SIG, or UNVERIFIABLE without discarding unverified observations.
            </div>
          </div>

          <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/20 space-y-1.5">
            <div className="text-emerald-400 font-bold">6. Promotion Gate</div>
            <div className="text-muted text-[11px]">
              Firewall rule: ONLY verified valid protocol events can become trusted state. Unverified = 0 promotion.
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Room Explorer & Live Wire Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Room Tabs & Observation List (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-wider uppercase text-muted mono">
                Public Room Feed
              </h2>
              <button
                onClick={() => fetchRoomObservations(selectedRoom)}
                disabled={isLoading}
                className="rounded px-2 py-1 text-xs mono text-signal bg-signal/15 hover:bg-signal/25 border border-signal/30 transition-colors disabled:opacity-50"
              >
                {isLoading ? "Fetching..." : "↻ Refresh Feed"}
              </button>
            </div>

            {/* Room Selector Pills */}
            <div className="flex flex-wrap gap-1.5">
              {SAMPLE_PUBLIC_ROOMS.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRoom(r)}
                  className={`px-2.5 py-1 rounded text-xs mono font-semibold transition-all ${
                    selectedRoom === r
                      ? "bg-signal text-void shadow-sm"
                      : "bg-void border border-hairline text-muted hover:text-ink hover:border-hairline-high"
                  }`}
                >
                  /r/{r}
                </button>
              ))}
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1.5 text-[11px] mono border-b border-hairline pb-2">
              {["ALL", "VERIFIED", "INVALID_SIGNATURE", "UNVERIFIABLE_UNSIGNED"].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    filterStatus === st
                      ? "bg-panel-high text-ink font-bold border border-hairline"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {st.replace("_UNSIGNED", "")}
                </button>
              ))}
            </div>

            {/* Observation List */}
            <div className="max-h-[480px] overflow-y-auto space-y-2 pr-1">
              {filteredMessages.length === 0 ? (
                <div className="p-6 text-center text-xs mono text-muted italic">
                  No observations matching the selected filter in /r/{selectedRoom}.
                </div>
              ) : (
                filteredMessages.map((msg, idx) => {
                  const isSelected = selectedMessage?.sequence === msg.sequence && selectedMessage?.room === msg.room;
                  const isVerified = msg.verificationStatus === "VERIFIED";
                  const isInvalid = msg.verificationStatus === "INVALID_SIGNATURE";

                  return (
                    <div
                      key={`${msg.room}_${msg.sequence}_${idx}`}
                      onClick={() => setSelectedMessage(msg)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? "border-signal bg-signal/10 shadow-sm"
                          : "border-hairline bg-void/60 hover:border-hairline-high"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mono">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink">#{msg.sequence}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isVerified
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : isInvalid
                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                : "bg-panel-high text-muted border border-hairline"
                            }`}
                          >
                            {msg.verificationStatus}
                          </span>
                        </div>

                        <span className="text-[10px] text-muted">
                          {msg.classification}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-muted truncate font-mono">
                        {msg.authorDid ? `${msg.authorDid.slice(0, 16)}...${msg.authorDid.slice(-6)}` : "anonymous"}
                      </div>

                      <div className="mt-1 text-xs text-ink/90 line-clamp-2 font-sans bg-panel/50 p-1.5 rounded border border-hairline/50">
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Cryptographic Wire Inspector & Forensic Breakdown (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm flex-1">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h2 className="text-xs font-bold tracking-wider uppercase text-muted mono">
                Cryptographic Wire Inspector
              </h2>
              {selectedMessage && (
                <span className="mono text-xs text-signal font-bold">
                  /r/{selectedMessage.room} · Seq #{selectedMessage.sequence}
                </span>
              )}
            </div>

            {selectedMessage ? (
              <div className="space-y-3 text-xs mono">
                {/* Status Callout */}
                <div
                  className={`p-3 rounded-lg border ${
                    selectedMessage.verificationStatus === "VERIFIED"
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                      : selectedMessage.verificationStatus === "INVALID_SIGNATURE"
                      ? "bg-rose-950/30 border-rose-500/40 text-rose-300"
                      : "bg-void border-hairline text-muted"
                  }`}
                >
                  <div className="font-bold uppercase tracking-wider text-[11px] mb-1">
                    Status: {selectedMessage.verificationStatus}
                  </div>
                  <div className="text-[11px] font-sans">
                    {selectedMessage.verificationReason}
                  </div>
                </div>

                {/* Wire Fields Breakdown */}
                <div className="space-y-2">
                  <div>
                    <span className="text-muted block text-[10px] uppercase font-semibold">Author DID:</span>
                    <div className="p-1.5 rounded bg-void border border-hairline text-ink break-all select-all">
                      {selectedMessage.authorDid || "None (Unsigned)"}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted block text-[10px] uppercase font-semibold">Nonce:</span>
                      <div className="p-1.5 rounded bg-void border border-hairline text-ink break-all">
                        {selectedMessage.nonce || "None"}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted block text-[10px] uppercase font-semibold">Server Timestamp:</span>
                      <div className="p-1.5 rounded bg-void border border-hairline text-ink truncate">
                        {selectedMessage.serverTimestamp || "Live Wire Buffer"}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-muted block text-[10px] uppercase font-semibold">Signature (Base64URL):</span>
                    <div className="p-1.5 rounded bg-void border border-hairline text-ink break-all select-all max-h-16 overflow-y-auto">
                      {selectedMessage.signature || "None (Unsigned)"}
                    </div>
                  </div>

                  <div>
                    <span className="text-muted block text-[10px] uppercase font-semibold">Canonical Signing Payload:</span>
                    <div className="p-1.5 rounded bg-void border border-hairline text-signal/90 break-all select-all max-h-20 overflow-y-auto">
                      {selectedMessage.room}|{selectedMessage.nonce || ""}|{selectedMessage.text}
                    </div>
                    <span className="text-[10px] text-faint">
                      Formula: UTF-8(room + &quot;|&quot; + nonce + &quot;|&quot; + text)
                    </span>
                  </div>

                  <div>
                    <span className="text-muted block text-[10px] uppercase font-semibold">Raw Text Body:</span>
                    <div className="p-2 rounded bg-void border border-hairline text-ink break-all max-h-28 overflow-y-auto whitespace-pre-wrap font-sans text-xs">
                      {selectedMessage.text}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs mono text-muted italic">
                Select a message from the public room feed to inspect its cryptographic payload.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Developer Verification Sandbox */}
      <div className="p-5 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-2">
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-ink mono">
              Interactive Ed25519 Verification Sandbox
            </h2>
            <p className="text-xs text-muted">
              Paste or modify any Technocore room message below to verify its Ed25519 cryptographic signature in real-time.
            </p>
          </div>
          <span className="rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 px-2 py-0.5 text-xs font-bold mono">
            IN-BROWSER WEBCRYPTO
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs mono">
          <div className="lg:col-span-7 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mb-1">Room Name:</label>
                <input
                  type="text"
                  value={sandboxRoom}
                  onChange={(e) => setSandboxRoom(e.target.value)}
                  className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink focus:border-signal focus:outline-none"
                />
              </div>
              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mb-1">Nonce:</label>
                <input
                  type="text"
                  value={sandboxNonce}
                  onChange={(e) => setSandboxNonce(e.target.value)}
                  className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink focus:border-signal focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-muted block text-[10px] uppercase font-semibold mb-1">Author DID (did:key:z6Mk...):</label>
              <input
                type="text"
                value={sandboxDid}
                onChange={(e) => setSandboxDid(e.target.value)}
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink focus:border-signal focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted block text-[10px] uppercase font-semibold mb-1">Message Text / Payload:</label>
              <textarea
                rows={3}
                value={sandboxText}
                onChange={(e) => setSandboxText(e.target.value)}
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink focus:border-signal focus:outline-none resize-none font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-muted block text-[10px] uppercase font-semibold mb-1">Signature (86-char Base64URL):</label>
              <input
                type="text"
                value={sandboxSig}
                onChange={(e) => setSandboxSig(e.target.value)}
                placeholder="Paste 86-character Base64URL signature..."
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink focus:border-signal focus:outline-none"
              />
            </div>

            <button
              onClick={handleRunSandboxVerification}
              className="rounded-lg bg-signal px-4 py-2 text-xs font-bold text-void hover:bg-signal/90 transition-colors"
            >
              ▶ Run Cryptographic Verification
            </button>
          </div>

          <div className="lg:col-span-5 p-4 rounded-xl border border-hairline bg-void flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted border-b border-hairline pb-1">
                Sandbox Diagnostic Output
              </div>

              {sandboxResult.ran ? (
                <div className="space-y-2">
                  <div
                    className={`p-2.5 rounded-lg border font-bold ${
                      sandboxResult.verified
                        ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                        : "bg-rose-950/30 border-rose-500/40 text-rose-300"
                    }`}
                  >
                    RESULT: {sandboxResult.status}
                  </div>
                  <div className="text-muted text-[11px] font-sans">
                    {sandboxResult.reason}
                  </div>
                  {sandboxResult.payloadBytes && (
                    <div>
                      <span className="text-[10px] uppercase text-faint block">Payload Bytes Evaluated:</span>
                      <div className="p-1.5 rounded bg-panel border border-hairline text-signal/80 break-all select-all text-[11px]">
                        {sandboxResult.payloadBytes}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-muted text-xs italic">
                  Awaiting input. Click &apos;Run Cryptographic Verification&apos; to test signature validity.
                </div>
              )}
            </div>

            <div className="text-[10px] text-faint mt-4 border-t border-hairline pt-2">
              Note: Verification occurs locally using native WebCrypto Ed25519 primitives. No private keys required.
            </div>
          </div>
        </div>
      </div>

      {/* Developer Reproducibility & CLI Snippet */}
      <div className="p-5 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm text-xs mono">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold tracking-wider uppercase text-muted">
            Developer Local Reproducibility
          </h2>
          <span className="text-signal font-semibold">
            ZERO DEPENDENCIES (Pure Node.js)
          </span>
        </div>

        <p className="text-xs text-muted font-sans">
          Any developer or autonomous agent can reproduce these observations locally from their own terminal using our standalone script:
        </p>

        <div className="p-3 rounded-lg bg-void border border-hairline text-signal select-all flex items-center justify-between">
          <code>npm run observe:technocore</code>
          <span className="text-muted text-[11px]">or: node scripts/observe-technocore.mjs --limit=25</span>
        </div>
      </div>
    </div>
  );
};
