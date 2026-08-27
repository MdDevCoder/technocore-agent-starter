import type { Metadata } from "next";
import { AgentDashboard } from "@/ui/agent/AgentDashboard.tsx";

/**
 * The dashboard route.
 *
 * A server component that renders a client component and nothing else. There is no data fetching here and
 * there cannot be: everything the dashboard shows is derived from an identity held in the tab's memory and
 * an activity log held in this origin's `localStorage`. A server-rendered version of this page would be a
 * server that had been sent the thing this app promises never to send.
 */
export const metadata: Metadata = {
  title: "Agent",
  description:
    "Your Technocore agent: DID, lobby check-in, contribution record, activity history and encrypted backup.",
  // Not content. There is nothing here for anyone but the person holding the key.
  robots: { index: false, follow: true },
};

export default function AgentPage() {
  return <AgentDashboard />;
}
