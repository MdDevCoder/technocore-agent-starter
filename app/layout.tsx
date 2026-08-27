import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AgentSessionProvider } from "@/hooks/AgentSession.tsx";
import { SiteFooter } from "@/ui/SiteFooter.tsx";
import { SiteHeader } from "@/ui/SiteHeader.tsx";
import "./globals.css";

/**
 * Fonts are fetched once at build time by `next/font` and then served from this origin. That is a
 * security decision as much as a performance one: no request leaves the visitor's browser for a font
 * CDN, so `font-src 'self'` in the Content-Security-Policy stays true, and no third party learns that
 * someone is on the page where cryptographic keys get generated.
 *
 * The variable names match the tokens `app/globals.css` already declares in its `@theme` block.
 * All three are variable fonts, so no weight list is needed — the full axis ships in one file.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const TITLE = "Technocore Agent Starter";
const DESCRIPTION =
  "Create a verifiable Technocore contribution record in your browser. Your Ed25519 signing key is " +
  "generated locally and never leaves this device.";

export const metadata: Metadata = {
  title: { default: TITLE, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  applicationName: TITLE,
  authors: [
    { name: "Shaikh Muhammad (Owner)", url: "https://x.com/Muhammad_0423" },
    { name: "ExoTech", url: "https://exo-tech.org/" },
  ],
  creator: "Shaikh Muhammad",
  publisher: "ExoTech",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Technocore Agent Starter by ExoTech",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@Muhammad_0423",
    site: "@ExoTech_HQ",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-void text-ink min-h-dvh antialiased">
        {/*
          The skip link is the first focusable thing on every page. The onboarding flow puts a step
          rail and an egress ledger around the workspace, so without this a keyboard user would tab
          through navigation on every single step.
        */}
        <a
          href="#main"
          className="focus:bg-panel focus:text-ink focus:border-hairline-bright sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:px-4 focus:py-2 focus:text-sm"
        >
          Skip to content
        </a>
        {/*
          The provider holds the identity for the whole tab, so it wraps the layout rather than a single
          route: navigating from the last onboarding step to the dashboard must not remount it, because a
          remount would drop a signing key that exists nowhere else. It is mounted here and not around the
          header so that the header, the footer and every static page stay server-rendered.
        */}
        <AgentSessionProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </AgentSessionProvider>
      </body>
    </html>
  );
}
