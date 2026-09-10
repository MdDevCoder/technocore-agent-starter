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

import { PublicObservationStore } from "../network/observation-store.ts";
import { PublicNetworkIndexer } from "../network/public-network-indexer.ts";

let globalStore: CivilizationEventStore | null = null;
let globalGateway: EventIngestionGateway | null = null;
let globalObservationStore: PublicObservationStore | null = null;
let globalIndexer: PublicNetworkIndexer | null = null;

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
  globalObservationStore = null;
  globalIndexer = null;
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

export function getServerObservationStore(): PublicObservationStore {
  if (!globalObservationStore) {
    const store = getServerEventStore();
    if (store instanceof SqlEventStore) {
      globalObservationStore = new PublicObservationStore(store.getDbAdapter());
    } else {
      // For in-memory store or fallback, create in-memory SQLite adapter for observations
      const memAdapter = new SqliteDatabaseAdapter(":memory:");
      globalObservationStore = new PublicObservationStore(memAdapter);
    }
  }
  return globalObservationStore;
}

export function getServerNetworkIndexer(): PublicNetworkIndexer {
  if (!globalIndexer) {
    const observationStore = getServerObservationStore();
    const store = getServerEventStore();

    // Promotion callback: promotes verified protocol events to the event store
    const promotionCallback = async (record: { text: string; did: string | null; protocolClassification: string }) => {
      try {
        if (record.protocolClassification === "CIVILIZATION_EVENT") {
          const parsed = JSON.parse(record.text);
          const receipt = await store.append(parsed);
          return receipt.status === "PERSISTED" ? receipt.eventId : null;
        }
      } catch {
        // Safe ignore
      }
      return null;
    };

    globalIndexer = new PublicNetworkIndexer(observationStore, {
      promotionCallback,
    });
  }
  return globalIndexer;
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
  if (globalIndexer) {
    await globalIndexer.stop();
    globalIndexer = null;
  }
  globalObservationStore = null;
  if (globalStore) {
    await globalStore.close();
    globalStore = null;
  }
  globalGateway = null;
}

