"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { buttonClasses } from "../ui/buttonStyles.ts";
import { CopyButton } from "../ui/copy.tsx";
import type { DemoStageNumber } from "../demo/types.ts";
import {
  DEMO_STAGES,
  STAGE_1_BUILD_FIXTURE,
  STAGE_2_WORKSPACE_FIXTURE,
  STAGE_3_TCLK_STEPS_FIXTURE,
  STAGE_4_READINESS_FIXTURE,
  STAGE_5_HEALTH_FIXTURE,
  STAGE_6_CONTRIBUTION_FIXTURE,
  STAGE_7_EVIDENCE_FIXTURE,
  STAGE_8_OBSERVATORY_FIXTURE,
  STAGE_9_TRACE_FIXTURE,
  STAGE_10_ACTIVITY_FIXTURE,
} from "../demo/fixtures.ts";
import {
  getStageMeta,
  getNextStage,
  getPreviousStage,
  parseStageFromQuery,
  computeDemoProgressPercentage,
} from "../demo/engine.ts";

export const GuidedDemoView: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Active Stage State
  const initialStage = useMemo(() => {
    return parseStageFromQuery(searchParams?.get("stage"));
  }, [searchParams]);

  const [currentStage, setCurrentStage] = useState<DemoStageNumber>(initialStage);
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set());

  // Interactive Stage-specific local states
  const [stage3StepIndex, setStage3StepIndex] = useState<number>(0);
  const [stage7Verified, setStage7Verified] = useState<boolean>(false);
  const [stage9FrameIndex, setStage9FrameIndex] = useState<number>(0);
  const [stage1SelectedFile, setStage1SelectedFile] = useState<string>("src/agent.ts");

  // Sync state if query param changes
  useEffect(() => {
    if (searchParams) {
      const qStage = parseStageFromQuery(searchParams.get("stage"));
      setCurrentStage(qStage);
    }
  }, [searchParams]);

  // Stage Meta & Helpers
  const stageMeta = useMemo(() => getStageMeta(currentStage), [currentStage]);
  const progressPercent = useMemo(() => computeDemoProgressPercentage(currentStage), [currentStage]);

  const navigateToStage = useCallback(
    (targetStage: DemoStageNumber) => {
      setCurrentStage(targetStage);
      setCompletedStages((prev) => {
        const next = new Set(prev);
        if (currentStage < targetStage) {
          for (let i = 1; i < targetStage; i++) next.add(i);
        }
        return next;
      });
      router.push(`/demo?stage=${targetStage}`, { scroll: false });
    },
    [currentStage, router],
  );

  const handleNext = useCallback(() => {
    const next = getNextStage(currentStage);
    setCompletedStages((prev) => new Set(prev).add(currentStage));
    navigateToStage(next);
  }, [currentStage, navigateToStage]);

  const handlePrev = useCallback(() => {
    const prev = getPreviousStage(currentStage);
    navigateToStage(prev);
  }, [currentStage, navigateToStage]);

  const handleRestart = useCallback(() => {
    setCompletedStages(new Set());
    setStage3StepIndex(0);
    setStage7Verified(false);
    setStage9FrameIndex(0);
    navigateToStage(1);
  }, [navigateToStage]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8 animate-fadeIn">
      {/* 1. Header Banner & Progress Bar */}
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-hairline pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-signal bg-signal/10 px-2.5 py-0.5 rounded-full border border-signal/25 uppercase mono tracking-wider">
                Guided Walkthrough
              </span>
              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/25 uppercase mono">
                LOCAL DEMO / SYNTHETIC PREVIEW
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-ink tracking-tight font-display">
              Technocore Guided Platform Walkthrough
            </h1>
            <p className="text-xs sm:text-sm text-muted max-w-2xl leading-relaxed">
              Explore the entire 10-stage agent lifecycle deterministically — from starter scaffolding and TCLK contract negotiation to evidence preservation and forensic replay.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleRestart}
              className={buttonClasses("secondary", "sm", "mono text-xs font-semibold flex items-center gap-1.5")}
              title="Reset walkthrough back to Stage 1"
            >
              <span>↺ Restart Demo</span>
            </button>
          </div>
        </div>

        {/* 10-Stage Progress Rail */}
        <nav aria-label="Walkthrough Stage Rail" className="space-y-2">
          <div className="flex items-center justify-between text-xs mono text-muted">
            <span className="font-semibold text-ink">
              Stage {currentStage} of 10: <span className="text-signal">{stageMeta.shortTitle}</span>
            </span>
            <span>{progressPercent}% Complete · Est. {stageMeta.timeEstimate}</span>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-1">
            {DEMO_STAGES.map((s) => {
              const isCurrent = s.stage === currentStage;
              const isCompleted = completedStages.has(s.stage) || s.stage < currentStage;

              return (
                <button
                  key={s.stage}
                  type="button"
                  onClick={() => navigateToStage(s.stage)}
                  className={`p-2 rounded-lg border text-left transition-all mono flex flex-col justify-between min-h-[58px] ${
                    isCurrent
                      ? "border-signal bg-signal/10 ring-1 ring-signal/30 shadow-sm"
                      : isCompleted
                      ? "border-hairline bg-panel hover:border-hairline-bright"
                      : "border-hairline/60 bg-void/60 text-faint hover:border-hairline hover:text-muted"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-[10px] font-bold ${isCurrent ? "text-signal" : "text-muted"}`}>
                      0{s.stage}
                    </span>
                    {isCompleted && !isCurrent && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓</span>
                    )}
                  </div>
                  <span className={`text-[11px] font-bold truncate block ${isCurrent ? "text-ink" : ""}`}>
                    {s.shortTitle}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* 2. Main Stage Content Grid */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Stage Explanation & Handoff (5 cols) */}
        <section className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
            <div className="space-y-1 border-b border-hairline pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-signal mono">
                {stageMeta.title}
              </span>
              <h2 className="text-xl font-bold text-ink font-display tracking-tight">
                {stageMeta.shortTitle} Overview
              </h2>
              <p className="text-xs text-muted leading-relaxed">{stageMeta.summary}</p>
            </div>

            {/* Key Concepts */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold text-ink mono uppercase tracking-wider">
                Key Protocol Concepts:
              </h3>
              <ul className="space-y-2 text-xs text-muted leading-relaxed">
                {stageMeta.conceptExplanation.map((concept, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-signal font-bold shrink-0">▸</span>
                    <span>{concept}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Zero-Custody Security Callout */}
            <div className="p-3.5 rounded-lg bg-void border border-hairline text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-ink text-[11px] mono">
                <span className="text-signal">🛡️</span>
                <span>Zero-Custody Boundary Guarantee</span>
              </div>
              <p className="text-muted leading-relaxed text-[11px]">{stageMeta.zeroCustodyNote}</p>
            </div>

            {/* Real Product Handoff Action */}
            <div className="pt-2 border-t border-hairline space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                Live Tool Handoff:
              </span>
              <p className="text-[11px] text-muted">{stageMeta.handoff.description}</p>
              <Link
                href={
                  stageMeta.handoff.params
                    ? `${stageMeta.handoff.route}?${new URLSearchParams(stageMeta.handoff.params).toString()}`
                    : stageMeta.handoff.route
                }
                className={buttonClasses("primary", "md", "w-full justify-center mono text-xs font-bold flex items-center gap-2 shadow-sm")}
              >
                <span>{stageMeta.handoff.title} ({stageMeta.handoff.route}) →</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Right Column: Live Interactive Demonstration Sandbox (7 cols) */}
        <section className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-5 shadow-sm min-h-[460px]">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink mono uppercase">Interactive Demo Sandbox</span>
                <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 mono">
                  SYNTHETIC FIXTURE
                </span>
              </div>
              <span className="text-[10px] text-muted mono">Deterministic Preview</span>
            </div>

            {/* STAGE 1: BUILD SANDBOX */}
            {currentStage === 1 && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Selected Archetype Template:
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">{STAGE_1_BUILD_FIXTURE.archetypeName}</span>
                    <span className="text-xs text-signal font-semibold mono">/r/{STAGE_1_BUILD_FIXTURE.targetRoom}</span>
                  </div>
                  <div className="text-[11px] mono text-muted flex items-center gap-2 pt-1">
                    <span>Public DID:</span>
                    <code className="text-ink text-[10px] select-all truncate">{STAGE_1_BUILD_FIXTURE.publicDid}</code>
                  </div>
                </div>

                {/* File Tree Explorer */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Generated Starter Repository Structure:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGE_1_BUILD_FIXTURE.fileTree.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => setStage1SelectedFile(f.path)}
                        className={`px-2.5 py-1 rounded text-xs mono border transition-colors ${
                          stage1SelectedFile === f.path
                            ? "border-signal bg-signal/15 text-ink font-bold"
                            : "border-hairline bg-void text-muted hover:text-ink"
                        }`}
                      >
                        {f.path}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] mono text-faint px-1">
                      <span>{stage1SelectedFile}</span>
                      <span>{STAGE_1_BUILD_FIXTURE.fileTree.find((f) => f.path === stage1SelectedFile)?.desc || ""}</span>
                    </div>
                    <pre className="p-3.5 rounded-lg bg-void border border-hairline text-xs font-mono text-ink overflow-x-auto max-h-[220px] leading-relaxed select-all">
                      {STAGE_1_BUILD_FIXTURE.fileContents[stage1SelectedFile] || STAGE_1_BUILD_FIXTURE.sampleCodeSnippet}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 2: CONFIGURE WORKSPACE SANDBOX */}
            {currentStage === 2 && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Active Workspace Context:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs mono">
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Project Name:</span>
                      <span className="font-bold text-ink">{STAGE_2_WORKSPACE_FIXTURE.activeProject}</span>
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Target Room:</span>
                      <span className="font-bold text-signal">/r/{STAGE_2_WORKSPACE_FIXTURE.activeRoom}</span>
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Language:</span>
                      <span className="font-bold text-ink">{STAGE_2_WORKSPACE_FIXTURE.activeLanguage}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    3-Stage Lifecycle Toolchain Organization:
                  </span>
                  <div className="space-y-2">
                    {STAGE_2_WORKSPACE_FIXTURE.lifecycleStages.map((stg) => (
                      <div key={stg.name} className="p-2.5 rounded-lg bg-surface border border-hairline text-xs flex items-center justify-between">
                        <span className="font-bold text-ink mono text-[11px]">{stg.name}</span>
                        <div className="flex gap-1.5">
                          {stg.tools.map((t) => (
                            <span key={t} className="px-2 py-0.5 rounded bg-panel border border-hairline text-[10px] text-muted mono">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 3: TEST TCLK SIMULATOR SANDBOX */}
            {currentStage === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs mono text-muted">
                  <span className="font-bold text-ink">Bilateral Deal State:</span>
                  <span>Step {stage3StepIndex + 1} of 4</span>
                </div>

                {/* 4 Step Selector Buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  {STAGE_3_TCLK_STEPS_FIXTURE.map((step, idx) => (
                    <button
                      key={step.type}
                      type="button"
                      onClick={() => setStage3StepIndex(idx)}
                      className={`p-2 rounded-lg border text-center transition-all mono text-xs font-bold ${
                        stage3StepIndex === idx
                          ? "border-signal bg-signal/15 text-signal"
                          : "border-hairline bg-void text-muted hover:text-ink"
                      }`}
                    >
                      {step.step}. {step.type}
                    </button>
                  ))}
                </div>

                {/* Active Step Details */}
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-3">
                  {(() => {
                    const activeStep = STAGE_3_TCLK_STEPS_FIXTURE[stage3StepIndex] || STAGE_3_TCLK_STEPS_FIXTURE[0]!;
                    return (
                      <>
                        <div className="flex items-center justify-between border-b border-hairline pb-2">
                          <span className="font-bold text-ink text-sm mono">
                            {activeStep.type} · <span className="text-signal">{activeStep.status}</span>
                          </span>
                          <span className="text-xs text-muted mono">/r/{activeStep.room}</span>
                        </div>
                        <p className="text-xs text-muted">{activeStep.summary}</p>
                        <div className="text-[11px] mono text-faint">
                          <span>Author: </span>
                          <span className="text-ink select-all">{activeStep.author}</span>
                        </div>
                        <pre className="p-2.5 rounded bg-panel border border-hairline text-[11px] font-mono text-ink overflow-x-auto select-all">
                          {JSON.stringify(activeStep.payload, null, 2)}
                        </pre>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* STAGE 4: READINESS FLOW SANDBOX */}
            {currentStage === 4 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">7-Stage Compliance Gates:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">7 / 7 VERIFIED READY</span>
                </div>

                <div className="space-y-1.5">
                  {STAGE_4_READINESS_FIXTURE.map((item) => (
                    <div
                      key={item.stage}
                      className="p-2.5 rounded-lg bg-void border border-hairline text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mono">
                          ✓ Gate 0{item.stage}
                        </span>
                        <span className="font-semibold text-ink">{item.name}</span>
                      </div>
                      <span className="text-[11px] text-muted mono truncate max-w-[200px]">{item.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STAGE 5: HEALTH DIAGNOSTIC SANDBOX */}
            {currentStage === 5 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">Subsystem Health Status:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">ALL SUBSYSTEMS HEALTHY</span>
                </div>

                <div className="space-y-2">
                  {STAGE_5_HEALTH_FIXTURE.map((h) => (
                    <div
                      key={h.subsystem}
                      className="p-3 rounded-lg bg-void border border-hairline text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-ink">{h.subsystem}</div>
                        <div className="text-[10px] text-faint mono">{h.detail}</div>
                      </div>
                      <div className="text-right mono">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs block">
                          ● {h.status}
                        </span>
                        <span className="text-[10px] text-muted">{h.latency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STAGE 6: CONTRIBUTE SANDBOX */}
            {currentStage === 6 && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-lg bg-void border border-hairline space-y-2">
                  <div className="flex items-center justify-between text-[11px] mono text-muted">
                    <span className="font-semibold text-ink">Local Terminal Command:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">● LOCAL EXECUTION ONLY</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-panel p-2.5 rounded-md border border-hairline">
                    <code className="text-signal font-bold text-xs select-all">
                      {STAGE_6_CONTRIBUTION_FIXTURE.command}
                    </code>
                    <CopyButton value={STAGE_6_CONTRIBUTION_FIXTURE.command} label="CLI Command" variant="secondary" />
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Signs and records your contribution directly from your machine. No private keys are sent to the web browser.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    7-Step Pipeline Overview:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {STAGE_6_CONTRIBUTION_FIXTURE.workflowSteps.map((s) => (
                      <div key={s.num} className="p-2 rounded bg-surface border border-hairline text-xs">
                        <div className="font-bold text-ink mono text-[11px]">
                          {s.num}. {s.name}
                        </div>
                        <div className="text-[10px] text-faint truncate">{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 7: EVIDENCE VAULT SANDBOX */}
            {currentStage === 7 && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-3">
                  <div className="flex items-center justify-between border-b border-hairline pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm mono">
                        /r/{STAGE_7_EVIDENCE_FIXTURE.room} seq {STAGE_7_EVIDENCE_FIXTURE.seq}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 mono">
                        {STAGE_7_EVIDENCE_FIXTURE.provenance}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mono">
                      ✓ {STAGE_7_EVIDENCE_FIXTURE.verificationStatus}
                    </span>
                  </div>

                  <div className="text-xs text-ink p-2.5 rounded bg-panel border border-hairline select-all">
                    &ldquo;{STAGE_7_EVIDENCE_FIXTURE.text}&rdquo;
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] mono text-muted">
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Author DID:</span>
                      <span className="text-ink truncate block select-all">{STAGE_7_EVIDENCE_FIXTURE.authorDid}</span>
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">SHA-256 Hash:</span>
                      <span className="text-faint truncate block">{STAGE_7_EVIDENCE_FIXTURE.evidenceSha256}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-hairline flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStage7Verified(true)}
                      className={buttonClasses("secondary", "sm", "mono text-xs font-semibold")}
                    >
                      {stage7Verified ? "✓ Verified with WebCrypto" : "Test Verify Signature"}
                    </button>
                    <span className="text-[10px] text-muted mono">Ed25519 Canonical Roundtrip</span>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 8: OBSERVATORY SANDBOX */}
            {currentStage === 8 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">Public Room Wire Stream:</span>
                  <span className="text-signal">3 Observed Records</span>
                </div>

                <div className="space-y-2">
                  {STAGE_8_OBSERVATORY_FIXTURE.map((rec) => (
                    <div
                      key={rec.sequence}
                      className="p-3 rounded-lg bg-void border border-hairline text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between mono">
                        <span className="font-bold text-ink">
                          /r/{rec.room} <span className="text-signal">#{rec.sequence}</span>
                        </span>
                        <span className="text-[10px] text-faint">{rec.time}</span>
                      </div>
                      <div className="text-[11px] text-ink font-mono p-1.5 rounded bg-panel border border-hairline truncate select-all">
                        {rec.text}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-faint mono">
                        <span>{rec.authorDid}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Ed25519 VALID</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STAGE 9: TRACE STUDIO SANDBOX */}
            {currentStage === 9 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs mono text-muted">
                  <span className="font-bold text-ink">{STAGE_9_TRACE_FIXTURE.presetName}</span>
                  <span>Frame {stage9FrameIndex + 1} of {STAGE_9_TRACE_FIXTURE.totalFrames}</span>
                </div>

                {/* Frame Scrubber */}
                <div className="grid grid-cols-4 gap-1.5">
                  {STAGE_9_TRACE_FIXTURE.frames.map((frm, idx) => (
                    <button
                      key={frm.frame}
                      type="button"
                      onClick={() => setStage9FrameIndex(idx)}
                      className={`p-2 rounded-lg border text-center transition-all mono text-xs ${
                        stage9FrameIndex === idx
                          ? "border-signal bg-signal/15 text-signal font-bold"
                          : "border-hairline bg-void text-muted hover:text-ink"
                      }`}
                    >
                      Frame {frm.frame}
                    </button>
                  ))}
                </div>

                {/* Active Frame Card */}
                {(() => {
                  const frame = STAGE_9_TRACE_FIXTURE.frames[stage9FrameIndex] || STAGE_9_TRACE_FIXTURE.frames[0]!;
                  return (
                    <div className="p-4 rounded-lg bg-void border border-hairline space-y-2 mono text-xs">
                      <div className="flex items-center justify-between border-b border-hairline pb-2">
                        <span className="font-bold text-ink">{frame.event}</span>
                        <span className="px-2 py-0.5 rounded bg-signal/10 text-signal font-bold text-[10px]">
                          STATE: {frame.state}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">
                        <span>Payload Hash: </span>
                        <span className="text-ink">{frame.payloadHash}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* STAGE 10: ACTIVITY CENTER SANDBOX */}
            {currentStage === 10 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">Immutable Local Audit Log:</span>
                  <span className="text-signal">5 Verified Events</span>
                </div>

                <div className="space-y-1.5">
                  {STAGE_10_ACTIVITY_FIXTURE.map((act) => (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-lg bg-void border border-hairline text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-panel border border-hairline font-bold mono uppercase text-muted">
                          {act.category}
                        </span>
                        <span className="font-semibold text-ink">{act.action}</span>
                      </div>
                      <div className="text-right mono text-[10px]">
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold block">{act.status}</span>
                        <span className="text-faint">{act.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 3. Bottom Walkthrough Navigation Controller */}
      <footer className="p-4 rounded-xl border border-hairline bg-panel flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentStage <= 1}
          className={buttonClasses("secondary", "md", "w-full sm:w-auto mono text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed")}
        >
          ← Previous Stage
        </button>

        <div className="text-xs mono text-muted flex items-center gap-3">
          <span>Stage {currentStage} of 10</span>
          <span className="text-faint">|</span>
          <button
            type="button"
            onClick={handleRestart}
            className="text-signal hover:underline font-semibold"
          >
            Restart Walkthrough
          </button>
        </div>

        {currentStage < 10 ? (
          <button
            type="button"
            onClick={handleNext}
            className={buttonClasses("primary", "md", "w-full sm:w-auto mono text-xs font-bold shadow-sm")}
          >
            Next: {getStageMeta(getNextStage(currentStage)).shortTitle} →
          </button>
        ) : (
          <Link
            href="/workspace"
            className={buttonClasses("primary", "md", "w-full sm:w-auto mono text-xs font-bold shadow-sm text-center")}
          >
            Finish Demo & Open Workspace →
          </Link>
        )}
      </footer>
    </div>
  );
};
