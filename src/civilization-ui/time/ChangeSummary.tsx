/**
 * "What Changed?" Historical Delta Component.
 *
 * Computes and displays the exact state delta between any historical time point
 * and the latest civilization state.
 */

"use client";

import React from "react";
import type { WhatChangedDelta } from "../types.ts";

interface ChangeSummaryProps {
  readonly delta: WhatChangedDelta | null;
  readonly onResumeLive: () => void;
}

export const ChangeSummary: React.FC<ChangeSummaryProps> = ({
  delta,
  onResumeLive,
}) => {
  if (!delta) return null;

  const repShiftSign = delta.avgReputationShift >= 0 ? "+" : "";

  return (
    <div className="rounded-lg border border-attention/50 bg-attention/5 p-4 shadow-xl space-y-3 mono text-xs">
      <div className="flex items-center justify-between border-b border-attention/30 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-attention font-bold">⏱</span>
          <span className="eyebrow text-attention font-bold">
            HISTORICAL_DELTA: T+{delta.fromTick} → T+{delta.toTick}
          </span>
        </div>
        <button
          onClick={onResumeLive}
          className="rounded bg-signal/20 px-2.5 py-1 text-signal border border-signal/40 text-[10px] font-bold hover:bg-signal/30 transition-colors"
        >
          RESUME_LIVE_NOW →
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="rounded bg-graphite/80 border border-hairline p-2">
          <div className="text-[10px] text-faint">NEW MISSIONS</div>
          <div className="text-sm font-bold text-signal mt-0.5">+{delta.newMissionsCount}</div>
        </div>
        <div className="rounded bg-graphite/80 border border-hairline p-2">
          <div className="text-[10px] text-faint">COMPLETED</div>
          <div className="text-sm font-bold text-verified mt-0.5">+{delta.completedMissionsCount}</div>
        </div>
        <div className="rounded bg-graphite/80 border border-hairline p-2">
          <div className="text-[10px] text-faint">DISPUTES RESOLVED</div>
          <div className="text-sm font-bold text-fault mt-0.5">+{delta.resolvedDisputesCount}</div>
        </div>
        <div className="rounded bg-graphite/80 border border-hairline p-2">
          <div className="text-[10px] text-faint">AVG REPUTATION</div>
          <div className="text-sm font-bold text-ink mt-0.5">
            {repShiftSign}{delta.avgReputationShift.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted border-t border-hairline/60 pt-2">
        <span>EVENTS DELTA: +{delta.eventDeltaCount} canonical records</span>
        <span>
          HEALTH SHIFT: {delta.healthStatusShift.from} → <strong className="text-signal">{delta.healthStatusShift.to}</strong>
        </span>
      </div>
    </div>
  );
};
