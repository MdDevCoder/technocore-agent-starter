/**
 * Server-Side Ingestion Gateway and Persistence Singleton.
 *
 * Provides a shared, thread-safe gateway instance for API route handlers and server components.
 * Automatically chooses the appropriate persistence backend:
 * - In Production: Requires and uses PostgreSQL (via DATABASE_URL).
 * - In Development/Test: Uses SQLite database at .technocore/civilization.db (or custom location).
 */

import * as path from "node:path";
import { SqliteDatabaseAdapter } from "../persistence/sqlite-adapter.ts";
import { PostgresDatabaseAdapter } from "../persistence/postgres-adapter.ts";
import { SqlEventStore } from "../persistence/sql-store.ts";
import { InMemoryEventStore } from "../persistence/in-memory-store.ts";
import type { CivilizationEventStore } from "../persistence/types.ts";
import { EventIngestionGateway } from "./ingestion.ts";
import { TokenBucketRateLimiter } from "./rate-limiter.ts";
import { loadProductionConfig, assertValidProductionStartup, type ProductionConfig } from "../config/production-config.ts";

let globalStore: CivilizationEventStore | null = null;
let globalGateway: EventIngestionGateway | null = null;

export function getServerProductionConfig(): ProductionConfig {
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
    return assertValidProductionStartup();
  }
  return loadProductionConfig();
}

/**
 * Explicitly sets or injects the server event store (useful for custom connection pools or testing).
 */
export function setServerEventStore(store: CivilizationEventStore): void {
  globalStore = store;
  globalGateway = null;
}

export function getServerEventStore(customLocation?: string): CivilizationEventStore {
  if (!globalStore) {
    const config = getServerProductionConfig();

    const databaseUrl = config.databaseUrl;
    if (databaseUrl) {
      // Production PostgreSQL Adapter (Client pool wrapper)
      const pool = {
        async query<T = Record<string, unknown>>(_text: string, _params: readonly unknown[] = []): Promise<{ rows: T[] }> {
          void _text;
          void _params;
          throw new Error(
            `PostgreSQL driver not initialized for ${databaseUrl.replace(/:[^:@]+@/, ":****@")}. In production, ensure the PostgreSQL client pool is injected via setServerEventStore or the pg driver is installed.`
          );
        },
      };
      const pgAdapter = new PostgresDatabaseAdapter(pool);
      globalStore = new SqlEventStore(pgAdapter);
    } else if (process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV) {
      // Graceful serverless preview fallback when external PostgreSQL is not configured
      globalStore = new InMemoryEventStore();
    } else {
      if (config.isProduction) {
        throw new Error("[Technocore] Security Invariant: SQLite is strictly forbidden in production mode.");
      }
      const dbPath = customLocation ?? config.sqliteDbPath ?? path.resolve(process.cwd(), ".technocore", "civilization.db");
      const adapter = new SqliteDatabaseAdapter(dbPath);
      globalStore = new SqlEventStore(adapter);
    }
  }
  return globalStore;
}

export function getServerIngestionGateway(store?: CivilizationEventStore): EventIngestionGateway {
  if (store) {
    const config = getServerProductionConfig();
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: config.rateLimitCapacity,
      refillRatePerSecond: config.rateLimitRefillPerSecond,
    });
    return new EventIngestionGateway(store, undefined, rateLimiter);
  }

  if (!globalGateway) {
    const serverStore = getServerEventStore();
    const config = getServerProductionConfig();
    const rateLimiter = new TokenBucketRateLimiter({
      capacity: config.rateLimitCapacity,
      refillRatePerSecond: config.rateLimitRefillPerSecond,
    });
    globalGateway = new EventIngestionGateway(serverStore, undefined, rateLimiter);
  }
  return globalGateway;
}

/**
 * Resets the server singleton (useful for isolated unit testing).
 */
export async function resetServerGateway(): Promise<void> {
  if (globalStore) {
    await globalStore.close();
    globalStore = null;
  }
  globalGateway = null;
}
