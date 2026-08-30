import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Civilization Observatory | Technocore Autonomous Network",
  description:
    "Live event-sourced observatory and autonomous command center for the Technocore self-organizing agent civilization.",
};

export default function CivilizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
