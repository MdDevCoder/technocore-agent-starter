"use client";

/**
 * Technocore Agent Readiness Flow: Primary UI View Component
 *
 * Provides a guided, evidence-driven checklist that certifies an agent's
 * development readiness across 7 stages with zero fake scores, zero secret leaks,
 * factual blocker diagnostics, safe resume/reset support, and direct tool handoffs.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAgentSession } from "../hooks/AgentSession.tsx";
import { useWorkspace } from "../hooks/useWorkspace.ts";
import {
  evaluateReadinessFlow,
  saveSafeReadinessState,
  clearSafeReadinessState,
} from "../readiness/engine.ts";
import type {
  ReadinessEvaluationReport,
  ReadinessStageItem,
  ReadinessBlocker,
  ReadinessStageStatus,
} from "../readiness/types.ts";
import { buttonClasses } from "../ui/buttonStyles.ts";

export function AgentReadinessView() {
  const session = useAgentSession();
  const { workspace, isLoaded: isWorkspaceLoaded } = useWorkspace();

  const [report, setReport] = useState<ReadinessEvaluationReport | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const runEvaluation = useCallback(async () => {
    setIsRunning(true);
    try {
      const activeDid = session.identity?.did || workspace?.project?.publicDid || null;
      const isSessionActive = Boolean(session.session || session.identity);
      const backupState = session.backup || "none";
      const isHardened = Boolean(session.hardened);

      const result = await evaluateReadinessFlow({
        activeDid,
        isSessionActive,
        backupState,
        isHardened,
        workspaceProject: workspace?.project ?? null,
        isWorkspaceLoaded,
      });

      setReport(result);
      saveSafeReadinessState(result);
    } catch {
      // In case of unexpected runtime error, keep safe fallback
    } finally {
      setIsRunning(false);
    }
  }, [session, workspace, isWorkspaceLoaded]);

  useEffect(() => {
    void runEvaluation();
  }, [runEvaluation]);

  const toggleEvidence = (stageId: string) => {
    setExpandedEvidence((prev) => ({
      ...prev,
      [stageId]: !prev[stageId],
    }));
  };

  const handleReset = () => {
    clearSafeReadinessState();
    setShowResetModal(false);
    void runEvaluation();
  };

  const handleCopyLink = async () => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.origin + "/readiness");
      if (workspace?.project?.name) {
        url.searchParams.set("project", workspace.project.name);
      }
      if (session.identity?.did) {
        url.searchParams.set("did", session.identity.did);
      }
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  const getStatusBadge = (status: ReadinessStageStatus) => {
    switch (status) {
      case "READY":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            READY
          </span>
        );
      case "ATTENTION":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse" />
            ATTENTION
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
            FAILED
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-spin" />
            IN PROGRESS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
            NOT STARTED
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            <Link href="/" className="hover:text-slate-900 dark:hover:text-slate-100">
              Home
            </Link>{" "}
            /{" "}
            <Link href="/workspace" className="hover:text-slate-900 dark:hover:text-slate-100">
              Workspace
            </Link>{" "}
            / <span className="text-slate-900 dark:text-slate-100 font-semibold">Readiness</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Agent Readiness Flow
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Guided 7-stage evidence-driven verification console certifying your agent is development-ready.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runEvaluation()}
            disabled={isRunning}
            className={buttonClasses("primary", "sm")}
          >
            {isRunning ? "Evaluating..." : "↻ Run Readiness Check"}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className={buttonClasses("secondary", "sm")}
          >
            {copiedLink ? "✓ Link Copied" : "Copy Share Link"}
          </button>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className={buttonClasses("secondary", "sm")}
          >
            Reset Flow
          </button>
        </div>
      </div>

      {/* Overall Verdict Banner */}
      {report && (
        <section
          aria-live="polite"
          className={`p-6 rounded-2xl border transition-all ${
            report.overall === "READY_FOR_DEVELOPMENT"
              ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
              : report.overall === "READY_LOCAL_NETWORK_ATTENTION"
                ? "bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-100"
                : report.overall === "IN_PROGRESS"
                  ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100"
                  : "bg-rose-50/80 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    report.overall === "READY_FOR_DEVELOPMENT"
                      ? "bg-emerald-500"
                      : report.overall === "READY_LOCAL_NETWORK_ATTENTION"
                        ? "bg-blue-500 animate-pulse"
                        : report.overall === "IN_PROGRESS"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                  }`}
                />
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  {report.overallLabel}
                </h2>
              </div>
              <p className="text-xs sm:text-sm opacity-90">
                {report.overall === "READY_FOR_DEVELOPMENT"
                  ? "All 7 stages verified with factual cryptographic and network evidence. Agent is certified for development."
                  : report.overall === "READY_LOCAL_NETWORK_ATTENTION"
                    ? "Local agent identity, backup, signing dry-run, and TCLK engine are verified. Technocore public network gateway is currently offline or unreachable."
                    : report.overall === "IN_PROGRESS"
                      ? `${report.readyCount} of ${report.totalStages} stages verified. Complete the remaining steps below.`
                      : `${report.blockers.length} blocker(s) prevent this agent from being certified ready. Review the blocker list below.`}
              </p>
            </div>

            {/* Factual Progress Stats (Zero Fake Scores) */}
            <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-current/20 pt-3 md:pt-0 md:pl-6 shrink-0">
              <div>
                <div className="text-2xl font-bold">{report.readyCount} / {report.totalStages}</div>
                <div className="text-xs uppercase tracking-wider font-semibold opacity-75">Stages Ready</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{report.blockers.length}</div>
                <div className="text-xs uppercase tracking-wider font-semibold opacity-75">Blockers</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Blocker Panel (Shown when any stage is incomplete) */}
      {report && report.blockers.length > 0 && (
        <section aria-labelledby="blocker-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="blocker-heading" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Actionable Blockers ({report.blockers.length})
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Resolve these items to achieve full readiness certification
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.blockers.map((blocker: ReadinessBlocker) => (
              <div
                key={blocker.stageId}
                className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                    {blocker.title}
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider bg-rose-200/60 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300">
                    {blocker.isLocal ? "Local Dependency" : "Network Dependency"}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-rose-800 dark:text-rose-400">Why: </span>
                    {blocker.why}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">
                    <span className="font-semibold text-rose-800 dark:text-rose-400">What to do: </span>
                    {blocker.whatToDo}
                  </p>
                </div>

                {blocker.actionHref && (
                  <div className="pt-1">
                    <Link
                      href={blocker.actionHref}
                      className={buttonClasses("secondary", "sm")}
                    >
                      {blocker.actionLabel ?? "Open Tool →"}
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7-Stage Interactive Checklist */}
      <section aria-labelledby="stages-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="stages-heading" className="text-lg font-bold text-slate-900 dark:text-white">
            7-Stage Readiness Checklist
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Evaluated at {report?.evaluatedAt ? new Date(report.evaluatedAt).toLocaleTimeString() : "..."} ({report?.durationMs ?? 0}ms)
          </span>
        </div>

        <div className="space-y-3">
          {report?.stages.map((stage: ReadinessStageItem) => {
            const isExpanded = Boolean(expandedEvidence[stage.id]);

            return (
              <div
                key={stage.id}
                className={`rounded-xl border transition-all ${
                  stage.status === "READY"
                    ? "bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800"
                    : stage.status === "ATTENTION"
                      ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60"
                      : stage.status === "FAILED"
                        ? "bg-rose-50/30 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60"
                        : "bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-90"
                }`}
              >
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Stage Index & Title */}
                  <div className="flex items-start sm:items-center gap-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        stage.status === "READY"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                          : stage.status === "ATTENTION"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                            : stage.status === "FAILED"
                              ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                              : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {stage.stageNumber}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {stage.title}
                        </h3>
                        {getStatusBadge(stage.status)}
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                          {stage.isLocalStage ? "Local" : "Network"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {stage.summary}
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleEvidence(stage.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      {isExpanded ? "Hide Evidence ▲" : "View Evidence ▼"}
                    </button>

                    {stage.actionHref && (
                      <Link
                        href={stage.actionHref}
                        className={buttonClasses("secondary", "sm")}
                      >
                        {stage.actionLabel ?? "Open →"}
                      </Link>
                    )}
                  </div>
                </div>

                {/* Evidence Accordion Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold uppercase tracking-wider">Factual Evidence Log</span>
                      <span>Checked: {stage.lastChecked}</span>
                    </div>

                    <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto leading-relaxed border border-slate-800">
                      {JSON.stringify(stage.evidence, null, 2)}
                    </pre>

                    {stage.remediation && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs space-y-1">
                        <p className="font-semibold text-amber-900 dark:text-amber-200">
                          Remediation Guidance:
                        </p>
                        <p className="text-amber-800 dark:text-amber-300">{stage.remediation.whatToDo}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Trace Findings & Anomaly Inspector (if any detected) */}
      {report && report.findings.length > 0 && (
        <section aria-labelledby="findings-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="findings-heading" className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Observed Network Anomalies ({report.findings.length})
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Trace stage is READY; anomalous events surfaced for inspection
            </span>
          </div>

          <div className="space-y-3">
            {report.findings.map((finding) => (
              <div
                key={finding.id}
                className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 dark:text-amber-200">
                    {finding.title} ({finding.ruleKey})
                  </span>
                  <span className="font-semibold px-2 py-0.5 rounded text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 uppercase">
                    {finding.severity}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">What: </span>
                  {finding.what}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">Why: </span>
                  {finding.why}
                </p>
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">Impact: </span>
                  {finding.impact}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Safe Context & Security Guarantee Footer */}
      <section className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-600 dark:text-slate-400 space-y-2">
        <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <span>🔒</span> Security & Zero-Secret Guarantee
        </h3>
        <p>
          The Agent Readiness Flow operates strictly as a read-only diagnostic orchestration layer. Ephemeral keypairs are used for dry-run verification and wiped immediately from memory. No private keys, seed phrases, passwords, or encrypted backup contents are ever read, exported, or persisted.
        </p>
      </section>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 id="modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Reset Readiness Flow?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              This action clears cached readiness checklist results and re-runs evaluation from fresh state.
            </p>
            <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">✓ Preserved Safely:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Your in-memory identity keypair</li>
                <li>Your encrypted backup files</li>
                <li>Your workspace project configuration</li>
                <li>Live public network state</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className={buttonClasses("secondary", "sm")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                className={buttonClasses("danger", "sm")}
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
