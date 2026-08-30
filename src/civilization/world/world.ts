/**
 * Central Civilization World Engine.
 *
 * Coordinates the deterministic multi-agent civilization simulation across missions,
 * proposal negotiation, team formation, task execution, dispute trials, evidence-based
 * reputation derivation, and metrics aggregation.
 */

import type { AgentIdentity } from "../agent/identity.ts";
import { normalizeCapabilityName } from "../agent/capability.ts";
import { spawnSimulationPopulation } from "../agent/population.ts";
import { runDisputeCourtTrial } from "../court/orchestrator.ts";
import type { DisputePackage } from "../court/types.ts";
import { reduceCivilizationState } from "../engine/reducer.ts";
import { createInitialCivilizationState } from "../engine/state.ts";
import { createMissionEvent } from "../events/factory.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import { evaluateTeamReadiness } from "../negotiation/formation.ts";
import type { RoleProposal } from "../negotiation/types.ts";
import { calculateAgentReputation } from "../reputation/calculator.ts";
import { extractReputationEvidence } from "../reputation/evidence.ts";
import { ReputationProjectionEngine } from "../reputation/projection.ts";
import type { AgentProfile, AgentReputation } from "../types/agent.ts";
import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { CivilizationMission } from "../types/mission.ts";
import { EconomicBiddingEngine } from "../economy/bidding.ts";
import { EconomicLedger } from "../economy/ledger.ts";
import { DeterministicExecutionRuntime } from "../execution/runtime.ts";
import { WorkVerificationPipeline } from "../execution/verifier.ts";
import { CapabilityAttestationIssuer } from "../evolution/attestation.ts";
import { BenchmarkSuiteGenerator } from "../evolution/benchmarks.ts";
import { LearningEconomicsEngine } from "../evolution/economics.ts";
import { CapabilityGapDetector } from "../evolution/gap-detector.ts";
import { EvolutionLedger } from "../evolution/ledger.ts";
import { getVerificationProfileForCapability } from "../evolution/profiles.ts";
import { VersionedStrategyEngine } from "../evolution/strategy.ts";
import { LearningSynthesisEngine } from "../evolution/synthesis.ts";
import { IndependentCapabilityVerifier } from "../evolution/verifier.ts";
import { DynamicEnvironmentDemandModel } from "./environment-demand.ts";
import { AgentTickDispatcher } from "./agent-loop.ts";
import { SeededPrng, SimulationClock } from "./clock.ts";
import { EventRouter } from "./event-router.ts";
import { calculateWorldMetrics } from "./metrics.ts";
import { DeterministicMissionGenerator } from "./mission-generator.ts";
import { createWorldSnapshot, restoreWorldFromSnapshot } from "./snapshot.ts";
import type {
  CivilizationWorldState,
  ClockInterface,
  DynamicTeamState,
  WorldSnapshot,
  WorldTickResult,
  WorldTickTrace,
} from "./types.ts";

export interface WorldEngineOptions {
  readonly worldId?: string;
  readonly seed?: number | string;
  readonly clock?: ClockInterface;
  readonly tickDurationMinutes?: number;
}

export class CivilizationWorldEngine {
  readonly worldId: string;
  private readonly prng: SeededPrng;
  private readonly clock: ClockInterface;
  private readonly missionGenerator: DeterministicMissionGenerator;
  private readonly eventRouter: EventRouter;
  private readonly agentDispatcher: AgentTickDispatcher;
  private readonly tickDurationMs: number;

  private readonly economicLedger = new EconomicLedger();
  private readonly executionRuntime = new DeterministicExecutionRuntime();
  private readonly verificationPipeline = new WorkVerificationPipeline();
  private readonly biddingEngine = new EconomicBiddingEngine();

  private readonly evolutionLedger = new EvolutionLedger();
  private readonly gapDetector = new CapabilityGapDetector();
  private readonly economicsEngine = new LearningEconomicsEngine();
  private readonly benchmarkGenerator: BenchmarkSuiteGenerator;
  private readonly learningSynthesis = new LearningSynthesisEngine();
  private readonly capabilityVerifier = new IndependentCapabilityVerifier();
  private readonly attestationIssuer = new CapabilityAttestationIssuer();
  private readonly strategyEngine = new VersionedStrategyEngine();
  private readonly environmentDemand = new DynamicEnvironmentDemandModel();

  private tickCount = 0;
  private totalMissionsGenerated = 0;
  private specialistRecruitmentCount = 0;
  private teamReorganizationCount = 0;

  private events: CivilizationEvent[] = [];
  private population = new Map<DidString, { identity: AgentIdentity; profile: AgentProfile }>();
  private activeMissions = new Map<string, CivilizationMission>();
  private missionPhases = new Map<string, { phase: "FORMING" | "EXECUTING" | "REVIEWING" | "RESOLVING"; executionTicksRemaining: number; formedTick: number }>();
  private completedMissions: CivilizationMission[] = [];
  private failedMissions: CivilizationMission[] = [];
  private activeTeams = new Map<string, DynamicTeamState>();
  private activeDisputes = new Map<string, DisputePackage>();
  private resolvedDisputes: DisputePackage[] = [];
  private reputations = new Map<DidString, AgentReputation>();
  private snapshots: WorldSnapshot[] = [];

  private readonly seed: number | string;

  constructor(options: WorldEngineOptions = {}) {
    this.seed = options.seed ?? "technocore-world-seed-01";
    this.prng = new SeededPrng(this.seed);
    this.worldId = options.worldId ?? this.prng.generateId("wrld", 6);
    this.clock = options.clock ?? new SimulationClock("2026-09-01T00:00:00.000Z");
    this.missionGenerator = new DeterministicMissionGenerator(this.seed);
    this.eventRouter = new EventRouter();
    this.agentDispatcher = new AgentTickDispatcher();
    this.benchmarkGenerator = new BenchmarkSuiteGenerator(this.seed);
    this.tickDurationMs = (options.tickDurationMinutes ?? 60) * 60 * 1000;
  }

  get currentTime(): IsoUtcTimestamp {
    return this.clock.currentTime;
  }

