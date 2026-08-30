/**
 * Token-Bucket Rate Limiter for Gateway Ingestion.
 *
 * Enforces per-DID and per-IP rate limits with configurable burst capacity and refill rate.
 * Prevents DoS floods and spamming while allowing burst traffic for multi-step agent proposals.
 */

export interface RateLimitConfig {
  /** Maximum burst tokens (default: 60) */
  readonly capacity: number;
  /** Tokens added per second (default: 1.0 = 60/min) */
  readonly refillRatePerSecond: number;
  /** Window for rate limiting cleanup in ms (default: 60,000ms) */
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remainingTokens: number;
  readonly resetMs: number;
  readonly limit: number;
}

interface Bucket {
  tokens: number;
  lastRefillTimestampMs: number;
}

export class TokenBucketRateLimiter {
  private readonly config: RateLimitConfig;
  private readonly buckets = new Map<string, Bucket>();

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      capacity: config?.capacity ?? 60,
      refillRatePerSecond: config?.refillRatePerSecond ?? 1.0,
      windowMs: config?.windowMs ?? 60_000,
    };
  }

  /**
   * Evaluates rate limit for a specific identifier (DID or IP address).
   * Atomically consumes 1 token if available.
   */
  public checkAndConsume(key: string, nowMs = Date.now()): RateLimitResult {
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: this.config.capacity,
        lastRefillTimestampMs: nowMs,
      };
      this.buckets.set(key, bucket);
    } else {
      // Calculate token refill
      const elapsedSeconds = Math.max(0, (nowMs - bucket.lastRefillTimestampMs) / 1000);
      const tokensToAdd = elapsedSeconds * this.config.refillRatePerSecond;
      bucket.tokens = Math.min(this.config.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefillTimestampMs = nowMs;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      const tokensNeededForFull = this.config.capacity - bucket.tokens;
      const resetMs = Math.ceil((tokensNeededForFull / this.config.refillRatePerSecond) * 1000);

      return {
        allowed: true,
        remainingTokens: Math.floor(bucket.tokens),
        resetMs,
        limit: this.config.capacity,
      };
    }

    const resetMs = Math.ceil(((1 - bucket.tokens) / this.config.refillRatePerSecond) * 1000);
    return {
      allowed: false,
      remainingTokens: 0,
      resetMs,
      limit: this.config.capacity,
    };
  }

  /**
   * Resets rate limit for a key (useful in tests).
   */
  public reset(key?: string): void {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }

  /**
   * Cleans up stale buckets older than the window.
   */
  public cleanup(nowMs = Date.now()): void {
    for (const [key, bucket] of this.buckets.entries()) {
      if (nowMs - bucket.lastRefillTimestampMs > this.config.windowMs && bucket.tokens >= this.config.capacity) {
        this.buckets.delete(key);
      }
    }
  }
}
