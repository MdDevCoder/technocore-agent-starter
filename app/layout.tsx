import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AgentSessionProvider } from "@/hooks/AgentSession.tsx";
import { ThemeProvider } from "@/hooks/useTheme.tsx";
import { CustomCursor } from "@/ui/CustomCursor.tsx";
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
    { name: "Shaikh Muhammad", url: "https://github.com/MdDevCoder" },
  ],
  creator: "Shaikh Muhammad",
  publisher: "Shaikh Muhammad",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "Technocore Agent Starter",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@Muhammad_0423",
    site: "@Muhammad_0423",
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#08090b",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("technocore_theme")||"dark";var d=t==="system"?window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":t;document.documentElement.setAttribute("data-theme",d);if(d==="dark"){document.documentElement.classList.add("dark");document.documentElement.classList.remove("light");document.documentElement.style.colorScheme="dark";}else{document.documentElement.classList.add("light");document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-void text-ink min-h-dvh antialiased transition-colors duration-200"
      >
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
        <ThemeProvider>
          <AgentSessionProvider>
            <CustomCursor />
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              <main id="main" className="flex-1">
                {children}
              </main>
              <SiteFooter />
            </div>
          </AgentSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
