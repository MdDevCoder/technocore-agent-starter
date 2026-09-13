"use client";

/**
 * Technocore Agent Readiness Flow: Primary UI View Component
 *
 * Provides a guided, evidence-driven checklist that certifies an agent's
 * development readiness across 7 stages with zero fake scores, zero secret leaks,
 * factual blocker diagnostics, safe resume/reset support, and direct tool handoffs.
 *
 * Fully unified with platform design system: Light Mode = DEFAULT, Dark Mode = PARITY.
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mono bg-verified/10 text-verified border border-verified/30">
            <span className="size-1.5 rounded-full bg-verified" />
            READY
          </span>
        );
      case "ATTENTION":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mono bg-attention/10 text-attention border border-attention/30">
            <span className="size-1.5 rounded-full bg-attention animate-pulse" />
            ATTENTION
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mono bg-fault/10 text-fault border border-fault/30">
            <span className="size-1.5 rounded-full bg-fault" />
            FAILED
          </span>
        );
      case "IN_PROGRESS":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mono bg-signal/10 text-signal border border-signal/30">
            <span className="size-1.5 rounded-full bg-signal animate-spin" />
            IN PROGRESS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold mono bg-panel text-muted border border-hairline">
            <span className="size-1.5 rounded-full bg-faint" />
            NOT STARTED
          </span>
        );
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 bg-void text-ink min-h-screen">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <nav aria-label="Breadcrumb" className="mono text-xs text-muted mb-2 flex items-center gap-1.5">
            <Link href="/" className="hover:text-ink transition-colors">
              Home
            </Link>
            <span className="text-faint">/</span>
            <Link href="/workspace" className="hover:text-ink transition-colors">
              Workspace
            </Link>
            <span className="text-faint">/</span>
            <span className="text-signal font-semibold">Readiness</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase bg-signal/10 text-signal border border-signal/20 mono">
              7-STAGE VERIFICATION
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase bg-panel text-muted border border-hairline mono">
              ZERO FAKE SCORES
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-ink display">
            Agent Readiness Flow
          </h1>
          <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">
            Guided 7-stage evidence-driven verification console certifying your agent is development-ready.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runEvaluation()}
            disabled={isRunning}
            className={buttonClasses("primary", "sm", "mono text-xs")}
          >
            {isRunning ? "Evaluating..." : "↻ Run Readiness Check"}
          </button>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className={buttonClasses("secondary", "sm", "mono text-xs")}
          >
            {copiedLink ? "✓ Link Copied" : "Copy Share Link"}
          </button>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className={buttonClasses("secondary", "sm", "mono text-xs")}
          >
            Reset Flow
          </button>
        </div>
      </div>

      {/* Overall Verdict Banner */}
      {report && (
        <section
          aria-live="polite"
          className={`p-6 rounded-2xl border shadow-xs transition-all bg-panel ${
            report.overall === "READY_FOR_DEVELOPMENT"
              ? "border-verified/40 text-ink"
              : report.overall === "READY_LOCAL_NETWORK_ATTENTION"
                ? "border-signal/40 text-ink"
                : report.overall === "IN_PROGRESS"
                  ? "border-attention/40 text-ink"
                  : "border-fault/40 text-ink"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`size-3 rounded-full shrink-0 ${
                    report.overall === "READY_FOR_DEVELOPMENT"
                      ? "bg-verified shadow-[0_0_8px_var(--color-verified)]"
                      : report.overall === "READY_LOCAL_NETWORK_ATTENTION"
                        ? "bg-signal animate-pulse shadow-[0_0_8px_var(--color-signal)]"
                        : report.overall === "IN_PROGRESS"
                          ? "bg-attention shadow-[0_0_8px_var(--color-attention)]"
                          : "bg-fault shadow-[0_0_8px_var(--color-fault)]"
                  }`}
                />
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-ink mono">
                  {report.overallLabel}
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-muted leading-relaxed max-w-2xl">
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
            <div className="flex items-center gap-5 border-t md:border-t-0 md:border-l border-hairline pt-3 md:pt-0 md:pl-6 shrink-0">
              <div className="space-y-0.5">
                <div className="text-2xl font-black mono text-ink">{report.readyCount} / {report.totalStages}</div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mono text-muted">Stages Ready</div>
              </div>
              <div className="space-y-0.5">
                <div className={`text-2xl font-black mono ${report.blockers.length > 0 ? "text-attention" : "text-verified"}`}>
                  {report.blockers.length}
                </div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mono text-muted">Blockers</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Blocker Panel (Shown when any stage is incomplete) */}
      {report && report.blockers.length > 0 && (
        <section aria-labelledby="blocker-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="blocker-heading" className="text-base font-bold text-ink display flex items-center gap-2">
              <span className="size-2 rounded-full bg-fault shadow-[0_0_6px_var(--color-fault)]" />
              Actionable Blockers ({report.blockers.length})
            </h2>
            <span className="text-xs text-muted mono">
              Resolve these items to achieve full readiness certification
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.blockers.map((blocker: ReadinessBlocker) => (
              <div
                key={blocker.stageId}
                className="p-5 rounded-xl border border-fault/30 hover:border-fault/50 bg-panel space-y-3 shadow-xs transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-fault mono">
                    {blocker.title}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mono bg-fault/10 text-fault border border-fault/20 shrink-0">
                    {blocker.isLocal ? "Local Dependency" : "Network Dependency"}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-muted leading-relaxed">
                  <p>
                    <strong className="text-ink font-semibold">Why: </strong>
                    {blocker.why}
                  </p>
                  <p>
                    <strong className="text-ink font-semibold">What to do: </strong>
                    {blocker.whatToDo}
                  </p>
                </div>

                {blocker.actionHref && (
                  <div className="pt-2 border-t border-hairline/60 flex justify-end">
                    <Link
                      href={blocker.actionHref}
                      className={buttonClasses("secondary", "sm", "mono text-xs")}
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
          <h2 id="stages-heading" className="text-lg font-bold text-ink display">
            7-Stage Readiness Checklist
          </h2>
          <span className="text-xs text-muted mono">
            Evaluated at {report?.evaluatedAt ? new Date(report.evaluatedAt).toLocaleTimeString() : "..."} ({report?.durationMs ?? 0}ms)
          </span>
        </div>

        <div className="space-y-3">
          {report?.stages.map((stage: ReadinessStageItem) => {
            const isExpanded = Boolean(expandedEvidence[stage.id]);

            return (
              <div
                key={stage.id}
                className={`rounded-xl border transition-all bg-panel shadow-xs ${
                  stage.status === "READY"
                    ? "border-hairline hover:border-verified/40"
                    : stage.status === "ATTENTION"
                      ? "border-attention/40 hover:border-attention/60"
                      : stage.status === "FAILED"
                        ? "border-fault/40 hover:border-fault/60"
                        : "border-hairline opacity-80"
                }`}
              >
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Stage Index & Title */}
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`size-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mono ${
                        stage.status === "READY"
                          ? "bg-verified/15 text-verified border border-verified/30"
                          : stage.status === "ATTENTION"
                            ? "bg-attention/15 text-attention border border-attention/30"
                            : stage.status === "FAILED"
                              ? "bg-fault/15 text-fault border border-fault/30"
                              : "bg-panel-high text-muted border border-hairline"
                      }`}
                    >
                      {stage.stageNumber}
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-ink mono">
                          {stage.title}
                        </h3>
                        {getStatusBadge(stage.status)}
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted mono">
                          {stage.isLocalStage ? "Local" : "Network"}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {stage.summary}
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleEvidence(stage.id)}
                      className="text-xs font-semibold px-2.5 py-1 rounded bg-panel-high hover:bg-surface border border-hairline text-ink transition-colors mono"
                    >
                      {isExpanded ? "Hide Evidence ▲" : "View Evidence ▼"}
                    </button>

                    {stage.actionHref && (
                      <Link
                        href={stage.actionHref}
                        className={buttonClasses("secondary", "sm", "mono text-xs")}
                      >
                        {stage.actionLabel ?? "Open →"}
                      </Link>
                    )}
                  </div>
                </div>

                {/* Evidence Accordion Panel */}
                {isExpanded && (
                  <div className="border-t border-hairline p-4 bg-panel-high space-y-3 rounded-b-xl">
                    <div className="flex items-center justify-between text-xs text-muted mono">
                      <span className="font-semibold uppercase tracking-wider">Factual Evidence Log</span>
                      <span>Checked: {stage.lastChecked}</span>
                    </div>

                    <pre className="p-3 rounded-lg bg-void text-signal text-[11px] font-mono overflow-x-auto leading-relaxed border border-hairline">
                      {JSON.stringify(stage.evidence, null, 2)}
                    </pre>

                    {stage.remediation && (
                      <div className="p-3 rounded-lg bg-panel border border-attention/30 text-xs space-y-1">
                        <p className="font-bold text-attention mono">
                          Remediation Guidance:
                        </p>
                        <p className="text-muted leading-relaxed">{stage.remediation.whatToDo}</p>
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
            <h2 id="findings-heading" className="text-lg font-bold text-ink display flex items-center gap-2">
              <span className="size-2 rounded-full bg-attention" />
              Observed Network Anomalies ({report.findings.length})
            </h2>
            <span className="text-xs text-muted mono">
              Trace stage is READY; anomalous events surfaced for inspection
            </span>
          </div>

          <div className="space-y-3">
            {report.findings.map((finding) => (
              <div
                key={finding.id}
                className="p-4 rounded-xl border border-attention/30 bg-panel space-y-2 text-xs shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-attention mono">
                    {finding.title} ({finding.ruleKey})
                  </span>
                  <span className="font-bold px-2 py-0.5 rounded text-[10px] bg-attention/10 text-attention border border-attention/20 uppercase mono">
                    {finding.severity}
                  </span>
                </div>
                <p className="text-muted">
                  <strong className="text-ink">What: </strong>
                  {finding.what}
                </p>
                <p className="text-muted">
                  <strong className="text-ink">Why: </strong>
                  {finding.why}
                </p>
                <p className="text-muted">
                  <strong className="text-ink">Impact: </strong>
                  {finding.impact}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Safe Context & Security Guarantee Footer */}
      <section className="p-4 rounded-xl border border-hairline bg-panel text-xs text-muted space-y-1.5 shadow-xs">
        <h3 className="font-bold text-ink flex items-center gap-2">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="text-signal size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          >
            <rect x="3" y="7" width="10" height="7" rx="1.5" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
          </svg>
          Security & Zero-Secret Guarantee
        </h3>
        <p className="leading-relaxed">
          The Agent Readiness Flow operates strictly as a read-only diagnostic orchestration layer. Ephemeral keypairs are used for dry-run verification and wiped immediately from memory. No private keys, seed phrases, passwords, or encrypted backup contents are ever read, exported, or persisted.
        </p>
      </section>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/80 backdrop-blur-md"
        >
          <div className="w-full max-w-md p-6 rounded-2xl bg-panel border border-hairline shadow-2xl space-y-4">
            <h3 id="modal-title" className="text-lg font-bold text-ink display">
              Reset Readiness Flow?
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              This action clears cached readiness checklist results and re-runs evaluation from fresh state.
            </p>
            <div className="p-3 rounded-lg bg-panel-high border border-hairline text-xs text-muted space-y-1">
              <p className="font-bold text-verified mono">✓ Preserved Safely:</p>
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
                className={buttonClasses("secondary", "sm", "mono text-xs")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                className={buttonClasses("danger", "sm", "mono text-xs")}
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
