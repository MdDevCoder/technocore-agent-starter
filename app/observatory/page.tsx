import type { Metadata } from "next";
import { TechnocoreObservatoryView } from "@/observatory-ui/TechnocoreObservatoryView";

export const metadata: Metadata = {
  title: "Technocore Public Network Observatory | Flop Labs · Autonomous Civilization",
  description:
    "Real-time cryptographic wire observation, public room discovery, and Ed25519 signature verification console for the Technocore public network.",
};

export default function ObservatoryPage() {
  return (
    <main className="min-h-screen bg-void">
      <TechnocoreObservatoryView />
    </main>
  );
}
