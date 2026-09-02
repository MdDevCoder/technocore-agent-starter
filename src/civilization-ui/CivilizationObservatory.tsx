/**
 * Master Civilization Observatory & Autonomous Command Center.
 *
 * The primary interactive surface connecting users to the live Technocore Autonomous Network:
 * Event-sourced world graph, inspector drawers, capability market, health metrics,
 * cryptographic event ledger, time-travel scrubbing, and bounded simulation controls.
 */

"use client";

import React from "react";
import { useCivilizationEngine } from "./hooks/useCivilizationEngine.ts";
import { WorldStats } from "./metrics/WorldStats.tsx";
import { CivilizationMap } from "./world/CivilizationMap.tsx";
import { CivilizationHealth, CapabilityMarket } from "./metrics/CivilizationHealth.tsx";
import { EconomyDashboard } from "./economy/EconomyDashboard.tsx";
import { VerifiedProofViewer } from "./economy/VerifiedProofViewer.tsx";
import type { VerifiedWorkProof } from "../civilization/execution/types.ts";
import { SkillTreeViewer } from "./evolution/SkillTreeViewer.tsx";
import { EvolutionChronicle } from "./evolution/EvolutionChronicle.tsx";
import { AttestationDrawer } from "./evolution/AttestationDrawer.tsx";
import { GenerationsTimeline } from "./evolution/GenerationsTimeline.tsx";
import { CausalityInspector } from "./causality/CausalityInspector.tsx";
import { AgentInspector } from "./agents/AgentInspector.tsx";
import { MissionInspector } from "./missions/MissionInspector.tsx";
import { CourtInspector } from "./court/CourtInspector.tsx";
import { EventInspector } from "./events/EventInspector.tsx";
import { EventStream } from "./events/EventStream.tsx";
import { TimeTravelBar } from "./time/TimeTravelBar.tsx";
import { ChangeSummary } from "./time/ChangeSummary.tsx";
import { SimulationControls } from "./controls/SimulationControls.tsx";
import { DemoNarrativePanel } from "./controls/DemoNarrativePanel.tsx";
import { RemoteAgentStatusPanel } from "./controls/RemoteAgentStatusPanel.tsx";
import { DealObservatory } from "./deals/DealObservatory.tsx";
import { DealInspector } from "./deals/DealInspector.tsx";
import { aggregateDealsFromEvents } from "./deals/aggregateDeals.ts";

