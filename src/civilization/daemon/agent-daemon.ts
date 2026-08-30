/**
 * Production Agent Daemon.
 *
 * Runs an independent, autonomous agent citizen outside the Next.js civilization process.
 * Enforces the strict zero-key-exposure security invariant: all cryptographic signing
 * occurs locally via non-extractable SigningHandles before network transmission.
 */

import { importIdentitySession } from "../../identity/session.ts";
import { createAgentIdentity, type AgentIdentity } from "../agent/identity.ts";
import { signCivilizationEvent } from "../events/signer.ts";
import { UnifiedAgentRuntime } from "../runtime/agent.ts";
import { MockLLMAdapter } from "../runtime/providers/mock.ts";
import { transformActionToSignedEvent } from "../runtime/signing-boundary.ts";
import type { AgentAction, AgentContext } from "../runtime/types.ts";
import { validateAgentAction } from "../runtime/validator.ts";
import type { CivilizationEvent } from "../types/events.ts";
import type { EventStoreReceipt, StoredCivilizationEvent } from "../persistence/types.ts";
import { DaemonCursorManager } from "./cursor.ts";
import { defaultAgentReputation, type AgentCapability } from "../types/agent.ts";
import type { AgentDaemonConfig, DaemonMetrics, DaemonState } from "./types.ts";

export class AgentDaemon {
  private readonly config: AgentDaemonConfig;
  private state: DaemonState = "UNINITIALIZED";
  private identity: AgentIdentity | null = null;
  private readonly capabilities: readonly AgentCapability[];
  private runtime: UnifiedAgentRuntime | null = null;
  private cursorManager: DaemonCursorManager | null = null;
  private headSequence = 0;
  private submittedEventsCount = 0;
  private consecutiveErrors = 0;
  private abortController: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;
  private readonly syncedEvents: StoredCivilizationEvent[] = [];

  constructor(config: AgentDaemonConfig) {
    this.config = config;
    this.capabilities = config.capabilities ? [...config.capabilities] : [{ name: "typescript", proficiency: 85 }];
  }

  /**
   * Initializes and unlocks the daemon's local identity and signing handle.
   */
  async boot(): Promise<void> {
    if (this.state !== "UNINITIALIZED" && this.state !== "STOPPED") {
      return;
    }
    this.state = "INITIALIZING";

    // 1. Resolve Identity
    if (this.config.identity) {
      this.identity = this.config.identity;
    } else if (this.config.identitySession) {
      this.identity = {
        agentId: `agt_${this.config.identitySession.identity.did.slice(-8)}`,
        did: this.config.identitySession.identity.did,
        displayName: this.config.displayName ?? `Agent ${this.config.identitySession.identity.did.slice(0, 12)}`,
        role: this.config.role ?? "Autonomous Citizen",
        signingHandle: this.config.identitySession.handle,
        createdAt: this.config.identitySession.identity.createdAt,
        metadata: {},
      };
    } else if (this.config.backupEnvelope && this.config.backupPassphrase) {
      // Restore from encrypted backup locally
      const session = await importIdentitySession(
        this.config.backupEnvelope,
        this.config.backupPassphrase,
      );
      this.identity = {
        agentId: `agt_${session.identity.did.slice(-8)}`,
        did: session.identity.did,
        displayName: this.config.displayName ?? `Agent ${session.identity.did.slice(0, 12)}`,
        role: this.config.role ?? "Autonomous Citizen",
        signingHandle: session.handle,
        createdAt: session.identity.createdAt,
        metadata: {},
      };
    } else {
      // Auto-generate fresh local identity
      this.identity = await createAgentIdentity({
        displayName: this.config.displayName ?? "Autonomous Agent",
        role: this.config.role ?? "Specialist",
      });
    }

    // 2. Initialize Cursor Manager
    this.cursorManager = new DaemonCursorManager(
      this.identity.did,
      this.config.cursorStoragePath,
    );
    await this.cursorManager.load();

    // 3. Initialize Runtime
    const provider = this.config.provider ?? new MockLLMAdapter();
    this.runtime = new UnifiedAgentRuntime({
      identity: this.identity,
      provider,
    });

    // 4. Initial Sync with Gateway
    await this.sync();

    // 5. Ensure Initial Profile Discovery & Capability Advertisement
    await this.announcePresenceIfMissing();

    this.state = "IDLE";
  }