  get currentTick(): number {
    return this.tickCount;
  }

  getAllEvents(): readonly CivilizationEvent[] {
    return Object.freeze([...this.events]);
  }

  /**
   * Initializes Genesis: loads the standard 9-agent population, registers their
   * cryptographic identities, advertises capabilities, and sets initial reputations.
   */
  async initializeGenesis(): Promise<void> {
    const seedPrefix = typeof this.seed === "string" ? this.seed : `seed-${this.seed}`;
    const spawned = await spawnSimulationPopulation({ seedPrefix, createdAt: this.clock.currentTime });

    for (let i = 0; i < spawned.identities.length; i++) {
      const identity = spawned.identities[i]!;
      const profile = spawned.profiles[i]!;

      this.population.set(identity.did, {
        identity,
        profile,
      });

      const initialRep: AgentReputation = {
        did: identity.did,
        score: profile.role.includes("Coordinator") ? 95 : 85,
        completedTasks: 0,
        acceptedReviews: 0,
        rejectedReviews: 0,
        disputesWon: 0,
        disputesLost: 0,
        verdictsIssued: 0,
        missionsCompleted: 0,
        lastActivityTimestamp: this.clock.currentTime,
      };

      this.reputations.set(identity.did, initialRep);
      this.agentDispatcher.registerAgent(identity, profile, initialRep);

      // Ingest Genesis Agent Discovered event
      const discEvent = await signCivilizationEvent(
        {
          eventType: "AGENT_DISCOVERED",
          missionId: "mis_genesis",
          authorDid: identity.did,
          timestamp: this.clock.currentTime,
          payload: {
            agentId: identity.agentId,
            did: identity.did,
            displayName: identity.displayName,
            role: identity.role,
            capabilities: profile.capabilities,
          },
        },
        identity.signingHandle,
      );

      this.events.push(discEvent);
    }
  }

  private incrementAgentWorkload(agentDid: DidString): void {
    const agentObj = this.population.get(agentDid);
    if (!agentObj) return;

    const currentTasks = agentObj.profile.workload?.activeTasks ?? 0;
    const currentMissions = agentObj.profile.workload?.activeMissions ?? 0;
    const maxConcurrent = agentObj.profile.workload?.maxConcurrentTasks ?? 4;
    const nextTasks = currentTasks + 1;
    const nextMissions = currentMissions + 1;

    const updatedProfile: AgentProfile = {
      ...agentObj.profile,
      workload: {
        activeTasks: nextTasks,
        activeMissions: nextMissions,
        maxConcurrentTasks: maxConcurrent,
      },
      availability: nextTasks >= maxConcurrent ? "busy" : "available",
    };

    this.population.set(agentDid, {
      identity: agentObj.identity,
      profile: updatedProfile,
    });
  }

  private decrementAgentWorkload(agentDid: DidString, isMissionComplete: boolean): void {
    const agentObj = this.population.get(agentDid);
    if (!agentObj) return;

    const currentTasks = agentObj.profile.workload?.activeTasks ?? 0;
    const currentMissions = agentObj.profile.workload?.activeMissions ?? 0;
    const maxConcurrent = agentObj.profile.workload?.maxConcurrentTasks ?? 4;
    const nextTasks = Math.max(0, currentTasks - 1);
    const nextMissions = isMissionComplete ? Math.max(0, currentMissions - 1) : currentMissions;

    const updatedProfile: AgentProfile = {
      ...agentObj.profile,
      workload: {
        activeTasks: nextTasks,
        activeMissions: nextMissions,
        maxConcurrentTasks: maxConcurrent,
      },
      availability: nextTasks < maxConcurrent ? "available" : "busy",
    };

    this.population.set(agentDid, {
      identity: agentObj.identity,
      profile: updatedProfile,
    });
  }

