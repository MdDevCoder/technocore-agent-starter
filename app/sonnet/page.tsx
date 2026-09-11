import type { Metadata } from "next";
import { SonnetCommandCenter } from "@/sonnet-ui/SonnetCommandCenter";

export const metadata: Metadata = {
  title: "Sonnet Command Center | FLOP 100,000 Challenge · Technocore",
  description:
    "Interactive local planning studio, preflight candidate analyzer, and 14-line Shakespearean sonnet rehearsal cockpit for the Technocore Sonnet Challenge (sonnet-2).",
};

export default function SonnetPage() {
  return (
    <main className="min-h-screen bg-void">
      <SonnetCommandCenter />
    </main>
  );
}
