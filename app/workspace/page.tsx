/**
 * Agent Workspace: Unified Developer Environment Page.
 *
 * Route: /workspace
 */

import React, { Suspense } from "react";
import type { Metadata } from "next";
import { WorkspaceView } from "../../src/workspace-ui/WorkspaceView.tsx";

export const metadata: Metadata = {
  title: "Agent Workspace — Unified Developer Environment",
  description:
    "Centralized developer workbench to configure, inspect, and connect autonomous Technocore agent projects across Builder, Forge, Doctor, TestKit, Observatory, and Trace Studio.",
  alternates: {
    canonical: "/workspace",
  },
  openGraph: {
    title: "Agent Workspace — Technocore Protocol",
    description:
      "Centralized developer workbench to configure, inspect, and connect autonomous Technocore agent projects.",
    url: "/workspace",
    type: "website",
  },
};

export default function WorkspacePage() {
  return (
    <main className="min-h-screen bg-background">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-background mono text-xs text-muted">
            Loading Agent Workspace...
          </div>
        }
      >
        <WorkspaceView />
      </Suspense>
    </main>
  );
}
