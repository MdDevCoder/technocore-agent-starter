/**
 * Secret-Safe Operational Telemetry & Observability Manager.
 *
 * Tracks gateway throughput, failure classifications, rate limit events, latency,
 * and active agent populations while guaranteeing 0% secret leakage into logs or telemetry.
 */

export interface NetworkHealthMetrics {
  readonly uptimeSeconds: number;
  readonly totalIngested: number;
  readonly totalPersisted: number;
  readonly totalRejected: number;
  readonly signatureFailures: number;
  readonly rateLimitHits: number;
  readonly policyRejections: number;
  readonly replayAttempts: number;
  readonly uniqueActiveDids: number;
  readonly averageLatencyMs: number;
  readonly headSequence: number;
  readonly activeSubscribers: number;
  readonly timestamp: string;
}

export class NetworkObservabilityManager {
  private static instance: NetworkObservabilityManager | null = null;

  private readonly startTime = Date.now();
  private totalIngested = 0;
  private totalPersisted = 0;
  private totalRejected = 0;
  private signatureFailures = 0;
  private rateLimitHits = 0;
  private policyRejections = 0;
  private replayAttempts = 0;
  private readonly activeDids = new Set<string>();
  private totalLatencyMs = 0;
  private latencyCount = 0;
  private headSequence = 0;

  public static getInstance(): NetworkObservabilityManager {
    if (!NetworkObservabilityManager.instance) {
      NetworkObservabilityManager.instance = new NetworkObservabilityManager();
    }
    return NetworkObservabilityManager.instance;
  }

  public recordIngestionAttempt(actorDid?: string): void {
    this.totalIngested++;
    if (actorDid && actorDid.startsWith("did:key:")) {
      this.activeDids.add(actorDid);
    }
  }

  public recordPersisted(sequenceNum: number, durationMs: number): void {
    this.totalPersisted++;
    this.headSequence = Math.max(this.headSequence, sequenceNum);
    this.recordLatency(durationMs);
  }

  public recordRejection(reason: "SIGNATURE" | "RATE_LIMIT" | "POLICY" | "REPLAY" | "OTHER", durationMs?: number): void {
    this.totalRejected++;
    switch (reason) {
      case "SIGNATURE":
        this.signatureFailures++;
        break;
      case "RATE_LIMIT":
        this.rateLimitHits++;
        break;
      case "POLICY":
        this.policyRejections++;
        break;
      case "REPLAY":
        this.replayAttempts++;
        break;
    }
    if (durationMs !== undefined) {
      this.recordLatency(durationMs);
    }
  }

  private recordLatency(durationMs: number): void {
    this.totalLatencyMs += durationMs;
    this.latencyCount++;
  }

  public getMetrics(activeSubscribers = 0): NetworkHealthMetrics {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const averageLatencyMs = this.latencyCount > 0 ? Number((this.totalLatencyMs / this.latencyCount).toFixed(2)) : 0;

    return {
      uptimeSeconds,
      totalIngested: this.totalIngested,
      totalPersisted: this.totalPersisted,
      totalRejected: this.totalRejected,
      signatureFailures: this.signatureFailures,
      rateLimitHits: this.rateLimitHits,
      policyRejections: this.policyRejections,
      replayAttempts: this.replayAttempts,
      uniqueActiveDids: this.activeDids.size,
      averageLatencyMs,
      headSequence: this.headSequence,
      activeSubscribers,
      timestamp: new Date().toISOString(),
    };
  }

  public reset(): void {
    this.totalIngested = 0;
    this.totalPersisted = 0;
    this.totalRejected = 0;
    this.signatureFailures = 0;
    this.rateLimitHits = 0;
    this.policyRejections = 0;
    this.replayAttempts = 0;
    this.activeDids.clear();
    this.totalLatencyMs = 0;
    this.latencyCount = 0;
    this.headSequence = 0;
  }
}
