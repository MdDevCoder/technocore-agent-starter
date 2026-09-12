"use client";

/**
 * Technocore Agent Workspace: Unified Developer Environment Component
 *
 * Route: /workspace
 *
 * Centralizes agent identity, project memory, toolchain telemetry, and quick actions
 * into a cohesive developer workbench.
 *
 * Light Mode = DEFAULT, Dark Mode = OPTIONAL
 */

import React, { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useWorkspace } from "../hooks/useWorkspace.ts";
import {
  buildHandoffUrl,
  getHandoffPreviewMetadata,
  type ToolDestination,
} from "../workspace/handoff.ts";
import type {
  WorkspaceLanguage,
  WorkspaceArchetype,
  HandoffPreviewMetadata,
} from "../workspace/types.ts";
import { HandoffModal } from "./HandoffModal.tsx";
import { buttonClasses } from "../ui/buttonStyles.ts";

const PUBLIC_ROOMS = [
  "events",
  "general",
  "lobby",
  "technocore",
  "tclk-offers",
  "market",
  "civilization",
  "meta",
] as const;

const ARCHETYPE_OPTIONS: Array<{ id: WorkspaceArchetype; label: string; desc: string }> = [
  {
    id: "TCLK_TRADER",
    label: "TCLK Trader",
    desc: "Bilateral escrow negotiator & hashlock counterparty",
  },
  {
    id: "TELEMETRY_INDEXER",
    label: "Telemetry Indexer",
    desc: "Verifiable log consumer & state machine listener",
  },
  {
    id: "LOBBY_BOT",
    label: "Lobby Bot",
    desc: "Autonomous check-in & directory registration daemon",
  },
  {
    id: "CUSTOM_AGENT",
    label: "Custom Agent",
    desc: "Bespoke wire protocol client with signature verification",
  },
];

