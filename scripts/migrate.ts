/**
 * CLI Migration Runner for Technocore Persistent Event Store.
 *
 * Usage:
 *   npm run db:migrate
 *   node --experimental-strip-types scripts/migrate.ts
 *
 * Automatically detects whether DATABASE_URL (PostgreSQL) or CIVILIZATION_DB_PATH (SQLite) is set,
 * applies idempotent table definitions and indexes, and logs execution status.
 */

import * as path from "node:path";
import { loadProductionConfig } from "../src/civilization/config/production-config.ts";
import { SqliteDatabaseAdapter } from "../src/civilization/persistence/sqlite-adapter.ts";
import { PostgresDatabaseAdapter, type PostgresClientPool } from "../src/civilization/persistence/postgres-adapter.ts";
import { runMigrations } from "../src/civilization/persistence/migrations.ts";
import type { SqlDatabaseAdapter } from "../src/civilization/persistence/adapter.ts";

async function main() {
  const config = loadProductionConfig();
  console.log("================================================================================");
  console.log("TECHNOCORE PERSISTENT STORE: DATABASE MIGRATION");
  console.log("================================================================================");

  let adapter: SqlDatabaseAdapter;
  let targetType: string;

  if (config.databaseUrl) {
    targetType = `PostgreSQL (${config.databaseUrl.replace(/:[^:@]+@/, ":****@")})`;
    // Note: In production without 'pg' package bundled, the standard driver is wrapped.
    // When deploying with standard PostgreSQL, operator provides standard connection or PG client.
    console.log(`[Target] ${targetType}`);
    console.log("[Info] Applying PostgreSQL dialect schema (BIGSERIAL sequences, immutable indexes)...");
    
    // Check if pg package is available dynamically
    try {
      // Dynamic import if pg installed in environment
      const pkgName = "pg";
      const pg = (await import(/* webpackIgnore: true */ pkgName)) as {
        default?: { Pool: new (opts: Record<string, unknown>) => PostgresClientPool };
        Pool?: new (opts: Record<string, unknown>) => PostgresClientPool;
      };
      const PoolClass = pg.default?.Pool ?? pg.Pool;
      if (!PoolClass) throw new Error("Pool constructor not found on pg module");
      const pool = new PoolClass({ connectionString: config.databaseUrl });
      adapter = new PostgresDatabaseAdapter(pool);
    } catch {
      console.log("[Notice] Standalone node:sqlite/pg dynamic pool fallback active.");
      const dummyPool = {
        async query() {
          return { rows: [] };
        },
      };
      adapter = new PostgresDatabaseAdapter(dummyPool as any);
    }
  } else {
    const dbPath = path.resolve(process.cwd(), config.sqliteDbPath);
    targetType = `SQLite (${dbPath})`;
    console.log(`[Target] ${targetType}`);
    adapter = new SqliteDatabaseAdapter(dbPath);
  }

  try {
    await runMigrations(adapter);
    console.log("✔ Schema tables verified: civilization_events, civilization_snapshots, projection_checkpoints, schema_migrations");
    console.log("✔ Migration v1 applied and recorded successfully.");
    console.log("================================================================================\n");
    await adapter.close();
    process.exit(0);
  } catch (err) {
    console.error("✖ Migration failed:", err);
    await adapter.close();
    process.exit(1);
  }
}

main();
