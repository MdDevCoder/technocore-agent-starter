"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  validateReceivedHandoff,
  type ToolDestination,
} from "../workspace/handoff.ts";

interface HandoffBannerProps {
  readonly destination: ToolDestination;
  readonly onDismiss?: () => void;
}

export function HandoffBanner({ destination, onDismiss }: HandoffBannerProps) {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!searchParams) return;
    const { hasHandoff, acceptedFields } = validateReceivedHandoff(
      destination,
      searchParams,
    );
    if (hasHandoff) {
      setAccepted(acceptedFields);
      setDismissed(false);
    } else {
      setAccepted({});
    }
  }, [searchParams, destination]);

  if (dismissed || Object.keys(accepted).length === 0) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined" && window.history) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (onDismiss) {
      onDismiss();
    }
  };

  return (
    <aside
      aria-label="Workspace Context Banner"
      className="mb-6 rounded-xl border border-signal/30 bg-signal/5 p-4 text-xs animate-fade-in flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
    >
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-signal animate-pulse"></span>
          <span className="mono font-bold text-signal text-[11px] uppercase tracking-wide">
            Loaded from Workspace
          </span>
          <span className="text-muted text-[11px]">· Public parameters applied</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {Object.entries(accepted).map(([key, val]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded bg-panel px-2 py-0.5 border border-hairline font-mono text-[11px] text-ink max-w-[260px] truncate"
            >
              <span className="text-muted">{key}:</span>
              <span className="font-semibold truncate">{val}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss workspace parameters"
          className="rounded-md border border-hairline bg-panel px-3 py-1.5 text-xs font-medium text-muted hover:text-ink hover:bg-panel-high transition-colors active:scale-95"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
