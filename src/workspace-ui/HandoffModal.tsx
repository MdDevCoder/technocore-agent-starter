"use client";

import React, { useState, useEffect } from "react";
import type { HandoffPreviewMetadata } from "../workspace/types.ts";

interface HandoffModalProps {
  readonly metadata: HandoffPreviewMetadata | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function HandoffModal({ metadata, isOpen, onClose }: HandoffModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCopied(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !metadata) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(metadata.fullUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    } catch {
      // Fallback
      setCopied(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-void/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-xl border border-hairline bg-panel p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-hairline/70 pb-4">
          <div>
            <span className="mono text-[11px] font-bold text-signal px-2 py-0.5 rounded bg-signal/10 border border-signal/20 uppercase tracking-wide">
              Safe Handoff Link
            </span>
            <h3 id="handoff-modal-title" className="text-ink font-semibold text-lg mt-1.5">
              Prefill {metadata.toolTitle}
            </h3>
            <p className="text-muted text-xs mt-0.5">
              Shareable link with public project parameters pre-loaded.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-muted hover:text-ink hover:bg-void/40 rounded-md p-1.5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* URL Output Box */}
        <div className="space-y-2">
          <label className="text-ink text-xs font-semibold uppercase tracking-wider block">
            Generated Safe URL
          </label>
          <div className="flex items-center gap-2 rounded-lg bg-void border border-hairline p-2.5">
            <span className="mono text-xs text-ink/90 truncate select-all flex-1">
              {metadata.fullUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                copied
                  ? "bg-emerald-500 text-white font-bold"
                  : "bg-ink text-void hover:opacity-90"
              }`}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          {copied && (
            <p className="text-emerald-500 text-xs font-medium flex items-center gap-1 mt-1">
              ✓ Safe handoff link copied to clipboard
            </p>
          )}
        </div>

        {/* Breakdown Matrix */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Shared Safe Parameters */}
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500"></span>
              SHARED IN URL ({metadata.sharedFields.length})
            </div>
            {metadata.sharedFields.length > 0 ? (
              <div className="space-y-1.5">
                {metadata.sharedFields.map((f) => (
                  <div key={f.key} className="text-[11px] leading-tight">
                    <span className="text-muted font-mono">{f.label}:</span>{" "}
                    <span className="text-ink font-mono font-medium truncate block max-w-[200px]">
                      {f.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted text-[11px] italic">No parameters pre-set.</p>
            )}
          </div>

          {/* NOT SHARED Guaranteed */}
          <div className="rounded-lg border border-hairline bg-void/50 p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <span className="size-2 rounded-full bg-slate-400"></span>
              NEVER SHARED
            </div>
            <ul className="space-y-1 text-[11px] text-muted">
              {metadata.notSharedFields.map((field) => (
                <li key={field} className="flex items-center gap-1.5">
                  <span className="text-rose-500">✕</span> {field}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Security Transparency Note */}
        <div className="rounded-lg border border-hairline bg-panel-high/40 p-3 text-[11px] text-muted leading-relaxed flex items-start gap-2">
          <span className="text-signal shrink-0 mt-0.5">ℹ</span>
          <span>
            This link contains public project context only. It never contains private keys or credentials.
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-hairline/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-hairline bg-panel text-ink hover:bg-panel-high text-xs font-medium transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-5 py-2 rounded-md bg-ink text-void hover:opacity-90 text-xs font-semibold shadow-sm transition-all"
          >
            {copied ? "✓ Safe Link Copied" : "Copy Safe Link"}
          </button>
        </div>
      </div>
    </div>
  );
}