export function CivilizationObservatory() {
  const {
    isRunning,
    isInitialized,
    isScrubbing,
    speedMultiplier,
    currentTick,
    displayedTick,
    maxTick,
    worldState,
    allEvents,
    filteredEvents,
    narrativeFeed,
    eventFilter,
    viewMode,
    selectedTarget,
    activeDelta,
    executionMode,
    remoteAgents,
    error,
    stepTick,
    runSimulation,
    pauseSimulation,
    resetSimulation,
    setSpeed,
    scrubToTick,
    resumeLivePlayback,
    setEventFilter,
    setViewMode,
    setSelectedTarget,
    setExecutionMode,
    runCompleteDemo,
  } = useCivilizationEngine();

  // Helper lookup for selected entities
  const selectedAgent =
    selectedTarget.type === "agent" && worldState
      ? worldState.population.get(selectedTarget.did)
      : null;

  const selectedMission =
    selectedTarget.type === "mission" && worldState
      ? worldState.activeMissions.get(selectedTarget.missionId) ||
        worldState.completedMissions.find((m) => m.missionId === selectedTarget.missionId)
      : null;

  const selectedTeam =
    selectedTarget.type === "mission" && worldState
      ? worldState.activeTeams.get(selectedTarget.missionId) ?? undefined
      : undefined;

  const selectedDispute =
    selectedTarget.type === "court" && worldState
      ? worldState.activeDisputes.get(selectedTarget.disputeId) ||
        worldState.resolvedDisputes.find((d) => d.disputeId === selectedTarget.disputeId)
      : null;

  const selectedEvent =
    selectedTarget.type === "event"
      ? allEvents.find((e) => e.eventId === selectedTarget.eventId)
      : null;

  const selectedProof: VerifiedWorkProof | null =
    selectedTarget.type === "proof"
      ? (((allEvents.find(
          (e) =>
            e.eventType === "VERIFIED_WORK_PROOF_PUBLISHED" &&
            (e.payload as { proofId?: string }).proofId === selectedTarget.proofId,
        )?.payload as unknown as VerifiedWorkProof)) ?? null)
      : null;

  const selectedAttestation =
    selectedTarget.type === "attestation" && worldState?.evolutionState
      ? worldState.evolutionState.attestations.get(selectedTarget.attestationId)
      : undefined;

  const allDeals = React.useMemo(() => aggregateDealsFromEvents(allEvents), [allEvents]);
  const selectedDeal =
    selectedTarget.type === "deal"
      ? allDeals.find((d) => d.contractId === selectedTarget.contractId) ?? null
      : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[1500px] flex-col gap-4 p-3 sm:p-5">
      {/* Top World Stats Bar */}
      <WorldStats
        worldState={worldState}
        isScrubbing={isScrubbing}
        displayedTick={displayedTick}
      />

      {/* Error Alert if any */}
      {error && (
        <div className="rounded-lg border border-fault/50 bg-fault/10 p-3 mono text-xs text-fault">
          CIVILIZATION ENGINE ERROR: {error}
        </div>
      )}

      {/* Main Observatory Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:h-[700px] lg:max-h-[700px]">
        {/* Left Column: Visual Map / Market / Economy / Evolution Views (7 Cols on large screen) */}
        <div className="lg:col-span-7 flex flex-col gap-3 h-full min-h-0 overflow-hidden">
          {/* View Mode Switcher */}
          <div className="flex items-center justify-between rounded-lg border border-hairline bg-panel px-3 py-2 mono text-xs shrink-0 shadow-sm">
            <div className="flex items-center gap-1">
              <span className="text-muted font-semibold text-xs mr-2">VIEW_SURFACE:</span>
              {(["MAP", "CAPABILITY_MARKET", "MACHINE_ECONOMY", "DEALS", "EVOLUTION", "GENERATIONS"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === mode
                      ? "bg-signal/20 text-signal border border-signal/40 font-bold"
                      : "text-muted hover:bg-panel-high hover:text-ink border border-transparent"
                  }`}
                >
                  {mode.replace("_", " ")}
                </button>
              ))}
            </div>

            <div className="mono text-xs text-muted font-medium">
              ENGINE SEED: <span className="text-signal font-bold">technocore-observatory-01</span>
            </div>
          </div>

          {/* Surface View Content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {viewMode === "MAP" && (
              <CivilizationMap
                worldState={worldState}
                selectedTarget={selectedTarget}
                onSelectTarget={setSelectedTarget}
              />
            )}

            {viewMode === "CAPABILITY_MARKET" && worldState && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                <CapabilityMarket
                  capabilities={worldState.metrics.capabilityEconomy}
                />
                <CivilizationHealth
                  health={worldState.metrics.health}
                />
              </div>
            )}

            {viewMode === "MACHINE_ECONOMY" && worldState && (
              <EconomyDashboard
                worldState={worldState}
                onSelectProof={(proofId) => setSelectedTarget({ type: "proof", proofId })}
                onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
              />
            )}

            {viewMode === "DEALS" && (
              <DealObservatory
                events={allEvents}
                selectedContractId={selectedTarget.type === "deal" ? selectedTarget.contractId : undefined}
                onSelectDeal={(contractId) => setSelectedTarget({ type: "deal", contractId })}
                onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
              />
            )}

            {viewMode === "EVOLUTION" && worldState && (
              <div className="space-y-6">
                <SkillTreeViewer
                  population={worldState.population}
                  reputations={worldState.reputations}
                  evolutionState={worldState.evolutionState}
                  onSelectAttestation={(attestationId) => setSelectedTarget({ type: "attestation", attestationId })}
                  onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
                />
                <EvolutionChronicle
                  evolutionState={worldState.evolutionState}
                  economicState={worldState.economicState}
                  onSelectAttestation={(attestationId) => setSelectedTarget({ type: "attestation", attestationId })}
                />
              </div>
            )}

            {viewMode === "GENERATIONS" && (
              <GenerationsTimeline
                worldState={worldState}
                allEvents={allEvents}
                currentTick={currentTick}
                displayedTick={displayedTick}
                onScrubToTick={scrubToTick}
                onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
                onOpenLineage={(entityType, id) => setSelectedTarget({ type: "lineage", entityType, entityId: id })}
              />
            )}
          </div>
        </div>

        {/* Right Column: Contextual Inspector or Live Event Stream (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3 h-full min-h-0 overflow-hidden">
          {selectedAgent && (
            <AgentInspector
              profile={selectedAgent.profile}
              reputation={worldState?.reputations.get(selectedAgent.identity.did)}
              allEvents={allEvents}
              onClose={() => setSelectedTarget({ type: "none" })}
              onSelectEvent={(eventId) => setSelectedTarget({ type: "event", eventId })}
            />
          )}

          {selectedMission && (
            <MissionInspector
              mission={selectedMission}
              team={selectedTeam}
              population={worldState?.population || new Map()}
              allEvents={allEvents}
              onClose={() => setSelectedTarget({ type: "none" })}
              onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
            />
          )}

          {selectedDispute && (
            <CourtInspector
              dispute={selectedDispute}
              population={worldState?.population || new Map()}
              allEvents={allEvents}
              onClose={() => setSelectedTarget({ type: "none" })}
              onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
            />
          )}

          {selectedDeal && (
            <DealInspector
              deal={selectedDeal}
              onClose={() => setSelectedTarget({ type: "none" })}
              onSelectEvent={(eventId) => setSelectedTarget({ type: "event", eventId })}
              onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
            />
          )}

          {selectedEvent && (
            <EventInspector
              event={selectedEvent}
              onClose={() => setSelectedTarget({ type: "none" })}
            />
          )}

          {selectedProof && (
            <VerifiedProofViewer
              proof={selectedProof}
              onClose={() => setSelectedTarget({ type: "none" })}
            />
          )}

          {selectedAttestation && (
            <AttestationDrawer
              attestation={selectedAttestation}
              onClose={() => setSelectedTarget({ type: "none" })}
              onSelectProof={(proofId) => setSelectedTarget({ type: "proof", proofId })}
            />
          )}

          {selectedTarget.type === "lineage" && (
            <CausalityInspector
              entityType={selectedTarget.entityType}
              entityId={selectedTarget.entityId}
              allEvents={allEvents}
              population={worldState?.population}
              onClose={() => setSelectedTarget({ type: "none" })}
              onSelectEvent={(eventId) => setSelectedTarget({ type: "event", eventId })}
              onSelectAgent={(did) => setSelectedTarget({ type: "agent", did })}
            />
          )}

          {!selectedAgent &&
            !selectedMission &&
            !selectedDispute &&
            !selectedDeal &&
            !selectedEvent &&
            !selectedProof &&
            !selectedAttestation &&
            selectedTarget.type !== "lineage" && (
              <div className="h-full min-h-0 overflow-hidden">
                <EventStream
                  events={filteredEvents}
                  currentFilter={eventFilter}
                  onSetFilter={setEventFilter}
                  onSelectEvent={(eventId) => setSelectedTarget({ type: "event", eventId })}
                />
              </div>
            )}
        </div>
      </div>

      {/* Emergent Narrative Chronicle Section */}
      <div className="w-full">
        <DemoNarrativePanel
          items={narrativeFeed}
          onSelectEvent={(eventId) => setSelectedTarget({ type: "event", eventId })}
        />
      </div>

      {/* Historical Delta Summary when Time-Travel is Active */}
      {isScrubbing && (
        <ChangeSummary delta={activeDelta} onResumeLive={resumeLivePlayback} />
      )}

      {/* Time Travel Timeline Bar */}
      <TimeTravelBar
        currentTick={currentTick}
        displayedTick={displayedTick}
        maxTick={maxTick}
        isScrubbing={isScrubbing}
        onScrub={scrubToTick}
        onResumeLive={resumeLivePlayback}
      />

      {/* Remote Agent & Network Architecture Telemetry */}
      <RemoteAgentStatusPanel
        executionMode={executionMode}
        onSelectMode={setExecutionMode}
        remoteAgents={remoteAgents}
        headSequence={allEvents.length}
        isConnected={!error}
      />

      {/* Simulation Controls Footer */}
      <SimulationControls
        isRunning={isRunning}
        isInitialized={isInitialized}
        speedMultiplier={speedMultiplier}
        executionMode={executionMode}
        onStep={stepTick}
        onRun={runSimulation}
        onPause={pauseSimulation}
        onReset={resetSimulation}
        onSetSpeed={setSpeed}
        onSetMode={setExecutionMode}
        onRunDemo={runCompleteDemo}
      />
    </div>
  );
}
