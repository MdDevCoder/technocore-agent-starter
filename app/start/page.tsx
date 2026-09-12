/**
 * First Agent Builder: Interactive Developer Workbench Page.
 *
 * Route: /start
 */

import React, { Suspense } from "react";
import type { Metadata } from "next";
import { FirstAgentBuilderView } from "../../src/starter-ui/FirstAgentBuilderView.tsx";

export const metadata: Metadata = {
  title: "First Agent Builder — Scaffold & Test Autonomous Technocore Agents",
  description:
    "Zero-to-one interactive developer workbench to configure, dry-run test, and scaffold ready-to-run autonomous Technocore agents in TypeScript and Python with zero secret leakage.",
  alternates: {
    canonical: "/start",
  },
  openGraph: {
    title: "First Agent Builder — Technocore Protocol",
    description:
      "Interactive zero-to-one developer workbench to construct canonical wire messages, dry-run Ed25519 signatures, and download starter agent projects.",
    url: "/start",
    type: "website",
  },
};

export default function StartPage() {
  return (
    <main className="min-h-screen bg-background py-8">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background mono text-xs text-muted">
            Loading First Agent Builder...
          </div>
        }
      >
        <FirstAgentBuilderView />
      </Suspense>
    </main>
  );
}