  /**
   * Synchronizes newly committed civilization events from the remote gateway.
   */
  async sync(signal?: AbortSignal): Promise<readonly StoredCivilizationEvent[]> {
    if (!this.cursorManager) {
      throw new Error("Daemon must be booted before synchronizing");
    }

    const previousState = this.state;
    this.state = "SYNCING";

    try {
      const currentCursor = this.cursorManager.getCursor();
      const syncResult = await this.config.client.fetchEvents(
        {
          after: currentCursor.lastAcknowledgedSequence,
          limit: this.config.syncBatchLimit ?? 50,
        },
        signal,
      );

      this.headSequence = syncResult.headSequence;
      const newEvents = syncResult.events;

      if (newEvents.length > 0) {
        for (const evt of newEvents) {
          this.syncedEvents.push(evt);
        }

        const highestSeq = Math.max(...newEvents.map((e) => e.sequenceNum));
        const lastEvtId = newEvents[newEvents.length - 1]!.eventId;
        await this.cursorManager.update(highestSeq, lastEvtId);
      }

      this.consecutiveErrors = 0;
      return newEvents;
    } catch (err) {
      this.consecutiveErrors++;
      throw err;
    } finally {
      this.state = previousState === "SYNCING" ? "IDLE" : previousState;
    }
  }

  /**
   * Announces AGENT_DISCOVERED and CAPABILITY_ADVERTISED events to the network
   * if the agent has not yet appeared in the event stream.
   */
  private async announcePresenceIfMissing(): Promise<void> {
    if (!this.identity) return;

    const alreadyDiscovered = this.syncedEvents.some(
      (e) => e.eventType === "AGENT_DISCOVERED" && (e.authorDid === this.identity!.did || (e.payload as { did?: string })?.did === this.identity!.did),
    );

    if (!alreadyDiscovered) {
      // 1. Locally sign AGENT_DISCOVERED event
      const discoveryEvent = await signCivilizationEvent(
        {
          eventType: "AGENT_DISCOVERED",
          missionId: "mis_genesis",
          authorDid: this.identity.did,
          payload: {
            agentId: this.identity.agentId,
            did: this.identity.did,
            displayName: this.identity.displayName,
            role: this.identity.role,
            capabilities: [...this.capabilities],
          },
        },
        this.identity.signingHandle,
      );

      const receipt1 = await this.config.client.submitEvent(discoveryEvent);
      if (this.cursorManager) {
        await this.cursorManager.update(receipt1.sequenceNum, discoveryEvent.eventId);
      }
      this.submittedEventsCount++;

      // 2. Locally sign CAPABILITY_ADVERTISED event
      const adEvent = await signCivilizationEvent(
        {
          eventType: "CAPABILITY_ADVERTISED",
          missionId: "mis_genesis",
          authorDid: this.identity.did,
          payload: {
            did: this.identity.did,
            capability: this.capabilities[0] ?? { name: "typescript", proficiency: 85 },
          },
        },
        this.identity.signingHandle,
      );

      const receipt2 = await this.config.client.submitEvent(adEvent);
      if (this.cursorManager) {
        await this.cursorManager.update(receipt2.sequenceNum, adEvent.eventId);
      }
      this.submittedEventsCount++;
    }
  }

