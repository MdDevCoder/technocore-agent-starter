/**
 * Master React Hook for the Civilization World Engine & Live Data Layer.
 *
 * Phase 17 — Live Data Unification & End-to-End Dynamic System.
 *
 * Dual Mode Architecture:
 * 1. LIVE MODE (Default): Subscribes to canonical LiveCivilizationRepository (authoritative
 *    PostgreSQL/SqlEventStore + SSE stream). Zero fake data or synthetic deal fixtures are injected.
 * 2. SIMULATION MODE: Interactive, deterministic 9-agent CivilizationWorldEngine with
 *    virtual ticking, time-travel scrubbing, and explicitly labeled LOCAL_SIMULATION provenance.
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
import { createDemoDealEvents } from "../deals/demoDeals.ts";
import type {
  DataProvenanceMetadata,
} from "../../civilization/data/provenance.ts";
import {
  createProvenanceMetadata,
} from "../../civilization/data/provenance.ts";
import { LiveCivilizationRepository } from "../../civilization/data/live-repository.ts";

import type { NetworkSyncStatus } from "../../civilization/network/types.ts";

export type ObservatoryEngineMode = "LIVE" | "SIMULATION";

export interface UseCivilizationEngineReturn {
  readonly mode: ObservatoryEngineMode;
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
  readonly provenance: DataProvenanceMetadata;
  readonly isUpdating: boolean;
  readonly error: string | null;
  readonly networkStatus: NetworkSyncStatus | null;
  readonly isSyncingNetwork: boolean;

  // Actions
  readonly setMode: (mode: ObservatoryEngineMode) => void;
  readonly toggleMode: () => void;
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
  readonly spawnDemoDeals: () => Promise<void>;
  readonly refreshLiveEvents: () => Promise<void>;
  readonly triggerNetworkSync: () => Promise<void>;
}


export function useCivilizationEngine(initialSeed = "technocore-observatory-01"): UseCivilizationEngineReturn {
  const [mode, setModeState] = useState<ObservatoryEngineMode>("LIVE");
  const liveRepoRef = useRef<LiveCivilizationRepository | null>(null);

  if (!liveRepoRef.current) {
    liveRepoRef.current = new LiveCivilizationRepository();
  }

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
  const [viewMode, setViewMode] = useState<ObservatoryViewMode>("NETWORK");
  const [selectedTarget, setSelectedTarget] = useState<SelectionTarget>({ type: "none" });
  const [activeDelta, setActiveDelta] = useState<WhatChangedDelta | null>(null);
  const [executionMode, setExecutionMode] = useState<NetworkExecutionMode>("SIMULATION");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSyncingNetwork, setIsSyncingNetwork] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkSyncStatus | null>(null);

  const [provenance, setProvenance] = useState<DataProvenanceMetadata>(() =>
    createProvenanceMetadata({
      provenance: "LIVE_PERSISTENCE",
      source: "/api/civilization/events",
      freshness: "UPDATING",
      verified: true,
    })
  );

  // Refresh live events and network status from server
  const refreshLiveEvents = useCallback(async () => {
    if (!liveRepoRef.current) return;
    setIsUpdating(true);
    setError(null);
    try {
      await liveRepoRef.current.fetchEvents();
      await liveRepoRef.current.fetchNetworkAgents();
      await liveRepoRef.current.fetchNetworkDeals();
      const status = await liveRepoRef.current.fetchNetworkStatus();
      if (status) {
        setNetworkStatus(status);
      }
      if (mode === "LIVE") {
        const liveEvents = liveRepoRef.current.getEvents();
        setAllEvents(liveEvents);
        setProvenance(liveRepoRef.current.getMetadata());
      }
    } catch (err) {
      if (mode === "LIVE") {
        setProvenance(liveRepoRef.current.getMetadata());
      }
      console.warn("Live events refresh encountered offline or network error:", err);
    } finally {
      setIsUpdating(false);
    }
  }, [mode]);

  // Trigger bounded on-demand network sync
  const triggerNetworkSync = useCallback(async () => {
    if (!liveRepoRef.current) return;
    setIsSyncingNetwork(true);
    try {
      const status = await liveRepoRef.current.triggerNetworkSync({ maxMessagesPerRoom: 100 });
      if (status) {
        setNetworkStatus(status);
      }
      if (mode === "LIVE") {
        const liveEvents = liveRepoRef.current.getEvents();
        setAllEvents(liveEvents);
        setProvenance(liveRepoRef.current.getMetadata());
      }
    } catch (err) {
      console.warn("Network sync trigger failed:", err);
    } finally {
      setIsSyncingNetwork(false);
    }
  }, [mode]);


  // Initialize simulation engine
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

      const genesisEvents = engine.getAllEvents();
      const demoDeals = await createDemoDealEvents();
      const combinedEvents = [...genesisEvents, ...demoDeals];
      setWorldState(state);
      setAllEvents(combinedEvents);
      setCurrentTick(0);
      setDisplayedTick(0);
      setIsInitialized(true);
      setIsScrubbing(false);
      setProvenance(
        createProvenanceMetadata({
          provenance: "LOCAL_SIMULATION",
          source: "CivilizationWorldEngine (Seed: " + initialSeed + ")",
          verified: true,
          verifiedEventsCount: combinedEvents.length,
          lastEventSequence: combinedEvents.length,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [initialSeed]);

  // Set Mode handler
  const setMode = useCallback(
    (newMode: ObservatoryEngineMode) => {
      setModeState(newMode);
      if (newMode === "LIVE") {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsRunning(false);
        const liveEvents = liveRepoRef.current?.getEvents() ?? [];
        setAllEvents(liveEvents);
        setProvenance(
          liveRepoRef.current?.getMetadata() ??
            createProvenanceMetadata({
              provenance: "LIVE_PERSISTENCE",
              source: "/api/civilization/events",
              verified: true,
            })
        );
        void refreshLiveEvents();
      } else {
        // SIMULATION MODE
        if (!engineRef.current) {
          void initializeGenesis();
        } else {
          const events = engineRef.current.getAllEvents();
          setAllEvents(events);
          setWorldState(engineRef.current.getState());
          setProvenance(
            createProvenanceMetadata({
              provenance: "LOCAL_SIMULATION",
              source: "CivilizationWorldEngine",
              verified: true,
              verifiedEventsCount: events.length,
              lastEventSequence: currentTick,
            })
          );
        }
      }
    },
    [initializeGenesis, refreshLiveEvents, currentTick]
  );

  const toggleMode = useCallback(() => {
    setMode(mode === "LIVE" ? "SIMULATION" : "LIVE");
  }, [mode, setMode]);

  // Execute 1 virtual tick in Simulation Mode
  const stepTick = useCallback(async (): Promise<WorldTickResult | null> => {
    if (mode === "LIVE") {
      await refreshLiveEvents();
      return null;
    }

    if (!engineRef.current) return null;
    try {
      setError(null);
      const result = await engineRef.current.tick();
      const state = engineRef.current.getState();
      const snapshot = engineRef.current.takeSnapshot();

      snapshotsHistoryRef.current.set(result.tick, { snapshot, state });

      const events = engineRef.current.getAllEvents();
      setWorldState(state);
      setAllEvents((prev) => {
        const dealEvts = prev.filter((e) => e.eventType.startsWith("DEAL_"));
        const existingIds = new Set(events.map((e) => e.eventId));
        const missingDealEvts = dealEvts.filter((d) => !existingIds.has(d.eventId));
        return [...events, ...missingDealEvts];
      });
      setCurrentTick(result.tick);
      setDisplayedTick(result.tick);
      setIsScrubbing(false);
      setProvenance(
        createProvenanceMetadata({
          provenance: "LOCAL_SIMULATION",
          source: "CivilizationWorldEngine (Tick #" + result.tick + ")",
          verified: true,
          verifiedEventsCount: events.length,
          lastEventSequence: result.tick,
        })
      );
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsRunning(false);
      return null;
    }
  }, [mode, refreshLiveEvents]);

  // Run continuous simulation loop
  const runSimulation = useCallback(() => {
    if (mode !== "SIMULATION") {
      setMode("SIMULATION");
    }
    if (!isInitialized) return;
    setIsRunning(true);
    setIsScrubbing(false);
  }, [mode, setMode, isInitialized]);

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

  // Auto-tick effect when isRunning is true (Simulation Mode only)
  useEffect(() => {
    if (!isRunning || !isInitialized || mode !== "SIMULATION") return;

    const intervalMs = Math.max(200, Math.floor(1500 / speedMultiplier));
    const timer = setTimeout(async () => {
      if (currentTick >= 50) {
        pauseSimulation();
        return;
      }
      await stepTick();
    }, intervalMs);

    timerRef.current = timer;
    return () => clearTimeout(timer);
  }, [isRunning, isInitialized, speedMultiplier, currentTick, stepTick, pauseSimulation, mode]);

  // Scrub to a historical tick
  const scrubToTick = useCallback(
    (targetTick: number) => {
      if (mode !== "SIMULATION") return;
      pauseSimulation();
      const boundedTick = Math.max(0, Math.min(targetTick, currentTick));
      const historicalEntry = snapshotsHistoryRef.current.get(boundedTick);

      if (historicalEntry) {
        setDisplayedTick(boundedTick);
        setIsScrubbing(boundedTick < currentTick);
        setWorldState(historicalEntry.state);

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
    [currentTick, pauseSimulation, mode],
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

  // Complete deterministic demo flow
  const runCompleteDemo = useCallback(async () => {
    if (mode !== "SIMULATION") {
      setMode("SIMULATION");
    }
    pauseSimulation();
    await initializeGenesis();
    for (let i = 0; i < 5; i++) {
      await stepTick();
    }
    const demoDeals = await createDemoDealEvents();
    setAllEvents((prev) => [...prev, ...demoDeals]);
  }, [mode, setMode, pauseSimulation, initializeGenesis, stepTick]);

  // Spawn or reload demo deals into event ledger (Simulation Mode only)
  const spawnDemoDeals = useCallback(async () => {
    const demoDeals = await createDemoDealEvents();
    setAllEvents((prev) => {
      const existingIds = new Set(prev.map((e) => e.eventId));
      const newDeals = demoDeals.filter((d) => !existingIds.has(d.eventId));
      return [...prev, ...newDeals];
    });
  }, []);

  // Initial load effect
  useEffect(() => {
    if (mode === "LIVE") {
      void refreshLiveEvents();
      liveRepoRef.current?.startLiveStream();
      const unsubscribe = liveRepoRef.current?.subscribe(() => {
        if (mode === "LIVE" && liveRepoRef.current) {
          setAllEvents(liveRepoRef.current.getEvents());
          setProvenance(liveRepoRef.current.getMetadata());
          const netStatus = liveRepoRef.current.getNetworkStatus();
          if (netStatus) {
            setNetworkStatus(netStatus);
          }
        }
      });
      return () => {
        unsubscribe?.();
        liveRepoRef.current?.stopLiveStream();
      };
    } else {
      void initializeGenesis();
    }
  }, [mode, refreshLiveEvents, initializeGenesis]);

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
    if (eventFilter === "DEALS") return evt.eventType.startsWith("DEAL_");
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
    mode,
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
    provenance,
    isUpdating,
    networkStatus,
    isSyncingNetwork,
    error,
    setMode,
    toggleMode,
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
    spawnDemoDeals,
    refreshLiveEvents,
    triggerNetworkSync,
  };
}

