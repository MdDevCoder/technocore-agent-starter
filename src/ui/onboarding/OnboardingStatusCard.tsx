"use client";

import { useEffect, useState } from "react";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { ellipsize } from "../format.ts";

export type NetworkStatus = "checking" | "reachable" | "degraded" | "offline";

export function OnboardingStatusCard() {
  const { identity, backup, artifacts, config } = useAgentSession();
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("checking");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function probeNetwork() {
      const startTime = performance.now();
      try {
        // Safe read-only room query via configured transport proxy or direct
        const targetUrl = config.transportMode === "proxy"
          ? `${config.proxyPrefix}/r/lobby?format=json&limit=1`
          : `${config.baseUrl}/r/lobby?format=json&limit=1`;

        const res = await fetch(targetUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        });

        const elapsed = Math.round(performance.now() - startTime);
        if (cancelled) return;

        if (res.ok) {
          setLatencyMs(elapsed);
          setNetworkStatus(elapsed > 1800 ? "degraded" : "reachable");
        } else {
          setLatencyMs(elapsed);
          setNetworkStatus("degraded");
        }
      } catch {
        if (!cancelled) {
          setNetworkStatus("offline");
          setLatencyMs(null);
        }
      }
    }

    void probeNetwork();
    const interval = setInterval(() => void probeNetwork(), 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [config]);

  // Stage 1: Identity
  const identityState = identity !== null;

  // Stage 2: Backup
  const backupState = backup === "verified";

  // Stage 3: Introduce
  const introSigned = artifacts.introduction !== null;
  const introAccepted = typeof artifacts.introduction?.record.sequence === "number";

  return (
    <div
      className="panel rounded-lg border border-hairline/80 bg-panel/60 p-4 text-[0.8125rem] backdrop-blur-sm"
      aria-label="Onboarding Lifecycle Status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-3">
        <span className="eyebrow tracking-wider text-ink/90 font-medium">Onboarding Status Ledger</span>
        <div className="flex items-center gap-1.5 mono text-[0.6875rem]">
          <span className="text-faint">Network:</span>
          {networkStatus === "checking" ? (
            <span className="flex items-center gap-1 text-faint">
              <span className="size-1.5 rounded-full bg-faint animate-pulse" />
              Probing
            </span>
          ) : networkStatus === "reachable" ? (
            <span className="flex items-center gap-1 text-verified font-medium">
              <span className="size-1.5 rounded-full bg-verified" />
              Reachable {latencyMs ? `(${latencyMs}ms)` : ""}
            </span>
          ) : networkStatus === "degraded" ? (
            <span className="flex items-center gap-1 text-attention font-medium">
              <span className="size-1.5 rounded-full bg-attention" />
              Degraded {latencyMs ? `(${latencyMs}ms)` : ""}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-fault font-medium">
              <span className="size-1.5 rounded-full bg-fault" />
              Offline
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Stage 1: Identity */}
        <div className="rounded border border-hairline/40 bg-surface/40 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink/90 text-[0.75rem]">1. IDENTITY</span>
            {identityState ? (
              <span className="flex items-center gap-1 text-verified font-medium text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-verified" />
                ◉ Complete
              </span>
            ) : (
              <span className="flex items-center gap-1 text-faint text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-hairline-bright" />
                ○ Not started
              </span>
            )}
          </div>
          <div className="mt-1 text-[0.6875rem] mono text-muted truncate">
            {identity ? ellipsize(identity.did, 10, 6) : "WebCrypto Ed25519"}
          </div>
        </div>

        {/* Stage 2: Backup */}
        <div className="rounded border border-hairline/40 bg-surface/40 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink/90 text-[0.75rem]">2. BACKUP</span>
            {backupState ? (
              <span className="flex items-center gap-1 text-verified font-medium text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-verified" />
                ◉ Verified
              </span>
            ) : backup === "exported" ? (
              <span className="flex items-center gap-1 text-attention font-medium text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-attention animate-pulse" />
                ○ Exported (Unverified)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-faint text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-hairline-bright" />
                ○ Not verified
              </span>
            )}
          </div>
          <div className="mt-1 text-[0.6875rem] mono text-muted">
            {backupState ? "Hardened (Seed Wiped)" : "PBKDF2 600k + AES-GCM"}
          </div>
        </div>

        {/* Stage 3: Introduce */}
        <div className="rounded border border-hairline/40 bg-surface/40 p-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-ink/90 text-[0.75rem]">3. INTRODUCE</span>
            {introAccepted ? (
              <span className="flex items-center gap-1 text-verified font-medium text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-verified" />
                ◉ Accepted
              </span>
            ) : introSigned ? (
              <span className="flex items-center gap-1 text-signal font-medium text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-signal" />
                ◉ Signed
              </span>
            ) : (
              <span className="flex items-center gap-1 text-faint text-[0.75rem]">
                <span className="size-1.5 rounded-full bg-hairline-bright" />
                ○ Not sent
              </span>
            )}
          </div>
          <div className="mt-1 text-[0.6875rem] mono text-muted">
            {introAccepted
              ? `Lobby Seq #${artifacts.introduction?.record.sequence}`
              : "Signed check-in to /r/lobby"}
          </div>
        </div>
      </div>
    </div>
  );
}