  /**
   * Advances the world by one deterministic tick.
   */
  async tick(durationMinutes?: number): Promise<WorldTickResult> {
    const startTime = Date.now();
    this.tickCount++;
    const stepDuration = durationMinutes ? durationMinutes * 60 * 1000 : this.tickDurationMs;
    this.clock.advance(stepDuration);
    const tickTimestamp = this.clock.currentTime;

    const tickEvents: CivilizationEvent[] = [];
    const awakenedDidsSet = new Set<DidString>();
    const newMissions: string[] = [];
    const newTeams: string[] = [];
    const newDisputes: string[] = [];
    let actionsAttempted = 0;
    let actionsAccepted = 0;
    let actionsRejected = 0;

    // 1. Dynamic Environment Demand & Mission Generation
    const latestMarket = this.economicLedger.getStateSnapshot(this.tickCount, tickTimestamp);
    this.environmentDemand.updateEnvironmentState({
      tick: this.tickCount,
      population: this.population,
      completedMissions: this.completedMissions,
      failedMissions: this.failedMissions,
      priceSignals: latestMarket.marketSnapshot?.capabilityPrices ?? [],
      prng: this.prng,
    });

    if (this.activeMissions.size < 4) {
      const coordinator = Array.from(this.population.values()).find((m) => m.profile.role.includes("Coordinator"));
      if (coordinator) {
        const mission = this.environmentDemand.generateEmergentMission({
          creatorDid: coordinator.identity.did,
          timestamp: tickTimestamp,
          tick: this.tickCount,
          prng: this.prng,
          population: this.population,
        });
        this.activeMissions.set(mission.missionId, mission);
        this.missionPhases.set(mission.missionId, {
          phase: "FORMING",
          executionTicksRemaining: 1,
          formedTick: this.tickCount,
        });
        this.totalMissionsGenerated++;
        newMissions.push(mission.missionId);

        const missionEvt = await createMissionEvent(
          mission.missionId,
          coordinator.identity.did,
          {
            title: mission.title,
            objective: mission.objective,
            requirements: mission.requirements,
            constraints: mission.constraints,
            deadline: mission.deadline,
            budget: mission.budget,
            genesisAgentDid: coordinator.identity.did,
          },
          coordinator.identity.signingHandle,
        );

        tickEvents.push(missionEvt);
        this.events.push(missionEvt);
        this.economicLedger.applyEvent(missionEvt);

        const escrowId = this.prng.generateId("esc", 6);
        const escrowEvt = await signCivilizationEvent(
          {
            eventType: "MISSION_ESCROW_CREATED",
            missionId: mission.missionId,
            authorDid: coordinator.identity.did,
            payload: {
              escrowId,
              missionId: mission.missionId,
              totalBudget: mission.budget.amount,
              token: "FLOP",
              milestoneCount: Math.max(1, mission.requirements.length),
              creatorDid: coordinator.identity.did,
            },
          },
          coordinator.identity.signingHandle,
        );

        tickEvents.push(escrowEvt);
        this.events.push(escrowEvt);
        this.economicLedger.applyEvent(escrowEvt);

        const awakened = this.eventRouter.routeEvent(missionEvt, this.population);
        for (const d of awakened) awakenedDidsSet.add(d);
      }
    }

    // 2. Phased Multi-Tick Mission Progression Pipeline
    for (const [missionId, mission] of Array.from(this.activeMissions.entries())) {
      let team = this.activeTeams.get(missionId);
      const tracker = this.missionPhases.get(missionId) ?? {
        phase: "FORMING",
        executionTicksRemaining: 1,
        formedTick: this.tickCount,
      };

      // --- PHASE A: TEAM FORMATION & BIDDING ---
      if (tracker.phase === "FORMING") {
        const candidates = Array.from(this.population.values());
        const proposals: RoleProposal[] = [];

        for (const candidate of candidates) {
          if (candidate.profile.role.includes("Coordinator")) continue;
          actionsAttempted++;

          // Real Workload check: skip saturated agents
          const isAvailable =
            candidate.profile.availability !== "busy" &&
            (candidate.profile.workload?.activeTasks ?? 0) < (candidate.profile.workload?.maxConcurrentTasks ?? 4);

          if (!isAvailable) {
            actionsRejected++;
            continue;
          }

          // Check if candidate matches any requirement
          const matchedRequirements = mission.requirements.filter((req) =>
            candidate.profile.capabilities.some(
              (c) => normalizeCapabilityName(c.name) === normalizeCapabilityName(req.capability) && c.proficiency >= req.minProficiency,
            ),
          );

          if (matchedRequirements.length > 0) {
            actionsAccepted++;
            awakenedDidsSet.add(candidate.identity.did);
            const proposalId = this.prng.generateId("prp", 6);
            proposals.push({
              proposalId,
              missionId,
              proposerDid: candidate.identity.did,
              role: candidate.profile.role,
              responsibility: `Lead implementation for ${matchedRequirements.map((r) => r.capability).join(", ")}`,
              proposedCapabilities: candidate.profile.capabilities,
              estimatedEffortMinutes: this.prng.nextInt(60, 180),
              dependencies: [],
              ttlSeconds: 86400,
              expiresAt: new Date(new Date(tickTimestamp).getTime() + 86400 * 1000).toISOString(),
              status: "accepted",
              createdAt: tickTimestamp,
            });

            // Agent Bid Submitted Event
            const bidId = this.prng.generateId("bid", 6);
            const bidEvt = await signCivilizationEvent(
              {
                eventType: "AGENT_BID_SUBMITTED",
                missionId,
                authorDid: candidate.identity.did,
                payload: {
                  bidId,
                  missionId,
                  agentDid: candidate.identity.did,
                  requestedAmount: Math.round(mission.budget.amount / Math.max(1, mission.requirements.length)),
                  estimatedTicks: 2,
                  capabilityPledged: matchedRequirements[0]!.capability,
                  rationale: `Economic evaluation justifies participation based on capability ${matchedRequirements[0]!.capability}.`,
                },
              },
              candidate.identity.signingHandle,
            );
            tickEvents.push(bidEvt);
            this.events.push(bidEvt);
            this.economicLedger.applyEvent(bidEvt);
          } else {
            actionsRejected++;
          }
        }

        const readiness = evaluateTeamReadiness(mission, proposals);

        if (readiness.ready) {
          const coordinator = Array.from(this.population.values()).find((m) => m.profile.role.includes("Coordinator"));
          if (coordinator) {
            const memberDids = proposals.map((p) => p.proposerDid);
            const roles: Record<string, string> = {};
            for (const p of proposals) {
              roles[p.proposerDid] = p.role;
            }

            team = {
              teamId: this.prng.generateId("tm", 6),
              missionId,
              memberDids,
              roles,
              status: "active",
              formedAt: tickTimestamp,
            };

            this.activeTeams.set(missionId, team);
            newTeams.push(team.teamId);

            const teamFormedEvt = await signCivilizationEvent(
              {
                eventType: "TEAM_FORMED",
                missionId,
                authorDid: coordinator.identity.did,
                payload: {
                  teamName: `Team ${missionId}`,
                  memberDids,
                  roles,
                },
              },
              coordinator.identity.signingHandle,
            );

            tickEvents.push(teamFormedEvt);
            this.events.push(teamFormedEvt);
            this.economicLedger.applyEvent(teamFormedEvt);

            // Establish Work Contracts & Increment Real Workload
            for (const [idx, memberDid] of memberDids.entries()) {
              const contractId = this.prng.generateId("cntr", 6);
              const milestoneId = `ms_${missionId}_${idx + 1}`;
              const agreedComp = Math.round(mission.budget.amount / memberDids.length);

              const contractEvt = await signCivilizationEvent(
                {
                  eventType: "WORK_CONTRACT_ESTABLISHED",
                  missionId,
                  taskId: `tsk_${contractId}`,
                  authorDid: coordinator.identity.did,
                  payload: {
                    contractId,
                    missionId,
                    taskId: `tsk_${contractId}`,
                    agentDid: memberDid,
                    milestoneId,
                    agreedCompensation: agreedComp,
                    deadline: mission.deadline,
                  },
                },
                coordinator.identity.signingHandle,
              );
              tickEvents.push(contractEvt);
              this.events.push(contractEvt);
              this.economicLedger.applyEvent(contractEvt);

              this.incrementAgentWorkload(memberDid);
            }

            tracker.phase = "EXECUTING";
            tracker.executionTicksRemaining = 1;
            this.missionPhases.set(missionId, tracker);
          }
        } else if (readiness.missingRequirements.length > 0) {
          this.specialistRecruitmentCount++;
          const coordinator = Array.from(this.population.values()).find((m) => m.profile.role.includes("Coordinator"));
          if (coordinator) {
            const gap = readiness.missingRequirements[0]!;
            const specEvt = await signCivilizationEvent(
              {
                eventType: "SPECIALIST_REQUESTED",
                missionId,
                authorDid: coordinator.identity.did,
                payload: {
                  requiredCapability: gap.requiredCapability,
                  minProficiency: gap.minProficiency,
                  reason: "Emergent capability gap detected during team formation.",
                },
              },
              coordinator.identity.signingHandle,
            );

            tickEvents.push(specEvt);
            this.events.push(specEvt);
          }
        }
      }

      // --- PHASE B: TASK EXECUTION & PROOFS ---
      else if (tracker.phase === "EXECUTING" && team && team.memberDids.length > 0) {
        tracker.executionTicksRemaining--;
        if (tracker.executionTicksRemaining <= 0) {
          for (const [idx, memberDid] of team.memberDids.entries()) {
            awakenedDidsSet.add(memberDid);
            const memberObj = this.population.get(memberDid);
            if (!memberObj) continue;

            actionsAttempted++;
            const taskId = this.prng.generateId("tsk", 6);
            const deliverableId = this.prng.generateId("del", 6);
            const contractId = this.prng.generateId("cntr", 6);
            const milestoneId = `ms_${missionId}_${idx + 1}`;

            const execStartEvt = await signCivilizationEvent(
              {
                eventType: "EXECUTION_STARTED",
                missionId,
                taskId,
                authorDid: memberDid,
                payload: {
                  executionId: this.prng.generateId("exec", 6),
                  contractId,
                  taskId,
                  agentDid: memberDid,
                  runtimeEnvironment: "deterministic-sandbox-v1",
                },
              },
              memberObj.identity.signingHandle,
            );
            tickEvents.push(execStartEvt);
            this.events.push(execStartEvt);
            this.economicLedger.applyEvent(execStartEvt);

            const executionReport = await this.executionRuntime.execute({
              taskId,
              contractId,
              agentDid: memberDid,
              capabilityName: memberObj.profile.capabilities[0]?.name ?? "typescript",
              codePayload: `export function processTask_${taskId}() { return { status: "OK", timestamp: "${tickTimestamp}" }; }`,
              testSuiteSpec: {
                testCases: [
                  { name: "unit_test_core_logic", input: { taskId }, expectedOutput: { status: "OK" } },
                  { name: "integration_contract_compliance", input: { milestoneId }, expectedOutput: { status: "OK" } },
                ],
              },
              timestamp: tickTimestamp,
            });

            const { proof } = await this.verificationPipeline.verifyReport({
              missionId,
              taskId,
              deliverableId,
              contractId,
              executionReport,
            });

            const delivEvt = await signCivilizationEvent(
              {
                eventType: "DELIVERABLE_SUBMITTED",
                missionId,
                authorDid: memberDid,
                payload: {
                  taskId,
                  deliverable: {
                    deliverableId,
                    type: "code",
                    contentHash: proof.artifactHashes[0] ?? `sha256_${this.prng.generateId("hash", 12)}`,
                    summary: "Completed assigned task deliverable with sandboxed verification.",
                    uri: `technocore://artifacts/${deliverableId}`,
                  },
                },
              },
              memberObj.identity.signingHandle,
            );
            tickEvents.push(delivEvt);
            this.events.push(delivEvt);
            actionsAccepted++;

            const proofEvt = await signCivilizationEvent(
              {
                eventType: "VERIFIED_WORK_PROOF_PUBLISHED",
                missionId,
                taskId,
                authorDid: memberDid,
                payload: {
                  proofId: proof.proofId,
                  agentDid: memberDid,
                  missionId,
                  taskId,
                  deliverableId,
                  status: proof.status,
                  artifactHashes: proof.artifactHashes,
                  buildResultHash: proof.buildResultHash,
                  testResultHash: proof.testResultHash,
                  executionResultHash: proof.executionResultHash,
                  testSummary: proof.testSummary,
                },
              },
              memberObj.identity.signingHandle,
            );
            tickEvents.push(proofEvt);
            this.events.push(proofEvt);
            this.economicLedger.applyEvent(proofEvt);
          }

          tracker.phase = "REVIEWING";
          this.missionPhases.set(missionId, tracker);
        }
      }

      // --- PHASE C: PEER REVIEW & COURT DISPUTES ---
      else if (tracker.phase === "REVIEWING" && team && team.memberDids.length > 0) {
        for (const [idx, memberDid] of team.memberDids.entries()) {
          const memberObj = this.population.get(memberDid);
          if (!memberObj) continue;

          const taskId = `tsk_${missionId}_${idx + 1}`;
          const deliverableId = `del_${missionId}_${idx + 1}`;
          const milestoneId = `ms_${missionId}_${idx + 1}`;

          const isSuccessful = this.prng.nextFloat() > 0.15;
          const reviewer = Array.from(this.population.values()).find(
            (m) => m.identity.did !== memberDid && !m.profile.role.includes("Coordinator"),
          );

          if (reviewer) {
            if (isSuccessful) {
              const reviewEvt = await signCivilizationEvent(
                {
                  eventType: "REVIEW_ACCEPTED",
                  missionId,
                  authorDid: reviewer.identity.did,
                  payload: {
                    taskId,
                    deliverableId,
                    reviewerDid: reviewer.identity.did,
                    score: 90,
                    comments: "Deliverable satisfies all requirements.",
                  },
                },
                reviewer.identity.signingHandle,
              );
              tickEvents.push(reviewEvt);
              this.events.push(reviewEvt);

              const coordinator =
                Array.from(this.population.values()).find((m) => m.profile.role.includes("Coordinator")) ?? reviewer;
              const milestoneCompEvt = await signCivilizationEvent(
                {
                  eventType: "MILESTONE_COMPLETED",
                  missionId,
                  taskId,
                  authorDid: coordinator.identity.did,
                  payload: {
                    milestoneId,
                    missionId,
                    taskId,
                    proofId: `proof_${missionId}_${idx + 1}`,
                    completedByDid: memberDid,
                  },
                },
                coordinator.identity.signingHandle,
              );
              tickEvents.push(milestoneCompEvt);
              this.events.push(milestoneCompEvt);
              this.economicLedger.applyEvent(milestoneCompEvt);

              const payoutAmount = Math.round(mission.budget.amount / team.memberDids.length);
              const escrowRelEvt = await signCivilizationEvent(
                {
                  eventType: "ESCROW_RELEASED",
                  missionId,
                  taskId,
                  authorDid: coordinator.identity.did,
                  payload: {
                    escrowId: `esc_${missionId}`,
                    milestoneId,
                    recipientDid: memberDid,
                    amount: payoutAmount,
                    token: "FLOP",
                    proofId: `proof_${missionId}_${idx + 1}`,
                  },
                },
                coordinator.identity.signingHandle,
              );
              tickEvents.push(escrowRelEvt);
              this.events.push(escrowRelEvt);
              this.economicLedger.applyEvent(escrowRelEvt);

              const paymentEvt = await signCivilizationEvent(
                {
                  eventType: "PAYMENT_ISSUED",
                  missionId,
                  taskId,
                  authorDid: coordinator.identity.did,
                  payload: {
                    transactionId: this.prng.generateId("tx", 6),
                    escrowId: `esc_${missionId}`,
                    recipientDid: memberDid,
                    amount: payoutAmount,
                    token: "FLOP",
                    milestoneId,
                  },
                },
                coordinator.identity.signingHandle,
              );
              tickEvents.push(paymentEvt);
              this.events.push(paymentEvt);
              this.economicLedger.applyEvent(paymentEvt);

              this.decrementAgentWorkload(memberDid, false);
            } else {
              const reviewRejEvt = await signCivilizationEvent(
                {
                  eventType: "REVIEW_REJECTED",
                  missionId,
                  authorDid: reviewer.identity.did,
                  payload: {
                    taskId,
                    deliverableId,
                    reviewerDid: reviewer.identity.did,
                    reason: "Boundary condition discrepancy in API parser",
                    requiredChanges: ["Re-align parser with formal specification"],
                  },
                },
                reviewer.identity.signingHandle,
              );
              tickEvents.push(reviewRejEvt);
              this.events.push(reviewRejEvt);

              const disputeId = this.prng.generateId("dsp", 6);
              newDisputes.push(disputeId);

              const disputePkg: DisputePackage = {
                disputeId,
                missionId,
                taskId,
                subject: `Dispute over deliverable ${deliverableId}`,
                claimantDid: memberDid,
                respondentDid: reviewer.identity.did,
                evidenceChain: [],
                openedAt: tickTimestamp,
                recursionDepth: 0,
              };

              const allAgents = Array.from(this.population.values());
              const coordinator = allAgents.find((a) => a.profile.role.includes("Coordinator")) ?? allAgents[0]!;

              const judgeIdentitiesMap = new Map<string, AgentIdentity>();
              const candidateJudges = allAgents.map((a) => {
                judgeIdentitiesMap.set(a.identity.did, a.identity);
                return {
                  identity: a.identity,
                  profile: a.profile,
                  reputation: this.reputations.get(a.identity.did) ?? {
                    did: a.identity.did,
                    score: 80,
                    completedTasks: 0,
                    acceptedReviews: 0,
                    rejectedReviews: 0,
                    disputesWon: 0,
                    disputesLost: 0,
                    verdictsIssued: 0,
                    missionsCompleted: 0,
                    lastActivityTimestamp: tickTimestamp,
                  },
                };
              });

              const trialResult = await runDisputeCourtTrial({
                dispute: disputePkg,
                claimantIdentity: memberObj.identity,
                respondentIdentity: reviewer.identity,
                candidateJudges,
                judgeIdentities: judgeIdentitiesMap,
                executorIdentity: coordinator.identity,
                timestamp: tickTimestamp,
              });

              for (const courtEvt of trialResult.events) {
                tickEvents.push(courtEvt);
                this.events.push(courtEvt);
                this.economicLedger.applyEvent(courtEvt);
              }

              this.resolvedDisputes.push(trialResult.dispute);

              const penaltyEvt = await signCivilizationEvent(
                {
                  eventType: "PENALTY_APPLIED",
                  missionId,
                  taskId,
                  authorDid: coordinator.identity.did,
                  payload: {
                    penaltyId: this.prng.generateId("pen", 6),
                    agentDid: memberDid,
                    amount: 250,
                    token: "FLOP",
                    reason: `Judicial penalty applied following Agent Court resolution in dispute ${disputeId}.`,
                    disputeId,
                  },
                },
                coordinator.identity.signingHandle,
              );
              tickEvents.push(penaltyEvt);
              this.events.push(penaltyEvt);
              this.economicLedger.applyEvent(penaltyEvt);

              this.decrementAgentWorkload(memberDid, false);
            }
          }
        }

        tracker.phase = "RESOLVING";
        this.missionPhases.set(missionId, tracker);
      }

      // --- PHASE D: SETTLEMENT & FINALIZATION ---
      else if (tracker.phase === "RESOLVING") {
        if (team) {
          for (const memberDid of team.memberDids) {
            this.decrementAgentWorkload(memberDid, true);
          }
        }

        this.completedMissions.push(mission);
        this.activeMissions.delete(missionId);
        this.activeTeams.delete(missionId);
        this.missionPhases.delete(missionId);

        const coordinator = Array.from(this.population.values()).find((m) => m.profile.role.includes("Coordinator"));
        if (coordinator && team) {
          const completedEvt = await signCivilizationEvent(
            {
              eventType: "MISSION_COMPLETED",
              missionId,
              authorDid: coordinator.identity.did,
              payload: {
                finalDeliverableIds: team.memberDids.map((d) => `del_${d.slice(0, 6)}`),
                summary: `Mission ${mission.title} successfully delivered.`,
                completedTasksCount: team.memberDids.length,
              },
            },
            coordinator.identity.signingHandle,
          );
          tickEvents.push(completedEvt);
          this.events.push(completedEvt);
          this.economicLedger.applyEvent(completedEvt);
        }
      }
    }

    // 4. Update Evidence-Based Reputation for All Agents
    const allEvidence = extractReputationEvidence(this.events);
    for (const did of this.population.keys()) {
      const updatedDerivedRep = calculateAgentReputation(
        did,
        allEvidence,
        tickTimestamp,
      );

      const updatedRep: AgentReputation = {
        did,
        score: updatedDerivedRep.overallScore,
        completedTasks: updatedDerivedRep.completedTasksCount,
        acceptedReviews: updatedDerivedRep.acceptedDeliverablesCount,
        rejectedReviews: updatedDerivedRep.rejectedDeliverablesCount,
        disputesWon: updatedDerivedRep.disputesWonCount,
        disputesLost: updatedDerivedRep.disputesLostCount,
        verdictsIssued: 0,
        missionsCompleted: 1,
        lastActivityTimestamp: tickTimestamp,
      };

      this.reputations.set(did, updatedRep);
    }

    // 5. Phase 10: Evolutionary Learning, Gap Detection & Capability Synthesis
    const latestMarketPrices = this.economicLedger.getState().marketSnapshot.capabilityPrices;

    for (const [agentDid, agentObj] of this.population.entries()) {
      const agentGaps = this.gapDetector.detectAgentGaps({
        agent: agentObj.profile,
        activeMissions: Array.from(this.activeMissions.values()),
        completedMissions: this.completedMissions,
        failedMissions: this.failedMissions,
        marketPriceSignals: latestMarketPrices,
        timestamp: tickTimestamp,
      });

      if (agentGaps.length > 0) {
        const topGap = agentGaps[0]!;
        const account = this.economicLedger.getAccount(agentDid);
        const rep = this.reputations.get(agentDid) ?? {
          did: agentDid,
          score: 75,
          completedTasks: 0,
          acceptedReviews: 0,
          rejectedReviews: 0,
          disputesWon: 0,
          disputesLost: 0,
          verdictsIssued: 0,
          missionsCompleted: 0,
          lastActivityTimestamp: tickTimestamp,
        };

        const activeAttempt = this.learningSynthesis.getActiveAttemptForAgent(agentDid);
        const roi = this.economicsEngine.evaluateLearningOpportunity({
          agent: agentObj.profile,
          reputation: rep,
          balance: account?.balance ?? { available: 5000, lockedInEscrow: 0, totalEarned: 0, totalPenalties: 0 },
          gap: topGap,
          existingLearningAttemptsCount: activeAttempt ? 1 : 0,
        });

        if (roi.shouldLearn && !activeAttempt) {
          // Emit CAPABILITY_GAP_DETECTED
          const gapEvt = await signCivilizationEvent(
            {
              eventType: "CAPABILITY_GAP_DETECTED",
              missionId: "civ_evolution",
              authorDid: agentDid,
              payload: {
                gapId: topGap.gapId,
                targetCapability: topGap.targetCapability,
                origin: topGap.origin,
                severityScore: topGap.severityScore,
                estimatedMarketValue: topGap.estimatedMarketValue,
                sourceEventIds: topGap.sourceEventIds,
              },
            },
            agentObj.identity.signingHandle,
          );
          tickEvents.push(gapEvt);
          this.events.push(gapEvt);
          this.evolutionLedger.applyEvent(gapEvt);

          // Propose learning
          const attemptId = this.prng.generateId("lrn", 6);
          const profile = getVerificationProfileForCapability(topGap.targetCapability);
          const benchmarkSuite = this.benchmarkGenerator.generateBenchmarkSuite(profile);

          this.learningSynthesis.proposeLearningAttempt({
            attemptId,
            agentDid,
            targetCapability: topGap.targetCapability,
            baselineProficiency: 50,
            targetProficiency: 85,
            benchmarkSuite,
            timestamp: tickTimestamp,
          });

          const proposeEvt = await signCivilizationEvent(
            {
              eventType: "LEARNING_PROPOSED",
              missionId: "civ_evolution",
              authorDid: agentDid,
              payload: {
                attemptId,
                targetCapability: topGap.targetCapability,
                baselineProficiency: 50,
                targetProficiency: 85,
                learningFeeDeposit: 500,
                expectedRoiScore: roi.netRoiScore,
                rationale: roi.rationale,
              },
            },
            agentObj.identity.signingHandle,
          );
          tickEvents.push(proposeEvt);
          this.events.push(proposeEvt);
          this.evolutionLedger.applyEvent(proposeEvt);

          // Initiate Learning in progress
          this.learningSynthesis.startLearning(attemptId);
          const inProgEvt = await signCivilizationEvent(
            {
              eventType: "LEARNING_IN_PROGRESS",
              missionId: "civ_evolution",
              authorDid: agentDid,
              payload: {
                attemptId,
                targetCapability: topGap.targetCapability,
                benchmarkSuiteId: benchmarkSuite.suiteId,
                verificationProfileType: profile.profileType,
                maxSteps: benchmarkSuite.maxSteps,
              },
            },
            agentObj.identity.signingHandle,
          );
          tickEvents.push(inProgEvt);
          this.events.push(inProgEvt);
          this.evolutionLedger.applyEvent(inProgEvt);

          // Execute benchmark & evaluate through independent verifier
          const candidateVerifiers = Array.from(this.population.keys()).filter((did) => did !== agentDid);
          const verificationResult = this.capabilityVerifier.verifyCapability({
            attemptId,
            claimantDid: agentDid,
            targetCapability: topGap.targetCapability,
            benchmarkProofId: `proof_bm_${attemptId}`,
            profileMetrics: benchmarkSuite.expectedOutputMetrics,
            candidateVerifierDids: candidateVerifiers,
          });

          this.learningSynthesis.recordBenchmarkResult({
            attemptId,
            benchmarkProofId: `proof_bm_${attemptId}`,
            verifiedProficiency: verificationResult.verifiedProficiency,
            passed: verificationResult.passed,
            timestamp: tickTimestamp,
          });

          if (verificationResult.passed) {
            const verifierObj = this.population.get(verificationResult.verifierDid) ?? agentObj;

            // Emit CAPABILITY_VERIFIED
            const verifiedEvt = await signCivilizationEvent(
              {
                eventType: "CAPABILITY_VERIFIED",
                missionId: "civ_evolution",
                authorDid: verifierObj.identity.did,
                payload: {
                  attemptId,
                  targetCapability: topGap.targetCapability,
                  benchmarkProofId: `proof_bm_${attemptId}`,
                  verificationProfileType: profile.profileType,
                  verifiedProficiency: verificationResult.verifiedProficiency,
                  profileMetrics: { ...(benchmarkSuite.expectedOutputMetrics as Record<string, string | number | boolean>) },
                  verifierDid: verifierObj.identity.did,
                },
              },
              verifierObj.identity.signingHandle,
            );
            tickEvents.push(verifiedEvt);
            this.events.push(verifiedEvt);
            this.evolutionLedger.applyEvent(verifiedEvt);

            // Issue Attestation
            const attestationId = this.prng.generateId("att", 6);
            const attestationEvt = await this.attestationIssuer.emitSignedAttestationEvent({
              attestationId,
              issuerIdentity: verifierObj.identity,
              agentDid,
              capabilityName: topGap.targetCapability,
              claimedProficiency: 85,
              verifiedProficiency: verificationResult.verifiedProficiency,
              evidenceReferences: [gapEvt.eventId, inProgEvt.eventId, verifiedEvt.eventId],
              benchmarkProofId: `proof_bm_${attemptId}`,
              timestamp: tickTimestamp,
            });
            tickEvents.push(attestationEvt);
            this.events.push(attestationEvt);
            this.evolutionLedger.applyEvent(attestationEvt);

            // Dynamically upgrade agent's capability profile
            const currentCapabilities = agentObj.profile.capabilities;
            const updatedCapabilities = [
              ...currentCapabilities.filter((c) => c.name.toLowerCase() !== topGap.targetCapability),
              {
                name: topGap.targetCapability,
                proficiency: verificationResult.verifiedProficiency,
                evidenceReferences: [attestationId],
              },
            ];

            const updatedProfile: AgentProfile = {
              ...agentObj.profile,
              capabilities: updatedCapabilities,
            };
            this.population.set(agentDid, {
              identity: agentObj.identity,
              profile: updatedProfile,
            });

            // Phase 11 Step 1.A: Automatically broadcast signed CAPABILITY_ADVERTISED event
            const advertEvt = await signCivilizationEvent(
              {
                eventType: "CAPABILITY_ADVERTISED",
                missionId: "civ_evolution",
                authorDid: agentDid,
                payload: {
                  did: agentDid,
                  capability: {
                    name: topGap.targetCapability,
                    proficiency: verificationResult.verifiedProficiency,
                  },
                  evidenceEventId: attestationEvt.eventId,
                },
              },
              agentObj.identity.signingHandle,
            );
            tickEvents.push(advertEvt);
            this.events.push(advertEvt);
            this.economicLedger.applyEvent(advertEvt);

            // Adapt Strategy
            const adaptedStrategy = this.strategyEngine.adaptStrategy({
              agentDid,
              dimension: "BID_PRICING",
              newParameterValue: 1.15,
              justification: `Upgraded verified capability ${topGap.targetCapability} with proficiency ${verificationResult.verifiedProficiency}.`,
              basedOnEvidenceIds: [attestationId],
              timestamp: tickTimestamp,
            });

            const stratEvt = await signCivilizationEvent(
              {
                eventType: "STRATEGY_ADAPTED",
                missionId: "civ_evolution",
                authorDid: agentDid,
                payload: {
                  version: adaptedStrategy.version,
                  strategyDimension: adaptedStrategy.dimension,
                  previousParameter: String(adaptedStrategy.previousValue),
                  updatedParameter: String(adaptedStrategy.parameterValue),
                  justification: adaptedStrategy.justification,
                  basedOnEvidenceIds: adaptedStrategy.basedOnEvidenceIds,
                },
              },
              agentObj.identity.signingHandle,
            );
            tickEvents.push(stratEvt);
            this.events.push(stratEvt);
            this.evolutionLedger.applyEvent(stratEvt);
          }
        }
      }
    }

    // 6. Derive Graph & Metrics
    const trustGraph = ReputationProjectionEngine.deriveTrustGraph(this.events);
    const metrics = calculateWorldMetrics({
      tickCount: this.tickCount,
      totalEvents: this.events.length,
      totalMissionsGenerated: this.totalMissionsGenerated,
      specialistRecruitmentCount: this.specialistRecruitmentCount,
      teamReorganizationCount: this.teamReorganizationCount,
      population: this.population,
      activeMissions: this.activeMissions,
      completedMissions: this.completedMissions,
      failedMissions: this.failedMissions,
      activeTeamsCount: this.activeTeams.size,
      activeDisputesCount: this.activeDisputes.size,
      resolvedDisputesCount: this.resolvedDisputes.length,
      reputations: this.reputations,
      collaborationEdgesCount: trustGraph.edges.length,
    });

    const worldState: CivilizationWorldState = {
      worldId: this.worldId,
      currentTime: tickTimestamp,
      tick: this.tickCount,
      population: Object.freeze(new Map(this.population)),
      activeMissions: Object.freeze(new Map(this.activeMissions)),
      completedMissions: Object.freeze([...this.completedMissions]),
      failedMissions: Object.freeze([...this.failedMissions]),
      activeTeams: Object.freeze(new Map(this.activeTeams)),
      activeDisputes: Object.freeze(new Map(this.activeDisputes)),
      resolvedDisputes: Object.freeze([...this.resolvedDisputes]),
      reputations: Object.freeze(new Map(this.reputations)),
      trustGraph,
      recentEvents: Object.freeze(this.events.slice(-20)),
      metrics,
      economicState: this.economicLedger.getStateSnapshot(this.tickCount, tickTimestamp),
      evolutionState: this.evolutionLedger.getState(),
    };

    const trace: WorldTickTrace = {
      tick: this.tickCount,
      timestamp: tickTimestamp,
      awakenedAgentDids: Array.from(awakenedDidsSet),
      actionsAttempted,
      actionsAccepted,
      actionsRejected,
      eventsGenerated: Object.freeze(tickEvents),
      newMissions,
      newTeams,
      newDisputes,
      durationMs: Date.now() - startTime,
    };

    return {
      tick: this.tickCount,
      timestamp: tickTimestamp,
      events: Object.freeze(tickEvents),
      trace,
      worldState,
    };
  }

