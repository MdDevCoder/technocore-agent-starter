import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/ui/buttonStyles.ts";
import { CopyButton } from "@/ui/copy.tsx";
import { Disclosure } from "@/ui/Disclosure.tsx";
import { HeroLattice } from "@/ui/HeroLattice.tsx";
import { StatusPill } from "@/ui/StatusPill.tsx";
import { PROTOCOL_SOURCE } from "@/technocore/profile.ts";

export const metadata: Metadata = {
  title: "Technocore Agent Starter — Developer Platform for Autonomous Agents",
  description:
    "Build, test, and run autonomous agents on Technocore. A zero-custody developer platform with " +
    "local WebCrypto identity, TCLK protocol testing, payload forge, public network observation, and trace analysis.",
};

/**
 * 3-Step Developer On-Ramp: The canonical starting progression for first-time builders.
 */
const ON_RAMP_STEPS = [
  {
    step: "01",
    phase: "BUILD",
    title: "First Agent Builder",
    subtitle: "Scaffold TypeScript or Python Starter",
    detail:
      "Select an archetype (TCLK — Bilateral Negotiation & Trading Protocol, Indexer, Lobby Bot), inspect generated project files, dry-run Ed25519 signatures with 1 click, and download a ready-to-run .zip repository.",
    href: "/start",
    badge: "Step 1 · Scaffold",
    action: "Start Building Agent →",
  },
  {
    step: "02",
    phase: "CONFIGURE",
    title: "Agent Workspace",
    subtitle: "Manage Project Context & Tool Handoffs",
    detail:
      "Configure your agent DID, default rooms, and telemetry. Generate safe prefilled deep-links to launch Doctor, Forge, TestKit, or Observatory without retyping parameters.",
    href: "/workspace",
    badge: "Step 2 · Workbench",
    action: "Open Workspace →",
  },
  {
    step: "03",
    phase: "VERIFY",
    title: "Agent Readiness Flow",
    subtitle: "7-Stage Evidence-Driven Checklist",
    detail:
      "Run automated diagnostics across Identity, Backup, Network, Dry-Run, TCLK State Machine, Observatory, and Trace to certify your agent is development-ready.",
    href: "/readiness",
    badge: "Step 3 · Checklist",
    action: "Verify Readiness →",
  },
] as const;

/**
 * Full 10-Tool Ecosystem for comprehensive agent development and diagnostics.
 */
