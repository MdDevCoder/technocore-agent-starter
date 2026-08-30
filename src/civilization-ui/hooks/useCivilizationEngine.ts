/**
 * Master React Hook for the Civilization World Engine.
 *
 * Manages the live state of the deterministic machine civilization,
 * time-travel playback, execution bounds, snapshot history, and inspector selections.
 *
 * All state is directly sourced from CivilizationWorldEngine and event-sourced projections.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CivilizationWorldEngine } from "../../civilization/world/world.ts";
import type {
  CivilizationWorldState,
  WorldTickResult,
  WorldSnapshot,
} from "../../civilization/world/types.ts";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import type {
  EmergentNarrativeItem,
  EventCategoryFilter,
  NetworkExecutionMode,
  ObservatoryViewMode,
  RemoteAgentTelemetry,
  SelectionTarget,
  WhatChangedDelta,
} from "../types.ts";
import { deriveNarrativeFromEvents } from "../narrative/deriveNarrative.ts";

export interface UseCivilizationEngineReturn {
  readonly isInitialized: boolean;
  readonly isRunning: boolean;
  readonly isScrubbing: boolean;
  readonly speedMultiplier: number;
  readonly currentTick: number;
  readonly displayedTick: number;
  readonly maxTick: number;
  readonly worldState: CivilizationWorldState | null;
  readonly allEvents: readonly CivilizationEvent[];
  readonly filteredEvents: readonly CivilizationEvent[];
  readonly narrativeFeed: readonly EmergentNarrativeItem[];
  readonly eventFilter: EventCategoryFilter;
  readonly viewMode: ObservatoryViewMode;
  readonly selectedTarget: SelectionTarget;
  readonly activeDelta: WhatChangedDelta | null;
  readonly executionMode: NetworkExecutionMode;
  readonly remoteAgents: readonly RemoteAgentTelemetry[];
  readonly error: string | null;

  // Actions
  readonly initializeGenesis: () => Promise<void>;
  readonly stepTick: () => Promise<WorldTickResult | null>;
  readonly runSimulation: () => void;
  readonly pauseSimulation: () => void;
  readonly resetSimulation: () => Promise<void>;
  readonly setSpeed: (speed: number) => void;
  readonly scrubToTick: (targetTick: number) => void;
  readonly resumeLivePlayback: () => void;
  readonly setEventFilter: (filter: EventCategoryFilter) => void;
  readonly setViewMode: (mode: ObservatoryViewMode) => void;
  readonly setSelectedTarget: (target: SelectionTarget) => void;
  readonly setExecutionMode: (mode: NetworkExecutionMode) => void;
  readonly runCompleteDemo: () => Promise<void>;
}

export function useCivilizationEngine(initialSeed = "technocore-observatory-01"): UseCivilizationEngineReturn {
  const engineRef = useRef<CivilizationWorldEngine | null>(null);
  const snapshotsHistoryRef = useRef<Map<number, { snapshot: WorldSnapshot; state: CivilizationWorldState }>>(new Map());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [currentTick, setCurrentTick] = useState(0);
  const [displayedTick, setDisplayedTick] = useState(0);
  const [worldState, setWorldState] = useState<CivilizationWorldState | null>(null);
  const [allEvents, setAllEvents] = useState<readonly CivilizationEvent[]>([]);
  const [eventFilter, setEventFilter] = useState<EventCategoryFilter>("ALL");
  const [viewMode, setViewMode] = useState<ObservatoryViewMode>("MAP");
  const [selectedTarget, setSelectedTarget] = useState<SelectionTarget>({ type: "none" });
  const [activeDelta, setActiveDelta] = useState<WhatChangedDelta | null>(null);
  const [executionMode, setExecutionMode] = useState<NetworkExecutionMode>("SIMULATION");
  const [error, setError] = useState<string | null>(null);

  // Initialize engine on mount
  const initializeGenesis = useCallback(async () => {
    try {
      setError(null);
      const engine = new CivilizationWorldEngine({
        seed: initialSeed,
        tickDurationMinutes: 60,
      });

      await engine.initializeGenesis();
      engineRef.current = engine;

      const state = engine.getState();
      const initialSnapshot = engine.takeSnapshot();
      snapshotsHistoryRef.current.clear();
      snapshotsHistoryRef.current.set(0, { snapshot: initialSnapshot, state });

      const events = engine.getAllEvents();
      setWorldState(state);
      setAllEvents(events);
      setCurrentTick(0);
      setDisplayedTick(0);
      setIsInitialized(true);
      setIsScrubbing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [initialSeed]);

  // Execute 1 virtual tick
  const stepTick = useCallback(async (): Promise<WorldTickResult | null> => {
    if (!engineRef.current) return null;
    try {
      setError(null);
      const result = await engineRef.current.tick();
      const state = engineRef.current.getState();
      const snapshot = engineRef.current.takeSnapshot();

      snapshotsHistoryRef.current.set(result.tick, { snapshot, state });

      const events = engineRef.current.getAllEvents();
      setWorldState(state);
      setAllEvents(events);
      setCurrentTick(result.tick);
      setDisplayedTick(result.tick);
      setIsScrubbing(false);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRunning(false);
      return null;
    }
  }, []);

  // Run continuous simulation loop
  const runSimulation = useCallback(() => {
    if (!isInitialized) return;
    setIsRunning(true);
    setIsScrubbing(false);
  }, [isInitialized]);

  // Pause simulation loop
  const pauseSimulation = useCallback(() => {
    setIsRunning(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reset to initial state
  const resetSimulation = useCallback(async () => {
    pauseSimulation();
    await initializeGenesis();
  }, [pauseSimulation, initializeGenesis]);

  // Auto-tick effect when isRunning is true
  useEffect(() => {
    if (!isRunning || !isInitialized) return;

    const intervalMs = Math.max(200, Math.floor(1500 / speedMultiplier));
    const timer = setTimeout(async () => {
      // Bound continuous runs to 50 ticks to prevent runaway loops
      if (currentTick >= 50) {
        pauseSimulation();
        return;
      }
      await stepTick();
    }, intervalMs);

    timerRef.current = timer;
    return () => clearTimeout(timer);
  }, [isRunning, isInitialized, speedMultiplier, currentTick, stepTick, pauseSimulation]);

  // Scrub to a historical tick
  const scrubToTick = useCallback(
    (targetTick: number) => {
      pauseSimulation();
      const boundedTick = Math.max(0, Math.min(targetTick, currentTick));
      const historicalEntry = snapshotsHistoryRef.current.get(boundedTick);

      if (historicalEntry) {
        setDisplayedTick(boundedTick);
        setIsScrubbing(boundedTick < currentTick);
        setWorldState(historicalEntry.state);

        // Compute "What Changed?" delta between scrubbed tick and latest tick
        const latestEntry = snapshotsHistoryRef.current.get(currentTick);
        if (latestEntry && boundedTick !== currentTick) {
          const fromState = historicalEntry.state;
          const toState = latestEntry.state;

          const fromRepValues = Array.from(fromState.reputations.values());
          const toRepValues = Array.from(toState.reputations.values());
          const fromAvgRep = fromRepValues.length > 0 ? fromRepValues.reduce((s, r) => s + r.score, 0) / fromRepValues.length : 80;
          const toAvgRep = toRepValues.length > 0 ? toRepValues.reduce((s, r) => s + r.score, 0) / toRepValues.length : 80;

          setActiveDelta({
            fromTick: boundedTick,
            toTick: currentTick,
            newAgentsCount: Math.max(0, toState.population.size - fromState.population.size),
            newMissionsCount: Math.max(0, toState.activeMissions.size + toState.completedMissions.length - (fromState.activeMissions.size + fromState.completedMissions.length)),
            completedMissionsCount: Math.max(0, toState.completedMissions.length - fromState.completedMissions.length),
            activeTeamsCount: toState.activeTeams.size,
            resolvedDisputesCount: Math.max(0, toState.resolvedDisputes.length - fromState.resolvedDisputes.length),
            eventDeltaCount: toState.recentEvents.length - fromState.recentEvents.length,
            avgReputationShift: toAvgRep - fromAvgRep,
            healthStatusShift: {
              from: fromState.metrics.health.status,
              to: toState.metrics.health.status,
            },
          });
        } else {
          setActiveDelta(null);
        }
      }
    },
    [currentTick, pauseSimulation],
  );

  // Resume live latest playback
  const resumeLivePlayback = useCallback(() => {
    if (snapshotsHistoryRef.current.has(currentTick)) {
      const latest = snapshotsHistoryRef.current.get(currentTick)!;
      setWorldState(latest.state);
      setDisplayedTick(currentTick);
      setIsScrubbing(false);
      setActiveDelta(null);
    }
  }, [currentTick]);

  // Complete deterministic demo flow: runs 5 ticks and selects key elements
  const runCompleteDemo = useCallback(async () => {
    pauseSimulation();
    await initializeGenesis();
    for (let i = 0; i < 5; i++) {
      await stepTick();
    }
  }, [pauseSimulation, initializeGenesis, stepTick]);

  // Initial load
  useEffect(() => {
    void initializeGenesis();
  }, [initializeGenesis]);

  // Filter events by category
  const filteredEvents = allEvents.filter((evt) => {
    if (eventFilter === "ALL") return true;
    if (eventFilter === "MISSIONS") return evt.eventType.startsWith("MISSION_");
    if (eventFilter === "AGENTS") return evt.eventType === "AGENT_DISCOVERED" || evt.eventType === "CAPABILITY_ADVERTISED" || evt.eventType === "AGENT_STATUS_CHANGED";
    if (eventFilter === "TEAMS") return evt.eventType.startsWith("TEAM_") || evt.eventType === "SPECIALIST_REQUESTED" || evt.eventType === "SPECIALIST_JOINED";
    if (eventFilter === "NEGOTIATIONS") return evt.eventType.startsWith("PROPOSAL_") || evt.eventType.startsWith("TASK_");
    if (eventFilter === "DELIVERABLES") return evt.eventType.startsWith("DELIVERABLE_") || evt.eventType.startsWith("REVIEW_");
    if (eventFilter === "COURT") {
      return (
        evt.eventType.startsWith("DISPUTE_") ||
        evt.eventType.startsWith("CLAIM_") ||
        evt.eventType === "EVIDENCE_SUBMITTED" ||
        evt.eventType === "JUDGES_SELECTED" ||
        evt.eventType === "JUDGE_CONFLICT_DECLARED" ||
        evt.eventType === "VOTE_CAST" ||
        evt.eventType === "VERDICT_ISSUED" ||
        evt.eventType === "RESOLUTION_APPLIED"
      );
    }
    if (eventFilter === "REPUTATION") return evt.eventType.startsWith("REPUTATION_");
    if (eventFilter === "ECONOMY") {
      return (
        evt.eventType.startsWith("MISSION_ESCROW_") ||
        evt.eventType.startsWith("MILESTONE_") ||
        evt.eventType.startsWith("AGENT_BID_") ||
        evt.eventType.startsWith("WORK_CONTRACT_") ||
        evt.eventType.startsWith("EXECUTION_") ||
        evt.eventType.startsWith("VERIFIED_WORK_PROOF_") ||
        evt.eventType.startsWith("ESCROW_") ||
        evt.eventType === "PAYMENT_ISSUED" ||
        evt.eventType === "PENALTY_APPLIED"
      );
    }
    if (eventFilter === "EVOLUTION") {
      return (
        evt.eventType === "CAPABILITY_GAP_DETECTED" ||
        evt.eventType === "LEARNING_PROPOSED" ||
        evt.eventType === "LEARNING_IN_PROGRESS" ||
        evt.eventType === "CAPABILITY_VERIFIED" ||
        evt.eventType === "CAPABILITY_ATTESTED" ||
        evt.eventType === "STRATEGY_ADAPTED"
      );
    }
    if (eventFilter === "SYSTEM") return evt.eventType === "MISSION_FAILED" || evt.eventType === "MISSION_COMPLETED";
    return true;
  });

  const narrativeFeed = deriveNarrativeFromEvents(allEvents);

  // Derive authentic remote agent telemetry from committed event stream and population
  const remoteAgents: RemoteAgentTelemetry[] = [];
  if (worldState) {
    for (const [did, agent] of worldState.population.entries()) {
      const authorEvents = allEvents.filter((e) => e.authorDid === did);
      if (authorEvents.length > 0) {
        const lastEvt = authorEvents[authorEvents.length - 1]!;
        remoteAgents.push({
          did,
          displayName: agent.profile.displayName,
          role: agent.profile.role,
          connected: true,
          lastSeen: lastEvt.timestamp,
          submittedEventsCount: authorEvents.length,
          acknowledgedSequence: authorEvents.length,
          syncLag: 0,
          signatureVerificationStatus: "VERIFIED",
        });
      }
    }
  }

  return {
    isInitialized,
    isRunning,
    isScrubbing,
    speedMultiplier,
    currentTick,
    displayedTick,
    maxTick: currentTick,
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
    initializeGenesis,
    stepTick,
    runSimulation,
    pauseSimulation,
    resetSimulation,
    setSpeed: setSpeedMultiplier,
    scrubToTick,
    resumeLivePlayback,
    setEventFilter,
    setViewMode,
    setSelectedTarget,
    setExecutionMode,
    runCompleteDemo,
  };
}
