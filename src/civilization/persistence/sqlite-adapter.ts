/**
 * SQLite Database Adapter using Node 22 native `node:sqlite`.
 *
 * Provides zero-dependency, high-performance local SQL storage and unit-test execution
 * with ACID transactions and exact SQL semantics.
 */

import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import type { SqlDatabaseAdapter } from "./adapter.ts";

export class SqliteDatabaseAdapter implements SqlDatabaseAdapter {
  private readonly db: DatabaseSync;
  private inTransaction = false;

  constructor(location = ":memory:") {
    if (location !== ":memory:") {
      const dir = path.dirname(path.resolve(location));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(location);
    // Enable WAL mode and foreign keys for performance and data integrity
    if (location !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<readonly T[]> {
    const stmt = this.db.prepare(sql);
    const rows = (stmt.all as (...args: unknown[]) => unknown[])(...params);
    return Object.freeze(rows as unknown as T[]);
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const row = (stmt.get as (...args: unknown[]) => unknown)(...params);
    if (!row) return null;
    return row as unknown as T;
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<{ readonly changes: number; readonly lastInsertRowid: number | bigint }> {
    const stmt = this.db.prepare(sql);
    const result = (stmt.run as (...args: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint })(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      // Nested transaction inside existing transaction
      return await fn();
    }

    this.inTransaction = true;
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = await fn();
      this.db.exec("COMMIT;");
      return result;
    } catch (err) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // ignore secondary rollback errors
      }
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