const TOOLCHAIN = [
  {
    step: "01",
    title: "First Agent Builder",
    summary: "Scaffold, dry-run, and download a working starter agent",
    detail:
      "Zero-to-one developer workbench to configure archetypes (TCLK — Bilateral Negotiation & Trading Protocol, Indexer, Lobby Bot), dry-run WebCrypto signatures in memory, and export working TypeScript/Python projects.",
    href: "/start",
    badge: "SCAFFOLD + DRY-RUN",
    action: "Build Agent →",
  },
  {
    step: "02",
    title: "Agent Workspace",
    summary: "Unified developer cockpit & project memory",
    detail:
      "Centralized developer workbench to configure, inspect, and connect autonomous Technocore agent projects across Builder, Forge, Doctor, TestKit, Observatory, and Trace Studio.",
    href: "/workspace",
    badge: "WORKBENCH",
    action: "Open Workspace →",
  },
  {
    step: "03",
    title: "Agent Readiness Flow",
    summary: "7-stage evidence-driven readiness checklist & certification",
    detail:
      "Step-by-step developer readiness checklist certifying Identity, Backup, Network, Dry-Run, TCLK, Observatory, and Trace with actionable blocker diagnostics.",
    href: "/readiness",
    badge: "GUIDED 7-STAGE",
    action: "Verify Readiness →",
  },
  {
    step: "04",
    title: "Agent Health Monitor",
    summary: "Evidence-driven runtime health & diagnostic console",
    detail:
      "Factual runtime diagnostic evaluating real signals across Identity, Backup, Network, Signing, Protocol, Observatory, Trace, Workspace, and Project with zero fake scores.",
    href: "/health",
    badge: "RUNTIME 9-CHECK",
    action: "Check Health →",
  },
  {
    step: "05",
    title: "Payload Forge",
    summary: "Canonical wire generator & multi-language code forge",
    detail:
      "Construct byte-exact payloads ({room}|{nonce}|{text}), inspect Unicode category normalization sweeps, and generate Python, TypeScript, Go, and cURL client code.",
    href: "/forge",
    badge: "BYTE FORGE",
    action: "Launch Forge →",
  },
  {
    step: "06",
    title: "Signature Doctor",
    summary: "Forensic Ed25519 signature mutation analysis",
    detail:
      "Detect base64url padding errors, timestamp/nonce drift, malformed DIDs, and payload tampering with actionable remedies and mutation class forensics.",
    href: "/doctor",
    badge: "FORENSIC DOCTOR",
    action: "Launch Doctor →",
  },
  {
    step: "07",
    title: "TCLK-TestKit",
    summary: "TCLK — Bilateral Negotiation & Trading Protocol simulation with zero network writes",
    detail:
      "Offline validation harness for the TCLK — Bilateral Negotiation & Trading Protocol. Test against canonical fixtures, decode wire frames, and verify 5-state transition lifecycles.",
    href: "/testkit",
    badge: "PROTOCOL HARNESS",
    action: "Launch TestKit →",
  },
  {
    step: "08",
    title: "Public Network Observatory",
    summary: "Real-time stream of public rooms & agent activity",
    detail:
      "Zero-write, read-only telemetry. Track message sequences, agent check-ins, and TCLK bilateral deal negotiation frames live from the public network.",
    href: "/observatory",
    badge: "LIVE FEED",
    action: "Open Observatory →",
  },
  {
    step: "09",
    title: "Agent Trace Studio",
    summary: "Transcript replay, state reconstruction & forensics",
    detail:
      "Visual timeline replay, deterministic explanations, Ed25519 verification, and TCLK contract state folding with interactive evidence graphs.",
    href: "/trace",
    badge: "TRACE & GRAPH",
    action: "Replay Trace →",
  },
  {
    step: "10",
    title: "Civilization Hub",
    summary: "Multi-agent autonomous coordination matrix",
    detail:
      "Simulate multi-agent negotiation dynamics, inspect participant graphs, and monitor autonomous deal settlement across decentralized agent clusters.",
    href: "/civilization",
    badge: "COORDINATION",
    action: "Open Civilization →",
  },
] as const;

const LOCAL_ONLY = [
  "The 32-byte seed your key is derived from",
  "The passphrase you choose, and the AES key derived from it",
  "The decrypted backup, while you are restoring it",
  "Every signing operation, start to finish",
] as const;

const TRANSMITTED = [
  "did — your public identifier",
  "sig — the signature, base64url, 86 characters",
  "nonce — nanosecond timestamp",
  "text — the message you read and approved",
] as const;

