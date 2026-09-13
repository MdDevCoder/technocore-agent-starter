"use client";

/**
 * Technocore Contribution Center — Main View Component
 *
 * Route: /contributions
 *
 * 7-Stage Evidence-Driven Workflow:
 * 1. PREPARE -> 2. PUBLISH -> 3. RECORD -> 4. CAPTURE -> 5. VERIFY -> 6. PRESERVE -> 7. COMPLETE
 *
 * Visualizes the contribution lifecycle, executes read-only public GET fetches,
 * verifies Ed25519 signatures, preserves evidence in the Evidence Vault, and logs activity.
 *
 * Light Mode = DEFAULT, Dark Mode = OPTIONAL
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import type {
  ContributionItemV1,
  ContributionDraftInput,
  ContributionLifecycleStep,
} from "../contributions/types.ts";
import {
  loadAllContributions,
  saveContribution,
  deleteContribution,
  clearAllContributions,
  computeContributionStats,
} from "../contributions/storage.ts";
import {
  validateAndSanitizeContributionDraft,
  validateUrlSyntax,
} from "../contributions/schema.ts";
import {
  fetchRecordForContribution,
  attachManualRecordToContribution,
  verifyContributionRecord,
  preserveContributionInEvidenceVault,
} from "../contributions/workflow.ts";
import { exportContributionsToJson } from "../contributions/export.ts";

const STEPS: Array<{ id: ContributionLifecycleStep; label: string; num: number }> = [
  { id: "PREPARE", label: "Prepare", num: 1 },
  { id: "PUBLISH", label: "Publish", num: 2 },
  { id: "RECORD", label: "Record", num: 3 },
  { id: "CAPTURE", label: "Capture", num: 4 },
  { id: "VERIFY", label: "Verify", num: 5 },
  { id: "PRESERVE", label: "Preserve", num: 6 },
  { id: "COMPLETE", label: "Complete", num: 7 },
];

export const ContributionCenterView: React.FC = () => {
  const [contributions, setContributions] = useState<ContributionItemV1[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [operationMsg, setOperationMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Draft form state
  const [draftForm, setDraftForm] = useState<ContributionDraftInput>({
    topic: "",
    contributionUrl: "",
    description: "",
    projectName: "",
    gitCommit: "",
    xUrl: "",
    room: "technocore",
  });

  // Capture / Fetch form state
  const [fetchRoom, setFetchRoom] = useState<string>("technocore");
  const [fetchSeq, setFetchSeq] = useState<string>("");
  const [isManualEntry, setIsManualEntry] = useState<boolean>(false);

  // Manual record fields
  const [manualDid, setManualDid] = useState<string>("");
  const [manualNonce, setManualNonce] = useState<string>("");
  const [manualText, setManualText] = useState<string>("");
  const [manualSig, setManualSig] = useState<string>("");

  // Confirmation Modals
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    const loaded = loadAllContributions();
    setContributions(loaded);
    if (loaded.length > 0 && !selectedId && !isCreatingNew && loaded[0]) {
      setSelectedId(loaded[0].id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedContribution = useMemo(() => {
    return contributions.find((c) => c.id === selectedId) || null;
  }, [contributions, selectedId]);

  const stats = useMemo(() => {
    return computeContributionStats(contributions);
  }, [contributions]);

  const refreshList = useCallback((updated: ContributionItemV1[], nextSelectedId?: string) => {
    setContributions(updated);
    if (nextSelectedId) {
      setSelectedId(nextSelectedId);
    } else if (updated.length > 0 && (!selectedId || !updated.some((c) => c.id === selectedId)) && updated[0]) {
      setSelectedId(updated[0].id);
    } else if (updated.length === 0) {
      setSelectedId(null);
    }
  }, [selectedId]);

  // Handle Draft Save
  const handleCreateDraft = (e: React.FormEvent) => {
    e.preventDefault();
    setDraftError(null);
    setOperationMsg(null);

    try {
      const created = validateAndSanitizeContributionDraft(draftForm);
      const updated = saveContribution(created);
      refreshList(updated, created.id);
      setIsCreatingNew(false);
      setOperationMsg({ text: `Contribution draft "${created.topic}" created.`, type: "success" });
      setDraftForm({
        topic: "",
        contributionUrl: "",
        description: "",
        projectName: "",
        gitCommit: "",
        xUrl: "",
        room: "technocore",
      });
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err));
    }
  };

  // Handle Live Fetch
  const handleFetchRecord = async () => {
    if (!selectedContribution) return;
    const seqNum = parseInt(fetchSeq.trim(), 10);
    if (isNaN(seqNum) || seqNum < 0) {
      setOperationMsg({ text: "Please enter a valid non-negative sequence number.", type: "error" });
      return;
    }

    setIsLoading(true);
    setOperationMsg({ text: `Querying public GET endpoint for /r/${fetchRoom} #${seqNum}...`, type: "info" });

    try {
      const res = await fetchRecordForContribution(selectedContribution, fetchRoom, seqNum);
      const all = loadAllContributions();
      refreshList(all, res.updated.id);

      if (res.error) {
        setOperationMsg({ text: res.error, type: "error" });
      } else {
        setOperationMsg({ text: `Successfully captured server record #${seqNum} from /r/${fetchRoom}.`, type: "success" });
      }
    } catch (err) {
      setOperationMsg({ text: err instanceof Error ? err.message : String(err), type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Manual Record Attach
  const handleAttachManualRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContribution) return;
    const seqNum = parseInt(fetchSeq.trim(), 10);
    if (isNaN(seqNum) || seqNum < 0) {
      setOperationMsg({ text: "Please enter a valid sequence number.", type: "error" });
      return;
    }
    if (!manualDid.trim() || !manualNonce.trim() || !manualText.trim() || !manualSig.trim()) {
      setOperationMsg({ text: "All manual proof fields (DID, Nonce, Text, Signature) are required.", type: "error" });
      return;
    }

    const updated = attachManualRecordToContribution(selectedContribution, {
      room: fetchRoom,
      seq: seqNum,
      did: manualDid,
      nonce: manualNonce,
      text: manualText,
      signature: manualSig,
    });

    const all = loadAllContributions();
    refreshList(all, updated.id);
    setIsManualEntry(false);
    setOperationMsg({ text: "Manual historical record attached. Provenance: MANUAL_HISTORICAL.", type: "success" });
  };

  // Handle Verify Signature
  const handleVerify = async () => {
    if (!selectedContribution) return;
    setIsLoading(true);
    setOperationMsg({ text: "Executing WebCrypto Ed25519 signature verification...", type: "info" });

    try {
      const res = await verifyContributionRecord(selectedContribution);
      const all = loadAllContributions();
      refreshList(all, res.updated.id);

      if (res.verified) {
        setOperationMsg({ text: "Cryptographic signature verified successfully!", type: "success" });
      } else {
        setOperationMsg({ text: `Verification failed: ${res.failureReason}`, type: "error" });
      }
    } catch (err) {
      setOperationMsg({ text: err instanceof Error ? err.message : String(err), type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Evidence Vault Preservation
  const handlePreserveEvidence = async () => {
    if (!selectedContribution) return;
    setIsLoading(true);
    setOperationMsg({ text: "Preserving verified proof in Evidence Vault...", type: "info" });

    try {
      const res = await preserveContributionInEvidenceVault(selectedContribution);
      const all = loadAllContributions();
      refreshList(all, res.updated.id);

      if (res.evidenceSha256) {
        setOperationMsg({ text: "Evidence preserved locally! Contribution is now COMPLETE.", type: "success" });
      } else {
        setOperationMsg({ text: res.error || "Preservation failed.", type: "error" });
      }
    } catch (err) {
      setOperationMsg({ text: err instanceof Error ? err.message : String(err), type: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Export
  const handleExportJson = () => {
    const jsonStr = exportContributionsToJson(contributions);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `technocore-contributions-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle Delete One
  const handleDelete = (id: string) => {
    const updated = deleteContribution(id);
    refreshList(updated);
    setShowDeleteModal(null);
    setOperationMsg({ text: "Contribution removed.", type: "info" });
  };

  // Handle Clear All
  const handleClearAll = () => {
    clearAllContributions();
    setContributions([]);
    setSelectedId(null);
    setShowClearModal(false);
    setOperationMsg({ text: "All contribution drafts cleared.", type: "info" });
  };

  return (
    <main className="min-h-screen bg-void text-ink px-4 py-8 md:px-8 max-w-7xl mx-auto space-y-8">
      {/* 1. Header & Badges */}
      <header className="space-y-4 border-b border-hairline pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 mono">
                EVIDENCE-DRIVEN WORKFLOW
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30 mono">
                READ-ONLY GET FETCH
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-panel-high text-muted border border-hairline mono">
                ZERO BROWSER CUSTODY
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-ink">
              Technocore Contribution Center
            </h1>
            <p className="text-muted text-sm md:text-base max-w-3xl leading-relaxed">
              Publish, record, verify, and preserve your Technocore contributions through a unified evidence-backed pipeline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setIsCreatingNew(true);
                setSelectedId(null);
                setDraftError(null);
                setOperationMsg(null);
              }}
              className="px-4 py-2 rounded-lg bg-ink text-void font-bold text-xs hover:opacity-90 transition-opacity mono flex items-center gap-1.5 shadow-sm"
            >
              <span>+ New Contribution</span>
            </button>
            {contributions.length > 0 && (
              <>
                <button
                  onClick={handleExportJson}
                  className="px-3.5 py-2 rounded-lg bg-panel border border-hairline text-ink font-semibold text-xs hover:border-hairline-bright transition-colors mono"
                  title="Export local contributions to JSON"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => setShowClearModal(true)}
                  className="px-3 py-2 rounded-lg bg-panel border border-rose-500/30 text-rose-600 dark:text-rose-400 font-semibold text-xs hover:bg-rose-500/10 transition-colors mono"
                >
                  Clear All
                </button>
              </>
            )}
          </div>
        </div>

        {/* Web Read-Only Boundary Visual Banner */}
        <div className="p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/10 text-xs text-sky-950 dark:text-sky-100 flex items-start gap-3">
          <span className="text-base leading-none">🛡️</span>
          <div className="space-y-0.5">
            <span className="font-bold uppercase tracking-wider mono text-[11px] block">
              Web Read-Only Security Boundary
            </span>
            <p className="text-[12px] opacity-90 leading-relaxed">
              The web Contribution Center is strictly read-only and does not submit or sign contributions from the browser. It validates public artifacts, explains the local CLI workflow, retrieves public records via GET, and verifies signatures locally using WebCrypto.
            </p>
          </div>
        </div>

        {/* Retention Warning Notice */}
        <div className="p-3 rounded-lg border border-hairline bg-panel text-[11px] text-muted flex items-center justify-between gap-4">
          <span className="mono">
            ⚠️ <strong>Retention Limit:</strong> Technocore room records may leave the live retained window as newer traffic advances. Preserve evidence when the record is available.
          </span>
          <Link href="/evidence" className="text-signal font-semibold hover:underline shrink-0 mono text-[11px]">
            Evidence Vault →
          </Link>
        </div>
      </header>

      {/* 2. Summary Metric Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-1 shadow-sm">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">TOTAL</span>
          <p className="text-2xl font-black text-ink mono">{stats.totalContributions}</p>
        </div>
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-1 shadow-sm">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">VERIFIED</span>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mono">{stats.verifiedContributions}</p>
        </div>
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-1 shadow-sm">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">PRESERVED</span>
          <p className="text-2xl font-black text-sky-600 dark:text-sky-400 mono">{stats.preservedContributions}</p>
        </div>
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-1 shadow-sm">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">COMPLETE</span>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mono">{stats.completeContributions}</p>
        </div>
        <div className="p-4 rounded-xl border border-hairline bg-panel space-y-1 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">PENDING</span>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mono">{stats.pendingContributions}</p>
        </div>
      </section>

      {/* Operation Feedback Banner */}
      {operationMsg && (
        <div
          className={`p-3 rounded-xl border text-xs mono flex items-center justify-between ${
            operationMsg.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
              : operationMsg.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
              : "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300"
          }`}
        >
          <span>{operationMsg.text}</span>
          <button onClick={() => setOperationMsg(null)} className="opacity-60 hover:opacity-100 text-sm">
            ✕
          </button>
        </div>
      )}

      {/* 3. Stepper Visualization (when a contribution or draft is active) */}
      <section className="p-4 rounded-xl border border-hairline bg-panel space-y-3 shadow-sm">
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono block">
          7-STAGE CONTRIBUTION LIFECYCLE
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs mono">
          {STEPS.map((step) => {
            const isSelectedComplete = selectedContribution?.status === "COMPLETE";
            let isActive = false;
            let isDone = false;

            if (selectedContribution) {
              if (isSelectedComplete) {
                isDone = true;
              } else if (step.id === "PREPARE" && selectedContribution.topic) {
                isDone = true;
              } else if (step.id === "PUBLISH" && validateUrlSyntax(selectedContribution.contributionUrl).valid) {
                isDone = true;
              } else if (step.id === "RECORD" && selectedContribution.room && selectedContribution.seq !== undefined) {
                isDone = true;
              } else if (step.id === "CAPTURE" && selectedContribution.text && selectedContribution.signature) {
                isDone = true;
              } else if (step.id === "VERIFY" && selectedContribution.isVerified) {
                isDone = true;
              } else if (step.id === "PRESERVE" && selectedContribution.isEvidencePreserved) {
                isDone = true;
              }

              if (selectedContribution.currentStep === step.id && !isSelectedComplete) {
                isActive = true;
              }
            } else if (isCreatingNew && step.id === "PREPARE") {
              isActive = true;
            }

            return (
              <div
                key={step.id}
                className={`p-2.5 rounded-lg border transition-colors ${
                  isDone
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-bold"
                    : isActive
                    ? "bg-signal/10 border-signal text-signal font-bold shadow-sm"
                    : "bg-void border-hairline text-muted opacity-70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] opacity-75">#{step.num}</span>
                  {isDone ? <span>✓</span> : isActive ? <span className="animate-pulse">●</span> : <span>○</span>}
                </div>
                <span className="text-xs uppercase tracking-tight truncate block mt-1">{step.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Contribution List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider mono">
              Your Contributions ({contributions.length})
            </h2>
            <button
              onClick={() => {
                setIsCreatingNew(true);
                setSelectedId(null);
              }}
              className="text-xs font-semibold text-signal hover:underline mono"
            >
              + Draft
            </button>
          </div>

          {contributions.length === 0 ? (
            <div className="p-6 rounded-xl border border-hairline bg-panel text-center space-y-3">
              <span className="text-3xl block">📦</span>
              <p className="text-xs text-muted leading-relaxed">
                No local contribution records yet. Create a draft or inspect the guide.
              </p>
              <button
                onClick={() => setIsCreatingNew(true)}
                className="w-full py-2 rounded-lg bg-ink text-void font-bold text-xs hover:opacity-90 transition-opacity mono"
              >
                Start First Contribution
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {contributions.map((item) => {
                const isSelected = item.id === selectedId && !isCreatingNew;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setIsCreatingNew(false);
                      setOperationMsg(null);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-2 ${
                      isSelected
                        ? "bg-panel-high border-signal/60 shadow-sm"
                        : "bg-panel border-hairline hover:border-hairline-bright"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xs font-bold text-ink truncate flex-1">{item.topic}</h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteModal(item.id);
                        }}
                        className="text-muted hover:text-rose-500 text-xs px-1"
                        title="Delete contribution"
                      >
                        ✕
                      </button>
                    </div>

                    <p className="text-[11px] text-muted truncate">{item.contributionUrl}</p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase mono ${
                          item.status === "COMPLETE"
                            ? "bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                            : item.status === "CRYPTOGRAPHICALLY_VERIFIED"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                            : item.status === "RECORD_CAPTURED"
                            ? "bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {item.status.replace(/_/g, " ")}
                      </span>

                      {item.isVerified && (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mono">
                          ✓ VERIFIED
                        </span>
                      )}
                      {item.isEvidencePreserved && (
                        <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 mono">
                          ✓ PRESERVED
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Guide Callout Link */}
          <div className="p-4 rounded-xl border border-hairline bg-panel space-y-2">
            <h4 className="text-xs font-bold text-ink mono">Need guidance?</h4>
            <p className="text-[11px] text-muted leading-relaxed">
              Read the full Technocore contribution standards, CLI workflow, and verification criteria.
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              <Link href="/contributions/tclk-testkit" className="text-xs text-signal font-semibold hover:underline mono">
                Inspect TCLK-TestKit Sample →
              </Link>
              <Link href="/start" className="text-xs text-muted hover:text-ink mono">
                Open First Agent Builder →
              </Link>
            </div>
          </div>
        </div>

        {/* Right Column: Active Workflow Detail / Form (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {isCreatingNew ? (
            /* DRAFT FORM VIEW */
            <section className="p-6 rounded-xl border border-hairline bg-panel space-y-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-hairline pb-4">
                <div>
                  <h2 className="text-lg font-bold text-ink tracking-tight">Prepare Contribution Draft</h2>
                  <p className="text-xs text-muted">Enter the public artifact metadata for your contribution.</p>
                </div>
                {contributions.length > 0 && (
                  <button
                    onClick={() => {
                      setIsCreatingNew(false);
                      if (contributions.length > 0 && contributions[0]) setSelectedId(contributions[0].id);
                    }}
                    className="text-xs text-muted hover:text-ink mono"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {draftError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs mono">
                  {draftError}
                </div>
              )}

              <form onSubmit={handleCreateDraft} className="space-y-4 text-xs font-mono">
                <div className="space-y-1.5">
                  <label className="font-bold text-ink">
                    Contribution URL <span className="text-signal">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://github.com/org/repo or https://x.com/user/status/..."
                    value={draftForm.contributionUrl}
                    onChange={(e) => setDraftForm({ ...draftForm, contributionUrl: e.target.value })}
                    className="w-full p-2.5 rounded-lg bg-void border border-hairline text-ink focus:border-signal outline-none"
                  />
                  <span className="text-[10px] text-muted">
                    Public addressable URL of your repo, guide, tutorial, tool, or video.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink">
                    Topic / Summary <span className="text-signal">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    placeholder="e.g. Setting up an agent on a Linux VPS / TCLK TestKit"
                    value={draftForm.topic}
                    onChange={(e) => setDraftForm({ ...draftForm, topic: e.target.value })}
                    className="w-full p-2.5 rounded-lg bg-void border border-hairline text-ink focus:border-signal outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-ink">
                    Description & Value <span className="text-signal">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={1000}
                    placeholder="Briefly describe what this contribution provides and how other developers can verify it."
                    value={draftForm.description}
                    onChange={(e) => setDraftForm({ ...draftForm, description: e.target.value })}
                    className="w-full p-2.5 rounded-lg bg-void border border-hairline text-ink focus:border-signal outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-bold text-ink">Project Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. technocore-agent-starter"
                      value={draftForm.projectName || ""}
                      onChange={(e) => setDraftForm({ ...draftForm, projectName: e.target.value })}
                      className="w-full p-2.5 rounded-lg bg-void border border-hairline text-ink focus:border-signal outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-bold text-ink">Git Commit Hash (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 1ccdf27528b576f9..."
                      value={draftForm.gitCommit || ""}
                      onChange={(e) => setDraftForm({ ...draftForm, gitCommit: e.target.value })}
                      className="w-full p-2.5 rounded-lg bg-void border border-hairline text-ink focus:border-signal outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 rounded-lg bg-ink text-void font-bold text-xs hover:opacity-90 transition-opacity mono shadow-sm"
                  >
                    Save & Proceed to Validation →
                  </button>
                </div>
              </form>
            </section>
          ) : selectedContribution ? (
            /* ACTIVE CONTRIBUTION WORKFLOW DETAIL */
            <div className="space-y-6">
              {/* Card 1: Public Artifact & Preparation */}
              <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">
                      STAGE 1 & 2 · ARTIFACT
                    </span>
                    <h3 className="text-base font-bold text-ink">{selectedContribution.topic}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {validateUrlSyntax(selectedContribution.contributionUrl).valid ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 mono">
                        URL FORMAT VALID
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 mono">
                        INVALID URL
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mono">
                  <div>
                    <span className="text-muted block text-[10px]">URL</span>
                    <a
                      href={selectedContribution.contributionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-signal hover:underline break-all"
                    >
                      {selectedContribution.contributionUrl} ↗
                    </a>
                  </div>
                  {selectedContribution.projectName && (
                    <div>
                      <span className="text-muted block text-[10px]">PROJECT</span>
                      <span className="text-ink">{selectedContribution.projectName}</span>
                    </div>
                  )}
                  {selectedContribution.gitCommit && (
                    <div>
                      <span className="text-muted block text-[10px]">COMMIT</span>
                      <span className="text-ink">{selectedContribution.gitCommit}</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted leading-relaxed border-t border-hairline pt-3">
                  {selectedContribution.description}
                </p>
              </div>

              {/* Card 2: Record on Technocore CLI Instructions */}
              <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">
                      STAGE 3 · RECORD ON TECHNOCORE
                    </span>
                    <h3 className="text-sm font-bold text-ink">Local Signing Workflow (CLI)</h3>
                  </div>
                  <span className="text-[10px] text-muted mono">flop_agent.py</span>
                </div>

                <p className="text-xs text-muted leading-relaxed">
                  Use your local agent key to sign and record your contribution to the public room <code className="text-signal font-semibold">/r/technocore</code>.
                </p>

                <div className="p-4 rounded-lg bg-void border border-hairline space-y-2 mono text-xs">
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>Terminal Command:</span>
                    <span>Ed25519 Local Signing</span>
                  </div>
                  <pre className="text-ink font-bold overflow-x-auto select-all">
                    python3 flop_agent.py contribute
                  </pre>
                  <p className="text-[11px] text-muted pt-1">
                    The CLI will prompt for your contribution URL and topic, sign the message locally, broadcast to <code className="text-ink font-semibold">/r/technocore</code>, and return a server-assigned sequence number.
                  </p>
                </div>
              </div>

              {/* Card 3: Capture Server Evidence */}
              <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">
                      STAGE 4 · CAPTURE SERVER EVIDENCE
                    </span>
                    <h3 className="text-sm font-bold text-ink">Retrieve Retained Room Record</h3>
                  </div>
                  <button
                    onClick={() => setIsManualEntry(!isManualEntry)}
                    className="text-xs text-muted hover:text-ink mono"
                  >
                    {isManualEntry ? "Switch to Public GET Fetch" : "Manual Historical Entry"}
                  </button>
                </div>

                {isManualEntry ? (
                  /* Manual Historical Record Form */
                  <form onSubmit={handleAttachManualRecord} className="space-y-3 text-xs mono">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-muted block text-[10px]">Room</label>
                        <input
                          type="text"
                          value={fetchRoom}
                          onChange={(e) => setFetchRoom(e.target.value)}
                          className="w-full p-2 rounded bg-void border border-hairline text-ink"
                        />
                      </div>
                      <div>
                        <label className="text-muted block text-[10px]">Sequence</label>
                        <input
                          type="number"
                          value={fetchSeq}
                          onChange={(e) => setFetchSeq(e.target.value)}
                          className="w-full p-2 rounded bg-void border border-hairline text-ink"
                          placeholder="e.g. 12345"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-muted block text-[10px]">Author DID</label>
                      <input
                        type="text"
                        value={manualDid}
                        onChange={(e) => setManualDid(e.target.value)}
                        placeholder="did:key:z6Mk..."
                        className="w-full p-2 rounded bg-void border border-hairline text-ink"
                      />
                    </div>

                    <div>
                      <label className="text-muted block text-[10px]">Nonce / Timestamp</label>
                      <input
                        type="text"
                        value={manualNonce}
                        onChange={(e) => setManualNonce(e.target.value)}
                        placeholder="e.g. 1789300000000"
                        className="w-full p-2 rounded bg-void border border-hairline text-ink"
                      />
                    </div>

                    <div>
                      <label className="text-muted block text-[10px]">Signed Message Text</label>
                      <textarea
                        rows={2}
                        value={manualText}
                        onChange={(e) => setManualText(e.target.value)}
                        placeholder="I published a Technocore contribution..."
                        className="w-full p-2 rounded bg-void border border-hairline text-ink"
                      />
                    </div>

                    <div>
                      <label className="text-muted block text-[10px]">Signature (Base64url)</label>
                      <input
                        type="text"
                        value={manualSig}
                        onChange={(e) => setManualSig(e.target.value)}
                        placeholder="86-character base64url signature..."
                        className="w-full p-2 rounded bg-void border border-hairline text-ink"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 rounded bg-ink text-void font-bold text-xs hover:opacity-90 transition-opacity"
                    >
                      Attach Manual Historical Record
                    </button>
                  </form>
                ) : (
                  /* Public GET Fetch Form */
                  <div className="space-y-4 text-xs mono">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-muted block text-[10px]">Room</label>
                        <input
                          type="text"
                          value={fetchRoom}
                          onChange={(e) => setFetchRoom(e.target.value)}
                          className="w-full p-2 rounded-lg bg-void border border-hairline text-ink"
                        />
                      </div>
                      <div>
                        <label className="text-muted block text-[10px]">Sequence Number</label>
                        <input
                          type="number"
                          value={fetchSeq}
                          onChange={(e) => setFetchSeq(e.target.value)}
                          placeholder="e.g. 5"
                          className="w-full p-2 rounded-lg bg-void border border-hairline text-ink"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={handleFetchRecord}
                          disabled={isLoading}
                          className="w-full py-2 rounded-lg bg-ink text-void font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {isLoading ? "Fetching..." : "Fetch Record (GET)"}
                        </button>
                      </div>
                    </div>

                    {selectedContribution.room && selectedContribution.seq !== undefined && (
                      <div className="p-4 rounded-lg bg-void border border-hairline space-y-2 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-ink">
                            Captured Record: /r/{selectedContribution.room} #{selectedContribution.seq}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30">
                            {selectedContribution.provenance || "SERVER_RETRIEVED"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted">
                          <div>
                            <span>DID: </span>
                            <span className="text-ink break-all">{selectedContribution.did || "N/A"}</span>
                          </div>
                          <div>
                            <span>Nonce: </span>
                            <span className="text-ink">{selectedContribution.nonce || "N/A"}</span>
                          </div>
                        </div>
                        {selectedContribution.text && (
                          <div className="text-muted pt-1">
                            <span>Text: </span>
                            <span className="text-ink italic">&quot;{selectedContribution.text}&quot;</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card 4: Cryptographic Verification */}
              <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">
                      STAGE 5 · VERIFY SIGNATURE
                    </span>
                    <h3 className="text-sm font-bold text-ink">WebCrypto Ed25519 Engine</h3>
                  </div>
                  {selectedContribution.isVerified ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 mono">
                      ✓ CRYPTOGRAPHICALLY VERIFIED
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 mono">
                      UNVERIFIED
                    </span>
                  )}
                </div>

                <div className="space-y-3 text-xs mono">
                  {selectedContribution.canonicalPayload && (
                    <div className="space-y-1">
                      <span className="text-muted text-[10px]">Canonical Payload (room|nonce|text):</span>
                      <pre className="p-2.5 rounded bg-void border border-hairline text-ink text-[11px] overflow-x-auto">
                        {selectedContribution.canonicalPayload}
                      </pre>
                    </div>
                  )}

                  {selectedContribution.canonicalPayloadSha256 && (
                    <div className="space-y-1">
                      <span className="text-muted text-[10px]">Payload SHA-256 Digest:</span>
                      <span className="text-ink text-[11px] break-all block">
                        {selectedContribution.canonicalPayloadSha256}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleVerify}
                    disabled={isLoading || !selectedContribution.signature}
                    className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {isLoading ? "Verifying..." : "Verify Ed25519 Signature"}
                  </button>
                </div>
              </div>

              {/* Card 5: Evidence Vault & Activity Completion */}
              <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div>
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider mono">
                      STAGE 6 & 7 · PRESERVE & COMPLETE
                    </span>
                    <h3 className="text-sm font-bold text-ink">Evidence Vault Preservation</h3>
                  </div>
                  {selectedContribution.status === "COMPLETE" ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 mono">
                      ✓ COMPLETE
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-panel-high text-muted border border-hairline mono">
                      PENDING PRESERVATION
                    </span>
                  )}
                </div>

                <div className="space-y-3 text-xs mono">
                  {selectedContribution.isEvidencePreserved ? (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 space-y-1">
                      <span className="font-bold block">✓ Preserved in Evidence Vault</span>
                      <span className="text-[10px] break-all opacity-90">
                        Integrity SHA-256: {selectedContribution.evidenceSha256}
                      </span>
                    </div>
                  ) : (
                    <p className="text-muted leading-relaxed">
                      Preserve this verified proof locally in your browser storage so it remains accessible even after public room retention advances.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-3 pt-2">
                    {!selectedContribution.isEvidencePreserved && (
                      <button
                        onClick={handlePreserveEvidence}
                        disabled={isLoading || !selectedContribution.isVerified}
                        className="px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs disabled:opacity-50 transition-colors shadow-sm"
                      >
                        Preserve Evidence Locally →
                      </button>
                    )}

                    <Link
                      href="/evidence"
                      className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-xs hover:border-hairline-bright transition-colors"
                    >
                      Open Evidence Vault →
                    </Link>

                    <Link
                      href="/activity"
                      className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-xs hover:border-hairline-bright transition-colors"
                    >
                      View Activity History →
                    </Link>

                    <Link
                      href="/workspace"
                      className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-xs hover:border-hairline-bright transition-colors"
                    >
                      Open Workspace →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* EMPTY STATE VIEW */
            <div className="p-8 rounded-xl border border-hairline bg-panel text-center space-y-6 shadow-sm">
              <div className="space-y-2 max-w-md mx-auto">
                <span className="text-4xl block">🚀</span>
                <h3 className="text-lg font-bold text-ink">Start Your First Contribution</h3>
                <p className="text-xs text-muted leading-relaxed">
                  Turn your work into a verified, evidence-backed Technocore contribution record.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-lg mx-auto text-xs mono">
                <div className="p-3 rounded-lg bg-void border border-hairline space-y-1">
                  <span className="font-bold text-signal">[1] Prepare Artifact</span>
                  <p className="text-[11px] text-muted">Publish your open-source repo, guide, tool, or video publicly.</p>
                </div>
                <div className="p-3 rounded-lg bg-void border border-hairline space-y-1">
                  <span className="font-bold text-signal">[2] Record on Technocore</span>
                  <p className="text-[11px] text-muted">Sign and broadcast via CLI: <code className="text-ink">python3 flop_agent.py contribute</code>.</p>
                </div>
                <div className="p-3 rounded-lg bg-void border border-hairline space-y-1">
                  <span className="font-bold text-signal">[3] Capture & Verify</span>
                  <p className="text-[11px] text-muted">Fetch sequence record via read-only GET and verify Ed25519 signature.</p>
                </div>
                <div className="p-3 rounded-lg bg-void border border-hairline space-y-1">
                  <span className="font-bold text-signal">[4] Preserve Evidence</span>
                  <p className="text-[11px] text-muted">Store proof in Evidence Vault before public room retention window advances.</p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className="px-5 py-2.5 rounded-lg bg-ink text-void font-bold text-xs hover:opacity-90 transition-opacity mono shadow-sm"
                >
                  Create Contribution Draft →
                </button>
                <Link
                  href="/start"
                  className="px-4 py-2.5 rounded-lg bg-panel border border-hairline text-ink font-semibold text-xs hover:border-hairline-bright transition-colors mono"
                >
                  Open First Agent Builder →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-sm">
          <div className="bg-panel border border-hairline rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-ink">Clear All Contribution Drafts?</h3>
            <p className="text-xs text-muted leading-relaxed">
              This will remove all local contribution draft entries from <code className="text-signal">technocore_contributions_v1</code>. Preserved records in your Evidence Vault will NOT be affected.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 rounded-lg bg-panel border border-hairline text-xs font-semibold text-ink hover:border-hairline-bright"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Confirm Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete One Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-sm">
          <div className="bg-panel border border-hairline rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-ink">Delete Contribution?</h3>
            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to remove this contribution draft from your local history?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 rounded-lg bg-panel border border-hairline text-xs font-semibold text-ink hover:border-hairline-bright"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteModal)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
