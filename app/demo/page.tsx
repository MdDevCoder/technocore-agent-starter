import React, { Suspense } from "react";
import type { Metadata } from "next";
import { GuidedDemoView } from "@/demo-ui/GuidedDemoView.tsx";

export const metadata: Metadata = {
  title: "Guided Platform Walkthrough & Interactive Demo · Technocore Agent Starter",
  description:
    "Deterministic 10-stage guided tour across the complete Technocore Agent platform. " +
    "Explore scaffolding, TCLK deals, readiness verification, evidence preservation, and trace forensics with zero private key custody.",
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: "Technocore Guided Platform Walkthrough",
    description: "Deterministic 10-stage developer tour across the Technocore agent ecosystem.",
  },
};

export default function DemoPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-center mono text-xs text-muted">
          Loading Guided Platform Walkthrough...
        </div>
      }
    >
      <GuidedDemoView />
    </Suspense>
  );
}
