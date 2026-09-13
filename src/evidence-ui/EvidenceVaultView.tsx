"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { buttonClasses } from "../ui/buttonStyles.ts";
import { CopyButton } from "../ui/copy.tsx";
import { fetchLiveContributionRecord } from "../evidence/fetch.ts";
import { formatEvidenceJson, formatEvidenceMarkdown, importAndVerifyEvidence } from "../evidence/format.ts";
import { clearAllEvidence, deleteEvidence, getStorageSummary, loadAllEvidence, saveEvidence } from "../evidence/storage.ts";
import { filterEvidenceRecords } from "../evidence/filter.ts";
import type {
  ContributionEvidenceV1,
  EvidenceProvenance,
  EvidenceVerificationDetails,
} from "../evidence/types.ts";
import { createContributionEvidence } from "../evidence/verify.ts";
import { extractSafeHandoffParams } from "../workspace/handoff.ts";
import { recordEvidenceAction } from "../activity/recorder.ts";

export const EvidenceVaultView: React.FC = () => {
  const searchParams = useSearchParams();

  // Form State
  const [topic, setTopic] = useState<string>("Technocore Agent Starter Development");
  const [contributionUrl, setContributionUrl] = useState<string>("https://github.com/MdDevCoder/technocore-agent-starter");
  const [projectName, setProjectName] = useState<string>("technocore-agent-starter");
  const [gitCommit, setGitCommit] = useState<string>("");
  const [xUrl, setXUrl] = useState<string>("");
  const [room, setRoom] = useState<string>("technocore");
  const [seqInput, setSeqInput] = useState<string>("120684");
  const [serverTimestamp, setServerTimestamp] = useState<string>("1789200000000");
  const [did, setDid] = useState<string>("did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw");
  const [nonce, setNonce] = useState<string>("1789200000000");
  const [text, setText] = useState<string>("I published a contribution for Technocore by @flop_labs. It helps people understand how to set up an agent on a Linux VPS.");
  const [signature, setSignature] = useState<string>("i_vHcZPue4bMgn3EBaAyC-H-N59E3mzeseS5fB02yvRJ7TUewuAQfam1QRBDQ6ke7kNBIBmBnH3taHfghdN1Bw");
  const [provenance, setProvenance] = useState<EvidenceProvenance>("SERVER_RETRIEVED");
  const [sourceEndpoint, setSourceEndpoint] = useState<string>("https://technocore.chat/r/technocore?format=json");
  const [sourceMethod, setSourceMethod] = useState<"GET" | "MANUAL">("GET");

  // Fetch / Async State
  const [isFetchingLive, setIsFetchingLive] = useState<boolean>(false);
  const [fetchNotice, setFetchNotice] = useState<{ type: "success" | "warning" | "error"; msg: string } | null>(null);

  // Verification & Active Evidence State
  const [verificationDetails, setVerificationDetails] = useState<EvidenceVerificationDetails | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<ContributionEvidenceV1 | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Saved Vault Repository State
  const [savedRecords, setSavedRecords] = useState<ContributionEvidenceV1[]>([]);
  const [storageSummary, setStorageSummary] = useState(getStorageSummary());
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Memoized case-insensitive filtered records
  const filteredRecords = useMemo(() => {
    return filterEvidenceRecords(savedRecords, searchQuery);
  }, [savedRecords, searchQuery]);

  // Import Modal State
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [importJsonText, setImportJsonText] = useState<string>("");
  const [importResult, setImportResult] = useState<{ success?: boolean; message: string } | null>(null);

  // Load vault records on mount
  const refreshVault = useCallback(() => {
    const list = loadAllEvidence();
    setSavedRecords(list);
    setStorageSummary(getStorageSummary());
  }, []);

  useEffect(() => {
    refreshVault();
  }, [refreshVault]);

  // Sync incoming searchParams safe context
  useEffect(() => {
    if (!searchParams) return;
    const safe = extractSafeHandoffParams(searchParams, "evidence");
    if (safe.project) setProjectName(safe.project);
    if (safe.did) setDid(safe.did);
    if (safe.room) setRoom(safe.room);
    const qSeq = searchParams.get("seq");
    if (qSeq) setSeqInput(qSeq);
    const qTopic = searchParams.get("topic");
    if (qTopic) setTopic(qTopic);
    const qUrl = searchParams.get("url");
    if (qUrl) setContributionUrl(qUrl);
    const qCommit = searchParams.get("commit");
    if (qCommit) setGitCommit(qCommit);
  }, [searchParams]);

  // Run Verification
  const handleVerify = useCallback(async () => {
    setIsVerifying(true);
    setSaveFeedback(null);
    try {
      const parsedSeq = parseInt(seqInput, 10) || 0;
      const { evidence, verification } = await createContributionEvidence({
        contributionUrl,
        topic,
        room,
        seq: parsedSeq,
        serverTimestamp: serverTimestamp || Date.now(),
        did,
        nonce,
        text,
        signature,
        sourceEndpoint,
        sourceMethod,
        provenance,
        gitCommit,
        projectName,
        xUrl,
      });

      setVerificationDetails(verification);
      setActiveEvidence(evidence);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVerificationDetails({
        verified: false,
        status: "INSUFFICIENT_EVIDENCE",
        canonicalPayload: `${room}|${nonce}|${text}`,
        utf8ByteLength: 0,
        canonicalPayloadSha256: "",
        did,
        signatureLength: signature.length,
        evidenceSha256: "",
        provenance,
        failureReason: msg,
      });
      setActiveEvidence(null);
    } finally {
      setIsVerifying(false);
    }
  }, [contributionUrl, topic, room, seqInput, serverTimestamp, did, nonce, text, signature, sourceEndpoint, sourceMethod, provenance, gitCommit, projectName, xUrl]);

  // Handle Live Record Fetch
  const handleFetchLiveRecord = useCallback(async () => {
    const targetSeq = parseInt(seqInput, 10);
    if (!targetSeq || targetSeq < 0) {
      setFetchNotice({ type: "error", msg: "Please enter a valid numeric sequence number." });
      return;
    }

    setIsFetchingLive(true);
    setFetchNotice(null);

    try {
      const result = await fetchLiveContributionRecord(room, targetSeq);
      if (result.found && result.record) {
        setDid(result.record.did);
        setNonce(result.record.nonce);
        setText(result.record.text);
        setSignature(result.record.signature);
        setServerTimestamp(String(result.record.serverTimestamp));
        setSourceEndpoint(result.record.sourceEndpoint);
        setSourceMethod("GET");
        setProvenance("SERVER_RETRIEVED");
        setFetchNotice({
          type: "success",
          msg: `✓ Found live record sequence ${targetSeq} in /r/${room}! Cryptographic proof fields populated.`,
        });

        // Immediately verify the fetched record
        const { evidence, verification } = await createContributionEvidence({
          contributionUrl,
          topic,
          room: result.record.room,
          seq: result.record.seq,
          serverTimestamp: result.record.serverTimestamp,
          did: result.record.did,
          nonce: result.record.nonce,
          text: result.record.text,
          signature: result.record.signature,
          sourceEndpoint: result.record.sourceEndpoint,
          sourceMethod: "GET",
          provenance: "SERVER_RETRIEVED",
          gitCommit,
          projectName,
          xUrl,
        });
        setVerificationDetails(verification);
        setActiveEvidence(evidence);
      } else {
        setFetchNotice({
          type: "warning",
          msg: result.reason || "RECORD NOT CURRENTLY RETAINED: Record has aged out of the live public room buffer. You may enter historical fields manually below.",
        });
        setProvenance("MANUAL_HISTORICAL");
        setSourceMethod("MANUAL");
        setSourceEndpoint("MANUAL_ENTRY");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFetchNotice({ type: "error", msg: `Fetch query error: ${msg}` });
    } finally {
      setIsFetchingLive(false);
    }
  }, [room, seqInput, contributionUrl, topic, gitCommit, projectName, xUrl]);

  // Save active evidence to localStorage
  const handleSaveToVault = useCallback(() => {
    if (!activeEvidence) return;
    const res = saveEvidence(activeEvidence);
    if (res.success) {
      setSaveFeedback("✓ Evidence record successfully preserved in local vault!");
      recordEvidenceAction(
        "Evidence Preserved",
        activeEvidence.room,
        activeEvidence.seq,
        activeEvidence.verificationStatus === "VERIFIED",
        activeEvidence.provenance,
      );
      refreshVault();
    } else {
      setSaveFeedback(`✕ Failed to save: ${res.reason}`);
    }
  }, [activeEvidence, refreshVault]);

  // Export JSON file
  const handleExportJson = useCallback((evidence: ContributionEvidenceV1) => {
    const jsonStr = formatEvidenceJson(evidence);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `technocore-evidence-${evidence.room}-seq${evidence.seq}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Export Markdown file
  const handleExportMarkdown = useCallback((evidence: ContributionEvidenceV1) => {
    const mdStr = formatEvidenceMarkdown(evidence);
    const blob = new Blob([mdStr], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `technocore-evidence-${evidence.room}-seq${evidence.seq}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Delete record from vault
  const handleDeleteRecord = useCallback((hash: string) => {
    if (window.confirm("Are you sure you want to delete this locally preserved evidence record? (This affects your local vault only)")) {
      deleteEvidence(hash);
      refreshVault();
      if (activeEvidence?.evidenceSha256 === hash) {
        setActiveEvidence(null);
        setVerificationDetails(null);
      }
    }
  }, [activeEvidence, refreshVault]);

  // Import JSON handler
  const handleImportJson = useCallback(async () => {
    if (!importJsonText.trim()) return;
    const res = await importAndVerifyEvidence(importJsonText);
    if (res.ok && res.evidence) {
      saveEvidence(res.evidence);
      refreshVault();
      setActiveEvidence(res.evidence);
      if (res.verification) setVerificationDetails(res.verification);
      setImportResult({ success: true, message: `✓ Successfully imported and verified evidence for /r/${res.evidence.room} seq ${res.evidence.seq}!` });
      setTimeout(() => {
        setImportModalOpen(false);
        setImportJsonText("");
        setImportResult(null);
      }, 1500);
    } else {
      setImportResult({
        success: false,
        message: `✕ Import rejected (${res.status}): ${res.reason || "Invalid evidence package"}`,
      });
    }
  }, [importJsonText, refreshVault]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* ---------- Top Header & Trust Badges ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-hairline pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="mono text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded bg-signal/15 text-signal border border-signal/30">
              Preserve &amp; Verify
            </span>
            <span className="mono text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
              ● LOCAL EVIDENCE
            </span>
            <span className="mono text-[10px] font-bold text-muted bg-void px-2 py-0.5 rounded border border-hairline">
              0 NETWORK WRITE
            </span>
          </div>
          <h1 className="display text-ink text-2xl sm:text-3xl font-extrabold tracking-tight">
            Contribution Evidence Vault
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1 max-w-2xl">
            Preserve and cryptographically verify durable public proof for your signed Technocore contributions before live public room retention windows advance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className={buttonClasses("secondary", "sm", "mono text-xs font-semibold")}
          >
            📥 Import Evidence JSON
          </button>
        </div>
      </div>

      {/* ---------- Strict Proof Boundary Notice ---------- */}
      <div className="p-4 rounded-xl border border-hairline bg-panel/70 backdrop-blur-sm space-y-2 text-xs">
        <div className="flex items-center gap-2 text-ink font-semibold">
          <span className="text-signal">ℹ</span>
          <span>Proof &amp; Retention Boundary Notice</span>
        </div>
        <p className="text-muted leading-relaxed">
          This tool generates <strong>locally preserved evidence of a Technocore signed record</strong>. Technocore public rooms operate with bounded retention, and server-side records may age out independently of this local copy.
        </p>
        <p className="text-faint text-[11px] mono">
          Zero Custody · Read-Only GET Lookup · No Mutations · Does not create contributions or guarantee rewards.
        </p>
      </div>

      {/* ---------- Section 1: Capture Evidence ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form (7 cols) */}
        <div className="lg:col-span-7 p-6 rounded-xl border border-hairline bg-panel space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-signal mono">
                1. Capture Contribution Record
              </h2>
              <p className="text-xs text-muted">
                Fetch directly from public network stream or supply historical record fields.
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setProvenance("SERVER_RETRIEVED");
                  setSourceMethod("GET");
                }}
                className={`px-2 py-0.5 rounded text-[11px] mono font-bold transition-colors ${
                  provenance === "SERVER_RETRIEVED"
                    ? "bg-signal text-void"
                    : "bg-void text-muted hover:text-ink border border-hairline"
                }`}
              >
                Live GET
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvenance("MANUAL_HISTORICAL");
                  setSourceMethod("MANUAL");
                  setSourceEndpoint("MANUAL_ENTRY");
                }}
                className={`px-2 py-0.5 rounded text-[11px] mono font-bold transition-colors ${
                  provenance === "MANUAL_HISTORICAL"
                    ? "bg-amber-500 text-void"
                    : "bg-void text-muted hover:text-ink border border-hairline"
                }`}
              >
                Manual Entry
              </button>
            </div>
          </div>

          {/* Provenance Tag Display */}
          <div className="flex items-center justify-between text-xs mono">
            <span className="text-muted text-[11px]">Current Record Provenance:</span>
            <span
              className={`px-2.5 py-0.5 rounded font-bold text-[10px] uppercase border ${
                provenance === "SERVER_RETRIEVED"
                  ? "bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/30"
                  : "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30"
              }`}
            >
              {provenance === "SERVER_RETRIEVED"
                ? "SERVER-RETRIEVED EVIDENCE"
                : "MANUALLY PROVIDED HISTORICAL RECORD"}
            </span>
          </div>

          {/* Form Fields */}
          <div className="space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                  Topic / Summary:
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Agent Deployment Guide"
                  className="w-full rounded border border-hairline bg-void px-3 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                />
              </div>

              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                  Contribution URL:
                </label>
                <input
                  type="text"
                  value={contributionUrl}
                  onChange={(e) => setContributionUrl(e.target.value)}
                  placeholder="https://github.com/... or https://x.com/..."
                  className="w-full rounded border border-hairline bg-void px-3 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                />
              </div>
            </div>

            {/* Room & Sequence Fetch Bar */}
            <div className="p-3.5 rounded-lg bg-void border border-hairline space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase mono text-signal">
                  Room &amp; Sequence Lookup
                </span>
                <span className="text-[10px] text-muted mono">Read-Only GET</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-5">
                  <div className="flex items-center gap-1">
                    <span className="text-muted text-xs mono">/r/</span>
                    <input
                      type="text"
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      placeholder="technocore"
                      className="w-full rounded border border-hairline bg-panel px-2.5 py-1 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                    />
                  </div>
                </div>

                <div className="sm:col-span-4">
                  <input
                    type="number"
                    value={seqInput}
                    onChange={(e) => setSeqInput(e.target.value)}
                    placeholder="Sequence #"
                    className="w-full rounded border border-hairline bg-panel px-2.5 py-1 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="button"
                    onClick={handleFetchLiveRecord}
                    disabled={isFetchingLive}
                    className="w-full rounded bg-signal px-2 py-1 text-xs mono font-bold text-void hover:bg-signal/90 transition-colors disabled:opacity-50"
                  >
                    {isFetchingLive ? "Fetching..." : "Fetch Record"}
                  </button>
                </div>
              </div>

              {/* Quick Room Selector */}
              <div className="flex items-center gap-1.5 pt-1 text-[11px] mono text-muted">
                <span>Rooms:</span>
                {["technocore", "lobby", "events", "tclk-offers"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRoom(r)}
                    className={`px-1.5 py-0.2 rounded ${room === r ? "text-signal font-bold" : "hover:text-ink"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>

              {fetchNotice && (
                <div
                  className={`p-2.5 rounded text-[11px] mono border ${
                    fetchNotice.type === "success"
                      ? "bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/30"
                      : fetchNotice.type === "warning"
                        ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30"
                        : "bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/30"
                  }`}
                >
                  {fetchNotice.msg}
                </div>
              )}
            </div>

            {/* Cryptographic Proof Fields */}
            <div className="space-y-2.5 pt-1">
              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                  Agent DID:
                </label>
                <input
                  type="text"
                  value={did}
                  onChange={(e) => setDid(e.target.value)}
                  placeholder="did:key:z6Mk..."
                  className="w-full rounded border border-hairline bg-void px-3 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                    Nonce (Nanoseconds / Epoch):
                  </label>
                  <input
                    type="text"
                    value={nonce}
                    onChange={(e) => setNonce(e.target.value)}
                    placeholder="1789200000000"
                    className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                    Server Timestamp:
                  </label>
                  <input
                    type="text"
                    value={serverTimestamp}
                    onChange={(e) => setServerTimestamp(e.target.value)}
                    placeholder="Server recorded timestamp"
                    className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                  Signed Wire Message Text:
                </label>
                <textarea
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Contribution message body..."
                  className="w-full rounded border border-hairline bg-void p-2.5 text-ink font-mono text-xs focus:border-signal focus:outline-none resize-none leading-relaxed"
                />
              </div>

              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                  Signature (86-character Base64URL):
                </label>
                <input
                  type="text"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Base64URL signature..."
                  className="w-full rounded border border-hairline bg-void px-3 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                />
              </div>

              {/* Optional Metadata Toggle */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] mono">
                <div>
                  <label className="text-faint block text-[9px] uppercase mb-0.5">Project Name:</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Optional project"
                    className="w-full rounded border border-hairline bg-void px-2 py-1 text-ink text-xs focus:border-signal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-faint block text-[9px] uppercase mb-0.5">Git Commit:</label>
                  <input
                    type="text"
                    value={gitCommit}
                    onChange={(e) => setGitCommit(e.target.value)}
                    placeholder="Optional SHA"
                    className="w-full rounded border border-hairline bg-void px-2 py-1 text-ink text-xs focus:border-signal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-faint block text-[9px] uppercase mb-0.5">X URL:</label>
                  <input
                    type="text"
                    value={xUrl}
                    onChange={(e) => setXUrl(e.target.value)}
                    placeholder="Optional tweet"
                    className="w-full rounded border border-hairline bg-void px-2 py-1 text-ink text-xs focus:border-signal focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="pt-3 border-t border-hairline flex items-center justify-between">
              <button
                type="button"
                onClick={handleVerify}
                disabled={isVerifying}
                className={buttonClasses("primary", "md", "mono text-xs font-bold w-full sm:w-auto")}
              >
                {isVerifying ? "Verifying..." : "▶ Cryptographically Verify Evidence"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Verification Result & Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Verification Outcome Card */}
          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-signal mono">
                2. Verification Inspector
              </h2>
              <span className="mono text-[10px] text-muted">WebCrypto-Ed25519</span>
            </div>

            {verificationDetails ? (
              <div className="space-y-4 text-xs mono">
                {/* Result Pill */}
                <div
                  className={`p-3 rounded-lg border flex items-center justify-between ${
                    verificationDetails.verified
                      ? "bg-teal-500/15 border-teal-500/40 text-teal-800 dark:text-teal-300"
                      : verificationDetails.status === "INVALID_SIGNATURE"
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-800 dark:text-rose-300"
                        : "bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300"
                  }`}
                >
                  <span className="font-extrabold text-xs">
                    {verificationDetails.verified
                      ? "✓ CRYPTOGRAPHICALLY VERIFIED"
                      : verificationDetails.status === "INVALID_SIGNATURE"
                        ? "✕ INVALID SIGNATURE"
                        : "⚠ INSUFFICIENT EVIDENCE"}
                  </span>
                  <span className="text-[10px] font-semibold">
                    {verificationDetails.provenance === "SERVER_RETRIEVED"
                      ? "SERVER-RETRIEVED"
                      : "MANUAL RECORD"}
                  </span>
                </div>

                {verificationDetails.failureReason && (
                  <p className="text-rose-600 dark:text-rose-400 text-[11px]">
                    Reason: {verificationDetails.failureReason}
                  </p>
                )}

                {/* Canonical Wire Payload Reconstructed */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted text-[10px] uppercase font-semibold">
                      Reconstructed Canonical Payload:
                    </span>
                    <span className="text-faint text-[10px]">
                      {verificationDetails.utf8ByteLength} UTF-8 Bytes
                    </span>
                  </div>
                  <div className="p-2.5 rounded bg-void border border-hairline text-signal break-all text-[11px] select-all max-h-24 overflow-y-auto">
                    {verificationDetails.canonicalPayload}
                  </div>
                </div>

                {/* Payload SHA-256 Digest */}
                <div className="space-y-1">
                  <span className="text-muted text-[10px] uppercase font-semibold block">
                    Payload SHA-256:
                  </span>
                  <div className="p-2 rounded bg-void border border-hairline text-faint text-[10px] break-all select-all">
                    {verificationDetails.canonicalPayloadSha256 || "N/A"}
                  </div>
                </div>

                {/* Deterministic Evidence Hash */}
                {activeEvidence && (
                  <div className="space-y-1 pt-2 border-t border-hairline">
                    <div className="flex items-center justify-between">
                      <span className="text-muted text-[10px] uppercase font-semibold">
                        Evidence Package SHA-256:
                      </span>
                      <CopyButton value={activeEvidence.evidenceSha256} label="evidence hash" variant="ghost" />
                    </div>
                    <div className="p-2 rounded bg-void border border-signal/30 text-ink text-[10px] break-all select-all font-mono font-bold">
                      {activeEvidence.evidenceSha256}
                    </div>
                  </div>
                )}

                {/* Save & Export Buttons */}
                {activeEvidence && (
                  <div className="space-y-2 pt-3 border-t border-hairline">
                    <button
                      type="button"
                      onClick={handleSaveToVault}
                      className="w-full rounded-lg bg-signal px-3.5 py-2 text-xs mono font-bold text-void hover:bg-signal/90 transition-colors shadow-sm"
                    >
                      💾 Save to Local Evidence Vault
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportJson(activeEvidence)}
                        className="rounded bg-void border border-hairline px-2.5 py-1.5 text-[11px] mono text-ink hover:text-signal hover:border-signal/40 transition-colors"
                      >
                        {`{ }`} Export JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMarkdown(activeEvidence)}
                        className="rounded bg-void border border-hairline px-2.5 py-1.5 text-[11px] mono text-ink hover:text-signal hover:border-signal/40 transition-colors"
                      >
                        📄 Export Markdown
                      </button>
                    </div>

                    {saveFeedback && (
                      <p className="text-[11px] font-bold text-teal-700 dark:text-teal-300 text-center">
                        {saveFeedback}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-muted text-xs mono space-y-2 border border-dashed border-hairline rounded-lg">
                <p>No verification performed yet.</p>
                <p className="text-[11px] text-faint">
                  Click &ldquo;Fetch Record&rdquo; or &ldquo;Cryptographically Verify Evidence&rdquo; to evaluate the Ed25519 signature and generate the integrity digest.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Section 3: Saved Evidence Timeline ---------- */}
      <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-signal mono">
              3. Locally Preserved Evidence Timeline
            </h2>
            <p className="text-xs text-muted">
              Records retained in your dedicated browser storage ({savedRecords.length} / {storageSummary.maxCapacity} capacity).
            </p>
          </div>

          {savedRecords.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Clear all locally preserved evidence records? (Local vault only)")) {
                  clearAllEvidence();
                  refreshVault();
                }
              }}
              className="text-[11px] mono text-rose-600 hover:underline"
            >
              Clear Local Vault
            </button>
          )}
        </div>

        {savedRecords.length > 0 && (
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search evidence by SHA-256 hash (case-insensitive), topic, DID, or seq..."
              className="w-full p-2.5 pl-8 rounded-lg bg-void border border-hairline text-ink text-xs mono focus:border-signal outline-none transition-colors"
              aria-label="Search evidence records"
            />
            <span className="absolute left-2.5 top-2.5 text-muted text-xs">🔍</span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted hover:text-ink text-xs mono"
                aria-label="Clear search query"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {savedRecords.length > 0 ? (
          filteredRecords.length > 0 ? (
            <div className="space-y-3">
              {filteredRecords.map((item) => (
                <div
                  key={item.evidenceSha256}
                  className="p-4 rounded-lg bg-void border border-hairline space-y-2 text-xs mono hover:border-signal/40 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm">
                        /r/{item.room} <span className="text-signal">seq {item.seq}</span>
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.2 rounded font-bold uppercase border ${
                          item.provenance === "SERVER_RETRIEVED"
                            ? "bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/25"
                            : "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25"
                        }`}
                      >
                        {item.provenance === "SERVER_RETRIEVED" ? "SERVER-RETRIEVED" : "MANUAL HISTORICAL"}
                      </span>
                      <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400">
                        ✓ {item.verificationStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleExportJson(item)}
                        className="px-2 py-1 rounded bg-panel border border-hairline text-[10px] text-muted hover:text-ink"
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportMarkdown(item)}
                        className="px-2 py-1 rounded bg-panel border border-hairline text-[10px] text-muted hover:text-ink"
                      >
                        MD
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRecord(item.evidenceSha256)}
                        className="px-2 py-1 rounded bg-panel border border-rose-500/30 text-[10px] text-rose-600 hover:bg-rose-500/10"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-muted">
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Topic:</span>
                      <span className="text-ink truncate block">{item.topic}</span>
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Agent DID:</span>
                      <span className="text-ink truncate block select-all">{item.did}</span>
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Integrity SHA-256:</span>
                      <span className="text-faint truncate block font-mono">{item.evidenceSha256}</span>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-panel/60 border border-hairline text-ink text-[11px] truncate">
                    &ldquo;{item.text}&rdquo;
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-muted text-xs mono space-y-2 border border-hairline rounded-lg bg-void">
              <p>No preserved evidence records match &ldquo;{searchQuery}&rdquo;.</p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-signal hover:underline text-[11px]"
              >
                Clear search filter
              </button>
            </div>
          )
        ) : (
          <div className="p-8 text-center text-muted text-xs mono space-y-1">
            <p>No contribution evidence saved in local vault.</p>
            <p className="text-[11px] text-faint">
              Capture or import a record above to preserve evidence locally.
            </p>
          </div>
        )}
      </div>

      {/* ---------- Import JSON Modal ---------- */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-signal mono">
                Import Contribution Evidence JSON
              </h3>
              <button
                type="button"
                onClick={() => {
                  setImportModalOpen(false);
                  setImportResult(null);
                }}
                className="text-muted hover:text-ink text-sm font-mono"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Paste the contents of a previously exported <code className="text-ink font-mono">technocore-contribution-evidence-v1</code> JSON file. The verifier will independently re-calculate the canonical payload, Ed25519 signature, and SHA-256 integrity hash.
            </p>

            <textarea
              rows={8}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste evidence JSON here..."
              className="w-full rounded border border-hairline bg-void p-3 text-ink font-mono text-xs focus:border-signal focus:outline-none resize-none"
            />

            {importResult && (
              <div
                className={`p-2.5 rounded text-xs mono border ${
                  importResult.success
                    ? "bg-teal-500/10 text-teal-800 dark:text-teal-300 border-teal-500/30"
                    : "bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/30"
                }`}
              >
                {importResult.message}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => {
                  setImportModalOpen(false);
                  setImportResult(null);
                }}
                className={buttonClasses("ghost", "sm", "mono text-xs")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportJson}
                className={buttonClasses("primary", "sm", "mono text-xs font-bold")}
              >
                Import &amp; Verify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
