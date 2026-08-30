/**
 * Provider-Neutral Economy Adapter Interface.
 *
 * Provides a clean separation between civilization-internal deterministic accounting
 * and any future on-chain or external Technocore / FLOP settlement gateways.
 */

import { computeSha256Hex } from "../execution/proof.ts";
import type { DidString } from "../types/common.ts";
import type { EconomyAdapter } from "./types.ts";

/**
 * Local simulation adapter providing deterministic transaction receipts.
 */
export class SimulationEconomyAdapter implements EconomyAdapter {
  readonly adapterName = "SimulationEconomyAdapter";

  async recordPayment(params: {
    readonly transactionId: string;
    readonly recipientDid: DidString;
    readonly amount: number;
    readonly token: string;
    readonly memo: string;
  }): Promise<{ readonly success: boolean; readonly receiptHash: string }> {
    const rawReceipt = `${params.transactionId}:${params.recipientDid}:${params.amount}:${params.token}:${params.memo}`;
    const receiptHash = await computeSha256Hex(rawReceipt);
    return {
      success: true,
      receiptHash,
    };
  }
}

/**
 * Future Technocore Economy Adapter stub (for Phase 10+ / on-chain integrations).
 */
export class FutureTechnocoreEconomyAdapter implements EconomyAdapter {
  readonly adapterName = "FutureTechnocoreEconomyAdapter";

  async recordPayment(params: {
    readonly transactionId: string;
    readonly recipientDid: DidString;
    readonly amount: number;
    readonly token: string;
    readonly memo: string;
  }): Promise<{ readonly success: boolean; readonly receiptHash: string }> {
    const rawReceipt = `technocore_gateway:${params.transactionId}:${params.recipientDid}:${params.amount}:${params.token}`;
    const receiptHash = await computeSha256Hex(rawReceipt);
    return {
      success: true,
      receiptHash,
    };
  }
}
