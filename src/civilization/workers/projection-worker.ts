/**
 * Asynchronous Background Projection Worker.
 *
 * Decouples heavy civilization projection materialization (Economy, Court, Discovery, Reputation)
 * from the synchronous HTTP ingestion gateway.
 * Processes event batches in sequence order, maintains persistent checkpoints in SQL,
 * and recovers gracefully after process crashes.
 */

import { DeterministicProjectionEngine, type ProjectedCivilizationState } from "../projections/engine.ts";
import type { CivilizationEventStore } from "../persistence/types.ts";

export interface ProjectionWorkerConfig {
  readonly workerId: string;
  readonly batchSize: number;
  readonly pollIntervalMs: number;
}

export class BackgroundProjectionWorker {
  private readonly store: CivilizationEventStore;
  private readonly engine: DeterministicProjectionEngine;
  private readonly config: ProjectionWorkerConfig;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastProcessedSequence = 0;

  constructor(store: CivilizationEventStore, config?: Partial<ProjectionWorkerConfig>) {
    this.store = store;
    this.config = {
      workerId: config?.workerId ?? "master_background_worker",
      batchSize: config?.batchSize ?? 50,
      pollIntervalMs: config?.pollIntervalMs ?? 500,
    };
    this.engine = new DeterministicProjectionEngine(store, this.config.workerId);
  }

  /**
   * Initializes checkpoint state from persistent store.
   */
  public async init(): Promise<void> {
    await this.engine.initialize();
    const checkpoint = await this.store.getCheckpoint(this.config.workerId);
    this.lastProcessedSequence = checkpoint?.lastSequenceNum ?? 0;
  }

  /**
   * Performs a single batch synchronization tick.
   * Returns the count of events processed in this batch.
   */
  public async syncOnce(): Promise<number> {
    const headSequence = await this.store.getHeadSequence();
    if (this.lastProcessedSequence >= headSequence) {
      return 0;
    }

    const events = await this.store.getAfterSequence(this.lastProcessedSequence, this.config.batchSize);
    if (events.length === 0) {
      return 0;
    }

    for (const event of events) {
      this.engine.applyEvent(event);
      this.lastProcessedSequence = event.sequenceNum;
    }

    // Persist checkpoint to SQL
    await this.store.saveCheckpoint({
      projectionName: this.config.workerId,
      lastSequenceNum: this.lastProcessedSequence,
      updatedAt: new Date().toISOString(),
    });

    return events.length;
  }

  /**
   * Starts continuous background polling.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.syncOnce();
      } catch (err) {
        console.warn(`[BackgroundProjectionWorker] Error during sync tick:`, err);
      }

      if (this.isRunning) {
        this.pollTimer = setTimeout(loop, this.config.pollIntervalMs);
      }
    };

    loop().catch((err) => {
      console.error("[BackgroundProjectionWorker] Unhandled loop error:", err);
    });
  }

  /**
   * Stops background polling.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public getProjectionState(): ProjectedCivilizationState {
    return this.engine.getState();
  }

  public getLastProcessedSequence(): number {
    return this.lastProcessedSequence;
  }

  public async getProjectionLag(): Promise<number> {
    const head = await this.store.getHeadSequence();
    return Math.max(0, head - this.lastProcessedSequence);
  }

  public getEngine(): DeterministicProjectionEngine {
    return this.engine;
  }
}
