/**
 * Evolution Chronicle & Emergence Timeline Component.
 *
 * Displays civilization-wide capability growth, dynamic capability market impact,
 * emergent technical specialists, and versioned strategy adaptation logs.
 */

"use client";

import React from "react";
import type { EvolutionState } from "../../civilization/evolution/types.ts";
import type { EconomicState } from "../../civilization/economy/types.ts";

interface EvolutionChronicleProps {
  readonly evolutionState?: EvolutionState;
  readonly economicState?: EconomicState;
  readonly onSelectAttestation?: (attestationId: string) => void;
}

export const EvolutionChronicle: React.FC<EvolutionChronicleProps> = ({
  evolutionState,
  economicState,
  onSelectAttestation,
}) => {
  const attestations = evolutionState ? Array.from(evolutionState.attestations.values()).reverse() : [];
  const specialists = evolutionState ? Array.from(evolutionState.emergentSpecialists.entries()) : [];
  const latestSnapshot = economicState?.marketSnapshot;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column: Emergent Specialists & Market Scarcity Impact */}
      <div className="space-y-6">
        {/* Emergent Specialists Card */}
        <div className="rounded-xl border border-hairline bg-void/80 p-5 backdrop-blur-md">
          <h3 className="text-sm font-bold uppercase tracking-wider text-chalk flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-purple-400"></span>
            Emergent Domain Specialists
          </h3>
          <p className="mt-1 text-xs text-ash">
            Citizens who developed verified high-proficiency expertise (≥80%) through synthesis benchmarks.
          </p>

          <div className="mt-4 space-y-2.5">
            {specialists.length === 0 ? (
              <div className="rounded border border-dashed border-hairline p-4 text-center text-xs text-ash">
                No emergent specialists verified yet. Advance simulation ticks to trigger gap detection and learning.
              </div>
            ) : (
              specialists.map(([capability, dids]) => (
                <div
                  key={capability}
                  className="flex items-center justify-between rounded-lg border border-hairline/80 bg-graphite/50 p-3"
                >
                  <div>
                    <span className="font-mono text-sm font-bold text-chalk uppercase">{capability}</span>
                    <div className="text-xs text-ash font-mono">{dids.length} Specialist Citizen(s) Verified</div>
                  </div>
                  <span className="rounded bg-purple-500/20 px-2 py-1 text-xs font-mono text-purple-300 font-bold">
                    SPECIALIST DOMAIN
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Dynamic Capability Price Impact */}
        {latestSnapshot && (
          <div className="rounded-xl border border-hairline bg-void/80 p-5 backdrop-blur-md">
            <h3 className="text-sm font-bold uppercase tracking-wider text-chalk flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyber-amber"></span>
              Capability Labor Rate & Scarcity Feedback
            </h3>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {latestSnapshot.capabilityPrices.slice(0, 4).map((signal: import("../../civilization/economy/types.ts").CapabilityPriceSignal) => (
                <div key={signal.capability} className="rounded-lg border border-hairline/80 bg-graphite/40 p-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-chalk">{signal.capability}</span>
                    <span className="text-cyber-amber">{signal.scarcityMultiplier.toFixed(2)}x Scarcity</span>
                  </div>
                  <div className="mt-2 text-lg font-mono font-bold text-emerald-400">
                    {signal.currentMarketPrice.toLocaleString()} FLOP
                  </div>
                  <div className="mt-1 text-[11px] text-ash">
                    Supply: {signal.supplyCount} | Demand: {signal.demandCount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Signed Capability Attestations Stream */}
      <div className="rounded-xl border border-hairline bg-void/80 p-5 backdrop-blur-md">
        <h3 className="text-sm font-bold uppercase tracking-wider text-chalk flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
          Signed Capability Attestation Stream
        </h3>
        <p className="mt-1 text-xs text-ash">
          Immutable cryptographic attestations signed by independent verifiers with linked SHA-256 benchmark proofs.
        </p>

        <div className="mt-4 space-y-3 max-h-[520px] overflow-y-auto pr-1">
          {attestations.length === 0 ? (
            <div className="rounded border border-dashed border-hairline p-6 text-center text-xs text-ash">
              No capability attestations issued yet. Run ticks to observe learning and verification.
            </div>
          ) : (
            attestations.map((att) => (
              <div
                key={att.attestationId}
                className="flex flex-col rounded-lg border border-hairline/80 bg-graphite/60 p-3.5 transition-all hover:border-emerald-500/50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-chalk">{att.capabilityName}</span>
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-mono font-bold text-emerald-400">
                    {att.verifiedProficiency}% VERIFIED
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono text-ash">
                  <div>
                    <span className="text-ash/60">Citizen: </span>
                    <span className="text-chalk">{att.agentDid.slice(0, 14)}...</span>
                  </div>
                  <div>
                    <span className="text-ash/60">Issuer: </span>
                    <span className="text-chalk">{att.issuerDid.slice(0, 14)}...</span>
                  </div>
                  <div>
                    <span className="text-ash/60">Confidence: </span>
                    <span className="text-cyan-400 uppercase font-bold">{att.confidence}</span>
                  </div>
                  <div>
                    <span className="text-ash/60">Evidence Refs: </span>
                    <span className="text-chalk">{att.evidenceReferences.length} Events</span>
                  </div>
                </div>

                {onSelectAttestation && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => onSelectAttestation(att.attestationId)}
                      className="rounded bg-emerald-500/10 px-2.5 py-1 text-xs font-mono text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    >
                      Inspect Cryptographic Attestation →
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
