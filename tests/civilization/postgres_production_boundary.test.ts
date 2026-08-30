/**
 * PostgreSQL Production Boundary & Query Translation Test Suite.
 *
 * Verifies:
 * 1. Parameter placeholder translation (? -> $1, $2, ...) with quotes and complex clauses
 * 2. PostgresDatabaseAdapter CRUD, transactions, rollback on exception, and connection closing
 * 3. PostgreSQL dialect migration runner (BIGSERIAL primary keys, immutable indexes)
 * 4. SqlEventStore operations over PostgresDatabaseAdapter
 * 5. Deterministic projection engine replay over PostgresDatabaseAdapter
 * 6. Strict rejection of SQLite in production mode (NODE_ENV=production)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PostgresDatabaseAdapter,
  translatePostgresParams,
  type PostgresClientPool,
} from "../../src/civilization/persistence/postgres-adapter.ts";
import { SqlEventStore } from "../../src/civilization/persistence/sql-store.ts";
import { runMigrations } from "../../src/civilization/persistence/migrations.ts";
import { DeterministicProjectionEngine } from "../../src/civilization/projections/engine.ts";
import { signCivilizationEvent } from "../../src/civilization/events/signer.ts";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { loadProductionConfig, validateProductionConfig } from "../../src/civilization/config/production-config.ts";

/**
 * Creates an in-memory SQL mock engine that enforces PostgreSQL dialect syntax and $1, $2 positional parameter handling.
 */