  /**
   * Executes one autonomous observe-decide-validate-sign-submit step.
   */
  async step(signal?: AbortSignal): Promise<{
    readonly action: AgentAction | null;
    readonly event: CivilizationEvent | null;
    readonly receipt: EventStoreReceipt | null;
  }> {
    if (!this.identity || !this.runtime || !this.cursorManager) {
      throw new Error("Daemon must be booted before executing step");
    }

    try {
      // 1. Sync latest events
      await this.sync(signal);

      // 2. Construct bounded AgentContext
      const recentEvents = this.syncedEvents.slice(-20);
      const missionEvt = recentEvents
        .slice()
        .reverse()
        .find((e) => e.eventType === "MISSION_CREATED");
      const activeMission = missionEvt
        ? ({
            missionId: missionEvt.missionId,
            ...(missionEvt.payload as unknown as Record<string, unknown>),
          } as unknown as AgentContext["activeMission"])
        : undefined;

      const now = new Date().toISOString();
      const context: AgentContext = {
        agentDid: this.identity.did,
        profile: {
          agentId: this.identity.agentId,
          did: this.identity.did,
          displayName: this.identity.displayName,
          role: this.identity.role,
          capabilities: [...this.capabilities],
          availability: "available",
          workload: { activeMissions: 0, activeTasks: 0, maxConcurrentTasks: 3 },
          createdAt: this.identity.createdAt,
          metadata: this.identity.metadata,
        },
        reputation: defaultAgentReputation(this.identity.did, now),
        activeMission,
        relevantTasks: [],
        activeTeamMembers: [],
        recentEvents,
        availableCapabilities: this.capabilities.map((c) => c.name),
        contextTimestamp: now,
        provenanceMap: new Map(),
      };

      // 3. Observe
      this.state = "OBSERVING";
      await this.runtime.observe(context);

      // 4. Decide
      this.state = "DECIDING";
      const unsignedAction = await this.runtime.decide(context);

      if (!unsignedAction || unsignedAction.actionType === "OBSERVE") {
        this.state = "IDLE";
        return { action: unsignedAction ?? null, event: null, receipt: null };
      }

      // 5. Local Validation Boundary
      const validation = validateAgentAction(unsignedAction, context);
      if (!validation.valid) {
        console.warn(`[AgentDaemon] Action failed local validation: ${validation.error}`);
        this.state = "IDLE";
        return { action: unsignedAction, event: null, receipt: null };
      }

      // 6. Local Signing Boundary (Private key never leaves process)
      this.state = "SIGNING";
      const parentEventIds = recentEvents.slice(-3).map((e) => e.eventId);
      const signedEvent = await transformActionToSignedEvent(
        unsignedAction,
        this.identity,
        parentEventIds,
      );

      if (!signedEvent) {
        this.state = "IDLE";
        return { action: unsignedAction, event: null, receipt: null };
      }

      // 7. Submit Signed Event to Remote Gateway
      this.state = "SUBMITTING";
      const receipt = await this.config.client.submitEvent(signedEvent, { signal });

      // 8. Update Local Cursor
      await this.cursorManager.update(receipt.sequenceNum, signedEvent.eventId);
      this.submittedEventsCount++;
      this.consecutiveErrors = 0;
      this.state = "IDLE";

      return {
        action: unsignedAction,
        event: signedEvent,
        receipt,
      };
    } catch (err) {
      this.state = "ERROR";
      this.consecutiveErrors++;
      throw err;
    }
  }

  /**
   * Starts the continuous autonomous daemon loop.
   */
  start(options: { readonly intervalMs?: number; readonly maxSteps?: number } = {}): void {
    if (this.abortController) {
      return; // Already running
    }

    this.abortController = new AbortController();
    const intervalMs = options.intervalMs ?? this.config.stepIntervalMs ?? 1000;
    const maxSteps = options.maxSteps ?? Infinity;

    this.loopPromise = (async () => {
      let stepCount = 0;
      while (!this.abortController?.signal.aborted && stepCount < maxSteps) {
        stepCount++;
        try {
          await this.step(this.abortController?.signal);
        } catch (err) {
          if (this.abortController?.signal.aborted) break;
          console.error(`[AgentDaemon] Error during daemon step ${stepCount}:`, err);
        }

        if (this.abortController?.signal.aborted) break;
        await new Promise((res) => setTimeout(res, intervalMs));
      }
    })();
  }

  /**
   * Stops the autonomous daemon loop.
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    this.state = "STOPPED";
  }

  /**
   * Exports safe public telemetry for Observatory visualization.
   * STRICT GUARANTEE: Zero private keys, seeds, or confidential handles are exported.
   */
  exportTelemetry(): DaemonMetrics {
    const currentSeq = this.cursorManager ? this.cursorManager.getCursor().lastAcknowledgedSequence : 0;
    const lag = Math.max(0, this.headSequence - currentSeq);

    return Object.freeze({
      did: this.identity ? this.identity.did : "did:key:uninitialized",
      displayName: this.identity ? this.identity.displayName : "Uninitialized",
      role: this.identity ? this.identity.role : "Unknown",
      state: this.state,
      lastAcknowledgedSequence: currentSeq,
      headSequence: this.headSequence,
      syncLag: lag,
      submittedEventsCount: this.submittedEventsCount,
      lastSeen: new Date().toISOString(),
      consecutiveErrors: this.consecutiveErrors,
    });
  }

  getIdentity(): AgentIdentity | null {
    return this.identity;
  }

  getState(): DaemonState {
    return this.state;
  }

  getAcknowledgedSequence(): number {
    return this.cursorManager ? this.cursorManager.getCursor().lastAcknowledgedSequence : 0;
  }

  getHeadSequence(): number {
    return this.headSequence;
  }
}
