/**
 * Local Secret Vault for Zero-Custody Lock Preimages & Witnesses.
 *
 * Implements an isolated, non-custodial in-memory vault for storing hash-lock
 * preimages and point-lock scalar witnesses.
 *
 * Strict Security Principles:
 * - Preimages and scalar witnesses are NEVER serialized to external network transports.
 * - Secrets are only revealed when the agent explicitly executes `createReveal`.
 * - The server, event gateway, and event store never receive unrevealed secrets.
 */

import {
  generateHashLock,
  generatePointLock,
  verifyHashPreimage,
  verifyPointWitness,
} from "@flop-labs/tclk";
import type { LocalSecretEntry, LocalSecretVault, LockKind } from "./types.ts";
import { TclkInvalidSecretError } from "./errors.ts";

export class InMemorySecretVault implements LocalSecretVault {
  private readonly secretsByStatement = new Map<string, LocalSecretEntry>();
  private readonly statementByContract = new Map<string, string>();

  /**
   * Generates a new hash lock or point lock, saving the secret locally and returning the public statement.
   */
  mintLock(kind: LockKind, contractId?: string): { statement: string; secret: string } {
    if (kind === "hash") {
      const { hash, preimage } = generateHashLock();
      this.saveSecret(hash, preimage, "hash", contractId);
      return { statement: hash, secret: preimage };
    } else if (kind === "point") {
      const { statement, witness } = generatePointLock();
      this.saveSecret(statement, witness, "point", contractId);
      return { statement, secret: witness };
    }
    throw new Error(`Unsupported lock kind: ${kind}`);
  }

  /**
   * Saves an explicitly generated secret into the vault with verification.
   */
  saveSecret(
    statement: string,
    secret: string,
    lockKind: LockKind,
    contractId?: string,
  ): void {
    // Validate that secret satisfies statement before storing
    if (lockKind === "hash") {
      if (!verifyHashPreimage(statement, secret)) {
        throw new TclkInvalidSecretError(statement, "hash");
      }
    } else if (lockKind === "point") {
      if (!verifyPointWitness(statement, secret)) {
        throw new TclkInvalidSecretError(statement, "point");
      }
    }

    const entry: LocalSecretEntry = {
      statement,
      secret,
      lockKind,
      contractId,
      createdAt: Date.now(),
    };

    this.secretsByStatement.set(statement, entry);
    if (contractId) {
      this.statementByContract.set(contractId, statement);
    }
  }

  /**
   * Binds an already minted statement to a finalized contract ID.
   */
  bindContract(statement: string, contractId: string): void {
    const existing = this.secretsByStatement.get(statement);
    if (existing) {
      this.secretsByStatement.set(statement, { ...existing, contractId });
    }
    this.statementByContract.set(contractId, statement);
  }

  /**
   * Retrieves a secret by its public lock statement.
   */
  getSecretByStatement(statement: string): string | undefined {
    return this.secretsByStatement.get(statement)?.secret;
  }

  /**
   * Retrieves a secret by its contract ID.
   */
  getSecretByContract(contractId: string): string | undefined {
    const statement = this.statementByContract.get(contractId);
    if (!statement) return undefined;
    return this.getSecretByStatement(statement);
  }

  /**
   * Checks if a secret exists for a statement.
   */
  hasSecret(statement: string): boolean {
    return this.secretsByStatement.has(statement);
  }

  /**
   * Removes a secret after revelation or deal completion.
   */
  removeSecret(statement: string): boolean {
    const entry = this.secretsByStatement.get(statement);
    if (entry?.contractId) {
      this.statementByContract.delete(entry.contractId);
    }
    return this.secretsByStatement.delete(statement);
  }

  /**
   * Lists all stored statements (safe for public inspection, contains no secrets).
   */
  listStatements(): readonly string[] {
    return Array.from(this.secretsByStatement.keys());
  }

  /**
   * Total number of isolated secrets held in this vault.
   */
  get size(): number {
    return this.secretsByStatement.size;
  }
}
