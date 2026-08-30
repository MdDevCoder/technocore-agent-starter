/**
 * Court Evidence Panel Component.
 *
 * Visualizes structured evidence packages submitted during Agent Court trials.
 */

"use client";

import React from "react";
import type { CourtEvidenceItem } from "../../civilization/court/types.ts";

interface EvidencePanelProps {
  readonly evidenceChain: readonly CourtEvidenceItem[];
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  evidenceChain,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">SUBMITTED_EVIDENCE_CHAIN</span>
        <span className="mono text-[10px] text-faint">
          {evidenceChain.length} VERIFIED ITEMS
        </span>
      </div>

      {evidenceChain.length === 0 ? (
        <div className="rounded border border-hairline bg-panel p-4 text-center text-xs text-muted mono">
          Evidence package is linked directly from signed review events.
        </div>
      ) : (
        <div className="space-y-2">
          {evidenceChain.map((item, idx) => (
            <div
              key={item.courtEvidenceId || idx}
              className="rounded border border-hairline bg-panel p-3 text-xs mono space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{item.evidenceType}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] border border-verified/40 bg-verified/10 text-verified">
                  WEIGHT: {item.weightScore}%
                </span>
              </div>
              <p className="text-[11px] text-muted">{item.description}</p>
              <div className="flex items-center justify-between border-t border-hairline/60 pt-1 text-[9px] text-faint">
                <span>SUBMITTER: {item.submitterDid?.slice(0, 16)}...</span>
                <span className="text-signal">ID: {item.courtEvidenceId.slice(0, 12)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