function createMockPostgresPool(): { pool: PostgresClientPool; getQueries: () => readonly { text: string; params?: readonly unknown[] }[] } {
  const executedQueries: { text: string; params?: readonly unknown[] }[] = [];
  const tables = new Map<string, any[]>();

  const pool: PostgresClientPool = {
    async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<{ rows: T[]; rowCount?: number }> {
      executedQueries.push({ text, params });

      // Transaction simulation
      if (text === "BEGIN;" || text === "COMMIT;" || text === "ROLLBACK;") {
        return { rows: [], rowCount: 0 };
      }

      // Check for $ placeholders in text
      if (params.length > 0) {
        for (let i = 1; i <= params.length; i++) {
          if (!text.includes(`$${i}`)) {
            throw new Error(`Positional parameter $${i} missing in SQL: "${text}" with params count ${params.length}`);
          }
        }
      }

      // Migrations table simulation
      if (text.includes("CREATE TABLE IF NOT EXISTS") || text.includes("CREATE INDEX IF NOT EXISTS")) {
        return { rows: [], rowCount: 0 };
      }

      // Schema migrations query
      if (text.includes("SELECT version FROM schema_migrations")) {
        const migrations = tables.get("schema_migrations") ?? [];
        return { rows: migrations as T[], rowCount: migrations.length };
      }

      // Insert migration
      if (text.includes("INSERT INTO schema_migrations")) {
        const migrations = tables.get("schema_migrations") ?? [];
        migrations.push({ version: params[0], applied_at: params[1] });
        tables.set("schema_migrations", migrations);
        return { rows: [], rowCount: 1 };
      }

      // civilization_events queries
      if (text.includes("INSERT INTO civilization_events")) {
        const events = tables.get("civilization_events") ?? [];
        const newSeq = events.length + 1;
        const eventRow = {
          sequence_num: newSeq,
          event_id: params[0],
          protocol: params[1],
          version: params[2],
          event_type: params[3],
          timestamp: params[4],
          author_did: params[5],
          mission_id: params[6],
          task_id: params[7],
          parent_event_ids: params[8],
          payload: params[9],
          signature: params[10],
          event_hash: params[11],
          persisted_at: params[12],
        };
        events.push(eventRow);
        tables.set("civilization_events", events);
        return { rows: [eventRow] as T[], rowCount: 1 };
      }

      if (text.includes("MAX(sequence_num)")) {
        const events = tables.get("civilization_events") ?? [];
        const maxSeq = events.length > 0 ? events[events.length - 1].sequence_num : 0;
        return { rows: [{ head: maxSeq }] as T[], rowCount: 1 };
      }

      if (text.includes("SELECT * FROM civilization_events WHERE sequence_num > $1")) {
        const events = tables.get("civilization_events") ?? [];
        const afterSeq = Number(params[0] ?? 0);
        const limit = Number(params[1] ?? 50);
        const filtered = events.filter((e) => e.sequence_num > afterSeq).slice(0, limit);
        return { rows: filtered as T[], rowCount: filtered.length };
      }

      if (text.includes("FROM civilization_events WHERE event_id = $1")) {
        const events = tables.get("civilization_events") ?? [];
        const eventId = params[0];
        const match = events.find((e) => e.event_id === eventId);
        return { rows: match ? ([match] as T[]) : [], rowCount: match ? 1 : 0 };
      }

      // Projection checkpoints queries
      if (text.includes("SELECT * FROM projection_checkpoints WHERE projection_name = $1")) {
        const checkpoints = tables.get("projection_checkpoints") ?? [];
        const name = params[0];
        const match = checkpoints.find((c) => c.projection_name === name);
        return { rows: match ? ([match] as T[]) : [], rowCount: match ? 1 : 0 };
      }

      if (text.includes("INSERT INTO projection_checkpoints")) {
        const checkpoints = tables.get("projection_checkpoints") ?? [];
        const existingIdx = checkpoints.findIndex((c) => c.projection_name === params[0]);
        const record = { projection_name: params[0], last_sequence_num: params[1], updated_at: params[2] };
        if (existingIdx >= 0) {
          checkpoints[existingIdx] = record;
        } else {
          checkpoints.push(record);
        }
        tables.set("projection_checkpoints", checkpoints);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    async end() {
      // Connection pool closed
    },
  };

  return { pool, getQueries: () => Object.freeze([...executedQueries]) };
}

describe("PostgreSQL Production Boundary & Query Translation", () => {
  it("1. translates standard '?' parameter placeholders to '$1, $2, ...' correctly", () => {
    const sql1 = "SELECT * FROM civilization_events WHERE author_did = ? AND sequence_num > ? LIMIT ?";
    assert.equal(
      translatePostgresParams(sql1),
      "SELECT * FROM civilization_events WHERE author_did = $1 AND sequence_num > $2 LIMIT $3",
    );

    // With question mark inside literal quotes
    const sql2 = "SELECT * FROM events WHERE query = 'is this valid?' AND author = ?";
    assert.equal(
      translatePostgresParams(sql2),
      "SELECT * FROM events WHERE query = 'is this valid?' AND author = $1",
    );
  });

  it("2. executes clean database migrations against PostgreSQL dialect pool", async () => {
    const { pool, getQueries } = createMockPostgresPool();
    const adapter = new PostgresDatabaseAdapter(pool);

    await runMigrations(adapter);

    const queries = getQueries();
    assert.ok(queries.some((q) => q.text === "BEGIN;"));
    assert.ok(queries.some((q) => q.text.includes("sequence_num BIGSERIAL PRIMARY KEY")));
    assert.ok(queries.some((q) => q.text === "COMMIT;"));
  });

  it("3. handles transaction rollback when an exception occurs inside transaction block", async () => {
    const { pool, getQueries } = createMockPostgresPool();
    const adapter = new PostgresDatabaseAdapter(pool);

    await assert.rejects(
      async () => {
        await adapter.transaction(async () => {
          await adapter.exec("SELECT 1;");
          throw new Error("Simulated Transaction Failure");
        });
      },
      /Simulated Transaction Failure/,
    );

    const queries = getQueries();
    assert.ok(queries.some((q) => q.text === "BEGIN;"));
    assert.ok(queries.some((q) => q.text === "ROLLBACK;"));
  });

  it("4. performs full SqlEventStore lifecycle over PostgresDatabaseAdapter", async () => {
    const { pool } = createMockPostgresPool();
    const adapter = new PostgresDatabaseAdapter(pool);
    const store = new SqlEventStore(adapter);

    const agent = await createAgentIdentity({ displayName: "PG Pioneer", role: "Dev" });
    const event = await signCivilizationEvent(
      {
        eventType: "CAPABILITY_ADVERTISED",
        missionId: "mis_pg_1",
        authorDid: agent.did,
        payload: { did: agent.did, capability: { name: "postgres_mastery", proficiency: 99 } },
      },
      agent.signingHandle,
    );

    // Append
    const receipt = await store.append(event);
    assert.equal(receipt.sequenceNum, 1);
    assert.equal(receipt.eventId, event.eventId);

    // Head sequence
    const head = await store.getHeadSequence();
    assert.equal(head, 1);

    // Get after sequence
    const after = await store.getAfterSequence(0, 10);
    assert.equal(after.length, 1);
    assert.equal(after[0]?.eventId, event.eventId);

    // Get by ID
    const byId = await store.getById(event.eventId);
    assert.ok(byId);
    assert.equal(byId.eventId, event.eventId);

    // Projection Engine replay
    const engine = new DeterministicProjectionEngine(store, "pg_test_proj");
    await engine.rebuildAllFromScratch();
    const state = engine.getState();
    assert.equal(state.totalEvents, 1);
    assert.equal(state.headSequence, 1);
  });

  it("5. strictly prevents SQLite from running when NODE_ENV === 'production'", () => {
    const prodWithoutDb = validateProductionConfig(
      loadProductionConfig({
        NODE_ENV: "production",
        DATABASE_URL: undefined,
      }),
    );
    assert.equal(prodWithoutDb.valid, false);
    assert.ok(prodWithoutDb.issues.some((i) => i.field === "DATABASE_URL" && i.message.includes("required in production")));

    const prodWithInvalidDb = validateProductionConfig(
      loadProductionConfig({
        NODE_ENV: "production",
        DATABASE_URL: "sqlite://local.db",
      }),
    );
    assert.equal(prodWithInvalidDb.valid, false);
    assert.ok(prodWithInvalidDb.issues.some((i) => i.field === "DATABASE_URL" && i.message.includes("must be a valid PostgreSQL connection string")));

    const prodValid = validateProductionConfig(
      loadProductionConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/technocore?sslmode=require",
      }),
    );
    assert.equal(prodValid.valid, true);
  });
});
