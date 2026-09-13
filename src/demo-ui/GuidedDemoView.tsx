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
  STAGE_7_EVIDENCE_SAMPLES,
  STAGE_8_OBSERVATORY_FIXTURE,
  STAGE_9_TRACE_PRESETS,
  STAGE_10_ACTIVITY_FIXTURE,
} from "../demo/fixtures.ts";
import {
  getStageMeta,
  getNextStage,
  getPreviousStage,
  parseStageFromQuery,
  computeDemoProgressPercentage,
} from "../demo/engine.ts";
import { ARCHETYPES, generateStarterProject } from "../starter/generator.ts";
import type { AgentArchetypeId, AgentLanguageId } from "../starter/types.ts";
import { buildHandoffUrl, type ToolDestination } from "../workspace/handoff.ts";

export const GuidedDemoView: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Active Stage State
  const initialStage = useMemo(() => {
    return parseStageFromQuery(searchParams?.get("stage"));
  }, [searchParams]);

  const [currentStage, setCurrentStage] = useState<DemoStageNumber>(initialStage);
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set());

  // STAGE 1 Local State: Archetype, Language, Room, Selected File
  const [stage1ArchetypeId, setStage1ArchetypeId] = useState<AgentArchetypeId>("TCLK_TRADER");
  const [stage1Language, setStage1Language] = useState<AgentLanguageId>("TYPESCRIPT");
  const [stage1Room, setStage1Room] = useState<string>("tclk-offers");
  const [stage1SelectedFile, setStage1SelectedFile] = useState<string>("src/agent.ts");

  // STAGE 2 Local State: Workspace Context & Target Tool Handoff
  const [stage2ProjectName, setStage2ProjectName] = useState<string>("alpha-trader");
  const [stage2Room, setStage2Room] = useState<string>("tclk-offers");
  const [stage2Lang, setStage2Lang] = useState<AgentLanguageId>("TYPESCRIPT");
  const [stage2ToolTarget, setStage2ToolTarget] = useState<string>("testkit");

  // STAGE 3 Local State: TCLK Bilateral Deal Step & Parameters
  const [stage3StepIndex, setStage3StepIndex] = useState<number>(0);
  const [stage3Asset, setStage3Asset] = useState<string>("FLOP");
  const [stage3Amount, setStage3Amount] = useState<string>("500");
  const [stage3Rail, setStage3Rail] = useState<string>("flop-htlc");

  // STAGE 4 Local State: Readiness Gate Selected
  const [stage4SelectedGate, setStage4SelectedGate] = useState<number>(1);

  // STAGE 5 Local State: Health Subsystem Tab
  const [stage5Subsystem, setStage5Subsystem] = useState<string>("all");

  // STAGE 6 Local State: Contribution Step & CLI Environment
  const [stage6StepIndex, setStage6StepIndex] = useState<number>(0);
  const [stage6Env, setStage6Env] = useState<"python" | "node" | "curl">("python");

  // STAGE 7 Local State: Evidence Vault Sample & Verification
  const [stage7SampleIndex, setStage7SampleIndex] = useState<number>(0);
  const [stage7Verified, setStage7Verified] = useState<boolean>(false);

  // STAGE 8 Local State: Observatory Room Filter & Selected Message
  const [stage8RoomFilter, setStage8RoomFilter] = useState<string>("all");
  const [stage8SelectedSeq, setStage8SelectedSeq] = useState<number>(3041);

  // STAGE 9 Local State: Trace Preset & Frame Scrubber
  const [stage9PresetIndex, setStage9PresetIndex] = useState<number>(0);
  const [stage9FrameIndex, setStage9FrameIndex] = useState<number>(0);

  // STAGE 10 Local State: Activity Category Filter & Selected Event
  const [stage10Category, setStage10Category] = useState<string>("ALL");
  const [stage10SelectedId, setStage10SelectedId] = useState<string>("act-1");

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
    setStage1ArchetypeId("TCLK_TRADER");
    setStage1Language("TYPESCRIPT");
    setStage1Room("tclk-offers");
    setStage1SelectedFile("src/agent.ts");
    setStage2ToolTarget("testkit");
    setStage3StepIndex(0);
    setStage4SelectedGate(1);
    setStage5Subsystem("all");
    setStage6StepIndex(0);
    setStage7SampleIndex(0);
    setStage7Verified(false);
    setStage8RoomFilter("all");
    setStage9PresetIndex(0);
    setStage9FrameIndex(0);
    setStage10Category("ALL");
    navigateToStage(1);
  }, [navigateToStage]);

  // --- Dynamic Computations for Stage 1 (Build) ---
  const stage1Project = useMemo(() => {
    return generateStarterProject({
      archetypeId: stage1ArchetypeId,
      languageId: stage1Language,
      agentName: "alpha-trader",
      targetRoom: stage1Room,
      publicDid: STAGE_1_BUILD_FIXTURE.publicDid,
    });
  }, [stage1ArchetypeId, stage1Language, stage1Room]);

  const stage1ActiveFile = useMemo(() => {
    const found = stage1Project.files.find((f) => f.path === stage1SelectedFile);
    if (found) return found;
    return stage1Project.files[0] || { path: "src/agent.ts", content: "", language: "typescript" };
  }, [stage1Project.files, stage1SelectedFile]);

  const handleStage1SelectArchetype = useCallback((id: AgentArchetypeId) => {
    setStage1ArchetypeId(id);
    const arch = ARCHETYPES.find((a) => a.id === id);
    if (arch) {
      setStage1Room(arch.defaultRoom);
      setStage1Language(arch.recommendedLanguage);
      setStage1SelectedFile(arch.recommendedLanguage === "TYPESCRIPT" ? "src/agent.ts" : "agent.py");
    }
  }, []);

  const handleStage1SelectLanguage = useCallback((lang: AgentLanguageId) => {
    setStage1Language(lang);
    setStage1SelectedFile(lang === "TYPESCRIPT" ? "src/agent.ts" : "agent.py");
  }, []);

  // --- Dynamic Computations for Stage 2 (Workspace Handoff) ---
  // --- Dynamic Computations for Stage 2 (Workspace Handoff) ---
  const stage2HandoffUrl = useMemo(() => {
    const validTargets: ToolDestination[] = [
      "workspace", "builder", "forge", "doctor", "testkit", "evidence", "observatory", "trace", "onboarding"
    ];
    const target = validTargets.includes(stage2ToolTarget as ToolDestination)
      ? (stage2ToolTarget as ToolDestination)
      : "workspace";
    return buildHandoffUrl(target, {
      project: stage2ProjectName,
      lang: stage2Lang,
      room: stage2Room,
      did: STAGE_2_WORKSPACE_FIXTURE.publicDid,
    });
  }, [stage2ToolTarget, stage2ProjectName, stage2Lang, stage2Room]);

  // --- Dynamic Computations for Stage 3 (TCLK Simulator) ---
  const stage3DynamicStep = useMemo(() => {
    const base = STAGE_3_TCLK_STEPS_FIXTURE[stage3StepIndex] || STAGE_3_TCLK_STEPS_FIXTURE[0]!;
    const payload = { ...base.payload } as Record<string, unknown>;
    if (payload.asset) payload.asset = stage3Asset;
    if (payload.amount) payload.amount = stage3Amount;
    if (payload.rails) payload.rails = ["paper", stage3Rail];
    if (payload.settlementRail) payload.settlementRail = stage3Rail;
    return {
      ...base,
      payload,
    };
  }, [stage3StepIndex, stage3Asset, stage3Amount, stage3Rail]);

  // --- Dynamic Computations for Stage 7 (Evidence Vault) ---
  const stage7ActiveSample = useMemo(() => {
    return STAGE_7_EVIDENCE_SAMPLES[stage7SampleIndex] || STAGE_7_EVIDENCE_SAMPLES[0]!;
  }, [stage7SampleIndex]);

  // --- Dynamic Computations for Stage 8 (Observatory) ---
  const stage8FilteredMessages = useMemo(() => {
    if (stage8RoomFilter === "all") return STAGE_8_OBSERVATORY_FIXTURE;
    return STAGE_8_OBSERVATORY_FIXTURE.filter((m) => m.room === stage8RoomFilter);
  }, [stage8RoomFilter]);

  const stage8ActiveMessage = useMemo(() => {
    return (
      STAGE_8_OBSERVATORY_FIXTURE.find((m) => m.sequence === stage8SelectedSeq) ||
      STAGE_8_OBSERVATORY_FIXTURE[0]!
    );
  }, [stage8SelectedSeq]);

  // --- Dynamic Computations for Stage 9 (Trace Studio) ---
  const stage9ActivePreset = useMemo(() => {
    return STAGE_9_TRACE_PRESETS[stage9PresetIndex] || STAGE_9_TRACE_PRESETS[0]!;
  }, [stage9PresetIndex]);

  const stage9ActiveFrame = useMemo(() => {
    return stage9ActivePreset.frames[stage9FrameIndex] || stage9ActivePreset.frames[0]!;
  }, [stage9ActivePreset, stage9FrameIndex]);

  // --- Dynamic Computations for Stage 10 (Activity Center) ---
  const stage10FilteredEvents = useMemo(() => {
    if (stage10Category === "ALL") return STAGE_10_ACTIVITY_FIXTURE;
    return STAGE_10_ACTIVITY_FIXTURE.filter((e) => e.category === stage10Category);
  }, [stage10Category]);

  const stage10ActiveEvent = useMemo(() => {
    return (
      STAGE_10_ACTIVITY_FIXTURE.find((e) => e.id === stage10SelectedId) ||
      STAGE_10_ACTIVITY_FIXTURE[0]!
    );
  }, [stage10SelectedId]);

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
          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm h-auto min-h-0 overflow-visible">
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
          <div className="p-6 rounded-xl border border-hairline bg-panel space-y-5 shadow-sm h-auto min-h-0 overflow-visible transition-all duration-200">
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
                {/* Interactive Controls: Archetype & Language Selectors */}
                <div className="space-y-3 p-4 rounded-lg bg-void border border-hairline">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                      1. Select Agent Archetype Template:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ARCHETYPES.map((arch) => (
                        <button
                          key={arch.id}
                          type="button"
                          onClick={() => handleStage1SelectArchetype(arch.id)}
                          className={`p-2.5 rounded-lg border text-left transition-all mono text-xs ${
                            stage1ArchetypeId === arch.id
                              ? "border-signal bg-signal/15 text-ink ring-1 ring-signal/40 font-bold"
                              : "border-hairline bg-panel text-muted hover:text-ink hover:border-hairline-bright"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-ink text-[11px] truncate">{arch.name.split("—")[0]}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-void border border-hairline text-signal font-semibold">
                              {arch.badge}
                            </span>
                          </div>
                          <div className="text-[10px] text-faint truncate pt-0.5">{arch.summary}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-hairline">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Language Selector */}
                      <div className="sm:col-span-4 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                          2. Target Language:
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleStage1SelectLanguage("TYPESCRIPT")}
                            className={`py-1.5 px-2 rounded-lg border text-center transition-all mono text-xs whitespace-nowrap ${
                              stage1Language === "TYPESCRIPT"
                                ? "border-signal bg-signal/15 text-signal font-bold shadow-sm"
                                : "border-hairline bg-panel text-muted hover:text-ink"
                            }`}
                          >
                            TypeScript
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStage1SelectLanguage("PYTHON")}
                            className={`py-1.5 px-2 rounded-lg border text-center transition-all mono text-xs whitespace-nowrap ${
                              stage1Language === "PYTHON"
                                ? "border-signal bg-signal/15 text-signal font-bold shadow-sm"
                                : "border-hairline bg-panel text-muted hover:text-ink"
                            }`}
                          >
                            Python
                          </button>
                        </div>
                      </div>

                      {/* Room Target Selector */}
                      <div className="sm:col-span-8 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                          3. Target Room:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {["tclk-offers", "events", "lobby", "technocore"].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setStage1Room(r)}
                              className={`px-1.5 py-1.5 rounded-lg border text-center transition-all mono text-[11px] whitespace-nowrap ${
                                stage1Room === r
                                  ? "border-signal bg-signal/15 text-signal font-bold shadow-sm"
                                  : "border-hairline bg-panel text-muted hover:text-ink"
                              }`}
                            >
                              /r/{r}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* File Tree Explorer */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                      Generated Repository Files ({stage1Project.files.length} Files):
                    </span>
                    <span className="text-[10px] text-signal mono">
                      {stage1Language} · /r/{stage1Room}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {stage1Project.files.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => setStage1SelectedFile(f.path)}
                        className={`px-2.5 py-1 rounded text-xs mono border transition-colors flex items-center gap-1.5 ${
                          stage1SelectedFile === f.path
                            ? "border-signal bg-signal/15 text-ink font-bold shadow-sm"
                            : "border-hairline bg-void text-muted hover:text-ink"
                        }`}
                      >
                        <span>{f.path}</span>
                        <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-surface border border-hairline text-faint">
                          {f.language}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Adaptable Code Viewer Box */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px] mono text-muted px-1 bg-surface p-2 rounded-t-lg border-t border-x border-hairline">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">{stage1ActiveFile.path}</span>
                        <span className="text-faint">({stage1ActiveFile.content.split("\n").length} lines)</span>
                      </div>
                      <CopyButton value={stage1ActiveFile.content} label="Copy File Content" variant="secondary" />
                    </div>
                    <pre className="p-4 rounded-b-lg bg-void border border-hairline text-xs font-mono text-ink leading-relaxed select-all overflow-auto max-h-80 whitespace-pre">
                      {stage1ActiveFile.content}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 2: CONFIGURE WORKSPACE SANDBOX */}
            {currentStage === 2 && (
              <div className="space-y-4">
                {/* Interactive Tool Target & Parameter Controls */}
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Interactive Safe Handoff & Tool Selection:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "testkit", label: "TCLK-TestKit" },
                      { id: "builder", label: "Agent Builder" },
                      { id: "readiness", label: "Readiness Flow" },
                      { id: "evidence", label: "Evidence Vault" },
                    ].map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => setStage2ToolTarget(tool.id)}
                        className={`p-2 rounded-lg border text-center transition-all mono text-xs ${
                          stage2ToolTarget === tool.id
                            ? "border-signal bg-signal/15 text-signal font-bold"
                            : "border-hairline bg-panel text-muted hover:text-ink"
                        }`}
                      >
                        {tool.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-hairline text-xs mono">
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Project Name:</span>
                      <input
                        type="text"
                        value={stage2ProjectName}
                        onChange={(e) => setStage2ProjectName(e.target.value)}
                        className="w-full mt-1 px-2 py-1 rounded bg-panel border border-hairline text-ink text-xs mono focus:border-signal outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Target Room:</span>
                      <select
                        value={stage2Room}
                        onChange={(e) => setStage2Room(e.target.value)}
                        className="w-full mt-1 px-2 py-1 rounded bg-panel border border-hairline text-ink text-xs mono focus:border-signal outline-none"
                      >
                        <option value="tclk-offers">/r/tclk-offers</option>
                        <option value="events">/r/events</option>
                        <option value="lobby">/r/lobby</option>
                        <option value="technocore">/r/technocore</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Language:</span>
                      <select
                        value={stage2Lang}
                        onChange={(e) => setStage2Lang(e.target.value as AgentLanguageId)}
                        className="w-full mt-1 px-2 py-1 rounded bg-panel border border-hairline text-ink text-xs mono focus:border-signal outline-none"
                      >
                        <option value="TYPESCRIPT">TypeScript</option>
                        <option value="PYTHON">Python</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Safe Handoff Deep-Link URL Preview */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Generated Allowlisted Deep-Link Handoff URL:
                  </span>
                  <div className="p-3 rounded-lg bg-void border border-hairline space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-signal font-bold text-xs break-all select-all">
                        {stage2HandoffUrl}
                      </code>
                      <CopyButton value={stage2HandoffUrl} label="Copy Handoff URL" variant="secondary" />
                    </div>
                    <p className="text-[11px] text-muted">
                      Stripped of all unpermitted fields. Preserves project metadata safely in URL parameters across tool transitions.
                    </p>
                  </div>
                </div>

                {/* 3-Stage Lifecycle Toolchain Organization */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    3-Stage Lifecycle Organization:
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
                {/* 4 Step Selector Buttons */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs mono text-muted">
                    <span className="font-bold text-ink">Bilateral Negotiation Step:</span>
                    <span>Step {stage3StepIndex + 1} of 4</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {STAGE_3_TCLK_STEPS_FIXTURE.map((step, idx) => (
                      <button
                        key={step.type}
                        type="button"
                        onClick={() => setStage3StepIndex(idx)}
                        className={`p-2 rounded-lg border text-center transition-all mono text-xs font-bold ${
                          stage3StepIndex === idx
                            ? "border-signal bg-signal/15 text-signal shadow-sm"
                            : "border-hairline bg-void text-muted hover:text-ink"
                        }`}
                      >
                        {step.step}. {step.type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Simulation Parameter Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 rounded-lg bg-surface border border-hairline text-xs mono">
                  <div>
                    <span className="text-faint text-[9px] uppercase block">Trade Asset:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {["FLOP", "COMPUTE", "DATA"].map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setStage3Asset(a)}
                          className={`px-2 py-0.5 rounded border text-[10px] whitespace-nowrap ${
                            stage3Asset === a ? "border-signal bg-signal/15 text-signal font-bold" : "border-hairline bg-panel text-muted"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-faint text-[9px] uppercase block">Amount:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {["250", "500", "1000"].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setStage3Amount(amt)}
                          className={`px-2 py-0.5 rounded border text-[10px] whitespace-nowrap ${
                            stage3Amount === amt ? "border-signal bg-signal/15 text-signal font-bold" : "border-hairline bg-panel text-muted"
                          }`}
                        >
                          {amt}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-faint text-[9px] uppercase block">Settlement Rail:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {["flop-htlc", "paper"].map((rail) => (
                        <button
                          key={rail}
                          type="button"
                          onClick={() => setStage3Rail(rail)}
                          className={`px-2 py-0.5 rounded border text-[10px] whitespace-nowrap ${
                            stage3Rail === rail ? "border-signal bg-signal/15 text-signal font-bold" : "border-hairline bg-panel text-muted"
                          }`}
                        >
                          {rail}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Active Step Details & Wire Payload */}
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-3">
                  <div className="flex items-center justify-between border-b border-hairline pb-2">
                    <span className="font-bold text-ink text-sm mono">
                      {stage3DynamicStep.type} · <span className="text-signal">{stage3DynamicStep.status}</span>
                    </span>
                    <span className="text-xs text-muted mono">/r/{stage3DynamicStep.room}</span>
                  </div>
                  <p className="text-xs text-muted">{stage3DynamicStep.summary}</p>
                  <div className="text-[11px] mono text-faint">
                    <span>Author: </span>
                    <span className="text-ink select-all">{stage3DynamicStep.author}</span>
                  </div>
                  <pre className="p-3 rounded bg-panel border border-hairline text-[11px] font-mono text-ink leading-relaxed select-all overflow-auto max-h-60 whitespace-pre">
                    {JSON.stringify(stage3DynamicStep.payload, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* STAGE 4: READINESS FLOW SANDBOX */}
            {currentStage === 4 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">7-Stage Compliance Gates:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">7 / 7 VERIFIED READY</span>
                </div>

                <div className="space-y-1.5">
                  {STAGE_4_READINESS_FIXTURE.map((item) => (
                    <button
                      key={item.stage}
                      type="button"
                      onClick={() => setStage4SelectedGate(item.stage)}
                      className={`w-full p-2.5 rounded-lg border text-left text-xs flex items-center justify-between transition-colors ${
                        stage4SelectedGate === item.stage
                          ? "border-signal bg-signal/10 ring-1 ring-signal/30"
                          : "border-hairline bg-void hover:bg-surface"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mono">
                          ✓ Gate 0{item.stage}
                        </span>
                        <span className="font-semibold text-ink">{item.name}</span>
                      </div>
                      <span className="text-[11px] text-muted mono truncate max-w-[220px]">{item.detail}</span>
                    </button>
                  ))}
                </div>

                {/* Selected Gate Inspection Detail Box */}
                {(() => {
                  const gate = STAGE_4_READINESS_FIXTURE.find((g) => g.stage === stage4SelectedGate) || STAGE_4_READINESS_FIXTURE[0]!;
                  return (
                    <div className="p-3.5 rounded-lg bg-surface border border-hairline space-y-2 mono text-xs">
                      <div className="flex items-center justify-between border-b border-hairline pb-1.5">
                        <span className="font-bold text-ink">Gate 0{gate.stage} · {gate.name}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">● {gate.status}</span>
                      </div>
                      <p className="text-muted text-[11px] leading-relaxed">
                        Deterministic Assertion: Verified local cryptographic derivation and compliance criteria without off-device transmission.
                      </p>
                      <div className="p-2 rounded bg-void border border-hairline text-ink text-[11px]">
                        <code>Result: {gate.detail}</code>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* STAGE 5: HEALTH DIAGNOSTIC SANDBOX */}
            {currentStage === 5 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">Subsystem Health Status:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">ALL SUBSYSTEMS HEALTHY</span>
                </div>

                {/* Subsystem Filter Tabs */}
                <div className="flex flex-wrap gap-1">
                  {["all", "crypto", "upstream", "proxy"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setStage5Subsystem(tab)}
                      className={`px-2.5 py-1 rounded text-xs mono border ${
                        stage5Subsystem === tab
                          ? "border-signal bg-signal/15 text-signal font-bold"
                          : "border-hairline bg-void text-muted hover:text-ink"
                      }`}
                    >
                      {tab === "all" ? "All Probes" : tab.toUpperCase()}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {STAGE_5_HEALTH_FIXTURE.filter((h) => {
                    if (stage5Subsystem === "crypto") return h.subsystem.toLowerCase().includes("crypto");
                    if (stage5Subsystem === "upstream") return h.subsystem.toLowerCase().includes("upstream") || h.subsystem.toLowerCase().includes("lobby");
                    if (stage5Subsystem === "proxy") return h.subsystem.toLowerCase().includes("proxy");
                    return true;
                  }).map((h) => (
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
                {/* Environment Selector: Python vs Node.js vs cURL */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Execution Environment & CLI Tool:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "python", label: "Python CLI (flop_agent.py)", cmd: "python3 flop_agent.py contribute" },
                      { id: "node", label: "TypeScript / Node.js CLI", cmd: "npm run contribute" },
                      { id: "curl", label: "Direct cURL Read Probe", cmd: "curl -s https://technocore.chat/r/technocore" },
                    ].map((envItem) => (
                      <button
                        key={envItem.id}
                        type="button"
                        onClick={() => setStage6Env(envItem.id as "python" | "node" | "curl")}
                        className={`p-2 rounded-lg border text-center transition-all mono text-xs whitespace-nowrap ${
                          stage6Env === envItem.id
                            ? "border-signal bg-signal/15 text-signal font-bold"
                            : "border-hairline bg-void text-muted hover:text-ink"
                        }`}
                      >
                        {envItem.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-void border border-hairline space-y-2">
                  <div className="flex items-center justify-between text-[11px] mono text-muted">
                    <span className="font-semibold text-ink">Local Terminal Execution:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">● LOCAL EXECUTION ONLY</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-panel p-2.5 rounded-md border border-hairline">
                    <code className="text-signal font-bold text-xs select-all">
                      {stage6Env === "python"
                        ? "python3 flop_agent.py contribute"
                        : stage6Env === "node"
                        ? "npm run contribute"
                        : "curl -s https://technocore.chat/r/technocore"}
                    </code>
                    <CopyButton
                      value={
                        stage6Env === "python"
                          ? "python3 flop_agent.py contribute"
                          : stage6Env === "node"
                          ? "npm run contribute"
                          : "curl -s https://technocore.chat/r/technocore"
                      }
                      label="CLI Command"
                      variant="secondary"
                    />
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Signs and records your contribution directly from your machine. No private keys are sent to the web browser.
                  </p>
                </div>

                {/* 7-Step Pipeline Interactive Step Inspector */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    7-Step Contribution Pipeline:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {STAGE_6_CONTRIBUTION_FIXTURE.workflowSteps.map((s, idx) => (
                      <button
                        key={s.num}
                        type="button"
                        onClick={() => setStage6StepIndex(idx)}
                        className={`p-2 rounded border text-left text-xs transition-colors ${
                          stage6StepIndex === idx
                            ? "border-signal bg-signal/15 text-ink font-bold"
                            : "border-hairline bg-surface text-muted hover:text-ink"
                        }`}
                      >
                        <div className="font-bold text-ink mono text-[11px]">
                          {s.num}. {s.name}
                        </div>
                        <div className="text-[10px] text-faint truncate">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 7: EVIDENCE VAULT SANDBOX */}
            {currentStage === 7 && (
              <div className="space-y-4">
                {/* Sample Selector */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Select Contribution Evidence Sample:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {STAGE_7_EVIDENCE_SAMPLES.map((sample, idx) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          setStage7SampleIndex(idx);
                          setStage7Verified(false);
                        }}
                        className={`p-2 rounded-lg border text-left transition-all mono text-xs ${
                          stage7SampleIndex === idx
                            ? "border-signal bg-signal/15 text-ink font-bold"
                            : "border-hairline bg-void text-muted hover:text-ink"
                        }`}
                      >
                        <div className="font-bold truncate">{sample.title.split("—")[0]}</div>
                        <div className="text-[10px] text-faint">/r/{sample.room} seq {sample.seq}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Evidence Preview Card */}
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-3">
                  <div className="flex items-center justify-between border-b border-hairline pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink text-sm mono">
                        /r/{stage7ActiveSample.room} seq {stage7ActiveSample.seq}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 mono">
                        {stage7ActiveSample.provenance}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mono">
                      ✓ {stage7ActiveSample.verificationStatus}
                    </span>
                  </div>

                  <div className="text-xs text-ink p-2.5 rounded bg-panel border border-hairline select-all">
                    &ldquo;{stage7ActiveSample.text}&rdquo;
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] mono text-muted">
                    <div>
                      <span className="text-faint block text-[9px] uppercase">Author DID:</span>
                      <span className="text-ink truncate block select-all">{stage7ActiveSample.authorDid}</span>
                    </div>
                    <div>
                      <span className="text-faint block text-[9px] uppercase">SHA-256 Hash:</span>
                      <span className="text-faint truncate block select-all">{stage7ActiveSample.evidenceSha256}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-hairline flex flex-col sm:flex-row items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setStage7Verified(true)}
                      className={buttonClasses("secondary", "sm", "w-full sm:w-auto mono text-xs font-semibold")}
                    >
                      {stage7Verified ? "✓ Verified with WebCrypto (Ed25519) in 0.4ms" : "Test Verify Signature (WebCrypto)"}
                    </button>
                    <span className="text-[10px] text-muted mono">Ed25519 Canonical Roundtrip</span>
                  </div>
                </div>
              </div>
            )}

            {/* STAGE 8: OBSERVATORY SANDBOX */}
            {currentStage === 8 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">Public Room Wire Stream:</span>
                  <span className="text-signal">{stage8FilteredMessages.length} Messages</span>
                </div>

                {/* Room Filter Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {["all", "tclk-offers", "technocore", "lobby", "events"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setStage8RoomFilter(r)}
                      className={`px-2.5 py-1 rounded text-xs mono border transition-colors ${
                        stage8RoomFilter === r
                          ? "border-signal bg-signal/15 text-signal font-bold"
                          : "border-hairline bg-void text-muted hover:text-ink"
                      }`}
                    >
                      {r === "all" ? "All Public Rooms" : `/r/${r}`}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {stage8FilteredMessages.map((rec) => (
                    <button
                      key={rec.sequence}
                      type="button"
                      onClick={() => setStage8SelectedSeq(rec.sequence)}
                      className={`w-full p-3 rounded-lg border text-left text-xs space-y-1.5 transition-colors ${
                        stage8SelectedSeq === rec.sequence
                          ? "border-signal bg-signal/10 ring-1 ring-signal/30"
                          : "border-hairline bg-void hover:bg-surface"
                      }`}
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
                        <span className="truncate max-w-[200px]">{rec.authorDid}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Ed25519 VALID</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Active Message Inspection Detail Box */}
                <div className="p-3.5 rounded-lg bg-surface border border-hairline space-y-2 mono text-xs">
                  <div className="flex items-center justify-between border-b border-hairline pb-1.5">
                    <span className="font-bold text-ink">
                      /r/{stage8ActiveMessage.room} · Message #{stage8ActiveMessage.sequence}
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓ Ed25519 Valid</span>
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    Author: <span className="text-ink select-all">{stage8ActiveMessage.authorDid}</span>
                  </div>
                  <pre className="p-2.5 rounded bg-void border border-hairline text-ink text-[11px] leading-relaxed select-all overflow-auto max-h-36 whitespace-pre">
                    {stage8ActiveMessage.text}
                  </pre>
                </div>
              </div>
            )}

            {/* STAGE 9: TRACE STUDIO SANDBOX */}
            {currentStage === 9 && (
              <div className="space-y-4">
                {/* Scenario Preset Selector */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted mono block">
                    Trace Scenario Preset:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STAGE_9_TRACE_PRESETS.map((preset, idx) => (
                      <button
                        key={preset.traceId}
                        type="button"
                        onClick={() => {
                          setStage9PresetIndex(idx);
                          setStage9FrameIndex(0);
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all mono text-xs ${
                          stage9PresetIndex === idx
                            ? "border-signal bg-signal/15 text-ink font-bold"
                            : "border-hairline bg-void text-muted hover:text-ink"
                        }`}
                      >
                        <div className="font-bold">{preset.presetName}</div>
                        <div className="text-[10px] text-faint truncate">{preset.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Frame Scrubber */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs mono text-muted">
                    <span className="font-bold text-ink">{stage9ActivePreset.presetName}</span>
                    <span>Frame {stage9FrameIndex + 1} of {stage9ActivePreset.totalFrames}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {stage9ActivePreset.frames.map((frm, idx) => (
                      <button
                        key={frm.frame}
                        type="button"
                        onClick={() => setStage9FrameIndex(idx)}
                        className={`p-2 rounded-lg border text-center transition-all mono text-xs ${
                          stage9FrameIndex === idx
                            ? "border-signal bg-signal/15 text-signal font-bold shadow-sm"
                            : "border-hairline bg-void text-muted hover:text-ink"
                        }`}
                      >
                        Frame {frm.frame} · {frm.state}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active Frame Card */}
                <div className="p-4 rounded-lg bg-void border border-hairline space-y-2 mono text-xs">
                  <div className="flex items-center justify-between border-b border-hairline pb-2">
                    <span className="font-bold text-ink">{stage9ActiveFrame.event}</span>
                    <span className="px-2 py-0.5 rounded bg-signal/10 text-signal font-bold text-[10px]">
                      STATE: {stage9ActiveFrame.state}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted flex items-center justify-between">
                    <span>Actor: <strong className="text-ink">{stage9ActiveFrame.actor}</strong></span>
                    <span>Hash: <code className="text-ink">{stage9ActiveFrame.payloadHash}</code></span>
                  </div>
                  {stage9ActiveFrame.details && (
                    <pre className="p-2.5 rounded bg-panel border border-hairline text-[11px] font-mono text-ink leading-relaxed select-all overflow-auto max-h-60 whitespace-pre">
                      {JSON.stringify(stage9ActiveFrame.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* STAGE 10: ACTIVITY CENTER SANDBOX */}
            {currentStage === 10 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs mono text-muted border-b border-hairline pb-2">
                  <span className="font-bold text-ink">Immutable Local Audit Log:</span>
                  <span className="text-signal">{stage10FilteredEvents.length} Verified Events</span>
                </div>

                {/* Category Filter Tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {["ALL", "DEMO", "EVIDENCE", "TESTKIT", "BUILDER", "HEALTH"].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setStage10Category(cat)}
                      className={`px-2.5 py-1 rounded text-xs mono border transition-colors ${
                        stage10Category === cat
                          ? "border-signal bg-signal/15 text-signal font-bold"
                          : "border-hairline bg-void text-muted hover:text-ink"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5">
                  {stage10FilteredEvents.map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setStage10SelectedId(act.id)}
                      className={`w-full p-2.5 rounded-lg border text-left text-xs flex items-center justify-between transition-colors ${
                        stage10SelectedId === act.id
                          ? "border-signal bg-signal/10 ring-1 ring-signal/30"
                          : "border-hairline bg-void hover:bg-surface"
                      }`}
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
                    </button>
                  ))}
                </div>

                {/* Active Event Detail Inspection */}
                <div className="p-3 rounded-lg bg-surface border border-hairline space-y-1 text-xs mono">
                  <div className="flex items-center justify-between text-muted text-[11px]">
                    <span className="font-bold text-ink">{stage10ActiveEvent.action}</span>
                    <span>{stage10ActiveEvent.time}</span>
                  </div>
                  <p className="text-muted text-[11px]">{stage10ActiveEvent.details}</p>
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
