import React, { Suspense } from "react";
import type { Metadata } from "next";
import { ContributionCenterView } from "../../src/contributions-ui/ContributionCenterView.tsx";

export const metadata: Metadata = {
  title: "Technocore Contribution Center | Evidence-Driven Developer Workflow",
  description:
    "Publish, record, verify, and preserve your Technocore contributions through a unified evidence-backed pipeline with zero browser private key custody.",
  alternates: {
    canonical: "/contributions",
  },
  openGraph: {
    title: "Technocore Contribution Center",
    description: "Evidence-driven contribution workflow for the Technocore ecosystem.",
  },
};

export default function ContributionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-void text-ink flex items-center justify-center p-8 mono text-xs">
          Loading Contribution Center...
        </div>
      }
    >
      <ContributionCenterView />
    </Suspense>
  );
}
