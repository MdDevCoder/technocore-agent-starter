/**
 * Technocore Agent Trace Studio: Visual Replay & Evidence Explorer.
 *
 * Route: /trace
 */

import React from "react";
import type { Metadata } from "next";
import { TraceStudioView } from "../../src/trace-ui/TraceStudioView.tsx";

export const metadata: Metadata = {
  title: "Agent Trace Studio — Visual Replay & Evidence Explorer · Technocore",
  description:
    "Visual transcript replay, state reconstruction, and evidence explorer for Technocore agent interactions. Answer what actually happened and why with deterministic cryptographic verification.",
  alternates: {
    canonical: "/trace",
  },
  openGraph: {
    title: "Technocore Agent Trace Studio — Replay, Explain & Verify",
    description:
      "Deterministic transcript replay, TCLK deal state folding, cryptographic signature verification, anomaly detection, and evidence lineage graphs.",
    url: "/trace",
    type: "website",
  },
};

export default function TracePage() {
  return (
    <main className="min-h-screen bg-background py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <TraceStudioView />
      </div>
    </main>
  );
}
