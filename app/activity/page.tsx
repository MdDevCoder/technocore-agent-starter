import React, { Suspense } from "react";
import type { Metadata } from "next";
import { ActivityCenterView } from "../../src/activity-ui/ActivityCenterView.tsx";

export const metadata: Metadata = {
  title: "Agent Activity Center | Factual Developer History | Technocore",
  description:
    "A factual, local-first chronological record of meaningful developer and autonomous agent activity across the Technocore toolchain.",
};

export default function ActivityPage() {
  return (
    <main className="min-h-screen bg-void text-ink">
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl px-4 py-16 text-center mono text-muted text-sm">
            Loading activity history...
          </div>
        }
      >
        <ActivityCenterView />
      </Suspense>
    </main>
  );
}
