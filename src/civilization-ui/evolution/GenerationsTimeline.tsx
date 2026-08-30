/**
 * Multi-Generation Timeline & Evolutionary Emergence Comparison Surface.
 *
 * Visualizes civilization progression across 0–100 ticks, highlighting generational
 * epochs (Gen 0, Gen 25, Gen 50, Gen 75, Gen 100), emergent specialist divergence,
 * capability depth shifts, and macro economic velocity.
 */

"use client";

import React, { useMemo, useState } from "react";
import type { CivilizationWorldState } from "../../civilization/world/types.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import type { DidString } from "../../civilization/types/common.ts";
import type { AgentProfile } from "../../civilization/types/agent.ts";
import type { AgentIdentity } from "../../civilization/agent/identity.ts";

interface GenerationsTimelineProps {
  readonly worldState: CivilizationWorldState | null;
  readonly allEvents: readonly CivilizationEvent[];
  readonly currentTick: number;
  readonly displayedTick: number;
  readonly onScrubToTick: (tick: number) => void;
  readonly onSelectAgent?: (did: DidString) => void;
  readonly onOpenLineage?: (entityType: "agent" | "capability", id: string) => void;
}

interface GenerationEpoch {
  readonly generation: number;
  readonly tick: number;
  readonly label: string;
  readonly description: string;
  readonly keyFocus: string;
}

const GENERATION_EPOCHS: readonly GenerationEpoch[] = [
  {
    generation: 0,
    tick: 0,
    label: "GENESIS (GEN 0)",
    description: "Genesis bootstrap of 9 initial agents with foundational generalist baseline capabilities.",
    keyFocus: "Foundational Identities & Bootstrapping",
  },
  {
    generation: 1,
    tick: 25,
    label: "INFRASTRUCTURE EXPANSION (GEN 25)",
    description: "Early market discovery, high demand for backend pipelines and core type safety.",
    keyFocus: "Node Backend, PostgreSQL, Type Systems",
  },
  {
    generation: 2,
    tick: 50,
    label: "SECURITY & REPUTATION (GEN 50)",
    description: "Market scarcity spikes in cryptography and security audits; initial capability synthesis.",
    keyFocus: "Cryptography, Security Audits, Consensus",
  },
  {
    generation: 3,
    tick: 75,
    label: "SCALE & PERFORMANCE (GEN 75)",
    description: "Load testing, distributed indexing, high-concurrency pipeline optimizations emerge.",
    keyFocus: "Database Performance, Load Testing",
  },
  {
    generation: 4,
    tick: 100,
    label: "EMERGENT SYNTHESIS (GEN 100)",
    description: "Autonomous domain super-specialists emerge through closed causal feedback loops.",
    keyFocus: "Deep Specialization & Dynamic Pricing",
  },
];

