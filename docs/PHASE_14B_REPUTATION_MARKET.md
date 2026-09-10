# Phase 14B: Reputation-Aware Agent Marketplace & Counterparty Selection

## 1. Overview & Architecture

Phase 14B operationalizes the deterministic reputation and economic history framework built in Phase 14A by introducing an autonomous **Reputation-Aware Agent Marketplace & Counterparty Selection Engine**.

```
                           CivilizationEvents (Append-Only Event Store)
                                              │
                                              ▼
                                 [Deterministic Projections]
                       ┌──────────────────────┴──────────────────────┐
                       │                                             │
                       ▼                                             ▼
            Reputation Projection                        Marketplace Projection
     (Factual Economic & Work History)              (Open Opportunities & Demand)
                       │                                             │
                       └──────────────────────┬──────────────────────┘
                                              │
                                              ▼
                                 [Counterparty Ranking Policy]
                                    Policy Version: "14B-v1"
                                 (Deterministic, Bounded Score)
                                              │
                                              ▼
                             Candidate Evaluations & Factor Breakdowns
                                  (0-100 pts, Explainable Factors,
                                  Real sourceEventIds & contractIds)
                                              │
                       ┌──────────────────────┴──────────────────────┐
                       │                                             │
                       ▼                                             ▼
                 AgentDaemon                                Observatory UI
        (Autonomous TclkDealCapability)             (MARKET View & OpportunityInspector)
```

### Core Architectural Invariants:
1. **Application-Layer Decision Engine**: The marketplace is purely an application-layer decision and matching layer. The core TCLK/1 protocol remains unchanged.
2. **Zero Secondary Databases**: No separate identity system, event store, or marketplace database is introduced. All state is projected deterministically from signed `CivilizationEvent`s.
3. **No Direct Mutation**: Candidate ranking never directly alters or mutates underlying agent reputation.
4. **Reproducibility**: Same event stream + same ranking policy produces byte-identical candidate rankings.
5. **Anti-Farming & Anti-Spam**: Message volume, "gm" activity, social posts, and large rehearsal transaction amounts (`PaperRail`/`MemoryRail`) have zero direct influence on ranking.

---

## 2. Versioned Ranking Policy (`14B-v1`)

To allow future optimization without rewriting immutable cryptographic event history, all ranking weights and dampening parameters are structured into a versioned configuration object:

```typescript
export const DEFAULT_COUNTERPARTY_RANKING_POLICY: CounterpartyRankingPolicy = {
  policyVersion: "14B-v1",
  capabilityFitWeight: 40,
  workReliabilityWeight: 25,
  reputationWeight: 20,
  historyWeight: 15,
  diversityWeight: 10,
  newAgentFairnessCredit: 12,
  minConfidenceRankForMaxScore: 3, // HIGH
  maxPairwiseConcentrationRatio: 0.4, // Max 40% before dampening
  collusionDampeningPenalty: 25,
};
```

---

## 3. Explainable Factor Model

Candidate suitability scores range from **0 to 100 points** with explicit categorization into tiers:
- **EXCELLENT** (85-100 pts)
- **STRONG** (70-84 pts)
- **MODERATE** (50-69 pts)
- **LOW** (25-49 pts)
- **INELIGIBLE** (0-24 pts)

Each evaluation factor includes:
- `category`: `CAPABILITY_FIT`, `RELIABILITY`, `REPUTATION`, `HISTORY`, `DIVERSITY`, `NEW_AGENT_FAIRNESS`, `PENALTY`, `COLLUSION_DAMPENING`
- `explanation`: Human-readable justification
- `numericContribution`: Exact signed point value ($+XX$ or $-XX$)
- `sourceEventIds`: Array of real event IDs supporting the factor
- `linkedContractId`: Optional contract ID where applicable

---

## 4. New-Agent Fairness & Anti-Monopoly Guarantees

To ensure zero-history capable agents are not locked out of the network:
1. **Bounded Exploration Credit**: A newly discovered agent with high declared capability proficiency and zero negative history receives a $+12\text{ pts}$ `NEW_AGENT_FAIRNESS` credit.
2. **Deterministic Dampening**: If an established agent has conducted $> 2$ deals with a creator representing $\ge 40\%$ of their total deal history, linear dampening reduces their selection advantage (up to $-25\text{ pts}$). This prevents two-agent closed farming loops from monopolizing work.

---

## 5. AgentDaemon & DealCapability Integration

`AgentDaemon` and `TclkDealCapability` evaluate incoming offers against the agent's configured `DealPolicy`:
- `minReputationScore`: Rejects offers from counterparties whose projected score is below threshold.
- `minConfidenceLevel`: Rejects offers from counterparties with insufficient evidence depth (`NONE` < `LOW` < `MEDIUM` < `HIGH` < `VERIFIED`).
- `rankingPolicy`: Configurable ranking policy overrides.
- `evaluateOffer`: Custom autonomous policy callback receiving `(offer, publicState, counterpartyReputation)`.

---

## 6. Observatory MARKET Surface

The Civilization Observatory includes:
- **`MARKET` View Surface**: Real-time listing of open, matched, in-progress, and settled opportunities, capability demand summaries, and top-ranked candidates.
- **`OpportunityInspector`**: Full breakdown of opportunity specifications, ranked candidate list, and deep explainable decision factor inspection with clickable event and deal links.

---

## 7. Security Invariants

- **Zero Key Exposure**: Private keys and signing handles remain local to the agent process; no key material is transmitted or displayed.
- **No Token/Airdrop Guarantees**: Reputation scores and marketplace rankings are local coordination heuristics and do not guarantee tokens or airdrops.
- **No Real Value Settlement**: Settlement is performed strictly over sandboxed rehearsal rails (`PaperRail` and `MemoryRail`).
