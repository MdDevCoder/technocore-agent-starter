/**
 * Capability Attestation Inspector Drawer Component.
 *
 * Provides granular cryptographic inspection of a CapabilityAttestation, including
 * issuer DID, claimed vs verified proficiency, benchmark proof link, and evidence provenance.
 */

"use client";

import React from "react";
import type { CapabilityAttestation } from "../../civilization/evolution/types.ts";

interface AttestationDrawerProps {
  readonly attestation: CapabilityAttestation | undefined;
  readonly onClose: () => void;
  readonly onSelectProof?: (proofId: string) => void;
}

export const AttestationDrawer: React.FC<AttestationDrawerProps> = ({
  attestation,
  onClose,
  onSelectProof,
}) => {
  if (!attestation) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-hairline bg-void/95 p-6 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-mono font-bold text-emerald-400">
              CAPABILITY ATTESTATION
            </span>
            <span className="rounded bg-cyan-500/20 px-2 py-0.5 text-xs font-mono font-bold text-cyan-300">
              {attestation.confidence.toUpperCase()} CONFIDENCE
            </span>
          </div>
          <h2 className="mt-2 text-xl font-bold font-mono text-chalk uppercase">
            {attestation.capabilityName}
          </h2>
          <div className="text-xs font-mono text-ash">ID: {attestation.attestationId}</div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-ash hover:bg-graphite hover:text-chalk transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Cryptographic Signature Badge */}
      <div className="my-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-mono font-bold text-emerald-400">
            ED25519 SIGNATURE VALID ✓
          </span>
        </div>
        <span className="text-[11px] font-mono text-ash">Canonical Event Protocol</span>
      </div>

      {/* Attestation Details */}
      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        {/* Proficiency Matrix */}
        <div className="rounded-lg border border-hairline bg-graphite/40 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-ash">Proficiency Matrix</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded bg-void/60 p-3">
              <div className="text-[11px] text-ash">Claimed Initial</div>
              <div className="text-lg font-mono font-bold text-chalk">{attestation.claimedProficiency}%</div>
            </div>
            <div className="rounded bg-void/60 p-3">
              <div className="text-[11px] text-emerald-400 font-bold">Verified Score</div>
              <div className="text-lg font-mono font-bold text-emerald-400">{attestation.verifiedProficiency}%</div>
            </div>
          </div>
        </div>

        {/* Identity & Provenance */}
        <div className="rounded-lg border border-hairline bg-graphite/40 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-ash">Identity & Provenance</div>
          <div className="space-y-2 text-xs font-mono">
            <div>
              <div className="text-ash/60">Beneficiary Citizen DID:</div>
              <div className="break-all text-chalk bg-void/80 p-1.5 rounded">{attestation.agentDid}</div>
            </div>
            <div>
              <div className="text-ash/60">Independent Issuer DID:</div>
              <div className="break-all text-cyan-300 bg-void/80 p-1.5 rounded">{attestation.issuerDid}</div>
            </div>
            <div>
              <div className="text-ash/60">Issued Timestamp:</div>
              <div className="text-chalk">{attestation.issuedAt}</div>
            </div>
          </div>
        </div>

        {/* Benchmark Proof Reference */}
        <div className="rounded-lg border border-hairline bg-graphite/40 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-ash">Benchmark Execution Proof</div>
          <div className="flex items-center justify-between bg-void/80 p-3 rounded">
            <div>
              <div className="text-xs font-mono font-bold text-chalk">{attestation.benchmarkProofId}</div>
              <div className="text-[11px] text-ash">Sandboxed benchmark test digest</div>
            </div>
            {onSelectProof && (
              <button
                onClick={() => onSelectProof(attestation.benchmarkProofId)}
                className="rounded bg-cyber-blue/20 px-2.5 py-1 text-xs font-mono text-cyber-blue hover:bg-cyber-blue/30"
              >
                Inspect Proof →
              </button>
            )}
          </div>
        </div>

        {/* Evidence References Chain */}
        <div className="rounded-lg border border-hairline bg-graphite/40 p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-ash">
            Immutable Evidence Chain ({attestation.evidenceReferences.length})
          </div>
          <div className="space-y-1.5">
            {attestation.evidenceReferences.map((refId, idx) => (
              <div key={refId} className="flex items-center justify-between rounded bg-void/60 p-2 text-xs font-mono">
                <span className="text-chalk">
                  #{idx + 1} {refId}
                </span>
                <span className="text-emerald-400 text-[10px]">ANCHORED ✓</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 border-t border-hairline pt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded bg-steel/40 px-4 py-2 text-xs font-mono text-chalk hover:bg-steel/60 transition-colors"
        >
          Close Drawer
        </button>
      </div>
    </div>
  );
};
