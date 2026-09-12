/**
 * Technocore Signature Doctor: Forensic Wire Debugger & Differential Diagnostic Console.
 *
 * Provides in-browser and public-observation forensic analysis of Ed25519 room messages,
 * testing 8 mutation classes against canonical Technocore wire semantics.
 */

"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { diagnoseSignature, type DiagnosticReport } from "../technocore/diagnostics/signature-doctor.ts";
import { extractSafeHandoffParams } from "../workspace/handoff.ts";
import { HandoffBanner } from "../workspace-ui/HandoffBanner.tsx";

interface SignatureDoctorViewProps {
  readonly initialParams?: {
    readonly room?: string;
    readonly did?: string;
    readonly nonce?: string;
    readonly text?: string;
    readonly sig?: string;
    readonly source?: string;
  };
}

const SAMPLE_ROOMS = ["events", "general", "tclk-offers", "market", "civilization", "lobby", "meta", "technocore"] as const;

export const SignatureDoctorView: React.FC<SignatureDoctorViewProps> = ({ initialParams }) => {
  const searchParams = useSearchParams();

  const [room, setRoom] = useState<string>("events");
  const [did, setDid] = useState<string>("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
  const [nonce, setNonce] = useState<string>("1789200001000");
  const [text, setText] = useState<string>('{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED"}');
  const [signature, setSignature] = useState<string>("");
  const [sourceTag, setSourceTag] = useState<string>("MANUAL");

  // Sync parameters from safe handoff
  useEffect(() => {
    if (!searchParams && !initialParams) return;
    const safe = extractSafeHandoffParams(searchParams, "doctor");
    if (safe.room) setRoom(safe.room);
    else if (initialParams?.room) setRoom(initialParams.room);

    if (safe.did) setDid(safe.did);
    else if (initialParams?.did) setDid(initialParams.did);

    if (safe.nonce) setNonce(safe.nonce);
    else if (initialParams?.nonce) setNonce(initialParams.nonce);

    if (safe.text) setText(safe.text);
    else if (initialParams?.text) setText(initialParams.text);

    if (safe.sig) setSignature(safe.sig);
    else if (initialParams?.sig) setSignature(initialParams.sig);

    if (safe.source) setSourceTag(safe.source);
    else if (initialParams?.source) setSourceTag(initialParams.source);
  }, [searchParams, initialParams]);

  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Run diagnosis
  const runDiagnosis = useCallback(async () => {
    startTransition(async () => {
      const result = await diagnoseSignature({
        room,
        did,
        nonce,
        text,
        signature,
      });
      setReport(result);
    });
  }, [room, did, nonce, text, signature]);

  useEffect(() => {
    runDiagnosis();
  }, [runDiagnosis]);

  const triggerCopy = useCallback((content: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(content);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  // Quick preset loading for demonstration
  const loadPreset = (presetType: "SLASH_R" | "TRIMMED" | "CROSS_ROOM") => {
    setSourceTag("PRESET / DEMONSTRATION");
    if (presetType === "SLASH_R") {
      setRoom("events");
      setDid("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
      setNonce("1789200002000");
      setText("Agent online check-in");
      setSignature("m6nK1w0v7qL9xZ3yA5bC8dE2fG4hJ6kM8nQ1sT3vW5yB7dF9hK2mP4rS6tU8vX0zB2dF4hJ6kL8nQ0sT2vW4xY6zA8b");
    } else if (presetType === "TRIMMED") {
      setRoom("general");
      setDid("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
      setNonce("1789200003000");
      setText("  Status report: 100% operational  ");
      setSignature("k7mP1w0v7qL9xZ3yA5bC8dE2fG4hJ6kM8nQ1sT3vW5yB7dF9hK2mP4rS6tU8vX0zB2dF4hJ6kL8nQ0sT2vW4xY6zA8c");
    } else if (presetType === "CROSS_ROOM") {
      setRoom("market");
      setDid("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
      setNonce("1789200004000");
      setText("Public network deal announcement");
      setSignature("a1bC2dE3fG4hJ5kL6mN7pQ8rS9tU0vW1xY2zA3bC4dE5fG6hJ7kL8mN9pQ0rS1tU2vW3xY4zA5bC6dE7fG8hJ9kL0mN");
    }
  };

  const nodeReproSnippet = `// Node.js 18+ Zero-Dependency Verification
import { verify, createPublicKey } from "node:crypto";

const room = ${JSON.stringify(room)};
const nonce = ${JSON.stringify(nonce)};
const text = ${JSON.stringify(text)};
const signatureBase64Url = ${JSON.stringify(signature)};
const did = ${JSON.stringify(did)};

// 1. Canonical Payload
const payload = Buffer.from(\`\${room}|\${nonce}|\${text}\`, "utf8");

// 2. Decode DID (did:key:z6Mk...)
const multibase = did.slice("did:key:z".length);
// Decode multibase -> extract 32-byte Ed25519 raw public key...
// 3. Verify
// const isValid = verify(null, payload, keyObject, signatureBytes);`;

  const pythonReproSnippet = `# Python 3.10+ Verification (cryptography package)
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
import base64

room = ${JSON.stringify(room)}
nonce = ${JSON.stringify(nonce)}
text = ${JSON.stringify(text)}
signature_b64url = ${JSON.stringify(signature)}

# 1. Canonical Payload Bytes
payload = f"{room}|{nonce}|{text}".encode("utf-8")

# 2. Decode Signature (unpadded Base64URL)
sig_padded = signature_b64url + "=" * ((4 - len(signature_b64url) % 4) % 4)
sig_bytes = base64.urlsafe_b64decode(sig_padded)

# 3. Verify against raw Ed25519 public key bytes
# pubkey.verify(sig_bytes, payload)`;

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 min-h-screen bg-void text-ink font-sans">
      {/* Top Banner & Diagnostic Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-hairline bg-panel shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-3 w-3 rounded-full bg-signal animate-pulse" />
            <h1 className="text-lg font-bold tracking-tight uppercase text-ink">
              Technocore Signature Doctor
            </h1>
            <span className="rounded bg-signal/15 border border-signal/30 px-2 py-0.5 text-xs font-bold text-signal mono">
              FORENSIC WIRE DEBUGGER
            </span>
          </div>
          <p className="text-xs text-muted">
            Deterministic candidate permutation solver to diagnose WHY an Ed25519 signature fails verification against Technocore wire semantics.
          </p>
        </div>

        {/* Source Origin Badge */}
        <div className="flex flex-wrap items-center gap-2 mono text-xs">
          {sourceTag.toUpperCase().includes("OBSERVATORY") ? (
            <span className="rounded bg-sky-500/20 border border-sky-500/40 px-2.5 py-1 text-sky-300 font-bold">
              SOURCE: PUBLIC NETWORK OBSERVATION (Loaded from /observatory)
            </span>
          ) : (
            <span className="rounded bg-panel-high border border-hairline px-2.5 py-1 text-muted font-semibold">
              SOURCE: {sourceTag}
            </span>
          )}
          <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-emerald-400 font-semibold">
            READ-ONLY
          </span>
        </div>
      </div>

      {/* Workspace Context Handoff Banner */}
      <HandoffBanner destination="doctor" />

      {/* Quick Diagnostic Preset Strip */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-hairline bg-panel mono text-xs">
        <span className="text-muted text-[10px] uppercase font-bold">Test Presets:</span>
        <button
          type="button"
          onClick={() => loadPreset("SLASH_R")}
          className="px-2 py-1 rounded bg-void border border-hairline text-signal hover:bg-panel-high transition-colors"
        >
          Preset: /r/events Prefix Bug
        </button>
        <button
          type="button"
          onClick={() => loadPreset("TRIMMED")}
          className="px-2 py-1 rounded bg-void border border-hairline text-signal hover:bg-panel-high transition-colors"
        >
          Preset: Whitespace Trimmed Bug
        </button>
        <button
          type="button"
          onClick={() => loadPreset("CROSS_ROOM")}
          className="px-2 py-1 rounded bg-void border border-hairline text-signal hover:bg-panel-high transition-colors"
        >
          Preset: Cross-Room Replay
        </button>
      </div>

      {/* Main Forensic Grid: Input Panel & Canonical Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h2 className="text-xs font-bold tracking-wider uppercase text-signal mono">
                1. Wire Message Parameters
              </h2>
              <button
                onClick={runDiagnosis}
                disabled={isPending}
                className="rounded px-2.5 py-1 text-xs mono text-signal bg-signal/15 hover:bg-signal/25 border border-signal/30 transition-colors disabled:opacity-50 font-bold"
              >
                {isPending ? "Analyzing..." : "▶ Run Diagnosis"}
              </button>
            </div>

            {/* Room Selector & Input */}
            <div className="space-y-1">
              <label className="text-muted block text-[10px] uppercase font-semibold mono">Room Name:</label>
              <div className="flex flex-wrap gap-1 mb-1.5">
                {SAMPLE_ROOMS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoom(r)}
                    className={`px-2 py-0.5 rounded text-[10px] mono font-semibold transition-all ${
                      room === r
                        ? "bg-signal text-void"
                        : "bg-void border border-hairline text-muted hover:text-ink"
                    }`}
                  >
                    /r/{r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink text-xs mono focus:border-signal focus:outline-none"
              />
            </div>

            {/* Author DID */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-muted block text-[10px] uppercase font-semibold mono">Author DID (did:key:...):</label>
                {report?.didDiagnostics.isValid ? (
                  <span className="text-[10px] text-emerald-400 font-bold mono">✓ Valid Ed25519</span>
                ) : (
                  <span className="text-[10px] text-rose-400 font-bold mono">✗ Invalid DID</span>
                )}
              </div>
              <input
                type="text"
                value={did}
                onChange={(e) => setDid(e.target.value)}
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink text-xs mono focus:border-signal focus:outline-none"
              />
            </div>

            {/* Nonce */}
            <div className="space-y-1">
              <label className="text-muted block text-[10px] uppercase font-semibold mono">Nonce:</label>
              <input
                type="text"
                value={nonce}
                onChange={(e) => setNonce(e.target.value)}
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink text-xs mono focus:border-signal focus:outline-none"
              />
            </div>

            {/* Text Payload */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-muted block text-[10px] uppercase font-semibold mono">Raw Text Payload:</label>
                {text.trim().startsWith("tclk1 ") && (
                  <a
                    href={`/testkit?source=doctor&frame=${encodeURIComponent(text.trim())}`}
                    className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/25 transition-colors mono"
                  >
                    ↗ Validate in TCLK-TestKit
                  </a>
                )}
              </div>
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink text-xs mono focus:border-signal focus:outline-none resize-none"
              />
            </div>

            {/* Signature */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-muted block text-[10px] uppercase font-semibold mono">Signature (86-char Base64URL):</label>
                <span className="text-[10px] mono text-muted">{signature.trim().length} chars</span>
              </div>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Paste 86-character Base64URL signature string..."
                className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink text-xs mono focus:border-signal focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Diagnostic Outcomes & Differential Matrix (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Canonical Verification Banner */}
          <div
            className={`p-4 rounded-xl border shadow-sm ${
              report?.canonicalVerification.verified
                ? "bg-emerald-500/10 dark:bg-emerald-950/25 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                : report?.canonicalVerification.status === "INVALID_SIGNATURE"
                ? "bg-rose-500/10 dark:bg-rose-950/25 border-rose-500/30 text-rose-800 dark:text-rose-300"
                : "bg-panel border-hairline text-muted"
            }`}
          >
            <div className="flex items-center justify-between mb-1 mono">
              <span className="font-bold text-sm tracking-wider uppercase">
                CANONICAL VERIFICATION: {report?.canonicalVerification.status || "IDLE"}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                  report?.canonicalVerification.verified
                    ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                    : "bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-500/30"
                }`}
              >
                {report?.canonicalVerification.verified ? "CANONICAL PASS" : "CANONICAL FAIL"}
              </span>
            </div>
            <p className="text-xs font-sans mt-1">{report?.canonicalVerification.reason}</p>
          </div>

          {/* Differential Permutation Analysis Panel */}
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-3.5 shadow-sm flex-1">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h2 className="text-xs font-bold tracking-wider uppercase text-signal mono">
                2. Differential Mutation Analysis
              </h2>
              <span className="text-[11px] mono text-muted">
                Candidates Tested: {report?.differentialAnalysis.candidatesTested ?? 0}
              </span>
            </div>

            {/* Matched Variant Callout */}
            {report?.canonicalVerification.verified ? (
              <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs mono space-y-1">
                <div className="font-bold uppercase tracking-wider">✓ Verified Under Canonical Rule</div>
                <p className="text-xs font-sans text-emerald-900/90 dark:text-emerald-400/90">
                  The signature strictly verifies against canonical formula: UTF-8(room + &quot;|&quot; + nonce + &quot;|&quot; + text). No candidate mutations needed.
                </p>
              </div>
            ) : report?.differentialAnalysis.matchedVariant ? (
              <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-300 text-xs mono space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-amber-950 dark:text-amber-200">
                    ⚡ Root Cause Identified: {report.differentialAnalysis.matchedCategory}
                  </span>
                  <span className="rounded bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                    CONFIDENCE: {report.differentialAnalysis.confidence}
                  </span>
                </div>
                <p className="text-xs font-sans text-amber-900/90 dark:text-amber-200/90">
                  {report.differentialAnalysis.primaryExplanation}
                </p>

                {/* Remediation Snippet */}
                {report.differentialAnalysis.remediationSnippet && (
                  <div className="mt-2 pt-2 border-t border-amber-500/30">
                    <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400 block mb-1">
                      Actionable Remediation:
                    </span>
                    <pre className="p-2 rounded bg-void border border-hairline text-signal text-[11px] overflow-x-auto select-all">
                      {report.differentialAnalysis.remediationSnippet}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-void border border-hairline text-muted text-xs mono">
                {report?.differentialAnalysis.primaryExplanation}
              </div>
            )}

            {/* Candidate Variant Results Table */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] uppercase font-bold text-muted mono block">
                Permutation Evaluation Breakdown:
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 mono text-xs">
                {report?.differentialAnalysis.candidateResults.map((cand) => (
                  <div
                    key={cand.variantId}
                    className={`p-2 rounded border flex items-center justify-between ${
                      cand.verified
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-300"
                        : "bg-void border-hairline text-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                          cand.verified ? "bg-amber-500/20 text-amber-800 dark:text-amber-300" : "bg-panel-high text-muted"
                        }`}
                      >
                        {cand.category}
                      </span>
                      <span className="truncate">{cand.name}</span>
                    </div>
                    <span className={`text-[10px] font-bold ${cand.verified ? "text-amber-800 dark:text-amber-300" : "text-muted"}`}>
                      {cand.verified ? "MATCHED (NON-CANONICAL)" : "MISMATCH"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forensic Inspectors: Payload, Signature & DID Invariants */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Canonical Payload Inspector */}
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-2.5 shadow-sm text-xs mono">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <h3 className="font-bold uppercase text-signal text-[11px]">Payload Inspector</h3>
            <button
              onClick={() => triggerCopy(report?.canonicalPayloadInfo.rawString || "", "payload")}
              className="text-[10px] text-signal hover:underline font-bold"
            >
              {copiedKey === "payload" ? "✓ Copied" : "Copy Payload"}
            </button>
          </div>
          <div className="space-y-1.5">
            <div>
              <span className="text-muted text-[10px] block">Canonical String:</span>
              <div className="p-1.5 rounded bg-void border border-hairline text-ink break-all max-h-20 overflow-y-auto select-all">
                {report?.canonicalPayloadInfo.rawString}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted text-[10px] block">UTF-8 Length:</span>
                <span className="text-ink font-bold">{report?.canonicalPayloadInfo.utf8ByteLength} bytes</span>
              </div>
              <div>
                <span className="text-muted text-[10px] block">SHA-256 Hash:</span>
                <span className="text-muted truncate block" title={report?.canonicalPayloadInfo.sha256Hash}>
                  {report?.canonicalPayloadInfo.sha256Hash.slice(0, 12)}...
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Signature Inspector */}
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-2.5 shadow-sm text-xs mono">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <h3 className="font-bold uppercase text-signal text-[11px]">Signature Inspector</h3>
            <span className="text-[10px] text-muted">{report?.signatureDiagnostics.length} / 86 chars</span>
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted text-[10px] block">Alphabet:</span>
                <span className="text-ink font-semibold">{report?.signatureDiagnostics.alphabet}</span>
              </div>
              <div>
                <span className="text-muted text-[10px] block">Decoded Size:</span>
                <span className="text-ink font-semibold">{report?.signatureDiagnostics.decodedByteLength} bytes</span>
              </div>
            </div>
            <div>
              <span className="text-muted text-[10px] block">Shape Diagnostic:</span>
              <span className={report?.signatureDiagnostics.isValidShape ? "text-emerald-700 dark:text-emerald-400 font-bold" : "text-rose-700 dark:text-rose-400 font-bold"}>
                {report?.signatureDiagnostics.isValidShape ? "Valid 86-char unpadded Base64URL" : report?.signatureDiagnostics.error || "Invalid Shape"}
              </span>
            </div>
          </div>
        </div>

        {/* 3. DID Inspector */}
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-2.5 shadow-sm text-xs mono">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <h3 className="font-bold uppercase text-signal text-[11px]">DID Inspector</h3>
            <span className="text-[10px] text-muted">0xed01 Multicodec</span>
          </div>
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-muted text-[10px] block">Multibase:</span>
                <span className={report?.didDiagnostics.multibaseValid ? "text-emerald-700 dark:text-emerald-400 font-bold" : "text-rose-700 dark:text-rose-400 font-bold"}>
                  {report?.didDiagnostics.multibaseValid ? "Base58 BTC ('z')" : "Invalid"}
                </span>
              </div>
              <div>
                <span className="text-muted text-[10px] block">Key Length:</span>
                <span className="text-ink font-semibold">{report?.didDiagnostics.extractedKeyLengthBytes} bytes</span>
              </div>
            </div>
            <div>
              <span className="text-muted text-[10px] block">Raw Public Key:</span>
              <span className="text-muted text-[10px] truncate block select-all">
                {report?.didDiagnostics.rawPublicKeyHex || "None"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Offline Code Reproduction Tab */}
      <div className="p-5 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm text-xs mono">
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <h2 className="text-xs font-bold tracking-wider uppercase text-signal">
            Offline Verification Reproduction
          </h2>
          <span className="text-[11px] text-muted">Minimal self-contained snippets</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase text-muted">Node.js / TypeScript:</span>
              <button
                onClick={() => triggerCopy(nodeReproSnippet, "nodeSnippet")}
                className="text-[10px] text-signal hover:underline font-bold"
              >
                {copiedKey === "nodeSnippet" ? "✓ Copied" : "Copy Node"}
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-void border border-hairline text-ink/90 text-[11px] overflow-x-auto select-all">
              {nodeReproSnippet}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase text-muted">Python (cryptography):</span>
              <button
                onClick={() => triggerCopy(pythonReproSnippet, "pythonSnippet")}
                className="text-[10px] text-signal hover:underline font-bold"
              >
                {copiedKey === "pythonSnippet" ? "✓ Copied" : "Copy Python"}
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-void border border-hairline text-ink/90 text-[11px] overflow-x-auto select-all">
              {pythonReproSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
