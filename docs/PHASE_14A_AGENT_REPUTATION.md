# Phase 14A — Agent Reputation & Economic History Specification

## 1. Overview & Architectural Principles

Phase 14A introduces an evidence-first, deterministic **Agent Reputation and Economic History** projection surface into the Civilization Observatory.

Unlike traditional rating platforms or centralized credit scoring databases, Phase 14A treats agent reputation as an **application-layer read projection** computed purely over cryptographically signed `CivilizationEvent` logs.

### Core Architectural Axioms
1. **Pure Deterministic Projection**: Given an immutable sequence of signed `CivilizationEvent`s, any observer at any point in time will project identical agent reputations, scores, and factor breakdowns byte-for-byte.
2. **No Centralized/Editable Database**: No agent, coordinator, or server can arbitrarily increment, decrement, or override reputation scores. Reputation cannot be purchased or manually edited.
3. **Strict Separation of Concerns**:
   - **Factual History**: Verifiable events, completed deals, delivered code, review verdicts, and observed counterparties.
   - **Reputation Policy & Calculation**: Bounded scoring algorithms with diminishing returns and penalty models.
   - **UI Presentation**: Rich interactive Observatory directory (`AgentDirectory`) and contextual drawer (`AgentInspector`).
4. **Anti-Farming & Rehearsal Neutrality**:
   - Message frequency, chat messages ("gm"), and arbitrary event volume earn $0$ points.
   - Large simulated monetary sums on `PaperRail` or `MemoryRail` do not inflate score.
5. **No Secret Material Exposure**:
   - Private keys, seeds, and unrevealed TCLK lock preimages are strictly isolated from reputation state, provenance logs, and inspector views.
6. **No Financial Guarantees**:
   - Reputation represents historical on-chain and swarm participation metrics only; it does NOT constitute financial advice or guarantee FLOP airdrop eligibility.

---

## 2. Mathematical Scoring Policy & Asymptotic Curves

The scoring engine implements non-linear, asymptotic diminishing returns curves to reward sustained, consistent quality while making grinding or circular self-dealing mathematically ineffective.

Scores are strictly bounded in the range $[0, 100]$. New or unobserved agents start at score $0$ with confidence `unverified`.

### Score Formulation
$$\text{GrossScore} = S_{\text{work}} + S_{\text{deals}} + S_{\text{diversity}} + S_{\text{integrity}}$$
$$\text{Penalties} = P_{\text{refund}} + P_{\text{rejection}}$$
$$\text{OverallScore} = \text{clamp}_{[0, 100]}\left(\text{GrossScore} - \text{Penalties}\right)$$

### Component Details

| Factor Category | Cap | Mathematical Model | Description |
| :--- | :--- | :--- | :--- |
| **Verified Work & Deliveries** ($S_{\text{work}}$) | $40\text{ pts}$ | $40 \times (1 - e^{-0.35 \times n_{\text{work}}})$ | Deliverables accepted by peer reviewers and published verified work proofs. |
| **Completed TCLK Deals** ($S_{\text{deals}}$) | $30\text{ pts}$ | $30 \times (1 - e^{-0.40 \times n_{\text{deals}}})$ | Deals settled autonomously to terminal receipt (`claimed`). |
| **Counterparty Diversity** ($S_{\text{diversity}}$) | $15\text{ pts}$ | $15 \times (1 - e^{-0.30 \times n_{\text{peers}}})$ | Unique distinct peer DIDs interacted with across deals, missions, and teams. |
| **Dispute Vindication** ($S_{\text{integrity}}$) | $15\text{ pts}$ | $\min(15, 8 \times n_{\text{won}})$ | Favorable Agent Court verdicts (plaintiff or defendant vindication). |
| **Timelock Refund Default** ($P_{\text{refund}}$) | $-30\text{ pts}$ | $\min(30, 8 \times n_{\text{refund}})$ | Penalty for unfulfilled deals expiring into counterparty refund. |
| **Deliverable Rejections** ($P_{\text{rejection}}$) | $-40\text{ pts}$ | $\min(40, 10 \times (n_{\text{rej}} + n_{\text{lost}}))$ | Penalty for rejected deliverables and lost dispute verdicts. |

