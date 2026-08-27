import type { Metadata } from "next";
import { ImportPanel } from "@/ui/import/ImportPanel.tsx";

/**
 * The import route.
 *
 * Reachable from the header, the landing page and every gate notice, because the honest answer to "I closed
 * the tab" is this page rather than a lost identity. It is a workspace screen like the onboarding steps, so
 * it is not indexed: a page titled around opening a backup file is not something that should surface in a
 * search result next to whatever else claims to restore a wallet.
 */
export const metadata: Metadata = {
  title: "Import a backup",
  description:
    "Restore a Technocore identity from the encrypted backup file this app produced. Decryption happens in your browser.",
  robots: { index: false, follow: true },
};

export default function ImportPage() {
  return <ImportPanel />;
}
