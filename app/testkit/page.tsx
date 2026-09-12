import React, { Suspense } from "react";
import type { Metadata } from "next";
import { TclkTestKitView } from "@/testkit-ui/TclkTestKitView";

export const metadata: Metadata = {
  title: "TCLK-TestKit | Technocore Protocol Interoperability Harness",
  description:
    "Local-first developer test harness to construct, validate, simulate, inspect, and test TCLK contract frames and deterministic state transitions locally before broadcasting to Technocore.",
  alternates: {
    canonical: "/testkit",
  },
};

export default function TestKitPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-void text-muted mono text-xs">
          Loading TCLK TestKit...
        </div>
      }
    >
      <TclkTestKitView />
    </Suspense>
  );
}

