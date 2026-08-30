/**
 * Deterministic Simulation Clock & Seeded PRNG.
 *
 * Provides reproducible, virtual time progression for simulations, time travel,
 * and deterministic randomized decisions without wall-clock dependency.
 */

import type { IsoUtcTimestamp } from "../types/common.ts";
import type { ClockInterface } from "./types.ts";

export class SimulationClock implements ClockInterface {
  private currentEpochMs: number;

  constructor(initialTime: IsoUtcTimestamp = "2026-09-01T00:00:00.000Z") {
    this.currentEpochMs = new Date(initialTime).getTime();
  }

  get currentTime(): IsoUtcTimestamp {
    return new Date(this.currentEpochMs).toISOString();
  }

  now(): IsoUtcTimestamp {
    return this.currentTime;
  }

  advance(durationMs: number): IsoUtcTimestamp {
    if (durationMs < 0) {
      throw new Error("SimulationClock: Cannot advance backwards with negative durationMs.");
    }
    this.currentEpochMs += durationMs;
    return this.currentTime;
  }

  setTime(time: IsoUtcTimestamp): void {
    const parsed = new Date(time).getTime();
    if (Number.isNaN(parsed)) {
      throw new Error(`SimulationClock: Invalid ISO UTC timestamp '${time}'.`);
    }
    this.currentEpochMs = parsed;
  }
}

export class LiveClock implements ClockInterface {
  get currentTime(): IsoUtcTimestamp {
    return new Date().toISOString();
  }

  now(): IsoUtcTimestamp {
    return this.currentTime;
  }

  advance(durationMs: number): IsoUtcTimestamp {
    void durationMs;
    // Live clock adheres to real-world time; advance is a no-op returning current time
    return this.currentTime;
  }

  setTime(time: IsoUtcTimestamp): void {
    void time;
    // Live clock cannot be manually overridden
  }
}

/**
 * Seeded Mulberry32 Pseudo-Random Number Generator.
 * Guarantees 100% deterministic float and integer generation across environments.
 */
export class SeededPrng {
  private state: number;

  constructor(seed: number | string) {
    if (typeof seed === "string") {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      this.state = hash >>> 0;
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) this.state = 1;
  }

  /**
   * Generates a deterministic float in [0, 1).
   */
  nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a deterministic integer in [min, max] inclusive.
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }

  /**
   * Deterministically picks an item from a list.
   */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("SeededPrng: Cannot pick from empty array.");
    }
    const idx = this.nextInt(0, items.length - 1);
    return items[idx]!;
  }

  /**
   * Deterministically generates a hex-prefixed ID using PRNG state.
   */
  generateId(prefix: string, length = 8): string {
    let hex = "";
    for (let i = 0; i < length; i++) {
      hex += this.nextInt(0, 15).toString(16);
    }
    return `${prefix}_${hex}`;
  }
}
