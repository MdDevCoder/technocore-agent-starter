"use client";

import React, { useState } from "react";
import type { NetworkSyncStatus, RoomSyncCursor } from "../../civilization/network/types.ts";
import { ProvenanceBadge } from "../controls/ProvenanceBadge.tsx";

export interface NetworkStatusPanelProps {
  status: NetworkSyncStatus | null;
  onTriggerSync?: () => Promise<void>;
  isSyncing?: boolean;
}

export const NetworkStatusPanel: React.FC<NetworkStatusPanelProps> = ({
  status,
  onTriggerSync,
  isSyncing = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSyncClick = async () => {
    if (!onTriggerSync || isSyncing) return;
    setSyncError(null);
    try {
      await onTriggerSync();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync pass failed");
    }
  };

  const isOnline = status?.isOnline ?? false;
  const nowMs = Date.now();
  const lastSyncTime = status?.lastSyncAt ? new Date(status.lastSyncAt).getTime() : 0;
  const syncLagSec = lastSyncTime > 0 ? Math.max(0, Math.floor((nowMs - lastSyncTime) / 1000)) : null;

  let statusLabel = "OFFLINE — SHOWING LAST VERIFIED STATE";
  let statusColor = "text-rose-400 border-rose-500/30 bg-rose-950/40";
  let dotColor = "bg-rose-500";

  if (isSyncing) {
    statusLabel = "SYNCING PUBLIC NETWORK...";
    statusColor = "text-cyan-400 border-cyan-500/30 bg-cyan-950/40 animate-pulse";
    dotColor = "bg-cyan-400 animate-ping";
  } else if (isOnline && syncLagSec !== null && syncLagSec < 35) {
    statusLabel = "● LIVE / SYNCED";
    statusColor = "text-emerald-400 border-emerald-500/30 bg-emerald-950/40";
    dotColor = "bg-emerald-500 shadow-[0_0_10px_#10b981]";
  } else if (syncLagSec !== null && syncLagSec >= 35) {
    const mins = Math.floor(syncLagSec / 60);
    const secs = syncLagSec % 60;
    statusLabel = `STALE — LAST SUCCESSFUL SYNC ${mins > 0 ? `${mins}m ` : ""}${secs}s AGO`;
    statusColor = "text-amber-400 border-amber-500/30 bg-amber-950/40";
    dotColor = "bg-amber-500";
  }

  const lastSyncText = status?.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleTimeString()
    : "Never";

  return (
    <div
      id="network-status-panel"
      className="p-4 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md text-white space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${dotColor}`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-zinc-300">
                Technocore Public Network Indexer
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${statusColor}`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono truncate max-w-md mt-0.5">
              {status?.networkEndpoint || "https://technocore.chat"}
            </p>
          </div>
        </div>


        <div className="flex items-center gap-2">
          <ProvenanceBadge provenance="LIVE_NETWORK" />

          <button
            id="btn-trigger-network-sync"
            onClick={handleSyncClick}
            disabled={isSyncing}
            className={`px-3 py-1.5 text-xs font-mono font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
              isSyncing
                ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300 cursor-wait animate-pulse"
                : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-zinc-200"
            }`}
          >

            {isSyncing ? (
              <>
                <span className="inline-block w-2.5 h-2.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <span>↺</span> Sync Network
              </>
            )}
          </button>
        </div>
      </div>

      {syncError && (
        <div className="p-2 rounded bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs font-mono">
          Sync Error: {syncError}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">Total Observations</div>
          <div className="text-lg font-mono font-bold text-white mt-0.5">
            {status?.totalMessagesObserved ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[11px] uppercase tracking-wider text-emerald-400">Cryptographically Verified</div>
          <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
            {status?.totalVerifiedValid ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">Promoted Events</div>
          <div className="text-lg font-mono font-bold text-cyan-400 mt-0.5">
            {status?.totalMessagesPromoted ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">Last Synced</div>
          <div className="text-sm font-mono font-semibold text-zinc-200 mt-1 truncate">
            {lastSyncText}
          </div>
        </div>
      </div>

      {/* Retention Gap Warning if detected */}
      {status?.retentionGapDetected && (
        <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>
            <strong>Retention Gap Detected:</strong> Upstream server truncated historical sequence numbers. Resynchronized from latest available head.
          </span>
        </div>
      )}

      {/* Tracked Rooms Dropdown */}
      <div className="border-t border-white/5 pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200 flex items-center justify-between w-full"
        >
          <span>
            Tracked Rooms ({status?.trackedRooms.length ?? 0}):{" "}
            {status?.trackedRooms.map((r) => r.room).join(", ") || "None"}
          </span>
          <span>{expanded ? "▲ Hide Details" : "▼ Show Room Cursors"}</span>
        </button>

        {expanded && status?.trackedRooms && status.trackedRooms.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400">
                  <th className="py-1 px-2">Room</th>
                  <th className="py-1 px-2">Status</th>
                  <th className="py-1 px-2">Last Seq</th>
                  <th className="py-1 px-2">Observed</th>
                  <th className="py-1 px-2">Promoted</th>
                  <th className="py-1 px-2">Last Fetch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-zinc-300">
                {status.trackedRooms.map((cursor: RoomSyncCursor) => (
                  <tr key={cursor.room} className="hover:bg-white/[0.02]">
                    <td className="py-1 px-2 font-semibold text-emerald-400">{cursor.room}</td>
                    <td className="py-1 px-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          cursor.status === "IDLE"
                            ? "bg-emerald-950 text-emerald-300"
                            : cursor.status === "SYNCING"
                            ? "bg-cyan-950 text-cyan-300 animate-pulse"
                            : cursor.status === "GAP_DETECTED"
                            ? "bg-amber-950 text-amber-300"
                            : "bg-rose-950 text-rose-300"
                        }`}
                      >
                        {cursor.status}
                      </span>
                    </td>
                    <td className="py-1 px-2">{cursor.lastSequence}</td>
                    <td className="py-1 px-2">{cursor.totalMessagesObserved}</td>
                    <td className="py-1 px-2">{cursor.totalMessagesPromoted}</td>
                    <td className="py-1 px-2 text-zinc-400">
                      {cursor.lastFetchedAt
                        ? new Date(cursor.lastFetchedAt).toLocaleTimeString()
                        : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
