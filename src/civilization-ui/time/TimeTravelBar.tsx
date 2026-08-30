/**
 * Time Travel Timeline Bar Component.
 *
 * Provides historical timeline scrubbing between Genesis (T=0) and Live (T=Now),
 * reconstructing deterministic civilization snapshots on the fly.
 */

"use client";

import React from "react";

interface TimeTravelBarProps {
  readonly currentTick: number;
  readonly displayedTick: number;
  readonly maxTick: number;
  readonly isScrubbing: boolean;
  readonly onScrub: (targetTick: number) => void;
  readonly onResumeLive: () => void;
}

export const TimeTravelBar: React.FC<TimeTravelBarProps> = ({
  currentTick,
  displayedTick,
  maxTick,
  isScrubbing,
  onScrub,
  onResumeLive,
}) => {
  return (
    <div className="rounded-lg border border-hairline bg-panel p-3.5 shadow-xl backdrop-blur-md space-y-2.5">
      <div className="flex items-center justify-between mono text-xs">
        <div className="flex items-center gap-2.5">
          <span className="eyebrow text-ink font-bold">CHRONO_TIMELINE</span>
          <span className="text-muted text-xs">
            VIEWING: <span className="text-signal font-bold">T+{displayedTick}</span> (HEAD: <span className="text-ink font-semibold">T+{currentTick}</span>)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isScrubbing && (
            <button
              onClick={onResumeLive}
              className="rounded bg-signal/20 px-2.5 py-1 text-signal border border-signal/40 text-xs font-bold hover:bg-signal/30 transition-colors"
            >
              RESUME LIVE →
            </button>
          )}
          <span className="text-muted text-xs font-medium">
            {isScrubbing ? "HISTORICAL SNAPSHOT REPLAY" : "LIVE SYNCHRONIZATION"}
          </span>
        </div>
      </div>

      {/* Slider Scrubber */}
      <div className="relative flex items-center gap-3">
        <span className="mono text-xs text-muted font-medium">GENESIS (T+0)</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, maxTick)}
          value={displayedTick}
          onChange={(e) => onScrub(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-graphite accent-signal border border-hairline hover:border-signal/40 transition-colors"
          aria-label="Time travel scrubber"
        />
        <span className="mono text-xs text-signal font-bold">T+{maxTick} (NOW)</span>
      </div>
    </div>
  );
};
