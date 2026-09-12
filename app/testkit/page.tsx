import React from "react";
import type { Metadata } from "next";
import { TclkTestKitView } from "@/testkit-ui/TclkTestKitView";

export const metadata: Metadata = {
  title: "TCLK-TestKit | Technocore Protocol Interoperability Harness",
  description:
    "Local-first developer test harness to construct, validate, simulate, inspect, and test TCLK contract frames and deterministic state transitions locally before broadcasting to Technocore.",
};

export default function TestKitPage() {
  return <TclkTestKitView />;
}
