"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  TRACE_PRESETS,
  PUBLIC_ROOMS,
  getPresetById,
  type PublicRoomName,
} from "../trace/fixtures.ts";
import {
  parseTranscriptInput,
  reconstructTimeline,
  explainWhy,
  buildEvidenceGraph,
  generateTraceReport,
  fetchLivePublicTrace,
} from "../trace/engine.ts";
import type {
  TraceReconstructionResult,
  TraceSource,
} from "../trace/types.ts";
import { extractSafeHandoffParams } from "../workspace/handoff.ts";
import { HandoffBanner } from "../workspace-ui/HandoffBanner.tsx";

export const TraceStudioView: React.FC = () => {
  // Preset Selection & Custom Input State
  const [selectedPresetId, setSelectedPresetId] = useState<string>("live-public-network");
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [customInputText, setCustomInputText] = useState<string>("");
  const [customSource, setCustomSource] = useState<TraceSource>("PUBLIC_NETWORK");

  // Live Public Network Room & State
  const [selectedLiveRoom, setSelectedLiveRoom] = useState<PublicRoomName>("events");
  const [isFetchingLive, setIsFetchingLive] = useState<boolean>(false);
  const [liveFetchError, setLiveFetchError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [networkSourceUrl] = useState<string>("https://technocore.chat");

  // Active Reconstruction & Selection State
  const [reconstruction, setReconstruction] = useState<TraceReconstructionResult | null>(null);
  const [isReconstructing, setIsReconstructing] = useState<boolean>(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"INSPECTOR" | "WHY" | "TCLK" | "ANOMALIES" | "GRAPH" | "EXPORT">("INSPECTOR");

  // Export State
  const [exportJson, setExportJson] = useState<string>("");
  const [exportMarkdown, setExportMarkdown] = useState<string>("");
  const [exportSha256, setExportSha256] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sync safe parameters from Workspace handoff
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!searchParams) return;
    const safe = extractSafeHandoffParams(searchParams, "trace");
    if (safe.room && PUBLIC_ROOMS.includes(safe.room as PublicRoomName)) {
      setSelectedLiveRoom(safe.room as PublicRoomName);
    }
    if (safe.preset) {
      const p = getPresetById(safe.preset);
      if (p) {
        setSelectedPresetId(p.id);
        setIsCustomMode(false);
      }
    }
  }, [searchParams]);

  // Execute Live Network Fetch from Public Technocore Endpoints
  const executeLiveFetch = useCallback(async (room: string) => {
    setIsFetchingLive(true);
    setIsReconstructing(true);
    setLiveFetchError(null);

    try {
      const res = await fetchLivePublicTrace(room, 40);
      if (res.ok) {
        setLastFetchedAt(res.lastFetchedAt);
        const result = await reconstructTimeline(res.records, "PUBLIC_NETWORK", room, {
          lastFetchedAt: res.lastFetchedAt,
          networkSourceUrl: res.networkSourceUrl,
        });
        setReconstruction(result);
        if (result.events.length > 0) {
          setSelectedEventId(result.events[0]!.id);
        } else {
          setSelectedEventId(null);
        }
      } else {
        setLiveFetchError(res.error || "Live Technocore network endpoint is unavailable.");
        setReconstruction(null);
        setSelectedEventId(null);
      }
    } catch (err) {
      setLiveFetchError((err as Error).message || "Failed to reach live Technocore public network.");
      setReconstruction(null);
      setSelectedEventId(null);
    } finally {
      setIsFetchingLive(false);
      setIsReconstructing(false);
    }
  }, []);

  // Run Reconstruction for Fixture or Custom Input
  const runLocalReconstruction = useCallback(async () => {
    setIsReconstructing(true);
    setLiveFetchError(null);
    try {
      if (isCustomMode) {
        const rawRecords = parseTranscriptInput(customInputText);
        const result = await reconstructTimeline(rawRecords, customSource, "events", {
          lastFetchedAt: customSource === "PUBLIC_NETWORK" ? new Date().toISOString() : undefined,
          networkSourceUrl: customSource === "PUBLIC_NETWORK" ? networkSourceUrl : undefined,
        });
        setReconstruction(result);
        if (result.events.length > 0) {
          setSelectedEventId(result.events[0]!.id);
        } else {
          setSelectedEventId(null);
        }
      } else {
        const preset = getPresetById(selectedPresetId);
        if (preset.id === "live-public-network") {
          await executeLiveFetch(selectedLiveRoom);
          return;
        }
        const result = await reconstructTimeline(preset.records, preset.source, preset.defaultRoom);
        setReconstruction(result);
        if (result.events.length > 0) {
          setSelectedEventId(result.events[0]!.id);
        } else {
          setSelectedEventId(null);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsReconstructing(false);
    }
  }, [isCustomMode, customInputText, customSource, selectedPresetId, selectedLiveRoom, networkSourceUrl, executeLiveFetch]);

  // Initial Load & on Preset Change
  useEffect(() => {
    if (!isCustomMode) {
      const preset = getPresetById(selectedPresetId);
      if (preset.id === "live-public-network") {
        void executeLiveFetch(selectedLiveRoom);
      } else {
        void runLocalReconstruction();
      }
    }
  }, [selectedPresetId, selectedLiveRoom, isCustomMode, executeLiveFetch, runLocalReconstruction]);

  // Re-generate Export report when reconstruction updates
  useEffect(() => {
    if (reconstruction) {
      void generateTraceReport(reconstruction).then((report) => {
        setExportJson(report.jsonReport);
        setExportMarkdown(report.markdownReport);
        setExportSha256(report.sha256Hash);
      });
    }
  }, [reconstruction]);

  // Selected Event Object
  const selectedEvent = useMemo(() => {
    if (!reconstruction || !selectedEventId) return null;
    return reconstruction.events.find((e) => e.id === selectedEventId) || reconstruction.events[0] || null;
  }, [reconstruction, selectedEventId]);

  // "Why" Explanation for Selected Event
  const whyReport = useMemo(() => {
    if (!selectedEvent || !reconstruction) return null;
    return explainWhy(selectedEvent, reconstruction.events, reconstruction.tclkFold, reconstruction.anomalies);
  }, [selectedEvent, reconstruction]);

  // Evidence Lineage Graph for Selected Event
  const evidenceGraph = useMemo(() => {
    if (!selectedEvent) return null;
    return buildEvidenceGraph(selectedEvent);
  }, [selectedEvent]);

  // Copy helper
  const handleCopy = useCallback((text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  }, []);

  // Download File helper
  const handleDownload = useCallback((content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const isLivePublicSelected = !isCustomMode && selectedPresetId === "live-public-network";
  const currentSource: TraceSource = isCustomMode ? customSource : (isLivePublicSelected ? "PUBLIC_NETWORK" : "LOCAL_FIXTURE");

  return (
    <div className="space-y-8 pb-16">
      {/* 1. Header & Source Badge */}
      <section className="border-b border-hairline pb-6 pt-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="mono rounded bg-signal/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-signal">
                Trace Studio
              </span>
              <span className="mono text-xs text-muted">/trace</span>

              {/* Explicit SOURCE Label Badge */}
              {currentSource === "PUBLIC_NETWORK" ? (
                <span
                  id="source-badge"
                  className="mono inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  SOURCE: PUBLIC NETWORK
                </span>
              ) : (
                <span
                  id="source-badge"
                  className="mono inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  SOURCE: LOCAL FIXTURE
                </span>
              )}

              <span className="mono inline-flex items-center rounded border border-hairline bg-panel/60 px-2 py-0.5 text-[0.6875rem] text-muted">
                READ-ONLY · ZERO WRITE
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Technocore Agent Trace Studio
            </h1>
            <p className="text-sm text-muted sm:text-base max-w-3xl">
              Visual transcript replay, state reconstruction, and evidence explorer answering:{" "}
              <span className="text-ink font-medium">“What actually happened in this agent interaction, and why?”</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-toggle-custom-input"
              onClick={() => setIsCustomMode((prev) => !prev)}
              className={`mono rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                isCustomMode
                  ? "border-signal bg-signal/10 text-signal"
                  : "border-hairline bg-panel text-muted hover:text-ink hover:border-signal/50"
              }`}
            >
              {isCustomMode ? "← Back to Presets" : "Paste Custom Trace"}
            </button>

            {isLivePublicSelected ? (
              <button
                type="button"
                id="btn-refresh-live-network"
                onClick={() => void executeLiveFetch(selectedLiveRoom)}
                disabled={isFetchingLive}
                className="mono rounded-md bg-signal hover:bg-signal/90 px-3.5 py-1.5 text-xs font-semibold text-void transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {isFetchingLive ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-void animate-ping" />
                    Fetching Live...
                  </>
                ) : (
                  <>↻ Refresh Live Trace</>
                )}
              </button>
            ) : (
              <button
                type="button"
                id="btn-rerun-replay"
                onClick={() => void runLocalReconstruction()}
                disabled={isReconstructing}
                className="mono rounded-md border border-hairline bg-panel hover:bg-panel-hover px-3 py-1.5 text-xs font-medium text-ink transition-colors disabled:opacity-50"
              >
                {isReconstructing ? "Replaying..." : "Replay Timeline"}
              </button>
            )}
          </div>
        </div>

        {/* Retained Window Disclosure Banner for Live Public Data */}
        {currentSource === "PUBLIC_NETWORK" && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
            <div className="flex items-center gap-2 text-ink">
              <span className="mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                LIVE PUBLIC NETWORK · RETAINED WINDOW · NON-EXHAUSTIVE
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-muted mono text-[0.6875rem]">
              <span>
                Source: <strong className="text-ink">{networkSourceUrl}</strong>
              </span>
              {lastFetchedAt && (
                <span>
                  Last Fetched: <strong className="text-ink">{lastFetchedAt.slice(11, 19)} UTC</strong>
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Workspace Context Handoff Banner */}
      <HandoffBanner destination="trace" />

      {/* 2. Controls & Preset Selection */}
      <section className="rounded-xl border border-hairline bg-panel/40 p-4 sm:p-6 space-y-4">
        {!isCustomMode ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="mono text-xs font-medium text-muted uppercase tracking-wider">
                Select Forensic Preset
              </span>
              <span className="text-xs text-muted">
                Choose live public network streaming or an offline local fixture vector.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {TRACE_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                const isLive = preset.source === "PUBLIC_NETWORK";
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                    }}
                    className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? "border-signal bg-signal/5 shadow-sm ring-1 ring-signal/30"
                        : "border-hairline bg-panel/70 hover:border-signal/40 hover:bg-panel"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="mono text-xs font-bold text-ink truncate">{preset.name}</span>
                      <span
                        className={`mono text-[0.625rem] px-1.5 py-0.5 rounded ${
                          isLive
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
                        }`}
                      >
                        {isLive ? "LIVE NETWORK" : "LOCAL FIXTURE"}
                      </span>
                    </div>
                    <p className="text-xs text-muted line-clamp-2 leading-relaxed">{preset.summary}</p>
                    <div className="mono text-[0.6875rem] text-muted/80 mt-1">
                      {isLive ? (
                        <span>
                          Live Endpoint: <span className="text-ink">/r/{selectedLiveRoom}</span>
                        </span>
                      ) : (
                        <span>
                          Room: <span className="text-ink">/r/{preset.defaultRoom}</span> · {preset.records.length} records
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live Public Room Selector (Visible when Live Public Network preset is active) */}
            {isLivePublicSelected && (
              <div className="space-y-2 rounded-lg border border-hairline/80 bg-panel/80 p-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="mono text-xs font-semibold text-ink">
                    Select Public Broadcast Room to Stream:
                  </span>
                  <span className="mono text-[0.6875rem] text-muted">
                    Read-only query of retained records on technocore.chat
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {PUBLIC_ROOMS.map((room) => {
                    const isRoomActive = selectedLiveRoom === room;
                    return (
                      <button
                        key={room}
                        type="button"
                        onClick={() => setSelectedLiveRoom(room)}
                        disabled={isFetchingLive}
                        className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                          isRoomActive
                            ? "bg-signal text-void font-bold shadow-sm"
                            : "border border-hairline bg-panel hover:bg-panel-hover text-muted hover:text-ink"
                        }`}
                      >
                        /r/{room}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <span className="mono text-xs font-semibold text-signal uppercase tracking-wider">
                  Custom Transcript Input
                </span>
                <p className="text-xs text-muted">
                  Paste an array of Technocore JSON records, JSON Lines (NDJSON), or fetch live public room data.
                </p>
              </div>

              {/* Source Mode Toggle for Custom Input */}
              <div className="flex items-center gap-2">
                <span className="mono text-xs text-muted">Declared Source:</span>
                <select
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value as TraceSource)}
                  className="mono rounded border border-hairline bg-panel px-2.5 py-1 text-xs text-ink focus:border-signal focus:outline-none"
                >
                  <option value="PUBLIC_NETWORK">SOURCE: PUBLIC NETWORK</option>
                  <option value="LOCAL_FIXTURE">SOURCE: LOCAL FIXTURE</option>
                </select>
              </div>
            </div>

            {/* Quick Live Fetch helpers */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline/80 bg-panel/80 p-2.5">
              <span className="mono text-xs text-muted">Fetch Live Public Room:</span>
              {PUBLIC_ROOMS.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={isFetchingLive}
                  onClick={async () => {
                    setIsFetchingLive(true);
                    setLiveFetchError(null);
                    const res = await fetchLivePublicTrace(r, 30);
                    if (res.ok) {
                      setCustomInputText(JSON.stringify(res.records, null, 2));
                      setCustomSource("PUBLIC_NETWORK");
                      setLastFetchedAt(res.lastFetchedAt);
                    } else {
                      setLiveFetchError(res.error || "Failed to fetch room records.");
                    }
                    setIsFetchingLive(false);
                  }}
                  className="mono rounded border border-hairline bg-panel hover:bg-panel-hover px-2 py-1 text-xs text-ink transition-colors disabled:opacity-50"
                >
                  /r/{r}
                </button>
              ))}
              {isFetchingLive && <span className="mono text-xs text-signal animate-pulse">Fetching records...</span>}
            </div>

            <textarea
              id="custom-transcript-textarea"
              value={customInputText}
              onChange={(e) => setCustomInputText(e.target.value)}
              placeholder={`[
  {
    "room": "tclk-offers",
    "sequence": 101,
    "serverTimestamp": "2026-09-12T10:00:00.000Z",
    "authorDid": "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    "nonce": "1789200001000",
    "sig": "4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA...",
    "text": "{\\"type\\":\\"offer\\",\\"amount\\":\\"500\\",\\"asset\\":\\"FLOP\\"}"
  }
]`}
              rows={8}
              className="mono w-full rounded-lg border border-hairline bg-panel p-3 text-xs text-ink font-mono focus:border-signal focus:outline-none"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCustomInputText("");
                }}
                className="mono rounded border border-hairline bg-panel px-3 py-1.5 text-xs text-muted hover:text-ink transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void runLocalReconstruction()}
                className="mono rounded bg-signal hover:bg-signal/90 px-4 py-1.5 text-xs font-semibold text-void transition-colors"
              >
                Reconstruct Custom Timeline
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Offline / Live Network Unavailable State */}
      {liveFetchError && (
        <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="mono rounded bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              LIVE NETWORK UNAVAILABLE
            </span>
            <span className="text-sm font-semibold text-ink">Failed to fetch live public network data</span>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Technocore public network endpoint error: <span className="mono text-ink font-semibold">{liveFetchError}</span>.
            Trace Studio will not fabricate or inject synthetic fallback records into the live view.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => void executeLiveFetch(selectedLiveRoom)}
              className="mono rounded bg-signal hover:bg-signal/90 px-3.5 py-1.5 text-xs font-semibold text-void transition-colors"
            >
              ↻ Retry Live Fetch
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedPresetId("tclk-clean-lifecycle");
                setLiveFetchError(null);
              }}
              className="mono rounded border border-hairline bg-panel hover:bg-panel-hover px-3.5 py-1.5 text-xs font-medium text-ink transition-colors"
            >
              Load Local Fixture Instead →
            </button>
          </div>
        </section>
      )}

      {/* 3. Executive Metrics Bar */}
      {reconstruction && !liveFetchError && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-xl border border-hairline bg-panel/40 p-4">
            <span className="mono text-[0.6875rem] text-muted uppercase">Events in Trace</span>
            <div className="mono text-2xl font-bold text-ink mt-1">
              {reconstruction.events.length}
            </div>
            <span className="mono text-[0.6875rem] text-muted">
              {reconstruction.events.length > 0
                ? `Seq ${reconstruction.sequenceRange.min}..${reconstruction.sequenceRange.max}`
                : "0 records in room"}
            </span>
          </div>

          <div className="rounded-xl border border-hairline bg-panel/40 p-4">
            <span className="mono text-[0.6875rem] text-muted uppercase">Cryptographic Validity</span>
            <div className="mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {reconstruction.stats.verifiedCount}/{reconstruction.events.length}
            </div>
            <span className="mono text-[0.6875rem] text-muted">
              {reconstruction.events.length > 0
                ? Math.round((reconstruction.stats.verifiedCount / reconstruction.events.length) * 100)
                : 100}
              % verified Ed25519
            </span>
          </div>

          <div className="rounded-xl border border-hairline bg-panel/40 p-4">
            <span className="mono text-[0.6875rem] text-muted uppercase">Protocol Anomalies</span>
            <div
              className={`mono text-2xl font-bold mt-1 ${
                reconstruction.anomalies.length > 0 ? "text-amber-500" : "text-ink"
              }`}
            >
              {reconstruction.anomalies.length}
            </div>
            <span className="mono text-[0.6875rem] text-muted">
              {reconstruction.anomalies.length === 0 ? "Clean transcript" : "Forensics flagged"}
            </span>
          </div>

          <div className="rounded-xl border border-hairline bg-panel/40 p-4">
            <span className="mono text-[0.6875rem] text-muted uppercase">TCLK Deals</span>
            <div className="mono text-2xl font-bold text-ink mt-1">
              {reconstruction.tclkFold.totalDealsObserved}
            </div>
            <span className="mono text-[0.6875rem] text-muted">
              {reconstruction.tclkFold.completedDealsCount} claimed · {reconstruction.tclkFold.partialDealsCount} partial
            </span>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-xl border border-hairline bg-panel/40 p-4 flex flex-col justify-between">
            <span className="mono text-[0.6875rem] text-muted uppercase">Report Digest</span>
            <div className="mono text-xs font-mono text-signal truncate mt-1">
              {exportSha256 ? `${exportSha256.slice(0, 12)}...` : "Calculating..."}
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("EXPORT")}
              className="mono text-xs text-signal hover:underline text-left mt-1"
            >
              View Report →
            </button>
          </div>
        </section>
      )}

      {/* 4. Main Interactive Workbench: Reconstructed Timeline + Forensic Inspector */}
      {reconstruction && !liveFetchError && (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Timeline Column (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="mono text-xs font-semibold text-ink uppercase tracking-wider">
                Reconstructed Timeline ({reconstruction.events.length})
              </span>
              <span className="mono text-[0.6875rem] text-muted">Click event to inspect</span>
            </div>

            <div className="max-h-[640px] space-y-2 overflow-y-auto rounded-xl border border-hairline bg-panel/20 p-2.5">
              {reconstruction.events.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted space-y-2">
                  <div className="mono font-semibold text-ink">0 retained records in /r/{selectedLiveRoom}</div>
                  <p className="text-xs text-muted max-w-xs mx-auto">
                    This public room currently has no messages in the retained window. No synthetic records were injected.
                  </p>
                </div>
              ) : (
                reconstruction.events.map((evt) => {
                  const isSelected = selectedEvent?.id === evt.id;
                  const hasAnomalies = evt.anomalyIds.length > 0;

                  return (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() => setSelectedEventId(evt.id)}
                      className={`flex w-full flex-col gap-1.5 rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? "border-signal bg-signal/10 shadow-sm ring-1 ring-signal/40"
                          : "border-hairline bg-panel/80 hover:border-signal/40 hover:bg-panel"
                      }`}
                    >
                      {/* Top row: Seq, Room, Timestamp */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="mono rounded bg-panel-hover px-1.5 py-0.5 text-xs font-bold text-ink">
                            #{evt.sequence}
                          </span>
                          <span className="mono text-xs text-signal">/r/{evt.room}</span>
                        </div>
                        <span className="mono text-[0.6875rem] text-muted">
                          {evt.serverTimestamp.slice(11, 19)} UTC
                        </span>
                      </div>

                      {/* Middle row: Classification & Verification Badge */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mono rounded bg-panel px-1.5 py-0.5 text-[0.6875rem] font-medium text-ink">
                          {evt.classification}
                        </span>

                        {evt.verificationState === "VERIFIED_VALID" && (
                          <span className="mono rounded bg-emerald-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-emerald-600 dark:text-emerald-400">
                            VERIFIED
                          </span>
                        )}
                        {evt.verificationState === "INVALID_SIGNATURE" && (
                          <span className="mono rounded bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-red-600 dark:text-red-400">
                            INVALID SIG
                          </span>
                        )}
                        {evt.verificationState === "MALFORMED_ENVELOPE" && (
                          <span className="mono rounded bg-red-500/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-red-600 dark:text-red-400">
                            MALFORMED
                          </span>
                        )}
                        {evt.verificationState === "UNVERIFIABLE_UNSIGNED" && (
                          <span className="mono rounded bg-panel px-1.5 py-0.5 text-[0.625rem] text-muted">
                            UNSIGNED
                          </span>
                        )}

                        {hasAnomalies && (
                          <span className="mono rounded bg-amber-500/20 px-1.5 py-0.5 text-[0.625rem] font-bold text-amber-600 dark:text-amber-400">
                            ⚠ {evt.anomalyIds.length} ANOMALY
                          </span>
                        )}
                      </div>

                      {/* Author DID / Snippet */}
                      <div className="mono text-[0.6875rem] text-muted truncate">
                        DID: <span className="text-ink">{evt.authorDid.slice(0, 22)}...</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Forensic Inspector Column (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Inspector Navigation Tabs */}
            <div className="flex flex-wrap items-center gap-1 border-b border-hairline pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("INSPECTOR")}
                className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === "INSPECTOR"
                    ? "bg-signal text-void font-bold"
                    : "text-muted hover:text-ink hover:bg-panel"
                }`}
              >
                Wire Inspector
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("WHY")}
                className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === "WHY"
                    ? "bg-signal text-void font-bold"
                    : "text-muted hover:text-ink hover:bg-panel"
                }`}
              >
                Why Did This Happen?
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("TCLK")}
                className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === "TCLK"
                    ? "bg-signal text-void font-bold"
                    : "text-muted hover:text-ink hover:bg-panel"
                }`}
              >
                TCLK State Fold ({reconstruction.tclkFold.totalDealsObserved})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ANOMALIES")}
                className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === "ANOMALIES"
                    ? "bg-signal text-void font-bold"
                    : "text-muted hover:text-ink hover:bg-panel"
                }`}
              >
                Anomalies ({reconstruction.anomalies.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("GRAPH")}
                className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === "GRAPH"
                    ? "bg-signal text-void font-bold"
                    : "text-muted hover:text-ink hover:bg-panel"
                }`}
              >
                Evidence Lineage Graph
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("EXPORT")}
                className={`mono rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === "EXPORT"
                    ? "bg-signal text-void font-bold"
                    : "text-muted hover:text-ink hover:bg-panel"
                }`}
              >
                Export Report
              </button>
            </div>

            {/* TAB 1: WIRE INSPECTOR */}
            {activeTab === "INSPECTOR" && selectedEvent && (
              <div className="space-y-4 rounded-xl border border-hairline bg-panel/40 p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-3">
                  <div>
                    <span className="mono text-xs font-bold text-signal">
                      Event #{selectedEvent.sequence} · /r/{selectedEvent.room}
                    </span>
                    <h3 className="text-base font-semibold text-ink">Wire & Cryptographic Forensics</h3>
                  </div>

                  {/* Deep-link diagnostics */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/doctor?sig=${encodeURIComponent(selectedEvent.signature || "")}&did=${encodeURIComponent(selectedEvent.authorDid)}`}
                      className="mono rounded border border-hairline bg-panel hover:bg-panel-hover px-2 py-1 text-[0.6875rem] text-ink transition-colors"
                    >
                      Open in Doctor →
                    </Link>
                    <Link
                      href={`/forge?room=${encodeURIComponent(selectedEvent.room)}`}
                      className="mono rounded border border-hairline bg-panel hover:bg-panel-hover px-2 py-1 text-[0.6875rem] text-ink transition-colors"
                    >
                      Open in Forge →
                    </Link>
                  </div>
                </div>

                {/* Canonical Wire Formula & Hash */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-muted uppercase">
                      Canonical Formula: room|nonce|text
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedEvent.canonicalPayload, "canon")}
                      className="mono text-xs text-signal hover:underline"
                    >
                      {copiedKey === "canon" ? "Copied!" : "Copy Formula"}
                    </button>
                  </div>
                  <pre className="mono rounded-lg border border-hairline bg-panel p-2.5 text-xs text-ink overflow-x-auto">
                    {selectedEvent.canonicalPayload}
                  </pre>
                </div>

                {/* Payload Text / JSON Body */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-muted uppercase">Wire Text / Frame Body</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedEvent.text, "text")}
                      className="mono text-xs text-signal hover:underline"
                    >
                      {copiedKey === "text" ? "Copied!" : "Copy Payload"}
                    </button>
                  </div>
                  <pre className="mono max-h-48 rounded-lg border border-hairline bg-panel p-2.5 text-xs text-ink overflow-auto">
                    {selectedEvent.text}
                  </pre>
                </div>

                {/* Exact Bytes Hex & Length */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 rounded-lg border border-hairline bg-panel/60 p-3">
                    <span className="mono text-[0.6875rem] text-muted uppercase">UTF-8 Byte Length</span>
                    <div className="mono text-sm font-semibold text-ink">
                      {selectedEvent.rawByteLength} bytes
                    </div>
                  </div>

                  <div className="space-y-1 rounded-lg border border-hairline bg-panel/60 p-3">
                    <span className="mono text-[0.6875rem] text-muted uppercase">Evidence SHA-256 Digest</span>
                    <div className="mono text-xs text-signal truncate">
                      {selectedEvent.evidenceHash}
                    </div>
                  </div>
                </div>

                {/* Signature Verification Details */}
                <div className="space-y-2 rounded-lg border border-hairline bg-panel/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-muted uppercase">Ed25519 Signature</span>
                    <span
                      className={`mono text-xs font-bold ${
                        selectedEvent.verificationState === "VERIFIED_VALID"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : selectedEvent.verificationState === "INVALID_SIGNATURE"
                            ? "text-red-500"
                            : "text-muted"
                      }`}
                    >
                      {selectedEvent.verificationState}
                    </span>
                  </div>
                  <div className="mono text-xs text-ink font-mono break-all bg-panel p-2 rounded">
                    {selectedEvent.signature || "None (Unsigned message)"}
                  </div>
                  {selectedEvent.verificationReason && (
                    <div className="text-xs text-muted leading-relaxed">
                      <span className="font-semibold text-ink">Reason:</span> {selectedEvent.verificationReason}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: WHY DID THIS HAPPEN? */}
            {activeTab === "WHY" && whyReport && selectedEvent && (
              <div className="space-y-4 rounded-xl border border-hairline bg-panel/40 p-4 sm:p-5">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div>
                    <span className="mono text-xs font-bold text-signal">
                      Deterministic Protocol Explanation
                    </span>
                    <h3 className="text-base font-semibold text-ink">
                      Why Did Event #{selectedEvent.sequence} Occur?
                    </h3>
                  </div>

                  <span
                    className={`mono rounded-full px-3 py-0.5 text-xs font-bold ${
                      whyReport.verdict === "VALID_TRANSITION"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : whyReport.verdict === "ANOMALOUS_EVENT"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-panel text-muted"
                    }`}
                  >
                    {whyReport.verdict}
                  </span>
                </div>

                <div className="rounded-lg border border-signal/20 bg-signal/5 p-3.5 text-sm text-ink leading-relaxed">
                  <span className="font-bold text-signal">Protocol Verdict:</span> {whyReport.summary}
                </div>

                <div className="space-y-2.5">
                  <span className="mono text-xs font-semibold text-muted uppercase">
                    Protocol & Cryptographic Conditions Checklist:
                  </span>
                  <div className="space-y-2">
                    {whyReport.conditions.map((cond, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          cond.passed
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-red-500/30 bg-red-500/5"
                        }`}
                      >
                        <span
                          className={`mono text-base font-bold ${
                            cond.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                          }`}
                        >
                          {cond.passed ? "✓" : "✗"}
                        </span>
                        <div className="space-y-0.5">
                          <span className="mono text-xs font-bold text-ink">{cond.label}</span>
                          <p className="text-xs text-muted leading-relaxed">{cond.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TCLK STATE FOLD */}
            {activeTab === "TCLK" && (
              <div className="space-y-4 rounded-xl border border-hairline bg-panel/40 p-4 sm:p-5">
                <div className="border-b border-hairline pb-3">
                  <span className="mono text-xs font-bold text-signal">TCLK State Machine</span>
                  <h3 className="text-base font-semibold text-ink">Folded Deal Lifecycles</h3>
                </div>

                {reconstruction.tclkFold.contracts.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted">
                    No TCLK bilateral deal frames observed in this trace.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reconstruction.tclkFold.contracts.map((contract) => (
                      <div
                        key={contract.contractId}
                        className="space-y-3 rounded-xl border border-hairline bg-panel/70 p-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-2.5">
                          <div>
                            <span className="mono text-xs text-muted">Contract ID:</span>
                            <div className="mono text-xs font-bold text-ink truncate max-w-sm">
                              {contract.contractId}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {contract.isPartial && (
                              <span className="mono rounded bg-amber-500/20 px-2 py-0.5 text-[0.625rem] font-bold text-amber-600 dark:text-amber-400">
                                PARTIAL TRANSCRIPT
                              </span>
                            )}
                            <span
                              className={`mono rounded px-2 py-0.5 text-xs font-bold uppercase ${
                                contract.currentStatus === "claimed"
                                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                  : contract.currentStatus === "locked"
                                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                    : contract.currentStatus === "accepted"
                                      ? "bg-purple-500/20 text-purple-600 dark:text-purple-400"
                                      : contract.currentStatus === "refunded" || contract.currentStatus === "cancelled"
                                        ? "bg-red-500/20 text-red-600 dark:text-red-400"
                                        : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              Status: {contract.currentStatus}
                            </span>
                          </div>
                        </div>

                        {/* State Machine Progress Bar */}
                        <div className="grid grid-cols-4 gap-1.5 pt-1">
                          {(["proposed", "accepted", "locked", "claimed"] as const).map((step, idx) => {
                            const reached =
                              (step === "proposed" && contract.transitions.some((t) => t.toStatus === "proposed")) ||
                              (step === "accepted" && contract.transitions.some((t) => t.toStatus === "accepted")) ||
                              (step === "locked" && contract.transitions.some((t) => t.toStatus === "locked")) ||
                              (step === "claimed" && contract.transitions.some((t) => t.toStatus === "claimed"));

                            return (
                              <div
                                key={step}
                                className={`rounded p-2 text-center mono text-[0.6875rem] font-bold uppercase ${
                                  reached
                                    ? "bg-signal text-void"
                                    : "bg-panel text-muted/60 border border-hairline"
                                }`}
                              >
                                {idx + 1}. {step}
                              </div>
                            );
                          })}
                        </div>

                        {/* Contract Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 text-xs text-muted">
                          <div>
                            <span className="mono text-[0.625rem] uppercase">Asset & Amount:</span>
                            <div className="mono text-ink font-semibold">
                              {contract.amount} {contract.asset}
                            </div>
                          </div>
                          <div>
                            <span className="mono text-[0.625rem] uppercase">Lock Type:</span>
                            <div className="mono text-ink font-semibold">{contract.lockKind}</div>
                          </div>
                          <div>
                            <span className="mono text-[0.625rem] uppercase">Payer DID:</span>
                            <div className="mono text-ink truncate">{contract.payerDid.slice(0, 16)}...</div>
                          </div>
                        </div>

                        {/* Transitions History */}
                        <div className="pt-2 border-t border-hairline">
                          <span className="mono text-[0.6875rem] font-semibold text-muted uppercase">
                            State Transitions ({contract.transitions.length}):
                          </span>
                          <div className="space-y-1 mt-1.5">
                            {contract.transitions.map((t, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-xs mono bg-panel p-1.5 rounded"
                              >
                                <span>
                                  Seq #{t.sequence} · Frame: <strong className="text-signal">{t.frameType}</strong> ({t.fromStatus} → {t.toStatus})
                                </span>
                                <span className={t.appliedSuccessfully ? "text-emerald-500 font-bold" : "text-red-500 font-bold"}>
                                  {t.appliedSuccessfully ? "APPLIED" : "REJECTED"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: ANOMALIES INSPECTOR */}
            {activeTab === "ANOMALIES" && (
              <div className="space-y-4 rounded-xl border border-hairline bg-panel/40 p-4 sm:p-5">
                <div className="border-b border-hairline pb-3">
                  <span className="mono text-xs font-bold text-signal">Forensic Anomaly Engine</span>
                  <h3 className="text-base font-semibold text-ink">
                    Detected Anomalies ({reconstruction.anomalies.length})
                  </h3>
                </div>

                {reconstruction.anomalies.length === 0 ? (
                  <div className="py-12 text-center text-sm text-emerald-600 dark:text-emerald-400">
                    ✓ Clean Transcript: Zero cryptographic or protocol anomalies detected in current window.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reconstruction.anomalies.map((anom) => (
                      <div
                        key={anom.id}
                        className={`space-y-2 rounded-xl border p-4 ${
                          anom.severity === "CRITICAL"
                            ? "border-red-500/40 bg-red-500/5"
                            : "border-amber-500/40 bg-amber-500/5"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`mono rounded px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase ${
                                anom.severity === "CRITICAL"
                                  ? "bg-red-500 text-white"
                                  : "bg-amber-500 text-black font-semibold"
                              }`}
                            >
                              {anom.severity}
                            </span>
                            <h4 className="text-sm font-bold text-ink">{anom.title}</h4>
                          </div>
                          {anom.sequence && (
                            <button
                              type="button"
                              onClick={() => {
                                const matchingEvt = reconstruction.events.find((e) => e.sequence === anom.sequence);
                                if (matchingEvt) {
                                  setSelectedEventId(matchingEvt.id);
                                  setActiveTab("INSPECTOR");
                                }
                              }}
                              className="mono text-xs text-signal hover:underline"
                            >
                              Jump to Seq #{anom.sequence} →
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
                          <div>
                            <strong className="mono text-muted uppercase">WHAT:</strong>{" "}
                            <span className="text-ink">{anom.what}</span>
                          </div>
                          <div>
                            <strong className="mono text-muted uppercase">WHY:</strong>{" "}
                            <span className="text-ink">{anom.why}</span>
                          </div>
                          <div>
                            <strong className="mono text-muted uppercase">IMPACT:</strong>{" "}
                            <span className="text-ink">{anom.impact}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: EVIDENCE LINEAGE GRAPH */}
            {activeTab === "GRAPH" && evidenceGraph && selectedEvent && (
              <div className="space-y-4 rounded-xl border border-hairline bg-panel/40 p-4 sm:p-5">
                <div className="border-b border-hairline pb-3">
                  <span className="mono text-xs font-bold text-signal">Cryptographic Lineage</span>
                  <h3 className="text-base font-semibold text-ink">
                    Evidence Graph for Event #{selectedEvent.sequence}
                  </h3>
                </div>

                <div className="space-y-3">
                  {evidenceGraph.nodes.map((node, idx) => (
                    <div
                      key={node.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border p-3 ${
                        node.status === "VALID"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : node.status === "INVALID"
                            ? "border-red-500/30 bg-red-500/5"
                            : "border-hairline bg-panel/70"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="mono rounded bg-panel px-2 py-1 text-xs font-bold text-ink">
                          {idx + 1}
                        </span>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="mono text-xs font-bold text-ink">{node.label}</span>
                            <span className="mono text-[0.625rem] text-muted">({node.type})</span>
                          </div>
                          <p className="text-xs text-muted">{node.description}</p>
                        </div>
                      </div>

                      <div className="mono text-xs text-signal font-mono truncate max-w-xs sm:text-right">
                        {node.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 6: DETERMINISTIC REPORT EXPORT */}
            {activeTab === "EXPORT" && (
              <div className="space-y-4 rounded-xl border border-hairline bg-panel/40 p-4 sm:p-5">
                <div className="border-b border-hairline pb-3">
                  <span className="mono text-xs font-bold text-signal">Forensic Integrity Export</span>
                  <h3 className="text-base font-semibold text-ink">Cryptographic Trace Report</h3>
                </div>

                <div className="space-y-2 rounded-lg border border-hairline bg-panel/70 p-3">
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-semibold text-muted uppercase">SHA-256 Integrity Hash</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(exportSha256, "sha")}
                      className="mono text-xs text-signal hover:underline"
                    >
                      {copiedKey === "sha" ? "Copied!" : "Copy Hash"}
                    </button>
                  </div>
                  <pre className="mono text-xs text-ink bg-panel p-2 rounded break-all">
                    {exportSha256}
                  </pre>
                </div>

                {/* Zero Secret Guarantee Banner */}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-ink leading-relaxed">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Zero-Secret Guarantee:</span> This report contains only deterministic public event digests, DIDs, signatures, and protocol states. No private keys, seeds, passwords, or credentials are ever included or processed.
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleDownload(exportJson, `technocore-trace-${Date.now()}.json`, "application/json")}
                    className="mono rounded bg-signal hover:bg-signal/90 px-3.5 py-1.5 text-xs font-semibold text-void transition-colors"
                  >
                    Download JSON Report
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(exportMarkdown, `technocore-trace-${Date.now()}.md`, "text/markdown")}
                    className="mono rounded border border-hairline bg-panel hover:bg-panel-hover px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors"
                  >
                    Download Markdown Report
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(exportMarkdown, "md")}
                    className="mono rounded border border-hairline bg-panel hover:bg-panel-hover px-3.5 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors"
                  >
                    {copiedKey === "md" ? "Copied Markdown!" : "Copy Markdown"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
