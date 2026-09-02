/**
 * Technocore Lock Protocol (tclk/1) Deal Module.
 *
 * Provides HTLC/PTLC deal negotiation, locking, and settlement primitives
 * for autonomous agents on the Technocore network.
 *
 * Safety Boundaries:
 * - PTLC implementation is an experimental reference implementation for research and protocol verification;
 *   it is NOT compatible with Bitcoin/Taproot production settlement.
 * - PaperRail is strictly a non-value-bearing development / rehearsal rail.
 * - Raw secret preimages and witnesses are stored in local agent memory (InMemorySecretVault)
 *   and are never published until explicit reveal.
 */

export * from "./types.ts";
export * from "./errors.ts";
export * from "./secret-vault.ts";
export * from "./transcript.ts";
export * from "./mapper.ts";
export * from "./adapter.ts";
export * from "./deal-engine.ts";
