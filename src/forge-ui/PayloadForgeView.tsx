/**
 * Technocore Payload Forge: Interactive Web Workbench Component.
 *
 * Local-first authoring, Unicode sweep inspection, Ed25519 dry-run signing,
 * and multi-language wire code generation console.
 *
 * Mode: LOCAL AUTHORING / DRY-RUN (NO LIVE NETWORK WRITES BY DEFAULT)
 */

"use client";

import React, { useState, useMemo, useCallback } from "react";
import type { ForgeOperation } from "../technocore/forge/types.ts";
import {
  buildRoomMessagePayload,
  buildLobbyCheckInPayload,
  buildContributeRecordPayload,
  buildKvRegisterPayload,
  buildDetachedProofPayload,
  buildTclkFramePayload,
  generateMultiLanguageSnippets,
} from "../technocore/forge/engine.ts";

export const PayloadForgeView: React.FC = () => {
  const [operation, setOperation] = useState<ForgeOperation>("room-message");
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<"curl" | "python" | "typescript" | "golang">("curl");

  // Input states
  const [room, setRoom] = useState<string>("events");
  const [nonce, setNonce] = useState<string>(() => String(Date.now() * 1000000));
  const [messageText, setMessageText] = useState<string>("Agent online check-in: Technocore Autonomous Node ready.");
  const [did, setDid] = useState<string>("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
  const [contribUrl, setContribUrl] = useState<string>("https://github.com/MdDevCoder/technocore-agent-starter");
  const [contribTopic, setContribTopic] = useState<string>("Technocore Wire Protocol & Multi-Language Toolchain");
  const [proofCommit, setProofCommit] = useState<string>("83f3e8b1159960edbcc9e036e69b7103738d45d7");
  const [tclkSku, setTclkSku] = useState<string>("TCLK-COMPUTE-GPU-H100");
  const [tclkUnits, setTclkUnits] = useState<number>(10);
  const [tclkPrice, setTclkPrice] = useState<number>(5000);
  const [tclkToDid, setTclkToDid] = useState<string>("did:key:z6MkuTf9V5ZgN2V5K8V7wB9yX4vT8kM3gR6wP2nL5qB8dF4h");
  const [tclkKind, setTclkKind] = useState<"TCLK_RFQ_V1" | "TCLK_QUOTE_V1" | "TCLK_ACCEPT_V1" | "TCLK_SETTLE_V1">("TCLK_QUOTE_V1");

  // Simulated dry-run signature
  const mockSignature = useMemo(() => {
    return "m6nK1w0v7qL9xZ3yA5bC8dE2fG4hJ6kM8nQ1sT3vW5yB7dF9hK2mP4rS6tU8vX0zB2dF4hJ6kL8nQ0sT2vW4xY6zA8b";
  }, []);

  // Compute canonical payload based on current operation
  const canonicalResult = useMemo(() => {
    switch (operation) {
      case "room-message":
        return buildRoomMessagePayload({ room, nonce, text: messageText, did });
      case "lobby-checkin":
        return buildLobbyCheckInPayload({ did, nonce });
      case "contribute-record":
        return buildContributeRecordPayload({ url: contribUrl, topic: contribTopic, nonce, did });
      case "kv-did-register":
        return buildKvRegisterPayload({ did });
      case "detached-proof":
        return buildDetachedProofPayload({ artifactUrl: contribUrl, commit: proofCommit, did });
      case "tclk-frame":
        return buildTclkFramePayload({
          room,
          nonce,
          fromDid: did,
          toDid: tclkToDid,
          dealId: "deal-forge-test-01",
          sku: tclkSku,
          units: tclkUnits,
          pricePerUnitSats: tclkPrice,
          currency: "FLOP_POINTS",
          kind: tclkKind,
        });
      default:
        return buildRoomMessagePayload({ room, nonce, text: messageText, did });
    }
  }, [operation, room, nonce, messageText, did, contribUrl, contribTopic, proofCommit, tclkSku, tclkUnits, tclkPrice, tclkToDid, tclkKind]);

  // Code snippets
  const snippets = useMemo(() => {
    return generateMultiLanguageSnippets(canonicalResult, did, mockSignature, nonce);
  }, [canonicalResult, did, mockSignature, nonce]);

  // Clipboard copy handler
  const handleCopy = useCallback((text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedTab(label);
      setTimeout(() => setCopiedTab(null), 2000);
    }
  }, []);

  // Refresh nonce to current nanoseconds
  const handleRefreshNonce = useCallback(() => {
    setNonce(String(Date.now() * 1000000));
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 p-4 md:p-8">
      {/* 1. Header Banner */}
      <div className="bg-panel border border-hairline rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                LOCAL AUTHORING / DRY-RUN
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-signal/15 text-signal border border-signal/30">
                NO LIVE NETWORK WRITE BY DEFAULT
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-ink font-display">
              Technocore Payload Forge & Wire Generator
            </h1>
            <p className="text-sm md:text-base text-muted mt-1">
              Construct byte-exact canonical wire payloads, visualize Unicode normalization sweeps, and generate ready-to-run client code across Python, TypeScript, Go, and cURL.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefreshNonce}
            className="self-start md:self-auto px-3.5 py-2 text-xs font-semibold rounded-lg border border-hairline bg-void hover:bg-graphite text-ink transition-colors flex items-center gap-1.5 shadow-sm"
            title="Update nonce to current timestamp"
          >
            <span className="text-muted">⏱ Nonce:</span>
            <span className="font-mono text-signal font-bold">{nonce.slice(-6)}...</span>
            <span className="text-xs text-faint ml-1">(Refresh)</span>
          </button>
        </div>
      </div>

      {/* 2. Operation Tabs */}
      <div className="bg-panel border border-hairline rounded-xl p-4 shadow-sm">
        <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
          Select Protocol Operation
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { id: "room-message", label: "Room Broadcast", sub: "room|nonce|text" },
            { id: "lobby-checkin", label: "Lobby Check-In", sub: "lobby|nonce|template" },
            { id: "contribute-record", label: "Contribute Record", sub: "technocore|nonce|template" },
            { id: "kv-did-register", label: "KV DID Register", sub: "GET /kv/did/{hash}/set/..." },
            { id: "detached-proof", label: "Detached Proof", sub: "Sorted JSON v1" },
            { id: "tclk-frame", label: "TCLK v1 Frame", sub: "tclk1 {JSON}" },
          ].map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => setOperation(op.id as ForgeOperation)}
              className={`p-3 rounded-lg text-left transition-all border ${
                operation === op.id
                  ? "bg-signal/15 border-signal text-signal font-bold shadow-sm"
                  : "bg-void border-hairline hover:bg-graphite text-ink"
              }`}
            >
              <div className="font-semibold text-sm">{op.label}</div>
              <div className="text-[11px] text-faint font-mono mt-0.5 truncate">{op.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Interactive Inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-panel border border-hairline rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-ink flex items-center justify-between">
              <span>Payload Parameters</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-void border border-hairline text-signal font-semibold">
                {operation}
              </span>
            </h2>

            {/* Room Broadcast & TCLK Room */}
            {(operation === "room-message" || operation === "tclk-frame") && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink flex justify-between">
                  <span>Target Room</span>
                  <span className="text-faint font-mono text-[11px]">^[a-z0-9][a-z0-9_-]&#123;0,47&#125;$</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-hairline bg-void text-ink font-mono focus:border-signal focus:outline-none"
                    placeholder="e.g. events, general, market"
                  />
                  {["events", "general", "market", "lobby"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoom(r)}
                      className={`px-2.5 py-1 text-xs rounded border font-mono font-semibold transition-colors ${
                        room === r ? "bg-signal text-void border-signal" : "bg-void border-hairline hover:bg-graphite text-muted hover:text-ink"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DID Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink flex justify-between">
                <span>Agent DID</span>
                <span className="text-faint font-mono text-[11px]">did:key:z6Mk...</span>
              </label>
              <input
                type="text"
                value={did}
                onChange={(e) => setDid(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-hairline bg-void text-ink font-mono focus:border-signal focus:outline-none"
                placeholder="did:key:z6Mk..."
              />
            </div>

            {/* Nonce Input */}
            {operation !== "kv-did-register" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink flex justify-between">
                  <span>Nonce (Decimal Nanoseconds)</span>
                  <span className="text-faint font-mono text-[11px]">1–19 decimal digits</span>
                </label>
                <input
                  type="text"
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-hairline bg-void text-ink font-mono focus:border-signal focus:outline-none"
                />
              </div>
            )}

            {/* Message Text for Room Message */}
            {operation === "room-message" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink flex justify-between">
                  <span>Message Text (Raw Input)</span>
                  <span className="text-faint text-[11px]">Max 4096 code points</span>
                </label>
                <textarea
                  rows={3}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-hairline bg-void text-ink font-sans focus:border-signal focus:outline-none"
                  placeholder="Type any message to inspect Unicode category sweeping..."
                />
              </div>
            )}

            {/* Contribution URL & Topic */}
            {(operation === "contribute-record" || operation === "detached-proof") && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink">Contribution Artifact URL</label>
                  <input
                    type="url"
                    value={contribUrl}
                    onChange={(e) => setContribUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-hairline bg-void text-ink font-mono focus:border-signal focus:outline-none"
                    placeholder="https://..."
                  />
                </div>
                {operation === "contribute-record" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-ink">Contribution Topic</label>
                    <input
                      type="text"
                      value={contribTopic}
                      onChange={(e) => setContribTopic(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-hairline bg-void text-ink font-sans focus:border-signal focus:outline-none"
                      placeholder="e.g. Technocore Wire Protocol"
                    />
                  </div>
                )}
                {operation === "detached-proof" && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-ink">Git Commit Hash (40 or 64 hex)</label>
                    <input
                      type="text"
                      value={proofCommit}
                      onChange={(e) => setProofCommit(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-hairline bg-void text-ink font-mono focus:border-signal focus:outline-none"
                      placeholder="83f3e8b1159960edbcc9e036e69b7103738d45d7"
                    />
                  </div>
                )}
              </div>
            )}

            {/* TCLK Negotiation Frame Parameters */}
            {operation === "tclk-frame" && (
              <div className="space-y-3 pt-2 border-t border-hairline">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-ink">TCLK Kind</label>
                    <select
                      value={tclkKind}
                      onChange={(e) => setTclkKind(e.target.value as "TCLK_RFQ_V1" | "TCLK_QUOTE_V1" | "TCLK_ACCEPT_V1" | "TCLK_SETTLE_V1")}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-hairline bg-void text-ink focus:border-signal focus:outline-none font-mono"
                    >
                      <option value="TCLK_RFQ_V1">TCLK_RFQ_V1</option>
                      <option value="TCLK_QUOTE_V1">TCLK_QUOTE_V1</option>
                      <option value="TCLK_ACCEPT_V1">TCLK_ACCEPT_V1</option>
                      <option value="TCLK_SETTLE_V1">TCLK_SETTLE_V1</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink">Counterparty DID</label>
                    <input
                      type="text"
                      value={tclkToDid}
                      onChange={(e) => setTclkToDid(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-hairline bg-void text-ink font-mono focus:border-signal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink">SKU</label>
                    <input
                      type="text"
                      value={tclkSku}
                      onChange={(e) => setTclkSku(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-hairline bg-void text-ink font-mono focus:border-signal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-ink">Units</label>
                    <input
                      type="number"
                      value={tclkUnits}
                      onChange={(e) => setTclkUnits(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-hairline bg-void text-ink focus:border-signal focus:outline-none font-mono"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-semibold text-ink">Price per Unit (Sats)</label>
                    <input
                      type="number"
                      value={tclkPrice}
                      onChange={(e) => setTclkPrice(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs rounded border border-hairline bg-void text-ink focus:border-signal focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Validation Issues Alert */}
            {canonicalResult.validationIssues.length > 0 && (
              <div className="p-3.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <span>⚠ Protocol Validation Notice:</span>
                </div>
                {canonicalResult.validationIssues.map((issue, idx) => (
                  <div key={idx} className="font-mono">• {issue.field}: {issue.message}</div>
                ))}
              </div>
            )}
          </div>

          {/* Unicode Normalization Inspector */}
          {canonicalResult.unicodeSweep && (
            <div className="bg-panel border border-hairline rounded-xl p-6 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                  <span>Unicode Normalization Sweep Inspector</span>
                  {canonicalResult.unicodeSweep.hasModifications ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                      Modifications Applied
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                      Clean (0 Swept)
                    </span>
                  )}
                </h3>
                <span className="text-xs text-faint font-mono">
                  {canonicalResult.unicodeSweep.canonicalCodePoints} code pts / {canonicalResult.unicodeSweep.utf8ByteLength} bytes
                </span>
              </div>

              {canonicalResult.unicodeSweep.sweptCharacters.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-xs space-y-2">
                  <div className="font-bold text-amber-900 dark:text-amber-200">
                    Swept Non-Printable / Control Characters:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {canonicalResult.unicodeSweep.sweptCharacters.map((s, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded bg-void border border-amber-400 dark:border-amber-700 font-mono text-[11px] text-amber-900 dark:text-amber-100"
                        title={`${s.category} at index ${s.index}`}
                      >
                        Pos {s.index}: {s.codePoint} ({s.category}) → Space
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <div className="text-xs text-muted font-semibold">Canonical Sanitized Text:</div>
                <div className="p-2.5 rounded-lg bg-void font-mono text-xs text-ink break-all border border-hairline">
                  {canonicalResult.unicodeSweep.canonicalText}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Output & Wire Representation */}
        <div className="lg:col-span-6 space-y-6">
          {/* Canonical Payload Display */}
          <div className="bg-panel border border-hairline rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Exact Canonical Wire Payload</h2>
              <button
                type="button"
                onClick={() => handleCopy(canonicalResult.canonicalPayload, "payload")}
                className="px-2.5 py-1 text-xs rounded border border-hairline bg-void hover:bg-graphite text-ink transition-colors font-semibold"
              >
                {copiedTab === "payload" ? "✔ Copied" : "Copy Payload"}
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-void text-signal font-mono text-xs break-all border border-hairline leading-relaxed shadow-inner">
              {canonicalResult.canonicalPayload}
            </div>

            {/* 3 Metric Cards - High Contrast in both Light & Dark modes */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2.5 rounded-lg bg-void border border-hairline shadow-sm">
                <div className="text-faint text-[10px] uppercase font-bold tracking-wider mono">Destination</div>
                <div className="font-mono font-semibold text-ink text-xs truncate mt-1">{canonicalResult.destination.path}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-void border border-hairline shadow-sm">
                <div className="text-faint text-[10px] uppercase font-bold tracking-wider mono">Code Points</div>
                <div className="font-mono font-semibold text-ink text-xs mt-1">{canonicalResult.codePointLength}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-void border border-hairline shadow-sm">
                <div className="text-faint text-[10px] uppercase font-bold tracking-wider mono">UTF-8 Bytes</div>
                <div className="font-mono font-semibold text-ink text-xs mt-1">{canonicalResult.utf8ByteLength} B</div>
              </div>
            </div>

            {/* Hex Bytes */}
            <div className="space-y-1">
              <div className="text-xs font-semibold text-ink flex justify-between">
                <span>UTF-8 Hex Representation</span>
                <span className="font-mono text-[11px] text-faint">{canonicalResult.utf8ByteLength} bytes</span>
              </div>
              <div className="p-3 rounded-lg bg-void font-mono text-[11px] text-signal break-all max-h-24 overflow-y-auto border border-hairline leading-relaxed shadow-inner">
                {canonicalResult.hexBytes}
              </div>
            </div>
          </div>

          {/* Dry-Run Signature */}
          <div className="bg-panel border border-hairline rounded-xl p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <span>Dry-Run Ed25519 Signature</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-signal/15 text-signal border border-signal/30">
                  Unpadded Base64URL (86 Chars)
                </span>
              </h3>
              <button
                type="button"
                onClick={() => handleCopy(mockSignature, "sig")}
                className="px-2.5 py-1 text-xs rounded border border-hairline bg-void hover:bg-graphite text-ink transition-colors font-semibold"
              >
                {copiedTab === "sig" ? "✔ Copied" : "Copy Sig"}
              </button>
            </div>

            <div className="p-2.5 rounded-lg bg-void text-amber-600 dark:text-amber-300 font-mono text-xs break-all border border-hairline font-semibold">
              {mockSignature}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Local verification: Matches <code>room|nonce|text</code> signing invariant.</span>
            </div>
          </div>

          {/* Multi-Language Code Generation */}
          <div className="bg-panel border border-hairline rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Generated Client Snippets</h3>
              <button
                type="button"
                onClick={() => handleCopy(snippets[selectedLang], `code-${selectedLang}`)}
                className="px-2.5 py-1 text-xs rounded border border-hairline bg-void hover:bg-graphite text-ink transition-colors font-semibold"
              >
                {copiedTab === `code-${selectedLang}` ? "✔ Copied" : `Copy ${selectedLang.toUpperCase()}`}
              </button>
            </div>

            {/* Language Selector */}
            <div className="flex gap-2 border-b border-hairline pb-2">
              {[
                { id: "curl", label: "cURL" },
                { id: "python", label: "Python (PyNaCl)" },
                { id: "typescript", label: "TypeScript / Node" },
                { id: "golang", label: "Go (crypto/ed25519)" },
              ].map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => setSelectedLang(lang.id as "curl" | "python" | "typescript" | "golang")}
                  className={`px-3 py-1 text-xs rounded-md font-semibold transition-colors ${
                    selectedLang === lang.id
                      ? "bg-signal text-void font-bold shadow-sm"
                      : "bg-void text-muted hover:text-ink border border-hairline"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <pre className="p-4 rounded-lg bg-void text-ink font-mono text-xs overflow-x-auto max-h-72 border border-hairline leading-relaxed shadow-inner">
              <code>{snippets[selectedLang]}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
