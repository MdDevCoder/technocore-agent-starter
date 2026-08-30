/**
 * Skill Tree & Progression Viewer Component.
 *
 * Visualizes capability progression ladders (Claimed -> Observed -> Verified),
 * active learning attempts, benchmark execution status, and rational ROI cards.
 */

"use client";

import React from "react";
import type { AgentProfile, AgentReputation } from "../../civilization/types/agent.ts";
import type { DidString } from "../../civilization/types/common.ts";
import type { EvolutionState } from "../../civilization/evolution/types.ts";

interface SkillTreeViewerProps {
  readonly population: ReadonlyMap<DidString, { profile: AgentProfile }>;
  readonly reputations: ReadonlyMap<DidString, AgentReputation>;
  readonly evolutionState?: EvolutionState;
  readonly onSelectAttestation?: (attestationId: string) => void;
  readonly onSelectAgent?: (did: DidString) => void;
}

export const SkillTreeViewer: React.FC<SkillTreeViewerProps> = ({
  population,
  reputations,
  evolutionState,
  onSelectAttestation,
  onSelectAgent,
}) => {
  const agents = Array.from(population.values()).map((p) => p.profile);
  const gaps = evolutionState ? Array.from(evolutionState.gaps.values()) : [];
  const attempts = evolutionState ? Array.from(evolutionState.learningAttempts.values()) : [];
  const attestations = evolutionState ? Array.from(evolutionState.attestations.values()) : [];

  return (
    <div className="space-y-6">
      {/* Top Banner: Evolution Engine Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-void/80 p-4 backdrop-blur-md">
          <div className="text-xs uppercase tracking-wider text-ash">Detected Gaps</div>
          <div className="mt-1 text-2xl font-mono font-bold text-cyber-amber">{gaps.length}</div>
          <div className="mt-1 text-xs text-ash/80">Identified skill bottlenecks</div>
        </div>

        <div className="rounded-xl border border-hairline bg-void/80 p-4 backdrop-blur-md">
          <div className="text-xs uppercase tracking-wider text-ash">Learning Attempts</div>
          <div className="mt-1 text-2xl font-mono font-bold text-cyber-blue">{attempts.length}</div>
          <div className="mt-1 text-xs text-ash/80">Sandboxed synthesis benchmarks</div>
        </div>

        <div className="rounded-xl border border-hairline bg-void/80 p-4 backdrop-blur-md">
          <div className="text-xs uppercase tracking-wider text-ash">Verified Attestations</div>
          <div className="mt-1 text-2xl font-mono font-bold text-emerald-400">{attestations.length}</div>
          <div className="mt-1 text-xs text-ash/80">Cryptographic proof-backed skills</div>
        </div>

        <div className="rounded-xl border border-hairline bg-void/80 p-4 backdrop-blur-md">
          <div className="text-xs uppercase tracking-wider text-ash">Emergent Specialists</div>
          <div className="mt-1 text-2xl font-mono font-bold text-purple-400">
            {evolutionState ? evolutionState.emergentSpecialists.size : 0}
          </div>
          <div className="mt-1 text-xs text-ash/80">Specialized technical domains</div>
        </div>
      </div>

      {/* Main Agent Capability Progression Grid */}
      <div className="rounded-xl border border-hairline bg-graphite/40 p-5 backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-chalk flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyber-blue"></span>
            Citizen Capability Progression (Claimed → Observed → Verified)
          </h3>
          <span className="text-xs text-ash font-mono">9 Citizens Monitored</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {agents.map((agent) => {
            const rep = reputations.get(agent.did);
            const agentAttestations = attestations.filter((a) => a.agentDid === agent.did);
            const agentAttempt = attempts.find(
              (a) => a.agentDid === agent.did && (a.status === "PROPOSED" || a.status === "IN_PROGRESS"),
            );

            return (
              <div
                key={agent.did}
                className="flex flex-col rounded-lg border border-hairline/80 bg-void/90 p-4 transition-all hover:border-cyber-blue/50"
              >
                {/* Agent Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <button
                      onClick={() => onSelectAgent?.(agent.did)}
                      className="font-bold text-chalk hover:text-cyber-blue text-left"
                    >
                      {agent.displayName}
                    </button>
                    <div className="text-xs text-ash font-mono">{agent.role}</div>
                  </div>
                  <span className="rounded bg-steel/40 px-2 py-0.5 text-xs font-mono text-ash">
                    Rep: {rep ? rep.score : 50}/100
                  </span>
                </div>

                {/* Active Learning Status Indicator */}
                {agentAttempt && (
                  <div className="mt-3 rounded border border-cyber-amber/40 bg-cyber-amber/10 p-2 text-xs">
                    <div className="flex items-center justify-between text-cyber-amber font-mono font-bold">
                      <span className="animate-pulse">⚡ LEARNING IN PROGRESS</span>
                      <span>{agentAttempt.targetProficiency}% Target</span>
                    </div>
                    <div className="mt-1 text-ash">
                      Synthesizing <span className="font-mono text-chalk">{agentAttempt.targetCapability}</span> (Deposit: {agentAttempt.resourceBudget.feePaid} FLOP)
                    </div>
                  </div>
                )}

                {/* Capability Progression Bars */}
                <div className="mt-4 space-y-3">
                  {agent.capabilities.map((cap) => {
                    const isAttested = agentAttestations.some((a) => a.capabilityName === cap.name.toLowerCase());
                    const attestation = agentAttestations.find((a) => a.capabilityName === cap.name.toLowerCase());

                    return (
                      <div key={cap.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className="text-chalk flex items-center gap-1.5">
                            {cap.name}
                            {isAttested && (
                              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[10px] text-emerald-400 font-bold">
                                VERIFIED ✓
                              </span>
                            )}
                          </span>
                          <span className="text-ash">{cap.proficiency}%</span>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-steel/40">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isAttested ? "bg-gradient-to-r from-emerald-500 to-cyan-400" : "bg-cyber-blue/70"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(10, cap.proficiency))}%` }}
                          />
                        </div>

                        {attestation && onSelectAttestation && (
                          <div className="flex justify-end pt-0.5">
                            <button
                              onClick={() => onSelectAttestation(attestation.attestationId)}
                              className="text-[10px] font-mono text-cyan-400 hover:underline"
                            >
                              View Attestation Proof →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
