/**
 * PostgreSQL Database Adapter Interface and Client.
 *
 * Implements SqlDatabaseAdapter for production PostgreSQL databases with support
 * for connection pools, parameterized queries, and transactional isolation.
 *
 * Automatically translates '?' query placeholders into PostgreSQL-compatible '$1, $2, ...' syntax.
 */

import type { SqlDatabaseAdapter } from "./adapter.ts";

export interface PostgresClientPool {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
  end?(): Promise<void>;
}

/**
 * Translates standard '?' parameter placeholders into PostgreSQL '$1, $2, ...' positional parameters.
 * Ignores question marks enclosed within single or double quotes.
 */
export function translatePostgresParams(sql: string): string {
  let paramIndex = 1;
  let inString = false;
  let quoteChar = "";
  let result = "";

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : "";

    if ((char === "'" || char === '"') && prevChar !== "\\") {
      if (!inString) {
        inString = true;
        quoteChar = char;
      } else if (quoteChar === char) {
        inString = false;
      }
      result += char;
    } else if (char === "?" && !inString) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  return result;
}

export class PostgresDatabaseAdapter implements SqlDatabaseAdapter {
  public readonly dialect = "postgres" as const;
  private readonly pool: PostgresClientPool;

  constructor(pool: PostgresClientPool) {
    this.pool = pool;
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<readonly T[]> {
    const pgSql = translatePostgresParams(sql);
    const result = await this.pool.query<T>(pgSql, params);
    return Object.freeze(result.rows ?? []);
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    const pgSql = translatePostgresParams(sql);
    const result = await this.pool.query<T>(pgSql, params);
    if (!result.rows || result.rows.length === 0) return null;
    return result.rows[0] ?? null;
  }

  async run(sql: string, params: readonly unknown[] = []): Promise<{ readonly changes: number; readonly lastInsertRowid: number | bigint }> {
    const pgSql = translatePostgresParams(sql);
    const result = await this.pool.query(pgSql, params);
    const changes = result.rowCount ?? 0;
    return {
      changes,
      lastInsertRowid: 0,
    };
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.pool.query("BEGIN;");
    try {
      const result = await fn();
      await this.pool.query("COMMIT;");
      return result;
    } catch (err) {
      try {
        await this.pool.query("ROLLBACK;");
      } catch {
        // Rollback error secondary to original failure
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    if (typeof this.pool.end === "function") {
      await this.pool.end();
    }
  }
}

/**
 * Creates a PostgreSQL Database Adapter from a connection string or an existing pool.
 */
export async function createPostgresAdapter(connectionOrPool: string | PostgresClientPool): Promise<PostgresDatabaseAdapter> {
  if (typeof connectionOrPool === "string") {
    try {
      // Dynamic import of pg driver when installed in environment
      const pkgName = "pg";
      const pg = (await import(/* webpackIgnore: true */ pkgName)) as {
        default?: { Pool: new (opts: Record<string, unknown>) => PostgresClientPool };
        Pool?: new (opts: Record<string, unknown>) => PostgresClientPool;
      };
      const PoolClass = pg.default?.Pool ?? pg.Pool;
      if (!PoolClass) {
        throw new Error("Pool constructor not found on pg module");
      }
      const pool = new PoolClass({
        connectionString: connectionOrPool,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
      return new PostgresDatabaseAdapter(pool);
    } catch {
      throw new Error(
        `Failed to initialize PostgreSQL pool for ${connectionOrPool.replace(/:[^:@]+@/, ":****@")}. Ensure the 'pg' driver package is installed in your deployment environment.`
      );
    }
  }
  return new PostgresDatabaseAdapter(connectionOrPool);
}
