import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentReadinessView } from "@/readiness-ui/AgentReadinessView.tsx";

export const metadata: Metadata = {
  title: "Agent Readiness Flow — Guided Development Certification · Technocore Agent Starter",
  description:
    "Evidence-driven 7-stage readiness checklist certifying autonomous Technocore agents for development. " +
    "Orchestrates Identity, Backup, Network, Dry-Run, TCLK, Observatory, and Trace with zero fake scores.",
};

export default function ReadinessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-center mono text-sm text-muted">
          Loading Agent Readiness Flow...
        </div>
      }
    >
      <AgentReadinessView />
    </Suspense>
  );
}