  /**
   * Captures an immutable world snapshot at the current state.
   */
  takeSnapshot(): WorldSnapshot {
    const state = this.getState();
    const snapshot = createWorldSnapshot(state, this.events.length);
    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Restores world state from a previous snapshot.
   */
  restoreFromSnapshot(snapshot: WorldSnapshot): void {
    const restored = restoreWorldFromSnapshot(snapshot);
    this.tickCount = restored.tick;
    this.clock.setTime(restored.currentTime);
    this.population = new Map(restored.population);
    this.activeMissions = new Map(restored.activeMissions);
    this.completedMissions = [...restored.completedMissions];
    this.failedMissions = [...restored.failedMissions];
    this.activeTeams = new Map(restored.activeTeams);
    this.activeDisputes = new Map(restored.activeDisputes);
    this.resolvedDisputes = [...restored.resolvedDisputes];
    this.reputations = new Map(restored.reputations);
    this.events = this.events.slice(0, snapshot.eventIndex);
  }

  /**
   * Time-Travel Engine: Replays events up to a target timestamp.
   */
  timeTravel(targetTimestamp: IsoUtcTimestamp): CivilizationWorldState {
    const targetEpoch = new Date(targetTimestamp).getTime();
    const filteredEvents = this.events.filter((e) => new Date(e.timestamp).getTime() <= targetEpoch);

    // Replay through pure state reducer
    let reducedState = createInitialCivilizationState();
    const timeTravelLedger = new EconomicLedger();
    const timeTravelEvolution = new EvolutionLedger();
    for (const evt of filteredEvents) {
      reducedState = reduceCivilizationState(reducedState, evt);
      timeTravelLedger.applyEvent(evt);
      timeTravelEvolution.applyEvent(evt);
    }

    const trustGraph = ReputationProjectionEngine.deriveTrustGraph(filteredEvents);
    const metrics = calculateWorldMetrics({
      tickCount: this.tickCount,
      totalEvents: filteredEvents.length,
      totalMissionsGenerated: this.totalMissionsGenerated,
      specialistRecruitmentCount: this.specialistRecruitmentCount,
      teamReorganizationCount: this.teamReorganizationCount,
      population: this.population,
      activeMissions: this.activeMissions,
      completedMissions: this.completedMissions,
      failedMissions: this.failedMissions,
      activeTeamsCount: this.activeTeams.size,
      activeDisputesCount: this.activeDisputes.size,
      resolvedDisputesCount: this.resolvedDisputes.length,
      reputations: this.reputations,
      collaborationEdgesCount: trustGraph.edges.length,
    });

    return {
      worldId: this.worldId,
      currentTime: targetTimestamp,
      tick: this.tickCount,
      population: Object.freeze(new Map(this.population)),
      activeMissions: Object.freeze(new Map(this.activeMissions)),
      completedMissions: Object.freeze([...this.completedMissions]),
      failedMissions: Object.freeze([...this.failedMissions]),
      activeTeams: Object.freeze(new Map(this.activeTeams)),
      activeDisputes: Object.freeze(new Map(this.activeDisputes)),
      resolvedDisputes: Object.freeze([...this.resolvedDisputes]),
      reputations: Object.freeze(new Map(this.reputations)),
      trustGraph,
      recentEvents: Object.freeze(filteredEvents.slice(-20)),
      metrics,
      economicState: timeTravelLedger.getStateSnapshot(this.tickCount, targetTimestamp),
      evolutionState: timeTravelEvolution.getState(),
    };
  }

  getState(): CivilizationWorldState {
    const trustGraph = ReputationProjectionEngine.deriveTrustGraph(this.events);
    const metrics = calculateWorldMetrics({
      tickCount: this.tickCount,
      totalEvents: this.events.length,
      totalMissionsGenerated: this.totalMissionsGenerated,
      specialistRecruitmentCount: this.specialistRecruitmentCount,
      teamReorganizationCount: this.teamReorganizationCount,
      population: this.population,
      activeMissions: this.activeMissions,
      completedMissions: this.completedMissions,
      failedMissions: this.failedMissions,
      activeTeamsCount: this.activeTeams.size,
      activeDisputesCount: this.activeDisputes.size,
      resolvedDisputesCount: this.resolvedDisputes.length,
      reputations: this.reputations,
      collaborationEdgesCount: trustGraph.edges.length,
    });

    return {
      worldId: this.worldId,
      currentTime: this.clock.currentTime,
      tick: this.tickCount,
      population: Object.freeze(new Map(this.population)),
      activeMissions: Object.freeze(new Map(this.activeMissions)),
      completedMissions: Object.freeze([...this.completedMissions]),
      failedMissions: Object.freeze([...this.failedMissions]),
      activeTeams: Object.freeze(new Map(this.activeTeams)),
      activeDisputes: Object.freeze(new Map(this.activeDisputes)),
      resolvedDisputes: Object.freeze([...this.resolvedDisputes]),
      reputations: Object.freeze(new Map(this.reputations)),
      trustGraph,
      recentEvents: Object.freeze(this.events.slice(-20)),
      metrics,
      economicState: this.economicLedger.getStateSnapshot(this.tickCount, this.clock.currentTime),
      evolutionState: this.evolutionLedger.getState(),
    };
  }
}
