"use client";

import React from "react";
import type { VerifiedWorkProof } from "../../civilization/execution/types.ts";

interface VerifiedProofViewerProps {
  readonly proof: VerifiedWorkProof;
  readonly onClose?: () => void;
}

export const VerifiedProofViewer: React.FC<VerifiedProofViewerProps> = ({ proof, onClose }) => {
  const isVerified = proof.status === "VERIFIED";
  const statusBadgeClass = isVerified
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
    : proof.status === "FAILED"
    ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30"
    : "bg-amber-500/15 text-amber-800 dark:text-amber-400 border-amber-500/30";

  return (
    <div className="fixed top-0 right-0 bottom-0 w-full sm:max-w-lg bg-panel/95 backdrop-blur-md border-l border-hairline z-50 p-6 overflow-y-auto flex flex-col gap-5 shadow-2xl text-ink">
      {/* Drawer Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-ink">
              Verified Work Proof
            </h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadgeClass}`}>
              {proof.status}
            </span>
          </div>
          <div className="text-xs text-muted mono">
            {proof.proofId}
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-md bg-panel-high border border-hairline text-muted hover:text-ink hover:border-hairline-bright transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* Provenance Details */}
      <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm space-y-2">
        <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
          Cryptographic Provenance
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted">Agent DID: </span>
            <span className="text-ink mono">{proof.agentDid.slice(0, 14)}...</span>
          </div>
          <div>
            <span className="text-muted">Mission: </span>
            <span className="text-ink mono">{proof.missionId}</span>
          </div>
          <div>
            <span className="text-muted">Task: </span>
            <span className="text-ink mono">{proof.taskId}</span>
          </div>
          <div>
            <span className="text-muted">Timestamp: </span>
            <span className="text-ink">{proof.timestamp ? new Date(proof.timestamp).toLocaleTimeString() : "N/A"}</span>
          </div>
        </div>
      </div>

      {/* Artifact Hashes (Proof of Integrity) */}
      <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm space-y-2">
        <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
          Artifact Integrity Hashes (SHA-256)
        </div>
        <div className="flex flex-col gap-1.5">
          {proof.artifactHashes.map((h: string, idx: number) => (
            <div
              key={idx}
              className="text-xs mono text-signal bg-panel-high border border-hairline p-2 rounded break-all"
            >
              <span className="text-muted mr-1.5">#{idx + 1}</span>
              {h}
            </div>
          ))}
        </div>
      </div>

      {/* Automated Test Verification Summary */}
      <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm space-y-2">
        <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
          Automated Sandbox Test Execution
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-ink">
            {proof.testSummary.passed} / {proof.testSummary.total} Tests Passed
          </span>
          <span className="text-muted">
            Duration: {proof.testSummary.durationMs}ms
          </span>
        </div>

        <div className="h-1.5 bg-panel-high rounded-full overflow-hidden border border-hairline">
          <div
            className={`h-full ${isVerified ? "bg-emerald-500" : "bg-rose-500"}`}
            style={{
              width: `${proof.testSummary.total > 0 ? (proof.testSummary.passed / proof.testSummary.total) * 100 : 0}%`,
            }}
          />
        </div>

        <div className="text-[11px] text-muted mono">
          Test Result Hash: {proof.testResultHash.slice(0, 32)}...
        </div>
      </div>

      {/* Pipeline Verification Steps */}
      {proof.pipelineResult && proof.pipelineResult.checks && (
        <div className="bg-panel border border-hairline rounded-lg p-4 shadow-sm space-y-2">
          <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
            Verification Pipeline Checks
          </div>
          <div className="flex flex-col gap-1.5">
            {proof.pipelineResult.checks.map((check: { stepName: string; passed: boolean; details: string }) => (
              <div
                key={check.stepName}
                className="flex justify-between items-center text-xs p-2 bg-panel-high border border-hairline rounded"
              >
                <div className="flex items-center gap-1.5">
                  <span>{check.passed ? "✅" : "❌"}</span>
                  <span className="text-ink font-medium">{check.stepName}</span>
                </div>
                <span className="text-[11px] text-muted mono">{check.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