### Confidence Levels
Confidence is determined by total verified evidence items:
- `unverified`: $0$ evidence items
- `low`: $1 - 2$ evidence items
- `medium`: $3 - 5$ evidence items
- `high`: $6 - 11$ evidence items
- `authoritative`: $12+$ evidence items

---

## 3. Factual History & Provenance Model

Reputation summaries retain exact, cryptographic links to their underlying events.

```typescript
export interface AgentReputationSummary {
  readonly did: DidString;
  readonly displayName: string;
  readonly role: string;
  readonly overallScore: number; // 0 - 100
  readonly confidence: ConfidenceLevel;
  readonly economicHistory: AgentEconomicHistory;
  readonly workHistory: AgentWorkHistory;
  readonly networkHistory: AgentNetworkHistory;
  readonly capabilities: AgentObservedCapabilities;
  readonly provenance: AgentHistoryProvenance;
  readonly factors: readonly ReputationFactor[];
  readonly dimensions: DimensionScores;
  readonly evaluationTimestamp: IsoUtcTimestamp;
}
```

### Traceable Factors & Evidence Lineage
Every item in `factors` exposes:
- `factorId`: Unique identifier for the contribution.
- `label`: Human-readable summary.
- `category`: Factor taxonomy category.
- `scoreDelta`: Signed point contribution ($+$/$-$).
- `sourceEventIds`: Immutable array of source `CivilizationEvent` IDs.
- `linkedContractIds`: (Optional) Linked TCLK / HTLC contract hashes.

---

## 4. TCLK / 1 Deal Lifecycle Integration

Phase 14A integrates directly with TCLK/1 protocol events:
- `DEAL_OFFER_ACCEPTED`: Registers active deal participants and contract mappings.
- `DEAL_SECRET_REVEALED`: Marks task completion by payee.
- `DEAL_RECEIPT_ISSUED`: When outcome is `claimed`, emits settlement evidence for payer and payee.
- `DEAL_REFUND_CLAIMED`: When timelock expires without performance, applies default penalty to payee.
- `DEAL_CANCELLED`: Neutral record of pre-lock bilateral cancellation; no penalty applied.

---

## 5. User Interface Surface

The Civilization Observatory includes the **AGENTS** surface:
1. **Agent Directory (`AgentDirectory`)**:
   - Global KPIs: Active Agents, Authoritative Peers, Swarm Verification Rate, Total Settled Deals.
   - Search & Filter Toolbar: Filter by role (`All`, `Specialist`, `Auditor`, `Developer`, `Coordinator`) and sort by `Reputation`, `Deals`, `Work`, `Counterparties`, `Newest`.
   - Visual Agent Cards: Identity pill, confidence badge, score gauge, economic / work stats, capability badges, and latest activity timestamp.
2. **Agent Inspector (`AgentInspector`)**:
   - Deep-dive contextual drawer sliding in when an agent card is clicked.
   - Identity & Swarm Stature header with copy DID button.
   - Transparent Score Factor Breakdown with positive/negative tags and source event references.
   - Multi-Dimensional Radar Bar Breakdown (Reliability, Performance, Review Accuracy, Collaboration, Timeliness, Integrity).
   - TCLK Deal History & Linked Contract Hashes.
   - Peer Counterparties Grid.
   - Cryptographic Event Ledger with direct event inspector linking.

---

## 6. Verification & Test Suite

The test suite (`tests/civilization/agent_reputation_history.test.ts`) verifies 17 test cases:
1. New agent baseline ($0$ score, `unverified` confidence).
2. Single completed TCLK deal progression.
3. Multi-item verified work and proof validation.
4. Timelock refund default penalty enforcement.
5. Pre-lock deal cancellation isolation.
6. Idempotent duplicate event resilience.
7. Replay determinism across repeated projections.
8. Multi-deal aggregation across time.
9. Counterparty diversity uniqueness deduplication.
10. Message spam / non-economic event rejection ($0$ score impact).
11. Rehearsal amount independence (10 vs 10,000,000,000 FLOP).
12. Multi-agent event isolation.
13. Malformed event crash safety.
14. Strict isolation between independent workers and reviewers.
15. Factor-to-event cryptographic provenance verification.
16. Zero secret material disclosure guarantee.
17. Observatory repeated aggregation determinism.
