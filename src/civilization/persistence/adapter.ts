/**
 * Generic SQL Database Adapter Interface.
 *
 * Provides a provider-neutral abstraction layer for relational database engines
 * (PostgreSQL, SQLite, embedded SQL) supporting parameterized queries, atomic
 * transactions, and schema execution.
 */

export interface SqlDatabaseAdapter {
  /**
   * Executes a raw SQL script (e.g. DDL schema migrations).
   */
  exec(sql: string): Promise<void>;

  /**
   * Executes a parameterized query returning multiple rows.
   */
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>;

  /**
   * Executes a parameterized query returning a single row or null.
   */
  queryOne<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T | null>;

  /**
   * Executes a command (INSERT, UPDATE, DELETE) returning the number of affected rows and last inserted ID.
   */
  run(sql: string, params?: readonly unknown[]): Promise<{ readonly changes: number; readonly lastInsertRowid: number | bigint }>;

  /**
   * Executes a callback within an isolated atomic transaction.
   * Rolls back completely if the callback throws an error.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Closes connection pool or database handle.
   */
  close(): Promise<void>;
}
