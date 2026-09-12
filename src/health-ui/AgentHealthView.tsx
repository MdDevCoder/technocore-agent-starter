"use client";

/**
 * Technocore Agent Health Monitor: Primary View Component
 *
 * Provides a production-grade, evidence-driven health console that evaluates
 * real available signals across Identity, Backup, Network, Signing, Protocol,
 * Observatory, Trace, Workspace, and Project with zero fake scores.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAgentSession } from "../hooks/AgentSession.tsx";
import { useWorkspace } from "../hooks/useWorkspace.ts";
import { evaluateAgentHealth } from "../health/engine.ts";
import type {
  HealthEvaluationSummary,
  HealthCheckItem,
} from "../health/types.ts";
import { buttonClasses } from "../ui/buttonStyles.ts";

export function AgentHealthView() {
  const session = useAgentSession();
  const { workspace, isLoaded: isWorkspaceLoaded } = useWorkspace();

  const [summary, setSummary] = useState<HealthEvaluationSummary | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});

  // Run the health checks
  const runHealthCheck = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await evaluateAgentHealth({
        activeDid: session.identity?.did || null,
        isSessionActive: session.session !== null,
        backupState: session.backup,
        isHardened: session.hardened,
        workspaceProject: isWorkspaceLoaded ? workspace.project : null,
        isWorkspaceLoaded,
      });
      setSummary(res);
    } catch (err) {
      console.error("Health check execution failed:", err);
    } finally {
      setIsRunning(false);
    }
  }, [
    session.identity?.did,
    session.session,
    session.backup,
    session.hardened,
    workspace.project,
    isWorkspaceLoaded,
  ]);

  // Initial health check run on mount and when session or workspace loads
  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  const toggleEvidence = (id: string) => {
    setExpandedEvidence((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const overall = summary?.overall ?? "UNKNOWN";
  const healthyCount = summary?.healthyCount ?? 0;
  const attentionCount = summary?.attentionCount ?? 0;
  const failedCount = summary?.failedCount ?? 0;
  const notCheckedCount = summary?.notCheckedCount ?? 0;

  // Filter items needing remediation
  const attentionItems = (summary?.items ?? []).filter(
    (item) => (item.status === "ATTENTION" || item.status === "FAILED") && item.remediation,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* 1. Header & Overall Health Hero */}
      <section className="border-hairline bg-panel relative overflow-hidden rounded-xl border p-6 shadow-xs backdrop-blur-sm sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 h-64 w-64 rounded-full bg-signal/5 blur-[100px]"
        />

        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start relative z-10">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="mono bg-signal/10 text-signal border-signal/20 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider">
                AGENT HEALTH MONITOR
              </span>
              <span className="border-hairline bg-surface text-muted inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-mono">
                EVIDENCE-DRIVEN DIAGNOSTIC
              </span>
            </div>

            <h1 className="display text-ink text-2xl font-bold tracking-tight sm:text-3xl">
              Is My Agent Healthy Right Now?
            </h1>

            <p className="text-muted max-w-2xl text-sm leading-relaxed">
              Factual runtime evaluation across 9 core signals: Identity, Backup, Network, Signing,
              Protocol, Observatory, Trace, Workspace, and Project. No fake percentages or arbitrary scores.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={() => void runHealthCheck()}
              disabled={isRunning}
              className={buttonClasses(
                "primary",
                "md",
                "cursor-pointer font-mono text-xs flex items-center justify-center gap-2",
              )}
            >
              <span className={isRunning ? "animate-spin" : ""}>↻</span>
              {isRunning ? "Running Diagnostic..." : "Run Health Check"}
            </button>
          </div>
        </div>

        {/* Overall Status Banner */}
        <div className="mt-8 border-hairline bg-surface/60 grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <div
              className={`size-3.5 rounded-full shrink-0 ${
                overall === "HEALTHY"
                  ? "bg-signal shadow-[0_0_12px_var(--color-signal)]"
                  : overall === "ATTENTION"
                  ? "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                  : overall === "DEGRADED"
                  ? "bg-fault shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                  : "bg-muted"
              }`}
            />
            <div>
              <div className="text-[11px] font-mono uppercase text-muted">Overall Health</div>
              <div className="text-sm font-bold text-ink flex items-center gap-1.5">
                {overall === "HEALTHY" && "✓ HEALTHY"}
                {overall === "ATTENTION" && "⚠ ATTENTION"}
                {overall === "DEGRADED" && "✕ DEGRADED"}
                {overall === "UNKNOWN" && "— NOT CHECKED"}
              </div>
            </div>
          </div>

          {/* Factual Counts */}
          <div className="flex items-center gap-3">
            <div className="border-l border-hairline pl-4 w-full">
              <div className="text-[11px] font-mono uppercase text-muted">Factual Breakdown</div>
              <div className="text-xs font-mono text-ink mt-0.5">
                <span className="text-signal font-semibold">{healthyCount} healthy</span>
                {" · "}
                <span className={attentionCount > 0 ? "text-amber-400 font-semibold" : "text-muted"}>
                  {attentionCount} attention
                </span>
                {" · "}
                <span className={failedCount > 0 ? "text-fault font-semibold" : "text-muted"}>
                  {failedCount} failed
                </span>
                {notCheckedCount > 0 && ` · ${notCheckedCount} pending`}
              </div>
            </div>
          </div>

          {/* Last Checked */}
          <div className="flex items-center gap-3">
            <div className="border-l border-hairline pl-4 w-full">
              <div className="text-[11px] font-mono uppercase text-muted">Last Checked</div>
              <div className="text-xs font-mono text-ink mt-0.5 truncate">
                {summary?.evaluatedAt ? new Date(summary.evaluatedAt).toLocaleTimeString() : "—"}
              </div>
            </div>
          </div>

          {/* Execution Latency */}
          <div className="flex items-center gap-3">
            <div className="border-l border-hairline pl-4 w-full">
              <div className="text-[11px] font-mono uppercase text-muted">Evaluation Time</div>
              <div className="text-xs font-mono text-ink mt-0.5">
                {summary?.durationMs !== undefined ? `${summary.durationMs}ms` : "—"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Actionable Remediation Panel (Visible if attention or failure exists) */}
      {attentionItems.length > 0 && (
        <section className="border-amber-500/30 bg-amber-500/5 rounded-xl border p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
            <span>⚠</span>
            <span>Recommended Actions ({attentionItems.length})</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            The following items need your attention to bring your agent to full operational readiness.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {attentionItems.map((item) => (
              <div
                key={item.id}
                className="bg-panel border-hairline rounded-lg border p-4 flex flex-col justify-between gap-3 shadow-xs"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="mono text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      {item.category}
                    </span>
                    <span className="mono text-[11px] text-muted">{item.statusLabel}</span>
                  </div>
                  <div className="text-xs text-muted">
                    <strong className="text-ink font-medium">Why: </strong>
                    {item.remediation?.why}
                  </div>
                  <div className="text-xs text-muted">
                    <strong className="text-ink font-medium">What to do: </strong>
                    {item.remediation?.whatToDo}
                  </div>
                </div>

                {item.remediation?.actionHref && (
                  <div className="pt-2 border-t border-hairline/60 flex justify-end">
                    <Link
                      href={item.remediation.actionHref}
                      className="text-signal hover:underline mono text-xs font-medium inline-flex items-center gap-1"
                    >
                      {item.remediation.actionLabel || "Resolve Issue →"}
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. 9-Category Health Checks Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="display text-ink text-lg font-bold">Health Evaluation Checks (9)</h2>
          <span className="mono text-xs text-muted">Real signals · No fabricated scores</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(summary?.items ?? []).map((item) => (
            <HealthCard
              key={item.id}
              item={item}
              isExpanded={Boolean(expandedEvidence[item.id])}
              onToggle={() => toggleEvidence(item.id)}
            />
          ))}
        </div>
      </section>

      {/* 4. Quick Actions Toolchain Navigation */}
      <section className="border-hairline bg-panel rounded-xl border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="display text-ink text-base font-semibold">Quick Actions & Safe Toolchain</h3>
          <span className="mono text-xs text-muted">Context-preserving navigation</span>
        </div>

        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          <Link
            href="/workspace"
            className="border-hairline bg-surface/60 hover:border-signal/40 p-3 rounded-lg border text-center transition-all group"
          >
            <div className="text-xs font-semibold text-ink group-hover:text-signal">Workspace</div>
            <div className="text-[10px] text-muted mono mt-1">Config & state</div>
          </Link>

          <Link
            href="/start"
            className="border-hairline bg-surface/60 hover:border-signal/40 p-3 rounded-lg border text-center transition-all group"
          >
            <div className="text-xs font-semibold text-ink group-hover:text-signal">Builder</div>
            <div className="text-[10px] text-muted mono mt-1">Scaffold code</div>
          </Link>

          <Link
            href="/forge"
            className="border-hairline bg-surface/60 hover:border-signal/40 p-3 rounded-lg border text-center transition-all group"
          >
            <div className="text-xs font-semibold text-ink group-hover:text-signal">Forge</div>
            <div className="text-[10px] text-muted mono mt-1">Wire payloads</div>
          </Link>

          <Link
            href="/doctor"
            className="border-hairline bg-surface/60 hover:border-signal/40 p-3 rounded-lg border text-center transition-all group"
          >
            <div className="text-xs font-semibold text-ink group-hover:text-signal">Doctor</div>
            <div className="text-[10px] text-muted mono mt-1">Signatures</div>
          </Link>

          <Link
            href="/testkit"
            className="border-hairline bg-surface/60 hover:border-signal/40 p-3 rounded-lg border text-center transition-all group"
          >
            <div className="text-xs font-semibold text-ink group-hover:text-signal">TestKit</div>
            <div className="text-[10px] text-muted mono mt-1">TCLK harness</div>
          </Link>

          <Link
            href="/observatory"
            className="border-hairline bg-surface/60 hover:border-signal/40 p-3 rounded-lg border text-center transition-all group"
          >
            <div className="text-xs font-semibold text-ink group-hover:text-signal">Observatory</div>
            <div className="text-[10px] text-muted mono mt-1">Live rooms</div>
          </Link>

          <Link
            href="/trace"
            className="border-hairline bg-surface/60 hover:border-signal/40 p-3 rounded-lg border text-center transition-all group"
          >
            <div className="text-xs font-semibold text-ink group-hover:text-signal">Trace</div>
            <div className="text-[10px] text-muted mono mt-1">Forensics</div>
          </Link>
        </div>
      </section>

      {/* 5. Security Invariant Notice */}
      <section className="border-hairline bg-surface/40 rounded-xl border p-5 flex items-start gap-3.5">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="text-signal mt-0.5 size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        >
          <rect x="3" y="7" width="10" height="7" rx="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
        </svg>
        <div className="space-y-1 text-xs leading-relaxed">
          <span className="text-ink font-semibold">Zero-Secret Cryptographic Health Architecture: </span>
          <span className="text-muted">
            The Agent Health Monitor uses exclusively read-only `GET` network telemetry, isolated
            disposable WebCrypto dry-runs, and in-memory public identity descriptors. Your private signing key
            is never touched, serialized, exported, or transmitted during any health check.
          </span>
        </div>
      </section>
    </div>
  );
}

interface HealthCardProps {
  readonly item: HealthCheckItem;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}

function HealthCard({ item, isExpanded, onToggle }: HealthCardProps) {
  const statusColor =
    item.status === "HEALTHY"
      ? "text-signal bg-signal/10 border-signal/20"
      : item.status === "ATTENTION"
      ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
      : item.status === "FAILED"
      ? "text-fault bg-fault/10 border-fault/20"
      : "text-muted bg-panel border-hairline";

  const statusDot =
    item.status === "HEALTHY"
      ? "bg-signal shadow-[0_0_8px_var(--color-signal)]"
      : item.status === "ATTENTION"
      ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"
      : item.status === "FAILED"
      ? "bg-fault shadow-[0_0_8px_rgba(239,68,68,0.5)]"
      : "bg-muted";

  return (
    <div className="cyber-card panel bg-panel/70 p-5 rounded-xl border border-hairline flex flex-col justify-between gap-4 hover:border-signal/30 transition-all group">
      <div className="space-y-3">
        {/* Card Header */}
        <div className="flex items-center justify-between gap-2">
          <span className="mono text-[10px] font-bold text-muted uppercase tracking-wider">
            {item.category}
          </span>
          <span
            className={`mono text-[11px] font-semibold px-2 py-0.5 rounded border flex items-center gap-1.5 ${statusColor}`}
          >
            <span className={`size-1.5 rounded-full ${statusDot}`} />
            {item.status === "HEALTHY" && "HEALTHY"}
            {item.status === "ATTENTION" && "ATTENTION"}
            {item.status === "FAILED" && "FAILED"}
            {item.status === "NOT_CHECKED" && "NOT CHECKED"}
          </span>
        </div>

        {/* Title & Status Label */}
        <div>
          <h3 className="text-ink font-semibold text-sm group-hover:text-signal transition-colors">
            {item.title}
          </h3>
          <div className="mono text-[11px] text-muted mt-0.5 font-medium">{item.statusLabel}</div>
        </div>

        {/* Summary */}
        <p className="text-muted text-xs leading-relaxed">{item.summary}</p>
      </div>

      {/* Card Footer: Metadata & Evidence Accordion */}
      <div className="space-y-2 pt-3 border-t border-hairline/60">
        <div className="flex items-center justify-between text-[10px] mono text-muted">
          <span>Checked: {new Date(item.lastChecked).toLocaleTimeString()}</span>
          {item.latencyMs !== undefined && <span className="text-ink font-mono">{item.latencyMs}ms</span>}
        </div>

        {/* Evidence Toggle */}
        <button
          onClick={onToggle}
          className="w-full py-1 text-[11px] mono text-muted hover:text-ink flex items-center justify-between transition-colors cursor-pointer"
        >
          <span>{isExpanded ? "Hide Evidence ▲" : "Inspect Evidence ▼"}</span>
          <span className="text-[10px] text-signal/80">{Object.keys(item.evidence).length} signals</span>
        </button>

        {/* Expanded Evidence Box */}
        {isExpanded && (
          <div className="p-3 bg-void rounded-lg border border-hairline space-y-1.5 text-[11px] mono animate-fade-in">
            {Object.entries(item.evidence).map(([key, val]) => (
              <div key={key} className="flex justify-between items-start gap-2 break-all">
                <span className="text-muted shrink-0">{key}:</span>
                <span className="text-ink text-right">
                  {typeof val === "object" && val !== null
                    ? JSON.stringify(val)
                    : String(val)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Action Link if in remediation */}
        {item.remediation?.actionHref && (
          <div className="pt-1">
            <Link
              href={item.remediation.actionHref}
              className="text-signal hover:underline mono text-xs font-medium flex items-center gap-1"
            >
              {item.remediation.actionLabel || "Action Required →"}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
