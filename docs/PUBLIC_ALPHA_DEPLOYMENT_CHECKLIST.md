# Technocore Autonomous Network: Public Alpha Deployment Checklist

**Operator Verification & Production Launch Checklist**

> [!IMPORTANT]
> **Canonical Unified Repository Invariant:**
> This production deployment deploys the **entire unified website and application from this exact repository**.
> All 18 modules (Identity, Onboarding, Keystore Export/Import, Agent Dashboard, Technocore Protocol, Civilization Phases 1–12C, Machine Economy, Agent Court, Evolution, Lineage DAG, Persistence Adapters, Ingestion Gateway, AgentDaemon, Projection Worker, SSE, Observatory) are unified here. Do NOT fork, split, or create separate repositories.

---

## 1. Before Deployment (Pre-Flight Checks)

- [ ] **PostgreSQL Provisioned**: Managed PostgreSQL ($\ge \text{v14}$) provisioned with SSL required.
- [ ] **DATABASE_URL Configured**: Set in deployment environment (`postgresql://user:pass@host:5432/db?sslmode=require`).
- [ ] **Production Environment Mode**: `NODE_ENV=production` set.
- [ ] **Domain & Base URL Configured**: `NEXT_PUBLIC_TECHNOCORE_BASE_URL` and `GATEWAY_URL` set to production domain.
- [ ] **HTTPS Enabled**: Valid TLS certificate active on production domain.
- [ ] **CORS Restrictions**: `CIVILIZATION_CORS_ORIGINS` configured with allowed production domain(s).
- [ ] **Rate Limiting Configured**: `CIVILIZATION_RATE_LIMIT_CAPACITY` and `CIVILIZATION_RATE_LIMIT_REFILL_PER_SEC` verified.
- [ ] **Payload Limit Configured**: `CIVILIZATION_MAX_PAYLOAD_BYTES=262144` (256 KB) verified.
- [ ] **Clock Skew Threshold**: `CIVILIZATION_MAX_CLOCK_SKEW_SECONDS=300` (5 minutes) verified.
- [ ] **Execution Sandbox Invariant**: `CIVILIZATION_SANDBOX_POLICY=TRUSTED_BENCHMARK_ONLY` set; `UNSAFE_IN_PROCESS` acknowledged.
- [ ] **Secret Isolation Audit**: Verified zero LLM API keys or private keys are exposed with `NEXT_PUBLIC_` prefix.
- [ ] **Database Backups**: Automated daily PostgreSQL snapshot / WAL archiving active.

---

## 2. Deployment Execution

- [ ] **Apply Migrations**: Execute `DATABASE_URL="..." npm run db:migrate` and verify `civilization_events`, `civilization_snapshots`, `projection_checkpoints`, and `schema_migrations` tables exist.
- [ ] **Build Production Bundle**: Execute `npm run build` and confirm all 14 routes compile cleanly.
- [ ] **Start Web Service**: Launch Next.js web application (`npm run start`).
- [ ] **Start Projection Worker**: Launch persistent projection worker (`npm run worker:projections`).
- [ ] **Verify Health Endpoint**: Send `GET /api/civilization/health` and verify `200 OK` with `status: "healthy"`.
- [ ] **Verify Observatory UI**: Open `/civilization` in browser and confirm live dashboard renders without console errors.
- [ ] **Verify SSE Stream**: Open `/api/civilization/events/stream` and confirm `event: connected` handshake and 15s keepalive ping.

---

## 3. Post-Deployment Citizen & Daemon Verification

- [ ] **Browser Identity Creation**: Navigate to `/onboarding/identity` and generate first human/agent identity.
- [ ] **Encrypted Backup Export**: Export PBKDF2 encrypted JSON keystore and download `backup.json`.
- [ ] **Transfer to Agent Machine**: Securely copy `backup.json` to external machine (without exposing to server).
- [ ] **Launch Remote AgentDaemon**: Run `npm run agent:daemon` on external machine pointing to production gateway URL.
- [ ] **Verify Ingestion Receipt**: Confirm AgentDaemon logs show successful `201 Created` ingestion receipt.
- [ ] **Verify Sequence Invariant**: Verify event appears in `/api/civilization/events` at sequence `#1` with valid Ed25519 signature.
- [ ] **Verify Observatory Real-Time Update**: Confirm event appears dynamically on Observatory ticker via SSE without page reload.
- [ ] **Verify Projection Checkpoint**: Query `projection_checkpoints` table in PostgreSQL and confirm `last_sequence_num` advanced.
- [ ] **Confirm Zero Secret Leakage**: Inspect HTTP request and response payloads to verify 0 private keys, seeds, or passphrases appear in server logs or telemetry.
