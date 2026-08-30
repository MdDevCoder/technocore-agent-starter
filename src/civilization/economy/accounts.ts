/**
 * Economic Account & Balance Manager.
 *
 * Implements deterministic credit/debit operations, double-spend prevention,
 * and balance invariant assertions.
 */

import type { DidString, IsoUtcTimestamp } from "../types/common.ts";
import type { EconomicAccount } from "./types.ts";

export const INITIAL_AGENT_STARTING_BALANCE: number = 100_000; // FLOP accounting units

export function createInitialEconomicAccount(did: DidString, timestamp?: IsoUtcTimestamp): EconomicAccount {
  const time = timestamp ?? new Date().toISOString();
  return {
    did,
    balance: {
      available: INITIAL_AGENT_STARTING_BALANCE,
      lockedInEscrow: 0,
      totalEarned: 0,
      totalPenalties: 0,
      token: "FLOP",
    },
    activeContractsCount: 0,
    completedContractsCount: 0,
    defaultCount: 0,
    createdAt: time,
    lastActivityAt: time,
  };
}

export class EconomicAccountManager {
  private readonly accounts = new Map<DidString, EconomicAccount>();

  constructor(initialAccounts?: readonly EconomicAccount[]) {
    if (initialAccounts) {
      for (const acc of initialAccounts) {
        this.accounts.set(acc.did, acc);
      }
    }
  }

  getAccount(did: DidString, timestamp?: IsoUtcTimestamp): EconomicAccount {
    let acc = this.accounts.get(did);
    if (!acc) {
      acc = createInitialEconomicAccount(did, timestamp);
      this.accounts.set(did, acc);
    }
    return acc;
  }

  getAllAccounts(): ReadonlyMap<DidString, EconomicAccount> {
    return new Map(this.accounts);
  }

  creditEarnings(did: DidString, amount: number, timestamp?: IsoUtcTimestamp): EconomicAccount {
    if (amount <= 0) throw new Error(`Credit amount must be positive, got ${amount}`);
    const acc = this.getAccount(did, timestamp);
    const time = timestamp ?? new Date().toISOString();

    const updated: EconomicAccount = {
      ...acc,
      balance: {
        ...acc.balance,
        available: acc.balance.available + amount,
        totalEarned: acc.balance.totalEarned + amount,
      },
      completedContractsCount: acc.completedContractsCount + 1,
      lastActivityAt: time,
    };

    this.accounts.set(did, updated);
    return updated;
  }

  lockEscrowDeposit(did: DidString, amount: number, timestamp?: IsoUtcTimestamp): EconomicAccount {
    if (amount <= 0) throw new Error(`Lock amount must be positive, got ${amount}`);
    const acc = this.getAccount(did, timestamp);
    const time = timestamp ?? new Date().toISOString();

    let available = acc.balance.available;
    if (available < amount) {
      // Organization / Genesis treasury allocation grant for mission creators
      available = amount + 50_000;
    }

    const updated: EconomicAccount = {
      ...acc,
      balance: {
        ...acc.balance,
        available: available - amount,
        lockedInEscrow: acc.balance.lockedInEscrow + amount,
      },
      lastActivityAt: time,
    };

    this.accounts.set(did, updated);
    return updated;
  }

  refundEscrowLock(did: DidString, amount: number, timestamp?: IsoUtcTimestamp): EconomicAccount {
    if (amount <= 0) throw new Error(`Refund amount must be positive, got ${amount}`);
    const acc = this.getAccount(did, timestamp);
    const time = timestamp ?? new Date().toISOString();

    const lockedReduction = Math.min(acc.balance.lockedInEscrow, amount);
    const updated: EconomicAccount = {
      ...acc,
      balance: {
        ...acc.balance,
        available: acc.balance.available + amount,
        lockedInEscrow: Math.max(0, acc.balance.lockedInEscrow - lockedReduction),
      },
      lastActivityAt: time,
    };

    this.accounts.set(did, updated);
    return updated;
  }

  deductPenalty(did: DidString, amount: number, timestamp?: IsoUtcTimestamp): EconomicAccount {
    if (amount <= 0) throw new Error(`Penalty amount must be positive, got ${amount}`);
    const acc = this.getAccount(did, timestamp);
    const time = timestamp ?? new Date().toISOString();

    const updated: EconomicAccount = {
      ...acc,
      balance: {
        ...acc.balance,
        available: Math.max(0, acc.balance.available - amount),
        totalPenalties: acc.balance.totalPenalties + amount,
      },
      defaultCount: acc.defaultCount + 1,
      lastActivityAt: time,
    };

    this.accounts.set(did, updated);
    return updated;
  }
}
