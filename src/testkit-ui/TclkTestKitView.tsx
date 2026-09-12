"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  validateTclkFrame,
  evaluateStateTransition,
  simulateTclkLifecycle,
  type FrameValidationResult,
  type TestKitContractState,
  type LifecycleSimulationResult,
} from "../technocore/harness/tclk-testkit";
import {
  makeOffer,
  makeAccept,
  generateHashLock,
  type LockFrame,
  type RevealFrame,
} from "@flop-labs/tclk";
import { extractSafeHandoffParams } from "../workspace/handoff.ts";
import { HandoffBanner } from "../workspace-ui/HandoffBanner.tsx";

export function TclkTestKitView() {
  const searchParams = useSearchParams();
  const [sourceTag, setSourceTag] = useState<string>("LOCAL DRAFT");
  const [rawJsonText, setRawJsonText] = useState<string>("");
  const [validationResult, setValidationResult] = useState<FrameValidationResult | null>(null);
  const [activeState, setActiveState] = useState<TestKitContractState | null>(null);
  const [simulationResult, setSimulationResult] = useState<LifecycleSimulationResult | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Default sample DID constants for testing
  const defaultPayerDid = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
  const defaultPayeeDid = "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG";

  // Preset loaders
  const loadPreset = useCallback((preset: "VALID_OFFER" | "INVALID_TIMELOCK" | "FULL_LIFECYCLE") => {
    const now = 1789200000000;
    if (preset === "VALID_OFFER") {
      setSourceTag("PRESET: VALID OFFER");
      const sample = makeOffer({
        from: defaultPayerDid,
        role: "payer",
        amount: "1000",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper", "flop-htlc"],
        expiresMs: now + 3600000,
        claimByMs: now + 7200000,
        refundAfterMs: now + 10800000,
        nonce: "a1b2c3d4e5f60718",
      });
      setRawJsonText(`tclk1 ${JSON.stringify(sample, null, 2)}`);
      setActiveState(null);
    } else if (preset === "INVALID_TIMELOCK") {
      setSourceTag("PRESET: INVALID TIMELOCK INVERSION");
      const bad = {
        type: "offer",
        from: defaultPayerDid,
        role: "payer",
        amount: "1000",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: now + 3600000,
        claimByMs: now + 10800000,
        refundAfterMs: now + 7200000, // Inverted!
        nonce: "deadbeef00112233",
        id: "0x0000000000000000000000000000000000000000000000000000000000000000",
      };
      setRawJsonText(`tclk1 ${JSON.stringify(bad, null, 2)}`);
      setActiveState(null);
    } else if (preset === "FULL_LIFECYCLE") {
      setSourceTag("PRESET: FULL 4-STEP DEAL LIFECYCLE");
      runFullLifecycleDemo();
    }
  }, []);

  // Initial load check for query parameters (e.g. from Observatory)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const frameParam = params.get("frame");
    const sourceParam = params.get("source");

    if (sourceParam) {
      setSourceTag(sourceParam.toUpperCase());
    }

    if (frameParam) {
      try {
        const decoded = decodeURIComponent(frameParam);
        setRawJsonText(decoded);
        setSourceTag("PUBLIC NETWORK OBSERVATION (Loaded from /observatory)");
      } catch {
        // Ignore invalid decoding
      }
    } else {
      // Default initial sample offer
      loadPreset("VALID_OFFER");
    }
  }, [loadPreset]);

  // Real-time frame validation
  useEffect(() => {
    let isCancelled = false;
    async function runValidation() {
      if (!rawJsonText.trim()) {
        setValidationResult(null);
        return;
      }
      const res = await validateTclkFrame(rawJsonText);
      if (!isCancelled) {
        setValidationResult(res);
      }
    }
    runValidation();
    return () => {
      isCancelled = true;
    };
  }, [rawJsonText]);

  // Execute candidate transition against active state
  const handleApplyFrame = async () => {
    if (!validationResult || !validationResult.valid || !validationResult.frame) return;
    const res = await evaluateStateTransition(activeState, validationResult.frame);
    if (res.accepted && res.nextState) {
      setActiveState(res.nextState);
    }
  };

  // Run sequential lifecycle simulation
  const runFullLifecycleDemo = async () => {
    const now = 1789200000000;
    const offer = makeOffer({
      from: defaultPayerDid,
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["paper", "flop-htlc"],
      expiresMs: now + 3600000,
      claimByMs: now + 7200000,
      refundAfterMs: now + 10800000,
      nonce: "a1b2c3d4e5f60718",
    });

    const hashLock = generateHashLock();
    const accept = makeAccept(offer, {
      from: defaultPayeeDid,
      statement: hashLock.hash,
      nonce: "1122334455667788",
    });

    const lock: LockFrame = {
      type: "lock",
      from: defaultPayerDid,
      contract: accept.contract,
      rail: "paper",
      ref: "paper-escrow-001",
    };

    const reveal: RevealFrame = {
      type: "reveal",
      from: defaultPayeeDid,
      contract: accept.contract,
      secret: hashLock.preimage,
    };

    const sim = await simulateTclkLifecycle([offer, accept, lock, reveal], { initialNowMs: now });
    setSimulationResult(sim);
    if (sim.finalState) {
      setActiveState(sim.finalState);
    }
    setRawJsonText(`tclk1 ${JSON.stringify(reveal, null, 2)}`);
  };

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopyFeedback(label);
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  // Sync safe handoff parameters from URL
  useEffect(() => {
    if (!searchParams) return;
    const safe = extractSafeHandoffParams(searchParams, "testkit");
    if (safe.preset === "bilateral-settlement" || safe.preset === "full-lifecycle") {
      runFullLifecycleDemo();
    } else if (safe.preset === "valid-offer") {
      loadPreset("VALID_OFFER");
    } else if (safe.preset === "invalid-timelock") {
      loadPreset("INVALID_TIMELOCK");
    }
  }, [searchParams, loadPreset]);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-8 min-h-screen bg-void text-ink font-sans">
      {/* Top Banner & Safety Disclaimer */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-hairline bg-panel shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-lg font-bold tracking-tight uppercase text-ink">
              Technocore TCLK-TestKit
            </h1>
            <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 mono">
              PROTOCOL INTEROP TEST HARNESS
            </span>
          </div>
          <p className="text-xs text-muted">
            Construct, validate, simulate, inspect, and test TCLK contract frames and deterministic state transitions locally before network broadcast.
          </p>
        </div>

        {/* Origin & Safety Tag */}
        <div className="flex flex-wrap items-center gap-2 mono text-xs">
          <span className="rounded bg-panel-high border border-hairline px-2.5 py-1 text-muted font-semibold">
            SOURCE: {sourceTag}
          </span>
          <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-emerald-700 dark:text-emerald-400 font-bold">
            LOCAL SIMULATION — NO LIVE NETWORK WRITE
          </span>
        </div>
      </div>

      {/* Workspace Context Handoff Banner */}
      <HandoffBanner destination="testkit" />

      {/* Preset Strips */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-hairline bg-panel mono text-xs">
        <span className="text-muted text-[10px] uppercase font-bold">Scenarios & Presets:</span>
        <button
          type="button"
          onClick={() => loadPreset("VALID_OFFER")}
          className="px-2.5 py-1 rounded bg-void border border-hairline text-signal hover:bg-panel-high transition-colors"
        >
          Preset: Valid Offer
        </button>
        <button
          type="button"
          onClick={() => loadPreset("INVALID_TIMELOCK")}
          className="px-2.5 py-1 rounded bg-void border border-hairline text-amber-800 dark:text-amber-400 hover:bg-panel-high transition-colors"
        >
          Preset: Invalid Timelock Gap
        </button>
        <button
          type="button"
          onClick={() => loadPreset("FULL_LIFECYCLE")}
          className="px-2.5 py-1 rounded bg-void border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-panel-high transition-colors font-bold"
        >
          Run Full 4-Step Lifecycle Demo
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveState(null);
            setSimulationResult(null);
          }}
          className="px-2.5 py-1 rounded bg-void border border-hairline text-muted hover:bg-panel-high transition-colors"
        >
          Reset State
        </button>
      </div>

      {/* Main Grid: Frame Editor vs Validation & State Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Frame Editor (6 Cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-xl border border-hairline bg-panel p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted mono">
                [A] TCLK Wire Frame Editor
              </h2>
              <span className="text-[11px] mono text-muted">Format: tclk1 &#123;...&#125;</span>
            </div>

            <textarea
              value={rawJsonText}
              onChange={(e) => setRawJsonText(e.target.value)}
              placeholder="Paste or edit raw tclk1 {...} frame line..."
              rows={14}
              className="w-full rounded-lg bg-void border border-hairline p-3 font-mono text-xs text-ink focus:outline-none focus:border-signal"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyFrame}
                  disabled={!validationResult?.valid}
                  className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold text-xs hover:bg-emerald-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Apply Frame to State Machine →
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(rawJsonText, "COPIED_FRAME")}
                  className="px-3 py-1.5 rounded bg-void border border-hairline text-xs mono text-muted hover:text-ink transition-colors"
                >
                  {copyFeedback === "COPIED_FRAME" ? "Copied!" : "Copy Frame"}
                </button>
                <Link
                  href="/doctor"
                  className="px-3 py-1.5 rounded bg-void border border-hairline text-xs mono text-signal hover:bg-panel-high transition-colors"
                >
                  ↗ Open in Doctor
                </Link>
              </div>
            </div>
          </div>

          {/* Validation Report Card */}
          <div className="rounded-xl border border-hairline bg-panel p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted mono">
              [B] Structural & Semantic Validation
            </h2>

            {validationResult ? (
              <div className="space-y-3">
                <div
                  className={`p-3 rounded-lg border font-mono text-xs ${
                    validationResult.valid
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    <span>{validationResult.valid ? "✔ [PASS] VALID TCLK FRAME" : "✖ [FAIL] INVALID TCLK FRAME"}</span>
                  </div>
                  {validationResult.errors.map((err, idx) => (
                    <div key={idx} className="mt-1 text-rose-700 dark:text-rose-400 text-[11px]">
                      • {err}
                    </div>
                  ))}
                  {validationResult.warnings.map((warn, idx) => (
                    <div key={idx} className="mt-1 text-amber-800 dark:text-amber-400 text-[11px]">
                      ⚠ {warn}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mono">
                  <div className="p-2.5 rounded bg-void border border-hairline">
                    <span className="text-muted text-[10px] uppercase block">Frame Type</span>
                    <span className="font-bold text-ink">{validationResult.frameType?.toUpperCase() ?? "UNKNOWN"}</span>
                  </div>
                  <div className="p-2.5 rounded bg-void border border-hairline">
                    <span className="text-muted text-[10px] uppercase block">Lock Kind</span>
                    <span className="font-bold text-ink">{validationResult.schemaDetails?.lockKind ?? "N/A"}</span>
                  </div>
                  <div className="col-span-2 p-2.5 rounded bg-void border border-hairline">
                    <span className="text-muted text-[10px] uppercase block">Canonical Wire Hash (SHA-256)</span>
                    <span className="font-bold text-ink break-all text-[11px]">
                      {validationResult.wireSha256 || "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted mono">Enter a TCLK frame to view real-time validation.</p>
            )}
          </div>
        </div>

        {/* Right Column: State Machine & Lifecycle (6 Cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Active State View */}
          <div className="rounded-xl border border-hairline bg-panel p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted mono">
                [C] Protocol State Machine
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold mono uppercase ${
                  activeState?.status === "claimed"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                    : activeState?.status === "locked"
                    ? "bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30"
                    : activeState?.status === "accepted"
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-400 border border-amber-500/30"
                    : activeState?.status === "proposed"
                    ? "bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                    : "bg-panel-high text-muted border border-hairline"
                }`}
              >
                STATUS: {activeState?.status.toUpperCase() ?? "NONE (IDLE)"}
              </span>
            </div>

            {activeState ? (
              <div className="space-y-3 text-xs mono">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded bg-void border border-hairline">
                    <span className="text-muted text-[10px] uppercase block">Contract ID</span>
                    <span className="font-bold text-ink break-all text-[11px]">
                      {activeState.contractId ? `${activeState.contractId.slice(0, 16)}...` : "UNBOUND"}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-void border border-hairline">
                    <span className="text-muted text-[10px] uppercase block">Deal Value</span>
                    <span className="font-bold text-ink">
                      {activeState.offer.amount} {activeState.offer.asset}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-void border border-hairline">
                    <span className="text-muted text-[10px] uppercase block">Payer DID</span>
                    <span className="font-bold text-ink truncate block text-[10px]">
                      {activeState.payerDid ?? "UNSPECIFIED"}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-void border border-hairline">
                    <span className="text-muted text-[10px] uppercase block">Payee DID</span>
                    <span className="font-bold text-ink truncate block text-[10px]">
                      {activeState.payeeDid ?? "UNBOUND"}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded bg-void border border-hairline space-y-1">
                  <span className="text-muted text-[10px] uppercase block">Applied Frames ({activeState.appliedFrames.length})</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeState.appliedFrames.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-panel-high border border-hairline text-ink text-[10px]">
                        {i + 1}. {f.type.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-lg bg-void border border-dashed border-hairline text-center text-xs text-muted mono">
                No active contract state. Apply an &quot;offer&quot; frame or click a preset to initialize the state machine.
              </div>
            )}
          </div>

          {/* Sequential Lifecycle Simulator Output */}
          {simulationResult && (
            <div className="rounded-xl border border-hairline bg-panel p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted mono">
                  [D] Lifecycle Simulation Sequence
                </h2>
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mono">
                  {simulationResult.acceptedSteps}/{simulationResult.totalSteps} Steps Accepted
                </span>
              </div>

              <div className="space-y-2">
                {simulationResult.steps.map((step) => (
                  <div
                    key={step.stepIndex}
                    className={`p-3 rounded-lg border text-xs mono flex items-center justify-between ${
                      step.accepted
                        ? "bg-void border-emerald-500/30 text-ink"
                        : "bg-void border-rose-500/30 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">
                          Step {step.stepIndex}: {step.frameType.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted">
                          ({step.statusBefore.toUpperCase()} → {step.statusAfter.toUpperCase()})
                        </span>
                      </div>
                      {step.errors.length > 0 && (
                        <div className="text-[10px] text-rose-700 dark:text-rose-400">{step.errors.join(", ")}</div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        step.accepted
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {step.accepted ? "ACCEPTED" : "REJECTED"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
