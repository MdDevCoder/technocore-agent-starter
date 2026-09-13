import type { Metadata } from "next";
import { Suspense } from "react";
import { EvidenceVaultView } from "@/evidence-ui/EvidenceVaultView.tsx";

export const metadata: Metadata = {
  title: "Contribution Evidence Vault — Locally Preserved Proof · Technocore Agent Starter",
  description:
    "Preserve, cryptographically verify, and export durable public proof for signed Technocore contributions " +
    "before live public room retention windows advance. Local-first and read-only.",
};

export default function EvidencePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-16 text-center mono text-sm text-muted">
          Loading Contribution Evidence Vault...
        </div>
      }
    >
      <EvidenceVaultView />
    </Suspense>
  );
}
