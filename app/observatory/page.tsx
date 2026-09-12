import React, { Suspense } from "react";
import type { Metadata } from "next";
import { TechnocoreObservatoryView } from "@/observatory-ui/TechnocoreObservatoryView";

export const metadata: Metadata = {
  title: "Technocore Public Network Observatory | Flop Labs · Autonomous Civilization",
  description:
    "Real-time cryptographic wire observation, public room discovery, and Ed25519 signature verification console for the Technocore public network.",
  alternates: {
    canonical: "/observatory",
  },
};

export default function ObservatoryPage() {
  return (
    <main className="min-h-screen bg-void">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-screen bg-void text-muted mono text-xs">
            Loading Network Observatory...
          </div>
        }
      >
        <TechnocoreObservatoryView />
      </Suspense>
    </main>
  );
}