export const WorkspaceView: React.FC = () => {
  const {
    workspace,
    isLoaded,
    updateProject,
    recordActivity,
    resetWorkspace,
    exportWorkspace,
    importWorkspace,
  } = useWorkspace();

  // Local editing state for project settings form
  const [editName, setEditName] = useState<string>(workspace.project.name);
  const [editDesc, setEditDesc] = useState<string>(workspace.project.description);
  const [editLang, setEditLang] = useState<WorkspaceLanguage>(workspace.project.language);
  const [editArch, setEditArch] = useState<WorkspaceArchetype>(workspace.project.archetype);
  const [editRoom, setEditRoom] = useState<string>(workspace.project.defaultRoom);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [copiedDid, setCopiedDid] = useState<boolean>(false);

  // Import / Export & Safe Handoff modal state
  const [importJsonText, setImportJsonText] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [handoffModalMeta, setHandoffModalMeta] = useState<HandoffPreviewMetadata | null>(null);

  // Safe Handoff Modal Opener
  const handleOpenHandoffModal = useCallback(
    (destination: ToolDestination, customParams: Record<string, unknown> = {}) => {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const baseParams: Record<string, unknown> = {
        project: workspace.project.name,
        lang: workspace.project.language,
        archetype: workspace.project.archetype,
        room: workspace.project.defaultRoom,
        did: workspace.project.publicDid,
        ...customParams,
      };
      const meta = getHandoffPreviewMetadata(destination, baseParams, origin);
      setHandoffModalMeta(meta);
    },
    [workspace.project],
  );

  // Sync edit form when workspace updates externally
  React.useEffect(() => {
    if (isLoaded) {
      setEditName(workspace.project.name);
      setEditDesc(workspace.project.description);
      setEditLang(workspace.project.language);
      setEditArch(workspace.project.archetype);
      setEditRoom(workspace.project.defaultRoom);
    }
  }, [workspace.project, isLoaded]);

  // Copy DID
  const handleCopyDid = useCallback(() => {
    if (!workspace.project.publicDid) return;
    navigator.clipboard.writeText(workspace.project.publicDid);
    setCopiedDid(true);
    setTimeout(() => setCopiedDid(false), 2000);
  }, [workspace.project.publicDid]);

  // Save Project Settings
  const handleSaveProject = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updateProject({
        name: editName,
        description: editDesc,
        language: editLang,
        archetype: editArch,
        defaultRoom: editRoom,
      });
      recordActivity({
        type: "PROJECT_UPDATED",
        label: "Project Configuration Updated",
        detail: `Updated language to ${editLang} and archetype to ${editArch}`,
        toolHref: "/workspace",
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    },
    [editName, editDesc, editLang, editArch, editRoom, updateProject, recordActivity],
  );

  // Download Workspace JSON
  const handleDownloadJson = useCallback(() => {
    const jsonStr = exportWorkspace();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspace.project.name || "technocore-agent"}-workspace.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportWorkspace, workspace.project.name]);

  // Import Workspace JSON
  const handleImportSubmit = useCallback(() => {
    setImportError(null);
    if (!importJsonText.trim()) {
      setImportError("Please provide valid JSON content.");
      return;
    }
    const res = importWorkspace(importJsonText);
    if (res.ok) {
      setShowImportModal(false);
      setImportJsonText("");
    } else {
      setImportError(res.error);
    }
  }, [importJsonText, importWorkspace]);

  // Deep links for quick actions
  const builderUrl = useMemo(
    () =>
      buildHandoffUrl("builder", {
        project: workspace.project.name,
        lang: workspace.project.language,
        archetype: workspace.project.archetype,
        room: workspace.project.defaultRoom,
        did: workspace.project.publicDid,
      }),
    [workspace.project],
  );

  const forgeUrl = useMemo(
    () =>
      buildHandoffUrl("forge", {
        room: workspace.project.defaultRoom,
        did: workspace.project.publicDid,
      }),
    [workspace.project],
  );

  const doctorUrl = useMemo(
    () =>
      buildHandoffUrl("doctor", {
        room: workspace.project.defaultRoom,
        did: workspace.project.publicDid,
      }),
    [workspace.project],
  );

  const testkitUrl = useMemo(
    () =>
      buildHandoffUrl("testkit", {
        preset: "bilateral-settlement",
      }),
    [],
  );

  const observatoryUrl = useMemo(
    () =>
      buildHandoffUrl("observatory", {
        room: workspace.project.defaultRoom,
      }),
    [workspace.project.defaultRoom],
  );

  const traceUrl = useMemo(
    () =>
      buildHandoffUrl("trace", {
        preset: "live-public-network",
        room: workspace.project.defaultRoom,
      }),
    [workspace.project.defaultRoom],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* 1. Header Overview & Hero */}
      <section className="border-hairline bg-panel mb-8 rounded-xl border p-6 shadow-xs backdrop-blur-sm sm:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono bg-signal/10 text-signal border-signal/20 inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider">
                AGENT WORKSPACE
              </span>
              <span className="border-hairline bg-surface text-muted inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium">
                {workspace.project.language === "TYPESCRIPT" ? "TypeScript / Node.js" : "Python"}
              </span>
              <span className="border-hairline bg-surface text-muted inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium">
                {workspace.project.archetype.replace("_", " ")}
              </span>
              <span className="border-hairline bg-surface text-muted mono inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium">
                /r/{workspace.project.defaultRoom}
              </span>
            </div>

            <h1 className="font-display text-ink text-2xl font-bold tracking-tight sm:text-3xl">
              {workspace.project.name}
            </h1>
            <p className="text-muted max-w-2xl text-sm leading-relaxed sm:text-base">
              {workspace.project.description}
            </p>

            {/* Public DID Lockup */}
            <div className="border-hairline bg-surface flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="mono text-muted text-xs font-medium uppercase tracking-wider">
                  Public DID:
                </span>
                {workspace.project.publicDid ? (
                  <code className="mono text-ink text-xs font-semibold sm:text-sm">
                    {workspace.project.publicDid.slice(0, 24)}...{workspace.project.publicDid.slice(-8)}
                  </code>
                ) : (
                  <span className="text-faint text-xs italic">No identity linked in session</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {workspace.project.publicDid && (
                  <button
                    type="button"
                    onClick={handleCopyDid}
                    className="border-hairline bg-panel hover:bg-panel-hover text-ink rounded border px-2 py-0.5 text-xs font-medium transition-colors"
                  >
                    {copiedDid ? "✓ Copied" : "Copy DID"}
                  </button>
                )}
                <Link
                  href="/onboarding/identity"
                  className="text-signal hover:underline text-xs font-medium"
                >
                  {workspace.project.publicDid ? "Rotate Key →" : "Create Identity →"}
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Config Actions */}
          <div className="flex shrink-0 flex-wrap gap-2 md:flex-col md:items-end">
            <div className="flex items-center gap-2">
              <Link
                href="/health"
                className={buttonClasses("secondary", "sm", "text-xs px-3 py-1.5 flex items-center gap-1.5 font-mono")}
              >
                <span>🩺</span> Check Health
              </Link>
              <button
                type="button"
                onClick={() => handleOpenHandoffModal("forge")}
                className="mono text-xs font-semibold px-3 py-1.5 rounded-md bg-signal/15 text-signal hover:bg-signal/25 border border-signal/30 shadow-xs transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span>🔗</span> Copy Handoff Link
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadJson}
                className={buttonClasses("secondary", "sm", "text-xs px-3 py-1.5")}
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className={buttonClasses("secondary", "sm", "text-xs px-3 py-1.5")}
              >
                Import Config
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="text-faint hover:text-danger hover:underline rounded px-2 py-1 text-xs font-medium transition-colors"
            >
              Reset Workspace
            </button>
          </div>
        </div>

        {/* Readiness Badges Bar */}
        <div className="border-hairline mt-6 border-t pt-4">
          <div className="mono text-muted mb-2 text-xs font-semibold uppercase tracking-wider">
            Agent Status & Readiness:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                workspace.readiness.identityReady
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-surface text-faint border-hairline"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${workspace.readiness.identityReady ? "bg-emerald-500" : "bg-muted"}`} />
              {workspace.readiness.identityReady ? "IDENTITY READY" : "IDENTITY PENDING"}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                workspace.readiness.backupReady
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-surface text-faint border-hairline"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${workspace.readiness.backupReady ? "bg-emerald-500" : "bg-muted"}`} />
              {workspace.readiness.backupReady ? "BACKUP READY" : "BACKUP UNVERIFIED"}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                workspace.readiness.dryRunReady
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-surface text-faint border-hairline"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${workspace.readiness.dryRunReady ? "bg-emerald-500" : "bg-muted"}`} />
              {workspace.readiness.dryRunReady ? "DRY-RUN READY" : "DRY-RUN PENDING"}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                workspace.readiness.testsPassing
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  : "bg-surface text-faint border-hairline"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${workspace.readiness.testsPassing ? "bg-emerald-500" : "bg-muted"}`} />
              {workspace.readiness.testsPassing ? "TESTS PASSING" : "TESTS PENDING"}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
                workspace.readiness.contributionReady
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold"
                  : "bg-surface text-faint border-hairline"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${workspace.readiness.contributionReady ? "bg-emerald-500" : "bg-muted"}`} />
              {workspace.readiness.contributionReady ? "CONTRIBUTION READY" : "CONTRIBUTION INCOMPLETE"}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Quick Actions Grid */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-ink text-lg font-bold tracking-tight">
            Developer Toolchain Quick Actions
          </h2>
          <span className="mono text-muted text-xs">Safe shared context prefilled</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Action 1: Builder */}
          <div className="border-hairline bg-panel hover:border-signal/40 group flex flex-col justify-between rounded-xl border p-5 transition-all shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="mono bg-signal/10 text-signal rounded px-2 py-0.5 text-xs font-semibold">
                  /start
                </span>
                <span className="text-muted text-xs">Builder</span>
              </div>
              <h3 className="font-display text-ink mt-3 text-base font-semibold group-hover:text-signal transition-colors">
                BUILD AGENT
              </h3>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Scaffold code, dry-run Ed25519 signatures, and package complete starter repositories.
              </p>
            </div>
            <div className="border-hairline text-faint mt-4 border-t pt-3 text-[0.6875rem]">
              Preset: {workspace.project.language} · {workspace.project.archetype}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/60 pt-3">
              <Link
                href={builderUrl}
                className="text-signal hover:underline text-xs font-semibold flex items-center gap-1 min-h-[36px] items-center"
              >
                Open →
              </Link>
              <button
                type="button"
                onClick={() => handleOpenHandoffModal("builder")}
                className="border-hairline bg-panel hover:bg-panel-high text-muted hover:text-ink rounded border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95"
              >
                Copy Link
              </button>
            </div>
          </div>

          {/* Action 2: Forge */}
          <div className="border-hairline bg-panel hover:border-signal/40 group flex flex-col justify-between rounded-xl border p-5 transition-all shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="mono bg-signal/10 text-signal rounded px-2 py-0.5 text-xs font-semibold">
                  /forge
                </span>
                <span className="text-muted text-xs">Forge</span>
              </div>
              <h3 className="font-display text-ink mt-3 text-base font-semibold group-hover:text-signal transition-colors">
                FORGE PAYLOAD
              </h3>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Author byte-exact canonical room frames with Unicode sweep inspection.
              </p>
            </div>
            <div className="border-hairline text-faint mt-4 border-t pt-3 text-[0.6875rem]">
              Target: /r/{workspace.project.defaultRoom}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/60 pt-3">
              <Link
                href={forgeUrl}
                className="text-signal hover:underline text-xs font-semibold flex items-center gap-1 min-h-[36px] items-center"
              >
                Open →
              </Link>
              <button
                type="button"
                onClick={() => handleOpenHandoffModal("forge")}
                className="border-hairline bg-panel hover:bg-panel-high text-muted hover:text-ink rounded border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95"
              >
                Copy Link
              </button>
            </div>
          </div>

          {/* Action 3: Doctor */}
          <div className="border-hairline bg-panel hover:border-signal/40 group flex flex-col justify-between rounded-xl border p-5 transition-all shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="mono bg-signal/10 text-signal rounded px-2 py-0.5 text-xs font-semibold">
                  /doctor
                </span>
                <span className="text-muted text-xs">Diagnostics</span>
              </div>
              <h3 className="font-display text-ink mt-3 text-base font-semibold group-hover:text-signal transition-colors">
                CHECK SIGNATURE
              </h3>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Diagnose bit-level wire corruption, nonce mismatches, and prefix defects.
              </p>
            </div>
            <div className="border-hairline text-faint mt-4 border-t pt-3 text-[0.6875rem]">
              Diagnostics: Ed25519 Canonical Rule Sweep
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/60 pt-3">
              <Link
                href={doctorUrl}
                className="text-signal hover:underline text-xs font-semibold flex items-center gap-1 min-h-[36px] items-center"
              >
                Open →
              </Link>
              <button
                type="button"
                onClick={() => handleOpenHandoffModal("doctor")}
                className="border-hairline bg-panel hover:bg-panel-high text-muted hover:text-ink rounded border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95"
              >
                Copy Link
              </button>
            </div>
          </div>

          {/* Action 4: TestKit */}
          <div className="border-hairline bg-panel hover:border-signal/40 group flex flex-col justify-between rounded-xl border p-5 transition-all shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="mono bg-signal/10 text-signal rounded px-2 py-0.5 text-xs font-semibold">
                  /testkit
                </span>
                <span className="text-muted text-xs">Simulation</span>
              </div>
              <h3 className="font-display text-ink mt-3 text-base font-semibold group-hover:text-signal transition-colors">
                TEST TCLK
              </h3>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Simulate bilateral timelock escrow state machines and hashlock claims offline.
              </p>
            </div>
            <div className="border-hairline text-faint mt-4 border-t pt-3 text-[0.6875rem]">
              Total simulated runs: {workspace.telemetry.testkit.totalSimulationsRun}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/60 pt-3">
              <Link
                href={testkitUrl}
                className="text-signal hover:underline text-xs font-semibold flex items-center gap-1 min-h-[36px] items-center"
              >
                Open →
              </Link>
              <button
                type="button"
                onClick={() =>
                  handleOpenHandoffModal("testkit", { preset: "bilateral-settlement" })
                }
                className="border-hairline bg-panel hover:bg-panel-high text-muted hover:text-ink rounded border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95"
              >
                Copy Link
              </button>
            </div>
          </div>

          {/* Action 5: Observatory */}
          <div className="border-hairline bg-panel hover:border-signal/40 group flex flex-col justify-between rounded-xl border p-5 transition-all shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="mono bg-signal/10 text-signal rounded px-2 py-0.5 text-xs font-semibold">
                  /observatory
                </span>
                <span className="text-muted text-xs">Observatory</span>
              </div>
              <h3 className="font-display text-ink mt-3 text-base font-semibold group-hover:text-signal transition-colors">
                OBSERVE NETWORK
              </h3>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Stream live retain-window telemetry directly from public Technocore rooms.
              </p>
            </div>
            <div className="border-hairline text-faint mt-4 border-t pt-3 text-[0.6875rem]">
              Room: /r/{workspace.project.defaultRoom}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/60 pt-3">
              <Link
                href={observatoryUrl}
                className="text-signal hover:underline text-xs font-semibold flex items-center gap-1 min-h-[36px] items-center"
              >
                Open →
              </Link>
              <button
                type="button"
                onClick={() => handleOpenHandoffModal("observatory")}
                className="border-hairline bg-panel hover:bg-panel-high text-muted hover:text-ink rounded border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95"
              >
                Copy Link
              </button>
            </div>
          </div>

          {/* Action 6: Trace Studio */}
          <div className="border-hairline bg-panel hover:border-signal/40 group flex flex-col justify-between rounded-xl border p-5 transition-all shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="mono bg-signal/10 text-signal rounded px-2 py-0.5 text-xs font-semibold">
                  /trace
                </span>
                <span className="text-muted text-xs">Forensics</span>
              </div>
              <h3 className="font-display text-ink mt-3 text-base font-semibold group-hover:text-signal transition-colors">
                TRACE INTERACTION
              </h3>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Reconstruct timelines, verify cryptographic evidence, and detect wire anomalies.
              </p>
            </div>
            <div className="border-hairline text-faint mt-4 border-t pt-3 text-[0.6875rem]">
              Live Source: https://technocore.chat
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/60 pt-3">
              <Link
                href={traceUrl}
                className="text-signal hover:underline text-xs font-semibold flex items-center gap-1 min-h-[36px] items-center"
              >
                Open →
              </Link>
              <button
                type="button"
                onClick={() =>
                  handleOpenHandoffModal("trace", {
                    preset: "live-public-network",
                  })
                }
                className="border-hairline bg-panel hover:bg-panel-high text-muted hover:text-ink rounded border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95"
              >
                Copy Link
              </button>
            </div>
          </div>

          {/* Action 7: Health Monitor */}
          <div className="border-hairline bg-panel hover:border-signal/40 group flex flex-col justify-between rounded-xl border p-5 transition-all shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="mono bg-signal/10 text-signal rounded px-2 py-0.5 text-xs font-semibold">
                  /health
                </span>
                <span className="text-muted text-xs">Diagnostic</span>
              </div>
              <h3 className="font-display text-ink mt-3 text-base font-semibold group-hover:text-signal transition-colors">
                CHECK AGENT HEALTH
              </h3>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Factual runtime evaluation across Identity, Backup, Network, Signing, Protocol, and Trace.
              </p>
            </div>
            <div className="border-hairline text-faint mt-4 border-t pt-3 text-[0.6875rem]">
              Factual Signals · Zero Secrets
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline/60 pt-3">
              <Link
                href="/health"
                className="text-signal hover:underline text-xs font-semibold flex items-center gap-1 min-h-[36px] items-center"
              >
                Inspect Health →
              </Link>
              <Link
                href="/health"
                className="border-hairline bg-panel hover:bg-panel-high text-muted hover:text-ink rounded border px-2.5 py-1 text-xs font-medium transition-colors active:scale-95"
              >
                Run Check
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Two-Column Dashboard Layout */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Configuration & Readiness Matrix */}
        <div className="space-y-8 lg:col-span-7">
          {/* Card: Project Configuration */}
          <div className="border-hairline bg-panel rounded-xl border p-6 shadow-xs">
            <h2 className="font-display text-ink text-base font-bold tracking-tight sm:text-lg">
              Project Memory & Configuration
            </h2>
            <p className="text-muted mt-1 text-xs leading-relaxed">
              Persist your agent&apos;s non-secret attributes locally to seamlessly resume across tools.
            </p>

            <form onSubmit={handleSaveProject} className="mt-5 space-y-4">
              <div>
                <label className="mono text-muted block text-xs font-semibold uppercase">
                  Project Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="border-hairline bg-surface text-ink focus:border-signal mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden"
                  placeholder="e.g. my-technocore-agent"
                  required
                />
              </div>

              <div>
                <label className="mono text-muted block text-xs font-semibold uppercase">
                  Description
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="border-hairline bg-surface text-ink focus:border-signal mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden"
                  placeholder="e.g. Autonomous arbitrage agent for Technocore TCLK orders"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mono text-muted block text-xs font-semibold uppercase">
                    Language
                  </label>
                  <select
                    value={editLang}
                    onChange={(e) => setEditLang(e.target.value as WorkspaceLanguage)}
                    className="border-hairline bg-surface text-ink focus:border-signal mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden"
                  >
                    <option value="TYPESCRIPT">TypeScript / Node.js</option>
                    <option value="PYTHON">Python</option>
                  </select>
                </div>

                <div>
                  <label className="mono text-muted block text-xs font-semibold uppercase">
                    Default Room
                  </label>
                  <select
                    value={editRoom}
                    onChange={(e) => setEditRoom(e.target.value)}
                    className="border-hairline bg-surface text-ink focus:border-signal mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-hidden"
                  >
                    {PUBLIC_ROOMS.map((r) => (
                      <option key={r} value={r}>
                        /r/{r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mono text-muted block text-xs font-semibold uppercase">
                  Agent Archetype
                </label>
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ARCHETYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEditArch(opt.id)}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        editArch === opt.id
                          ? "border-signal bg-signal/5 text-ink"
                          : "border-hairline bg-surface text-muted hover:text-ink hover:bg-surface/80"
                      }`}
                    >
                      <div className="font-semibold text-xs">{opt.label}</div>
                      <div className="text-[0.6875rem] text-muted mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  className={buttonClasses("primary", "sm", "text-xs px-4 py-2")}
                >
                  Save Configuration
                </button>
                {isSaved && (
                  <span className="mono text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                    ✓ Configuration Saved
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Card: Toolchain Readiness Matrix */}
          <div className="border-hairline bg-panel rounded-xl border p-6 shadow-xs">
            <h2 className="font-display text-ink text-base font-bold tracking-tight sm:text-lg">
              Toolchain Readiness Matrix
            </h2>
            <p className="text-muted mt-1 text-xs leading-relaxed">
              Step-by-step developer pipeline status computed from factual session evidence.
            </p>

            <div className="mt-4 divide-hairline divide-y">
              {/* Step 1: Scaffold */}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    workspace.readiness.dryRunReady ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-surface text-faint border border-hairline"
                  }`}>
                    {workspace.readiness.dryRunReady ? "✓" : "1"}
                  </span>
                  <div>
                    <h4 className="text-ink text-xs font-semibold">1. Project Scaffolding & Dry-Run</h4>
                    <p className="text-muted text-[0.6875rem]">Generate boilerplate code and dry-run first wire signing.</p>
                  </div>
                </div>
                <Link href={builderUrl} className="text-signal hover:underline shrink-0 text-xs font-medium">
                  {workspace.readiness.dryRunReady ? "Re-run →" : "Start →"}
                </Link>
              </div>

              {/* Step 2: Identity */}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    workspace.readiness.identityReady ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-surface text-faint border border-hairline"
                  }`}>
                    {workspace.readiness.identityReady ? "✓" : "2"}
                  </span>
                  <div>
                    <h4 className="text-ink text-xs font-semibold">2. Cryptographic Identity Session</h4>
                    <p className="text-muted text-[0.6875rem]">Derive Ed25519 keypair and public multibase did:key identifier.</p>
                  </div>
                </div>
                <Link href="/onboarding/identity" className="text-signal hover:underline shrink-0 text-xs font-medium">
                  {workspace.readiness.identityReady ? "Inspect →" : "Derive →"}
                </Link>
              </div>

              {/* Step 3: Encrypted Backup */}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    workspace.readiness.backupReady ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-surface text-faint border border-hairline"
                  }`}>
                    {workspace.readiness.backupReady ? "✓" : "3"}
                  </span>
                  <div>
                    <h4 className="text-ink text-xs font-semibold">3. Encrypted Identity Backup</h4>
                    <p className="text-muted text-[0.6875rem]">Verify restore proof before dropping raw key material.</p>
                  </div>
                </div>
                <Link href="/onboarding/backup" className="text-signal hover:underline shrink-0 text-xs font-medium">
                  {workspace.readiness.backupReady ? "Verified ✓" : "Backup →"}
                </Link>
              </div>

              {/* Step 4: TCLK Simulation */}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    workspace.readiness.testsPassing ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-surface text-faint border border-hairline"
                  }`}>
                    {workspace.readiness.testsPassing ? "✓" : "4"}
                  </span>
                  <div>
                    <h4 className="text-ink text-xs font-semibold">4. TCLK Escrow Settlement Verification</h4>
                    <p className="text-muted text-[0.6875rem]">Simulate bilateral offer, accept, lock, and reveal transitions.</p>
                  </div>
                </div>
                <Link href={testkitUrl} className="text-signal hover:underline shrink-0 text-xs font-medium">
                  {workspace.readiness.testsPassing ? "Simulated ✓" : "Test →"}
                </Link>
              </div>

              {/* Step 5: Live Observation & Trace */}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-start gap-3">
                  <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    ✓
                  </span>
                  <div>
                    <h4 className="text-ink text-xs font-semibold">5. Public Network Observability & Trace</h4>
                    <p className="text-muted text-[0.6875rem]">Live retained-window stream & cryptographic evidence replay.</p>
                  </div>
                </div>
                <Link href={traceUrl} className="text-signal hover:underline shrink-0 text-xs font-medium">
                  Trace →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Activity Timeline & Safe Storage */}
        <div className="space-y-8 lg:col-span-5">
          {/* Card: Recent Activity Timeline */}
          <div className="border-hairline bg-panel rounded-xl border p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-ink text-base font-bold tracking-tight">
                Recent Local Activity
              </h2>
              <span className="mono text-muted text-xs">
                {workspace.activities.length} event{workspace.activities.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-muted mt-1 text-xs leading-relaxed">
              Real chronological log of your local session actions.
            </p>

            <div className="mt-4 max-h-96 overflow-y-auto space-y-3 pr-1">
              {workspace.activities.map((act) => (
                <div
                  key={act.id}
                  className="border-hairline bg-surface hover:border-signal/30 rounded-lg border p-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-ink text-xs font-semibold">{act.label}</div>
                    <span className="mono text-faint shrink-0 text-[0.625rem]">
                      {act.timestamp.slice(11, 19)} UTC
                    </span>
                  </div>
                  <p className="text-muted mt-1 text-xs leading-snug">{act.detail}</p>
                  <div className="mt-2 text-right">
                    <Link
                      href={act.toolHref}
                      className="text-signal hover:underline text-[0.6875rem] font-medium"
                    >
                      Open Tool →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card: Zero-Custody Guarantee Notice */}
          <div className="border-hairline bg-panel/60 rounded-xl border p-5 text-xs shadow-xs">
            <h3 className="font-display text-ink flex items-center gap-1.5 font-bold">
              <span className="text-emerald-700 dark:text-emerald-400">🔒</span> Zero-Secret Security Boundary
            </h3>
            <p className="text-muted mt-2 leading-relaxed">
              This workspace stores only public configuration (project name, language, archetype,
              public DID, and default room).
            </p>
            <p className="text-muted mt-2 leading-relaxed">
              Private keys, signing seeds, and passwords are never persisted to localStorage or exported in
              JSON configurations.
            </p>
          </div>
        </div>
      </div>

      {/* Import Configuration Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="border-hairline bg-panel max-w-lg w-full rounded-xl border p-6 shadow-xl">
            <h3 className="font-display text-ink text-lg font-bold">Import Workspace Configuration</h3>
            <p className="text-muted mt-1 text-xs">
              Paste your exported non-secret workspace JSON. Content will be filtered through strict allowlist rules.
            </p>

            <textarea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder="Paste JSON here..."
              rows={8}
              className="border-hairline bg-surface text-ink font-mono focus:border-signal mt-4 block w-full rounded-md border p-3 text-xs focus:outline-hidden"
            />

            {importError && (
              <p className="text-danger mt-2 text-xs font-semibold">{importError}</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportError(null);
                }}
                className={buttonClasses("secondary", "sm")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                className={buttonClasses("primary", "sm")}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="border-hairline bg-panel max-w-md w-full rounded-xl border p-6 shadow-xl">
            <h3 className="font-display text-ink text-lg font-bold">Reset Workspace?</h3>
            <p className="text-muted mt-2 text-xs leading-relaxed">
              This will reset your local project name, archetype, and activity log to default values.
              Your cryptographic identity keys in active memory will not be deleted.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className={buttonClasses("secondary", "sm")}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  resetWorkspace();
                  setShowResetConfirm(false);
                }}
                className="bg-danger hover:bg-danger/90 text-white rounded-md px-3 py-1.5 text-xs font-semibold transition-colors"
              >
                Reset Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Handoff Link Modal */}
      <HandoffModal
        metadata={handoffModalMeta}
        isOpen={handoffModalMeta !== null}
        onClose={() => setHandoffModalMeta(null)}
      />
    </div>
  );
};
