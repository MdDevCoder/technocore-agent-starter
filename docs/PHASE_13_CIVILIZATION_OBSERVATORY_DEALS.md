# Civilization Observatory × Autonomous TCLK Deals (Phase 13.4)

## 1. Overview & UI Architecture

The **Civilization Observatory × Autonomous TCLK Deals** surface makes the autonomous economic coordination implemented in Phases 13.1–13.3 visible, verifiable, and understandable in real time.

```mermaid
graph TD
    Ledger[Civilization Event Ledger] -->|DEAL_* Events| Aggregator[aggregateDealsFromEvents]
    Aggregator -->|ObservatoryDealView[]| Dashboard[DealObservatory]
    Dashboard -->|Select Contract| Inspector[DealInspector]
    Dashboard -->|Summary Metrics| KPIs[KPI Summary Cards]
    Dashboard -->|Filters| FilterBar[Status & Role Toolbar]
    Inspector --> Timeline[Lifecycle Timeline]
    Inspector --> Lineage[Causal Event Lineage]
    Inspector --> Security[Secret Redaction & Verification]
    Inspector --> Rehearsal[Rehearsal Settlement Warning]
```

---

## 2. Public Data Model

Deals are projected purely and deterministically from cryptographically signed `CivilizationEvent`s:

```typescript
export interface ObservatoryDealView {
  readonly contractId: string;
  readonly offerId: string;
  readonly payerDid: string;
  readonly payeeDid: string;
  readonly status: "proposed" | "accepted" | "locked" | "claimed" | "refunded" | "cancelled";
  readonly amount: string;
  readonly asset: string;
  readonly lockKind: "hash" | "point";
  readonly statement?: string;
  readonly secretRevealed: boolean;
  readonly rails: readonly string[];
  readonly rail?: string;
  readonly railRef?: string;
  readonly job?: {
    readonly proto: string;
    readonly id: string;
    readonly meta?: Record<string, unknown>;
  };
  readonly claimByMs: number;
  readonly refundAfterMs: number;
  readonly expiresMs: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly events: readonly CivilizationEvent[];
}
```

---

## 3. Lifecycle States & Visualization

### Primary Successful Lifecycle
$$\text{OFFER} \longrightarrow \text{ACCEPT} \longrightarrow \text{LOCK} \longrightarrow \text{WORK \& REVEAL} \longrightarrow \text{RECEIPT}$$

### Alternative Terminal Lifecycles
* **Pre-Lock Cancellation**: $\text{OFFER} \longrightarrow \text{CANCEL}$
* **Timelock Expiry Refund**: $\text{LOCK} \longrightarrow \text{REFUND}$

Each state visually displays its progression step (Completed, Current/In-Flight, Pending, or Skipped/Cancelled).

---

## 4. Secret Redaction & Protocol Security

* **Prior to Reveal**: The secret preimage is strictly redacted. The UI displays `🔒 HIDDEN UNTIL REVEAL (RAM Vault Guarded)` and presents only the public statement hash ($H = \text{sha256}(S)$).
* **Upon Reveal**: The UI displays `✓ Preimage Revealed & Escrow Claimed`. No raw private signing keys, seed material, or unrevealed secrets are exposed in React state, DOM attributes, or serialized logs.

---

## 5. Rehearsal Settlement Semantics

All operations executed on `PaperRail` or `MemoryRail` display a prominent **Rehearsal Settlement Warning**:
```text
⚠️ REHEARSAL — NO VALUE SETTLED
This deal is coordinated through an in-memory or paper rehearsal rail.
Protocol commitments, statements, and state transitions are cryptographically verified,
but zero financial assets are transferred.
```

Language used across the interface strictly adheres to non-value rehearsal terminology:
* "deal completed" / "protocol claim completed" / "rehearsal settlement" (never "payment completed" or "money transferred").

---

## 6. Live Updates & Filtering

* **Live Updates**: Utilizes the existing SSE event stream (`EventStream` / `useCivilizationEngine`). Newly ingested `DEAL_*` events automatically update deal status, KPI summaries, and lifecycle timelines without page refreshes or polling.
* **Filtering**: Filter by Status (`ALL`, `proposed`, `accepted`, `locked`, `claimed`, `refunded`, `cancelled`), Role (`ALL`, `PAYER`, `PAYEE`), or search by contract ID, DID, or job task ID.