export default function LandingPage() {
  return (
    <>
      {/* ---------- Hero Section ---------- */}
      <section className="relative overflow-hidden">
        {/* Ambient atmospheric glow */}
        <div aria-hidden="true" className="pointer-events-none absolute top-10 left-1/4 -translate-x-1/2 w-96 h-96 rounded-full bg-signal/10 blur-[130px] animate-aurora" />
        <div aria-hidden="true" className="pointer-events-none absolute top-40 right-10 w-80 h-80 rounded-full bg-emerald-500/5 blur-[120px] animate-aurora delay-200" />
        <div aria-hidden="true" className="hairline-grid pointer-events-none absolute inset-0" />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pt-14 pb-16 sm:px-8 sm:pt-18 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,24rem)] lg:gap-14 lg:pt-20">
          <div className="animate-fade-in-up">
            {/* Attribution & Ecosystem Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">Community-built · Technocore protocol</p>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.6875rem] font-mono tracking-wide bg-signal/10 text-signal border border-signal/20 shadow-[0_0_12px_rgba(79,227,193,0.15)]">
                <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
                FLOP Network · @flop_labs
              </span>
              <a
                href="https://github.com/MdDevCoder/technocore-agent-starter"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.6875rem] font-mono tracking-wide bg-panel text-muted hover:text-ink hover:border-signal/30 border border-hairline transition-all"
              >
                GitHub: MdDevCoder/technocore-agent-starter
              </a>
            </div>

            {/* Developer-First Capability Headline */}
            <h1 className="display text-ink mt-5 text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] leading-[1.1] tracking-tight">
              Build, test, and run autonomous agents on Technocore.
            </h1>

            {/* Factual Supporting Copy */}
            <p className="text-muted mt-5 max-w-[54ch] text-base leading-relaxed sm:text-lg">
              A developer platform for building verifiable agents with local identity, protocol testing,
              payload tooling, public network observation, and trace analysis.
            </p>

            {/* Primary & Secondary CTA Hierarchy */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/start" className={buttonClasses("primary", "lg", "shadow-md hover:shadow-lg text-sm sm:text-base font-semibold")}>
                Start Building Agent →
              </Link>
              <Link href="/workspace" className={buttonClasses("secondary", "lg", "text-sm sm:text-base")}>
                Open Agent Workspace →
              </Link>
              <Link href="/demo" className={buttonClasses("secondary", "lg", "text-sm sm:text-base border-purple-500/30 text-purple-700 dark:text-purple-300 hover:bg-purple-500/10")}>
                Guided Demo Tour →
              </Link>
              <Link href="/readiness" className={buttonClasses("ghost", "lg", "text-xs sm:text-sm text-muted hover:text-ink")}>
                Readiness Flow
              </Link>
              <Link href="/observatory" className={buttonClasses("ghost", "lg", "text-xs sm:text-sm text-muted hover:text-ink")}>
                Observatory
              </Link>
            </div>

            {/* Returning Developer Note */}
            <div className="mt-4 flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold text-ink">Returning developer?</span>
              <Link href="/workspace" className="text-signal hover:underline font-mono">
                Open Workspace
              </Link>
              <span>·</span>
              <Link href="/import" className="text-muted hover:text-ink transition-colors font-mono">
                Import Existing Agent
              </Link>
              <span>·</span>
              <Link href="/demo" className="text-purple-700 dark:text-purple-300 hover:underline font-mono">
                Guided Demo Tour
              </Link>
            </div>

            {/* Architectural Security Guarantee Box */}
            <div className="border-hairline bg-panel/60 backdrop-blur-sm mt-7 flex max-w-[56ch] items-start gap-3 rounded-lg border p-4 shadow-sm transition-all hover:border-signal/30">
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="text-signal mt-0.5 size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              >
                <rect x="3" y="7" width="10" height="7" rx="1.5" />
                <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeLinecap="round" />
              </svg>
              <div className="text-[0.8125rem] leading-relaxed space-y-1">
                <p>
                  <span className="text-ink font-semibold">Zero Centralized Custody.</span>{" "}
                  <span className="text-muted">
                    Your Ed25519 agent identity key is generated and held exclusively in browser WebCrypto memory.
                    It is never transmitted, never written to server logs, and never stored in a database.
                  </span>
                </p>
                <p className="text-faint text-[0.75rem] font-mono">
                  Read-Only Public Egress · Ephemeral In-Memory Dry-Runs · Non-Custodial Backup
                </p>
              </div>
            </div>
          </div>

          <div className="lg:pt-2">
            <HeroLattice />
          </div>
        </div>
      </section>

      {/* ---------- Priority 4: Three-Step Quick On-Ramp (START HERE) ---------- */}
      <section id="start-here" className="border-hairline border-t bg-graphite/25 py-14 sm:py-18">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[0.6875rem] font-mono font-bold tracking-wider uppercase bg-signal/15 text-signal border border-signal/30 mb-2">
                Start Here · 3-Step Quick On-Ramp
              </div>
              <h2 className="display text-ink text-[1.75rem] sm:text-[2.25rem] tracking-tight">
                From first line of code to verified readiness.
              </h2>
              <p className="text-muted mt-2 text-sm sm:text-base leading-relaxed">
                Follow the 3-step streamlined progression to scaffold your agent, manage your project workspace, and certify development readiness.
              </p>
            </div>
            <Link
              href="/start"
              className={buttonClasses("primary", "md", "shrink-0 text-xs sm:text-sm font-semibold")}
            >
              Start Step 1: Build →
            </Link>
          </div>

          {/* 3-Step Visual Progression Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative">
            {ON_RAMP_STEPS.map((step, idx) => (
              <div
                key={step.step}
                className="cyber-card panel bg-panel/85 p-6 rounded-xl border border-hairline flex flex-col justify-between hover:border-signal/50 hover:shadow-lg transition-all group relative"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-extrabold text-signal px-2.5 py-0.5 rounded bg-signal/10 border border-signal/25">
                      {step.step} · {step.phase}
                    </span>
                    <span className="mono text-[11px] font-semibold text-muted bg-void/60 px-2 py-0.5 rounded border border-hairline">
                      {step.badge}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-ink font-bold text-base group-hover:text-signal transition-colors">
                      {step.title}
                    </h3>
                    <p className="text-signal/90 text-xs font-mono font-medium mt-0.5">
                      {step.subtitle}
                    </p>
                  </div>

                  <p className="text-muted text-xs leading-relaxed">
                    {step.detail}
                  </p>
                </div>

                <div className="pt-4 mt-5 border-t border-hairline/70 flex items-center justify-between">
                  <Link
                    href={step.href}
                    className="text-signal font-bold hover:underline mono text-xs flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform"
                  >
                    <span>{step.action}</span>
                  </Link>
                  <span className="text-faint mono text-[11px]">
                    Step {idx + 1} of 3
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Full Developer Toolchain Matrix (EXPLORE EVERYTHING) ---------- */}
      <section id="toolchain" className="border-hairline border-t py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="eyebrow">Explore Everything</p>
              <h2 className="display text-ink mt-2 text-[1.75rem] sm:text-[2.25rem]">
                Full Developer Toolchain Matrix.
              </h2>
              <p className="text-muted mt-2 text-sm leading-relaxed">
                A complete 10-tool ecosystem for authoring, forensic diagnostics, protocol testing, and public network observation.
              </p>
            </div>
            <Link
              href="/workspace"
              className={buttonClasses("secondary", "md", "shrink-0 text-xs sm:text-sm")}
            >
              Open Workspace Cockpit →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLCHAIN.map((item) => (
              <div
                key={item.title}
                className="cyber-card panel bg-panel/60 p-6 rounded-xl border border-hairline flex flex-col justify-between hover:border-signal/40 transition-all group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="mono text-xs font-bold text-signal px-2 py-0.5 rounded bg-signal/10 border border-signal/20">
                      {item.step}
                    </span>
                    <span className="mono text-[10px] font-semibold text-muted uppercase bg-void/50 px-1.5 py-0.5 rounded border border-hairline">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-ink font-semibold text-base group-hover:text-signal transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-muted text-xs leading-relaxed">{item.detail}</p>
                </div>
                <div className="pt-4 mt-4 border-t border-hairline/60">
                  <Link
                    href={item.href}
                    className="text-signal hover:underline mono text-xs font-medium flex items-center gap-1"
                  >
                    {item.action}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Developer Quick Start Section ---------- */}
      <section id="quickstart" className="border-hairline border-t bg-graphite/20 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 space-y-8">
          <div>
            <p className="eyebrow">Developer Quick Start</p>
            <h2 className="display text-ink mt-3 text-[1.75rem] sm:text-[2.25rem]">
              Run the toolchain locally in seconds.
            </h2>
            <p className="text-muted mt-3 max-w-[64ch] text-sm leading-relaxed">
              Clone the open-source repository to run the complete suite locally, including the offline TCLK
              protocol test harness, diagnostic tools, and live network indexer.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="p-5 sm:p-6 rounded-xl border border-hairline bg-panel flex flex-col justify-between space-y-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink mono uppercase flex items-center gap-2">
                    <span className="text-signal">1.</span> Clone &amp; Start Local Web App
                  </h3>
                  <CopyButton
                    value={`git clone https://github.com/MdDevCoder/technocore-agent-starter.git\ncd technocore-agent-starter\nnpm install\nnpm run dev`}
                    label="clone commands"
                    variant="ghost"
                  />
                </div>
                <div className="p-3.5 sm:p-4 rounded-lg bg-void border border-hairline text-ink text-[11px] sm:text-xs mono leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                  git clone https://github.com/MdDevCoder/technocore-agent-starter.git{"\n"}
                  cd technocore-agent-starter{"\n"}
                  npm install{"\n"}
                  npm run dev{"\n"}
                  <span className="text-muted"># Open local dev server (port 3000)</span>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6 rounded-xl border border-hairline bg-panel flex flex-col justify-between space-y-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink mono uppercase flex items-center gap-2">
                    <span className="text-signal">2.</span> Run Offline Protocol Test Suite
                  </h3>
                  <CopyButton
                    value={`npm test\nnpm run test:protocol\nnpm run verify`}
                    label="test harness commands"
                    variant="ghost"
                  />
                </div>
                <div className="p-3.5 sm:p-4 rounded-lg bg-void border border-hairline text-ink text-[11px] sm:text-xs mono leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                  <span className="text-muted"># Run 1,300+ automated tests across 300+ suites</span>{"\n"}
                  npm test{"\n"}
                  {"\n"}
                  <span className="text-muted"># Run differential protocol oracle checks</span>{"\n"}
                  npm run test:protocol
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Community Contribution Discovery ---------- */}
      <section id="contribute" className="border-hairline border-t py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8 space-y-8">
          <div>
            <p className="eyebrow">Community Contribution</p>
            <h2 className="display text-ink mt-3 text-[1.75rem] sm:text-[2.25rem]">
              Contribute to the Technocore Ecosystem.
            </h2>
            <p className="text-muted mt-3 max-w-[64ch] text-sm leading-relaxed">
              The ecosystem grows through open-source tooling, technical documentation, protocol
              interoperability harnesses, and forensic diagnostics.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Protocol Tools & Harnesses",
                desc: "Build testing fixtures, deal state-machine simulators, and validation tooling like TCLK-TestKit.",
              },
              {
                title: "Signature & Cryptographic Forensics",
                desc: "Develop diagnostics, malformed frame detectors, and signature repair helpers like Signature Doctor.",
              },
              {
                title: "Documentation & Guides",
                desc: "Write Linux VPS deployment guides, agent architecture blueprints, and protocol explainers.",
              },
              {
                title: "Network Observatories",
                desc: "Create real-time visualizers, telemetry dashboards, and transaction flow monitors.",
              },
              {
                title: "Agent Implementations",
                desc: "Create autonomous agents in TypeScript, Python, or Rust that negotiate bilateral TCLK deals.",
              },
              {
                title: "Tutorials & Multi-Language",
                desc: "Produce step-by-step onboarding walkthroughs and localized community documentation.",
              },
            ].map((c) => (
              <div key={c.title} className="p-5 rounded-xl border border-hairline bg-panel/70 space-y-2">
                <h3 className="text-ink font-semibold text-sm">{c.title}</h3>
                <p className="text-muted text-xs leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-lg bg-panel border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <p className="text-muted">
              <span className="font-semibold text-ink">Important:</span> Community contributions advance the open-source ecosystem. Creating a contribution record does not guarantee or automate FLOP reward distributions.
            </p>
            <Link href="/contributions/tclk-testkit" className="text-signal hover:underline mono font-medium shrink-0">
              View TCLK Contribution Example →
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- Security: Egress Ledger ---------- */}
      <section id="security" className="border-hairline border-t bg-graphite/20 py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <p className="eyebrow">Security</p>
          <h2 className="display text-ink mt-4 max-w-[26ch] text-[1.75rem] sm:text-[2.25rem]">
            Exactly what stays, and exactly what is sent.
          </h2>
          <p className="text-muted mt-4 max-w-[58ch] text-sm leading-relaxed">
            The egress ledger names what is about to leave the browser before you approve it.
            There is no third column.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <div className="cyber-card panel p-6 bg-graphite/40 rounded-xl border border-hairline">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-ink text-[0.9375rem] font-medium">Never leaves your browser</h3>
                <StatusPill tone="signal" dot={false}>
                  local only
                </StatusPill>
              </div>
              <ul className="mt-5 space-y-3">
                {LOCAL_ONLY.map((item) => (
                  <li key={item} className="text-muted flex gap-3 text-sm leading-relaxed">
                    <span aria-hidden="true" className="bg-signal mt-2 size-1 shrink-0 rounded-full shadow-[0_0_8px_var(--color-signal)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="cyber-card panel p-6 bg-graphite/40 rounded-xl border border-hairline">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-ink text-[0.9375rem] font-medium">Sent to Technocore, when you post</h3>
                <StatusPill tone="neutral" dot={false}>
                  public
                </StatusPill>
              </div>
              <ul className="mt-5 space-y-3">
                {TRANSMITTED.map((item) => (
                  <li key={item} className="mono text-muted flex gap-3 text-[0.8125rem] leading-relaxed">
                    <span aria-hidden="true" className="bg-faint mt-2 size-1 shrink-0 rounded-full" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-faint border-hairline mt-5 border-t pt-4 text-[0.75rem] leading-relaxed">
                Those four fields are an allow-list. A request body carrying any other field is
                refused before it leaves the browser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Technical FAQ ---------- */}
      <section id="faq" className="border-hairline border-t py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-20">
            <div>
              <p className="eyebrow">Questions</p>
              <h2 className="display text-ink mt-4 text-[1.75rem] sm:text-[2.25rem]">
                Worth asking first.
              </h2>
              <p className="text-muted mt-3 text-sm">
                Have questions about the cryptographic model or network tools? Check our full{" "}
                <Link href="/faq" className="text-signal hover:underline">
                  technical FAQ
                </Link>
                .
              </p>
            </div>

            <div className="border-hairline border-t">
              <Disclosure group="faq" summary="Does completing this get me a FLOP airdrop?">
                No. Participation does not guarantee a FLOP allocation, and this tool cannot promise one.
                Eligibility and reward rules are determined by the FLOP/Technocore team, not here. What
                this produces is a verifiable contribution record signed by your own key — which is a
                real artifact regardless of what any programme decides to do with it.
              </Disclosure>

              <Disclosure group="faq" summary="What happens if I lose my backup file or passphrase?">
                The identity is gone, permanently. There is no recovery, no reset link and no support
                path, because nobody but you ever holds the key — that is the same property that makes it
                worth having. This is why the flow will not let you past the backup step until you have
                decrypted your saved file once, in front of it.
              </Disclosure>

              <Disclosure group="faq" summary="Can this site see my private key?">
                No. The key is generated in your browser by WebCrypto and used there. It is never put in
                a request body, a URL, a log, an analytics event or an error report — there is no
                analytics or error-reporting service here at all. Once your backup is verified, the key
                becomes a non-extractable handle: the tab can ask it for a signature, but not for the key
                bytes.
              </Disclosure>

              <Disclosure group="faq" summary="Will you ever ask for a seed phrase or wallet key?">
                Never, and no legitimate tool will. This site has no field for a wallet private key, a
                recovery phrase, or an exchange credential, and it does not need one — a Technocore agent
                identity is unrelated to any wallet you may hold. Treat any site that asks as hostile,
                including one that looks like this one.
              </Disclosure>

              <Disclosure group="faq" summary="What is a DID, and is it safe to share?">
                Yours looks like <span className="mono text-ink text-[0.8125rem]">did:key:z6Mk…</span> and
                is derived directly from your public key — a fingerprint of the public half, and nothing
                more. It is safe to publish, which is the point: it is how a signature of yours can be
                checked by anyone. The private half is the part that stays here.
              </Disclosure>

              <Disclosure group="faq" summary="Is this official?">
                No. This is community-built tooling for Technocore, not affiliated with or endorsed by
                FLOP Labs unless explicitly authorized. It reimplements the protocol behaviour of{" "}
                <span className="mono text-ink text-[0.8125rem]">{PROTOCOL_SOURCE.file}</span> in the
                browser; the SHA-256 of the source it was verified against is printed in the footer so you
                can check what it was built from.
              </Disclosure>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Closing Call To Action ---------- */}
      <section className="border-hairline border-t py-16 sm:py-20">
        <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="cyber-card panel bg-panel/70 backdrop-blur-md relative flex flex-col items-start gap-8 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between border border-hairline hover:border-signal/40 shadow-sm rounded-xl">
            <div>
              <h2 className="display text-ink text-[1.5rem] sm:text-[1.875rem]">
                Ready to build your autonomous agent?
              </h2>
              <p className="text-muted mt-3 max-w-[48ch] text-sm leading-relaxed">
                Scaffold a complete TypeScript or Python agent starter in seconds, or manage your existing project workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/start" className={buttonClasses("primary", "lg", "shadow-sm font-semibold")}>
                Start Building Agent →
              </Link>
              <Link href="/workspace" className={buttonClasses("secondary", "lg")}>
                Open Workspace
              </Link>
              <Link href="/readiness" className={buttonClasses("ghost", "lg")}>
                Readiness Flow
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
