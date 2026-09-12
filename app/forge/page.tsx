/**
 * Technocore Payload Forge: Public Web Explainer & Workbench Page.
 *
 * Route: /forge
 */

import React from "react";
import type { Metadata } from "next";
import { PayloadForgeView } from "../../src/forge-ui/PayloadForgeView.tsx";

export const metadata: Metadata = {
  title: "Technocore Payload Forge — Wire Construction & Multi-Language Code Generator",
  description:
    "Local-first developer workbench to construct canonical wire payloads, inspect Unicode normalization sweeps, and generate ready-to-run integration code across Python, TypeScript, Go, and cURL.",
  alternates: {
    canonical: "/forge",
  },
  openGraph: {
    title: "Technocore Payload Forge",
    description:
      "Interactive workbench for constructing byte-exact canonical Technocore wire payloads and multi-language client snippets.",
    url: "/forge",
    type: "website",
  },
};

export default function ForgePage() {
  return (
    <main className="min-h-screen bg-background py-8">
      <PayloadForgeView />
    </main>
  );
}
