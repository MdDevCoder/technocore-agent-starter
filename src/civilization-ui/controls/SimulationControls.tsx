/**
 * Simulation Controls Component.
 *
 * Controls deterministic world ticks: Play, Pause, Step, Reset, Speed multipliers,
 * and Genesis / Demo Mode execution.
 */

"use client";

import React from "react";
import type { NetworkExecutionMode } from "../types.ts";

interface SimulationControlsProps {
  readonly isRunning: boolean;
  readonly isInitialized: boolean;
  readonly speedMultiplier: number;
  readonly executionMode: NetworkExecutionMode;
  readonly onStep: () => void;
  readonly onRun: () => void;
  readonly onPause: () => void;
  readonly onReset: () => void;
  readonly onSetSpeed: (speed: number) => void;
  readonly onSetMode: (mode: NetworkExecutionMode) => void;
  readonly onRunDemo: () => void;
  readonly isLiveMode?: boolean;
  readonly onToggleMode?: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isRunning,
  isInitialized,
  speedMultiplier,
  executionMode,
  onStep,
  onRun,
  onPause,
  onReset,
  onSetSpeed,
  onSetMode,
  onRunDemo,
  isLiveMode = false,
  onToggleMode,
}) => {
  if (isLiveMode) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-panel p-3.5 shadow-xl backdrop-blur-md mono text-xs">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-emerald-400">LIVE OBSERVATORY ACTIVE:</span>
          <span className="text-muted text-[11px] hidden sm:inline">
            Rendering authentic persisted event ledger and derived trust projections. Synthetic world ticks are in standby.
          </span>
        </div>
        {onToggleMode && (
          <button
            onClick={onToggleMode}
            className="flex items-center gap-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 px-3.5 py-1.5 font-bold text-amber-400 hover:bg-amber-500/30 transition-colors cursor-pointer"
          >
            <span>⚙</span>
            <span>ENTER SIMULATION MODE</span>
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-panel p-3.5 shadow-xl backdrop-blur-md mono text-xs">
      {/* Primary Actions */}
      <div className="flex items-center gap-2">
        {isRunning ? (
          <button
            onClick={onPause}
            className="flex items-center gap-1.5 rounded-md bg-attention/20 border border-attention/40 px-3.5 py-1.5 font-bold text-attention hover:bg-attention/30 transition-colors"
          >
            <span>⏸</span>
            <span>PAUSE</span>
          </button>
        ) : (
          <button
            onClick={onRun}
            className="flex items-center gap-1.5 rounded-md bg-signal/20 border border-signal/40 px-3.5 py-1.5 font-bold text-signal hover:bg-signal/30 transition-colors"
          >
            <span>▶</span>
            <span>RUN SIMULATION</span>
          </button>
        )}

        <button
          onClick={onStep}
          disabled={isRunning || !isInitialized}
          className="flex items-center gap-1.5 rounded-md bg-graphite border border-hairline px-3 py-1.5 text-ink hover:bg-panel-high hover:border-hairline-bright disabled:opacity-40 font-medium transition-colors"
        >
          <span>⏭</span>
          <span>STEP (1 TICK)</span>
        </button>

        <button
          onClick={onReset}
          className="rounded-md bg-graphite border border-hairline px-3 py-1.5 text-muted hover:text-ink hover:bg-panel-high font-medium transition-colors"
          title="Reset to Genesis"
        >
          ↻ RESET
        </button>

        <button
          onClick={onRunDemo}
          className="rounded-md bg-verified/20 border border-verified/40 px-3.5 py-1.5 font-bold text-verified hover:bg-verified/30 transition-colors"
        >
          ★ RUN COMPLETE DEMO
        </button>
      </div>

      {/* Speed & Mode Selectors */}
      <div className="flex items-center gap-4">
        {/* Speed Buttons */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted font-semibold text-xs mr-1">SPEED:</span>
          {[1, 2, 5, 10].map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`rounded px-2.5 py-1 text-xs border transition-colors ${speedMultiplier === s
                  ? "bg-signal/20 text-signal border-signal/40 font-bold"
                  : "bg-graphite text-muted border-hairline hover:text-ink font-medium"
                }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Execution Mode */}
        <div className="flex items-center gap-1.5 border-l border-hairline pl-3">
          <span className="text-muted font-semibold text-xs mr-1">MODE:</span>
          <button
            onClick={() => onSetMode("SIMULATION")}
            className={`rounded px-2.5 py-1 text-xs border transition-colors ${executionMode === "SIMULATION"
                ? "bg-signal/20 text-signal border-signal/40 font-bold"
                : "bg-graphite text-muted border-hairline hover:text-ink font-medium"
              }`}
          >
            SIMULATION
          </button>
          <button
            onClick={() => onSetMode("REMOTE_AGENT")}
            className={`rounded px-2.5 py-1 text-xs border transition-colors ${executionMode === "REMOTE_AGENT"
                ? "bg-signal/20 text-signal border-signal/40 font-bold"
                : "bg-graphite text-muted border-hairline hover:text-ink font-medium"
              }`}
            title="Independent Agent Daemon"
          >
            REMOTE DAEMON
          </button>
          <button
            onClick={() => onSetMode("PERSISTENT_NETWORK")}
            className={`rounded px-2.5 py-1 text-xs border transition-colors ${executionMode === "PERSISTENT_NETWORK"
                ? "bg-signal/20 text-signal border-signal/40 font-bold"
                : "bg-graphite text-muted border-hairline hover:text-ink font-medium"
              }`}
            title="SQL Persistent Ledger"
          >
            PERSISTENT SQL
          </button>
        </div>
      </div>
    </div>
  );
};
