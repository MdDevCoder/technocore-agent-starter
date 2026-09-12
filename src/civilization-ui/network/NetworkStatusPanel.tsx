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
  let statusColor = "text-rose-700 dark:text-rose-400 border-rose-500/30 bg-rose-500/15";
  let dotColor = "bg-rose-500";

  if (isSyncing) {
    statusLabel = "SYNCING PUBLIC NETWORK...";
    statusColor = "text-teal-700 dark:text-teal-400 border-teal-500/30 bg-teal-500/15 animate-pulse";
    dotColor = "bg-teal-500 animate-ping";
  } else if (isOnline && syncLagSec !== null && syncLagSec < 35) {
    statusLabel = "● LIVE / SYNCED";
    statusColor = "text-emerald-700 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/15";
    dotColor = "bg-emerald-500 shadow-[0_0_10px_#10b981]";
  } else if (syncLagSec !== null && syncLagSec >= 35) {
    const mins = Math.floor(syncLagSec / 60);
    const secs = syncLagSec % 60;
    statusLabel = `STALE — LAST SUCCESSFUL SYNC ${mins > 0 ? `${mins}m ` : ""}${secs}s AGO`;
    statusColor = "text-amber-800 dark:text-amber-400 border-amber-500/30 bg-amber-500/15";
    dotColor = "bg-amber-500";
  }

  const lastSyncText = status?.lastSyncAt
    ? new Date(status.lastSyncAt).toLocaleTimeString()
    : "Never";

  return (
    <div
      id="network-status-panel"
      className="p-4 rounded-xl border border-hairline bg-panel text-ink shadow-sm space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${dotColor}`} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-ink">
                Technocore Public Network Indexer
              </h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${statusColor}`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-xs text-muted font-mono truncate max-w-md mt-0.5">
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
                : "bg-panel-high border-hairline hover:border-hairline-bright text-ink"
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
        <div className="p-2.5 rounded-lg bg-panel-high border border-hairline">
          <div className="text-[11px] uppercase tracking-wider text-muted">Total Observations</div>
          <div className="text-lg font-mono font-bold text-ink mt-0.5">
            {status?.totalMessagesObserved ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-panel-high border border-hairline">
          <div className="text-[11px] uppercase tracking-wider text-emerald-500 font-medium">Cryptographically Verified</div>
          <div className="text-lg font-mono font-bold text-emerald-500 mt-0.5">
            {status?.totalVerifiedValid ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-panel-high border border-hairline">
          <div className="text-[11px] uppercase tracking-wider text-muted">Promoted Events</div>
          <div className="text-lg font-mono font-bold text-signal mt-0.5">
            {status?.totalMessagesPromoted ?? 0}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-panel-high border border-hairline">
          <div className="text-[11px] uppercase tracking-wider text-muted">Last Synced</div>
          <div className="text-sm font-mono font-semibold text-ink mt-1 truncate">
            {lastSyncText}
          </div>
        </div>
      </div>

      {/* Retention Gap Warning if detected */}
      {status?.retentionGapDetected && (
        <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-300 text-xs flex items-center gap-2">
          <span>⚠️</span>
          <span>
            <strong>Retention Gap Detected:</strong> Upstream server truncated historical sequence numbers. Resynchronized from latest available head.
          </span>
        </div>
      )}

      {/* Tracked Rooms Dropdown */}
      <div className="border-t border-hairline pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-mono text-muted hover:text-ink flex items-center justify-between w-full"
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
                <tr className="border-b border-hairline text-muted">
                  <th className="py-1 px-2">Room</th>
                  <th className="py-1 px-2">Status</th>
                  <th className="py-1 px-2">Last Seq</th>
                  <th className="py-1 px-2">Observed</th>
                  <th className="py-1 px-2">Promoted</th>
                  <th className="py-1 px-2">Last Fetch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-ink">
                {status.trackedRooms.map((cursor: RoomSyncCursor) => (
                  <tr key={cursor.room} className="hover:bg-panel-high/50">
                    <td className="py-1 px-2 font-semibold text-emerald-500">{cursor.room}</td>
                    <td className="py-1 px-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] ${
                          cursor.status === "IDLE"
                            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                            : cursor.status === "SYNCING"
                            ? "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 animate-pulse"
                            : cursor.status === "GAP_DETECTED"
                            ? "bg-amber-500/20 text-amber-600 dark:text-amber-300"
                            : "bg-rose-500/20 text-rose-600 dark:text-rose-300"
                        }`}
                      >
                        {cursor.status}
                      </span>
                    </td>
                    <td className="py-1 px-2">{cursor.lastSequence}</td>
                    <td className="py-1 px-2">{cursor.totalMessagesObserved}</td>
                    <td className="py-1 px-2">{cursor.totalMessagesPromoted}</td>
                    <td className="py-1 px-2 text-muted">
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
