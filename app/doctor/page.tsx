/**
 * Technocore Signature Doctor: Forensic Wire Debugger Route (/doctor)
 */

import React, { Suspense } from "react";
import type { Metadata } from "next";
import { SignatureDoctorView } from "../../src/doctor-ui/SignatureDoctorView.tsx";

export const metadata: Metadata = {
  title: "Technocore Signature Doctor | Forensic Wire Debugger",
  description:
    "Deterministic differential diagnostic toolkit to explain why an Ed25519 signature fails verification on Technocore.",
};

function DoctorPageContent() {
  return <SignatureDoctorView />;
}

export default function DoctorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-void text-muted mono text-xs">
          Loading Signature Doctor...
        </div>
      }
    >
      <DoctorPageContent />
    </Suspense>
  );
}