export function GenerationsTimeline({
  worldState,
  allEvents,
  currentTick,
  displayedTick,
  onScrubToTick,
  onSelectAgent,
  onOpenLineage,
}: GenerationsTimelineProps) {
  const [selectedEpochGen, setSelectedEpochGen] = useState<number>(0);

  const selectedEpoch = useMemo(() => {
    return GENERATION_EPOCHS.find((e) => e.generation === selectedEpochGen) || GENERATION_EPOCHS[0]!;
  }, [selectedEpochGen]);

  // Derived metrics from events
  const metrics = useMemo(() => {
    const attestations = allEvents.filter((e) => e.eventType === "CAPABILITY_ATTESTED");
    const advertisements = allEvents.filter((e) => e.eventType === "CAPABILITY_ADVERTISED");
    const contracts = allEvents.filter((e) => e.eventType === "WORK_CONTRACT_ESTABLISHED");
    const disputes = allEvents.filter((e) => e.eventType === "DISPUTE_OPENED");

    return {
      totalAttestations: attestations.length,
      totalAdvertisements: advertisements.length,
      totalContracts: contracts.length,
      totalDisputes: disputes.length,
    };
  }, [allEvents]);

  const population: { identity: AgentIdentity; profile: AgentProfile }[] = useMemo(() => {
    if (!worldState) return [];
    return Array.from(worldState.population.values());
  }, [worldState]);

  const specializedAgents = useMemo(() => {
    return population.filter((a) => a.profile.capabilities.some((c) => c.proficiency >= 90));
  }, [population]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-hairline bg-void/90 p-4 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-signal animate-pulse" />
            <h2 className="mono text-sm font-bold uppercase tracking-wider text-ink">
              CIVILIZATION GENERATIONS & EMERGENCE TIMELINE
            </h2>
          </div>
          <p className="mono text-xs text-muted mt-0.5">
            Deterministic multi-generation simulation scrubbing (0 to 100 ticks) and evolutionary divergence
          </p>
        </div>

        <div className="flex items-center gap-3 mono text-xs">
          <div className="rounded border border-signal/40 bg-signal/10 px-2.5 py-1 text-signal font-semibold">
            CURRENT TICK: T+{currentTick}
          </div>
          <div className="rounded border border-hairline bg-panel px-2.5 py-1 text-muted">
            DISPLAYED: T+{displayedTick}
          </div>
        </div>
      </div>

      {/* Generation Epoch Selector Bar */}
      <div className="grid grid-cols-5 gap-2 mono text-xs">
        {GENERATION_EPOCHS.map((epoch) => {
          const isSelected = selectedEpochGen === epoch.generation;
          const isReached = currentTick >= epoch.tick;

          return (
            <button
              key={epoch.generation}
              onClick={() => {
                setSelectedEpochGen(epoch.generation);
                onScrubToTick(epoch.tick);
              }}
              className={`flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-all ${
                isSelected
                  ? "border-signal bg-signal/15 shadow-lg shadow-signal/10"
                  : isReached
                  ? "border-hairline bg-panel/60 hover:bg-panel hover:border-signal/40"
                  : "border-hairline/40 bg-void/40 opacity-60 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between text-[10px]">
                <span className={`font-bold ${isSelected ? "text-signal" : "text-ink"}`}>
                  GEN {epoch.generation}
                </span>
                <span className="text-faint">T+{epoch.tick}</span>
              </div>
              <div className="text-[11px] font-semibold text-ink line-clamp-1">{epoch.label.split(" (")[0]}</div>
              <div className="text-[9px] text-muted line-clamp-1">{epoch.keyFocus}</div>
            </button>
          );
        })}
      </div>

      {/* Epoch Detail Banner */}
      <div className="rounded-lg border border-hairline bg-panel/40 p-3.5 space-y-2">
        <div className="flex items-center justify-between mono text-xs">
          <span className="font-bold text-signal">{selectedEpoch.label}</span>
          <span className="text-faint">Target Virtual Instant: T+{selectedEpoch.tick}</span>
        </div>
        <p className="mono text-xs text-muted">{selectedEpoch.description}</p>
        <div className="flex items-center gap-2 pt-1 mono text-[11px]">
          <span className="text-faint">Primary Drivers:</span>
          <span className="rounded bg-void/80 px-2 py-0.5 border border-hairline text-ink font-medium">
            {selectedEpoch.keyFocus}
          </span>
        </div>
      </div>

      {/* Generational Macro Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mono text-xs">
        <div className="rounded-lg border border-hairline bg-panel/30 p-3">
          <span className="text-faint text-[10px] block uppercase">Capability Attestations</span>
          <span className="text-lg font-bold text-emerald-400 mt-1 block">
            {metrics.totalAttestations}
          </span>
          <span className="text-[10px] text-faint">Independent proofs verified</span>
        </div>

        <div className="rounded-lg border border-hairline bg-panel/30 p-3">
          <span className="text-faint text-[10px] block uppercase">Capability Advertisements</span>
          <span className="text-lg font-bold text-sky-400 mt-1 block">
            {metrics.totalAdvertisements}
          </span>
          <span className="text-[10px] text-faint">Swarm capability upgrades</span>
        </div>

        <div className="rounded-lg border border-hairline bg-panel/30 p-3">
          <span className="text-faint text-[10px] block uppercase">Work Contracts Settled</span>
          <span className="text-lg font-bold text-signal mt-1 block">
            {metrics.totalContracts}
          </span>
          <span className="text-[10px] text-faint">Autonomous missions executed</span>
        </div>

        <div className="rounded-lg border border-hairline bg-panel/30 p-3">
          <span className="text-faint text-[10px] block uppercase">Emerged Specialists</span>
          <span className="text-lg font-bold text-purple-400 mt-1 block">
            {specializedAgents.length} / {population.length}
          </span>
          <span className="text-[10px] text-faint">Proficiency &ge; 90 in domain</span>
        </div>
      </div>

      {/* Population Specialization & Provenance Table */}
      <div className="rounded-lg border border-hairline bg-panel/20 p-3 space-y-3">
        <div className="flex items-center justify-between mono text-xs">
          <span className="font-bold text-ink">Active Population & Domain Specialization</span>
          <span className="text-faint text-[10px]">{population.length} Autonomous Agents</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {population.map((agent) => {
            const caps = agent.profile.capabilities;
            const topCap = [...caps].sort((a, b) => b.proficiency - a.proficiency)[0];
            const isSpecialist = (topCap?.proficiency ?? 0) >= 90;

            return (
              <div
                key={agent.profile.did}
                className="flex flex-col justify-between rounded-lg border border-hairline bg-void/80 p-3 hover:border-signal/40 transition-all mono text-xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onSelectAgent?.(agent.profile.did)}
                      className="font-bold text-ink hover:text-signal text-left"
                    >
                      {agent.profile.displayName}
                    </button>
                    {isSpecialist && (
                      <span className="rounded bg-purple-500/20 text-purple-400 border border-purple-500/40 px-1.5 py-0.5 text-[9px] font-bold">
                        SPECIALIST
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">{agent.profile.role}</div>

                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {caps.slice(0, 3).map((c) => (
                      <span
                        key={c.name}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium border ${
                          c.proficiency >= 90
                            ? "bg-signal/15 text-signal border-signal/30 font-bold"
                            : "bg-panel text-muted border-hairline"
                        }`}
                      >
                        {c.name}: {c.proficiency}%
                      </span>
                    ))}
                    {caps.length > 3 && (
                      <span className="text-[9px] text-faint self-center">+{caps.length - 3}</span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-hairline/40 pt-2 text-[10px]">
                  <span className="text-faint truncate max-w-[120px]">{agent.profile.did.slice(0, 16)}...</span>
                  <button
                    onClick={() => onOpenLineage?.("agent", agent.profile.did)}
                    className="text-signal hover:underline font-semibold"
                  >
                    Inspect Lineage →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
