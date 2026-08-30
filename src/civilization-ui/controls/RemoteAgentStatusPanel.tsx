/**
 * Remote Agent & Persistent Network Telemetry Panel.
 *
 * Visualizes independent remote agent citizens connected to the persistent gateway:
 * DID, connection status, acknowledged sequence, sync lag, submitted events,
 * and cryptographic verification status.
 */

"use client";

import React from "react";
import type { NetworkExecutionMode, RemoteAgentTelemetry } from "../types.ts";

interface RemoteAgentStatusPanelProps {
  readonly executionMode: NetworkExecutionMode;
  readonly onSelectMode: (mode: NetworkExecutionMode) => void;
  readonly remoteAgents?: readonly RemoteAgentTelemetry[];
  readonly headSequence?: number;
  readonly isConnected?: boolean;
}

export function RemoteAgentStatusPanel({
  executionMode,
  onSelectMode,
  remoteAgents = [],
  headSequence = 0,
  isConnected = true,
}: RemoteAgentStatusPanelProps) {
  return (
    <div className="rounded-xl border border-glass bg-surface-primary/70 p-4 shadow-xl backdrop-blur-md">
      {/* Top Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              isConnected ? "bg-accent shadow-[0_0_8px_rgba(0,255,200,0.6)] animate-pulse" : "bg-fault"
            }`}
          />
          <h3 className="mono text-xs font-semibold uppercase tracking-wider text-ink-bright">
            Network Execution Architecture
          </h3>
        </div>

        {/* 3-Mode Segmented Control */}
        <div className="flex items-center gap-1 rounded-lg border border-glass bg-surface-secondary/60 p-1">
          {(["SIMULATION", "REMOTE_AGENT", "PERSISTENT_NETWORK"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSelectMode(mode)}
              className={`rounded-md px-3 py-1 mono text-[11px] font-medium transition-all ${
                executionMode === mode
                  ? "bg-accent/20 text-accent border border-accent/40 shadow-sm"
                  : "text-ink-muted hover:text-ink hover:bg-surface-primary/40"
              }`}
            >
              {mode === "SIMULATION" ? "Simulation Clock" : mode === "REMOTE_AGENT" ? "Remote Daemon" : "SQL Persistent"}
            </button>
          ))}
        </div>
      </div>

      {/* Network / Gateway Status Summary */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-glass/40 bg-surface-secondary/40 p-2.5">
          <div className="text-[10px] mono uppercase text-ink-muted">Operating Mode</div>
          <div className="mt-1 mono text-xs font-bold text-accent">{executionMode}</div>
        </div>

        <div className="rounded-lg border border-glass/40 bg-surface-secondary/40 p-2.5">
          <div className="text-[10px] mono uppercase text-ink-muted">Gateway Head Seq</div>
          <div className="mt-1 mono text-xs font-bold text-ink-bright">#{headSequence}</div>
        </div>

        <div className="rounded-lg border border-glass/40 bg-surface-secondary/40 p-2.5">
          <div className="text-[10px] mono uppercase text-ink-muted">Connected Daemons</div>
          <div className="mt-1 mono text-xs font-bold text-ink-bright">{remoteAgents.length} Active</div>
        </div>

        <div className="rounded-lg border border-glass/40 bg-surface-secondary/40 p-2.5">
          <div className="text-[10px] mono uppercase text-ink-muted">Security Boundary</div>
          <div className="mt-1 mono text-xs font-bold text-emerald-400">Ed25519 Local-Only</div>
        </div>
      </div>

      {/* Connected Remote Agents Table */}
      {remoteAgents.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-glass/60 text-[10px] mono uppercase text-ink-muted">
                <th className="pb-2 font-medium">Agent DID</th>
                <th className="pb-2 font-medium">Citizen / Role</th>
                <th className="pb-2 font-medium">Ack Seq</th>
                <th className="pb-2 font-medium">Sync Lag</th>
                <th className="pb-2 font-medium">Events</th>
                <th className="pb-2 font-medium">Ed25519 Auth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-glass/30">
              {remoteAgents.map((agent) => (
                <tr key={agent.did} className="hover:bg-surface-secondary/30 transition-colors">
                  <td className="py-2.5 font-mono text-[11px] text-ink-bright">
                    <span className="rounded bg-surface-secondary px-1.5 py-0.5 border border-glass/40">
                      {agent.did.slice(0, 16)}...{agent.did.slice(-6)}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="font-medium text-ink">{agent.displayName}</div>
                    <div className="text-[10px] mono text-ink-muted">{agent.role}</div>
                  </td>
                  <td className="py-2.5 mono font-semibold text-accent">#{agent.acknowledgedSequence}</td>
                  <td className="py-2.5 mono">
                    {agent.syncLag === 0 ? (
                      <span className="text-emerald-400">Synced</span>
                    ) : (
                      <span className="text-amber-400">{agent.syncLag} behind</span>
                    )}
                  </td>
                  <td className="py-2.5 mono text-ink-muted">{agent.submittedEventsCount}</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 mono text-[10px] text-emerald-400">
                      ✓ Verified
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-glass/60 p-4 text-center">
          <p className="mono text-xs text-ink-muted">
            {executionMode === "REMOTE_AGENT"
              ? "No remote agent daemon connected. Run `npm run agent:daemon` in a terminal to launch an independent citizen."
              : "Civilization running in standard mode. Switch to Remote Daemon to inspect independently connected processes."}
          </p>
        </div>
      )}
    </div>
  );
}
