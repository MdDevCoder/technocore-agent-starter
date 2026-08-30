"use client";

import React from "react";
import type { VerifiedWorkProof } from "../../civilization/execution/types.ts";

interface VerifiedProofViewerProps {
  readonly proof: VerifiedWorkProof;
  readonly onClose?: () => void;
}

export const VerifiedProofViewer: React.FC<VerifiedProofViewerProps> = ({ proof, onClose }) => {
  const isVerified = proof.status === "VERIFIED";
  const statusColor = isVerified ? "#22c55e" : proof.status === "FAILED" ? "#ef4444" : "#eab308";

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(560px, 90vw)",
        background: "rgba(10, 15, 29, 0.95)",
        backdropFilter: "blur(16px)",
        borderLeft: "1px solid rgba(56, 189, 248, 0.25)",
        zIndex: 1000,
        padding: "1.5rem",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
      }}
    >
      {/* Drawer Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>
              Verified Work Proof
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "0.2rem 0.5rem",
                borderRadius: "999px",
                background: `${statusColor}20`,
                color: statusColor,
                border: `1px solid ${statusColor}50`,
              }}
            >
              {proof.status}
            </span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontFamily: "var(--font-mono, monospace)" }}>
            {proof.proofId}
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              border: "1px solid rgba(100, 116, 139, 0.3)",
              color: "#cbd5e1",
              borderRadius: "6px",
              padding: "0.3rem 0.6rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Provenance Details */}
      <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.4)", borderRadius: "8px", padding: "1rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          Cryptographic Provenance
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8rem" }}>
          <div>
            <span style={{ color: "#64748b" }}>Agent DID: </span>
            <span style={{ color: "#cbd5e1", fontFamily: "var(--font-mono, monospace)" }}>{proof.agentDid.slice(0, 14)}...</span>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Mission: </span>
            <span style={{ color: "#cbd5e1", fontFamily: "var(--font-mono, monospace)" }}>{proof.missionId}</span>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Task: </span>
            <span style={{ color: "#cbd5e1", fontFamily: "var(--font-mono, monospace)" }}>{proof.taskId}</span>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Timestamp: </span>
            <span style={{ color: "#cbd5e1" }}>{proof.timestamp ? new Date(proof.timestamp).toLocaleTimeString() : "N/A"}</span>
          </div>
        </div>
      </div>

      {/* Artifact Hashes (Proof of Integrity) */}
      <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.4)", borderRadius: "8px", padding: "1rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          Artifact Integrity Hashes (SHA-256)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {proof.artifactHashes.map((h, idx) => (
            <div
              key={idx}
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono, monospace)",
                color: "#38bdf8",
                background: "rgba(30, 41, 59, 0.4)",
                padding: "0.3rem 0.5rem",
                borderRadius: "4px",
                wordBreak: "break-all",
              }}
            >
              <span style={{ color: "#64748b", marginRight: "0.4rem" }}>#{idx + 1}</span>
              {h}
            </div>
          ))}
        </div>
      </div>

      {/* Automated Test Verification Summary */}
      <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.4)", borderRadius: "8px", padding: "1rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
          Automated Sandbox Test Execution
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#f1f5f9" }}>
            {proof.testSummary.passed} / {proof.testSummary.total} Tests Passed
          </span>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            Duration: {proof.testSummary.durationMs}ms
          </span>
        </div>

        <div style={{ height: "6px", background: "rgba(30, 41, 59, 0.8)", borderRadius: "3px", overflow: "hidden", marginBottom: "0.5rem" }}>
          <div
            style={{
              height: "100%",
              width: `${proof.testSummary.total > 0 ? (proof.testSummary.passed / proof.testSummary.total) * 100 : 0}%`,
              background: isVerified ? "#22c55e" : "#ef4444",
            }}
          />
        </div>

        <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "var(--font-mono, monospace)" }}>
          Test Result Hash: {proof.testResultHash.slice(0, 32)}...
        </div>
      </div>

      {/* Pipeline Verification Steps */}
      {proof.pipelineResult && proof.pipelineResult.checks && (
        <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(51, 65, 85, 0.4)", borderRadius: "8px", padding: "1rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
            Verification Pipeline Checks
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {proof.pipelineResult.checks.map((check) => (
              <div
                key={check.stepName}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.8rem",
                  padding: "0.3rem 0.5rem",
                  background: "rgba(30, 41, 59, 0.3)",
                  borderRadius: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>{check.passed ? "✅" : "❌"}</span>
                  <span style={{ color: "#f1f5f9" }}>{check.stepName}</span>
                </div>
                <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{check.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
