import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentHealthView } from "@/health-ui/AgentHealthView.tsx";

export const metadata: Metadata = {
  title: "Agent Health Monitor — Runtime Signal Evaluation · Technocore Agent Starter",
  description:
    "Evidence-driven health console for Technocore autonomous agents. Real-time runtime diagnostics " +
    "across Identity, Backup, Network, Signing, Protocol, Observatory, Trace, Workspace, and Project with zero secrets.",
};

export default function HealthPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-center mono text-sm text-muted">
          Loading Agent Health Monitor...
        </div>
      }
    >
      <AgentHealthView />
    </Suspense>
  );
}
