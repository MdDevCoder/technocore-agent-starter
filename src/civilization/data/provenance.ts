/**
 * Universal Data Provenance & Freshness Model.
 *
 * Phase 17 — Live Data Unification & End-to-End Dynamic System.
 *
 * Mandate:
 * Every user-facing route, component, and projection must expose an explicit, truthful provenance.
 * Absolutely no fake data may appear in a live view.
 */

export type DataProvenance =
  | "LIVE_NETWORK"
  | "LIVE_PERSISTENCE"
  | "DERIVED_FROM_LIVE_EVENTS"
  | "LOCAL_SIMULATION"
  | "LOCAL_DEMO"
  | "REHEARSAL";

export type DataFreshness =
  | "LIVE"
  | "UPDATING"
  | "STALE"
  | "OFFLINE";

export interface DataProvenanceMetadata {
  readonly provenance: DataProvenance;
  readonly source: string;
  readonly updatedAt: string;
  readonly freshness: DataFreshness;
  readonly verified: boolean;
  readonly verifiedEventsCount?: number;
  readonly lastEventSequence?: number;
  readonly unverifiableCount?: number;
  readonly unsupportedCount?: number;
  readonly disclaimer?: string;
}

/**
 * Creates a normalized DataProvenanceMetadata object with safe defaults.
 */
export function createProvenanceMetadata(
  partial: Partial<DataProvenanceMetadata> & { provenance: DataProvenance; source: string; verified: boolean }
): DataProvenanceMetadata {
  const updatedAt = partial.updatedAt ?? new Date().toISOString();
  const freshness = partial.freshness ?? evaluateFreshness(updatedAt);

  return {
    provenance: partial.provenance,
    source: partial.source,
    updatedAt,
    freshness,
    verified: partial.verified,
    verifiedEventsCount: partial.verifiedEventsCount ?? 0,
    lastEventSequence: partial.lastEventSequence ?? 0,
    unverifiableCount: partial.unverifiableCount,
    unsupportedCount: partial.unsupportedCount,
    disclaimer: partial.disclaimer,
  };
}

/**
 * Evaluates freshness dynamically based on elapsed time since updatedAt.
 * Default threshold is 60,000ms (1 minute).
 */
export function evaluateFreshness(
  updatedAt: string,
  staleThresholdMs = 60_000
): DataFreshness {
  const updatedTime = new Date(updatedAt).getTime();
  if (isNaN(updatedTime)) return "OFFLINE";

  const elapsed = Date.now() - updatedTime;
  if (elapsed > staleThresholdMs) {
    return "STALE";
  }
  return "LIVE";
}

/**
 * Checks whether a provenance represents authoritative live/persisted data.
 */
export function isLiveProvenance(provenance: DataProvenance): boolean {
  return (
    provenance === "LIVE_NETWORK" ||
    provenance === "LIVE_PERSISTENCE" ||
    provenance === "DERIVED_FROM_LIVE_EVENTS"
  );
}

/**
 * Checks whether a provenance represents local synthetic simulation or demo fixtures.
 */
export function isSimulationOrDemo(provenance: DataProvenance): boolean {
  return (
    provenance === "LOCAL_SIMULATION" ||
    provenance === "LOCAL_DEMO" ||
    provenance === "REHEARSAL"
  );
}

/**
 * Human-readable label for badges and tooltips.
 */
export function formatProvenanceLabel(provenance: DataProvenance): string {
  switch (provenance) {
    case "LIVE_NETWORK":
      return "Live Network (Technocore)";
    case "LIVE_PERSISTENCE":
      return "Live Persistence (PostgreSQL/Authoritative)";
    case "DERIVED_FROM_LIVE_EVENTS":
      return "Derived from Live Events";
    case "LOCAL_SIMULATION":
      return "Local Simulation (Synthetic World)";
    case "LOCAL_DEMO":
      return "Local Demo Fixture";
    case "REHEARSAL":
      return "Rehearsal Rail (No Value Settled)";
    default:
      return String(provenance);
  }
}
