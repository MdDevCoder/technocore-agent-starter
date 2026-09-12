"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ARCHETYPES, generateStarterProject, generateStarterZip } from "../starter/generator.ts";
import type { AgentArchetypeId, AgentLanguageId } from "../starter/types.ts";
import { inspectUnicodeSweep } from "../technocore/forge/engine.ts";
import { generateKeyPair, importSigningKey, sign } from "../crypto/ed25519.ts";
import { publicKeyToDid } from "../identity/did.ts";
import { utf8, toBase64Url, wipe } from "../crypto/bytes.ts";
import { extractSafeHandoffParams } from "../workspace/handoff.ts";
import { HandoffBanner } from "../workspace-ui/HandoffBanner.tsx";

export const FirstAgentBuilderView: React.FC = () => {
  const searchParams = useSearchParams();

  // State: Archetype & Language Selection
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<AgentArchetypeId>("TCLK_TRADER");
  const [selectedLanguage, setSelectedLanguage] = useState<AgentLanguageId>("TYPESCRIPT");
  const [agentName, setAgentName] = useState<string>("my-technocore-agent");

  // State: Identity & Room
  const [publicDid, setPublicDid] = useState<string>("did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2");
  const [targetRoom, setTargetRoom] = useState<string>("tclk-offers");
  const [isGeneratingIdentity, setIsGeneratingIdentity] = useState<boolean>(false);

  // Sync safe handoff parameters from URL
  useEffect(() => {
    if (!searchParams) return;
    const safe = extractSafeHandoffParams(searchParams, "builder");
    if (safe.project) setAgentName(safe.project);
    if (safe.lang) {
      setSelectedLanguage(safe.lang);
      setSelectedFilePath(safe.lang === "TYPESCRIPT" ? "src/agent.ts" : "agent.py");
    }
    if (safe.archetype) {
      setSelectedArchetypeId(safe.archetype);
      const arch = ARCHETYPES.find((a) => a.id === safe.archetype);
      if (arch) {
        setTargetRoom(arch.defaultRoom);
        setMessageText(arch.defaultPayloadTemplate);
      }
    }
    if (safe.room) setTargetRoom(safe.room);
    if (safe.did) setPublicDid(safe.did);
  }, [searchParams]);

  // State: First Message Drafting & Dry-Run
  const selectedArchetype = useMemo(
    () => ARCHETYPES.find((a) => a.id === selectedArchetypeId) || ARCHETYPES[0]!,
    [selectedArchetypeId],
  );

  const [messageText, setMessageText] = useState<string>(selectedArchetype.defaultPayloadTemplate);
  const [nonce, setNonce] = useState<string>("1789200001000");

  // State: Dry-Run Signing Outcome
  const [dryRunSignature, setDryRunSignature] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState<boolean>(false);

  // State: Active File Tab in Project Tree
  const [selectedFilePath, setSelectedFilePath] = useState<string>("src/agent.ts");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Update defaults when Archetype changes
  const handleSelectArchetype = useCallback((id: AgentArchetypeId) => {
    setSelectedArchetypeId(id);
    const arch = ARCHETYPES.find((a) => a.id === id);
    if (arch) {
      setTargetRoom(arch.defaultRoom);
      setMessageText(arch.defaultPayloadTemplate);
      setSelectedLanguage(arch.recommendedLanguage);
      setSelectedFilePath(arch.recommendedLanguage === "TYPESCRIPT" ? "src/agent.ts" : "agent.py");
      setDryRunSignature(null);
    }
  }, []);

  // Update active file when language changes
  const handleSelectLanguage = useCallback((lang: AgentLanguageId) => {
    setSelectedLanguage(lang);
    setSelectedFilePath(lang === "TYPESCRIPT" ? "src/agent.ts" : "agent.py");
  }, []);

  // Generate throwaway local WebCrypto identity
  const handleGenerateIdentity = useCallback(async () => {
    setIsGeneratingIdentity(true);
    try {
      const kp = await generateKeyPair();
      const derivedDid = publicKeyToDid(kp.publicKey);
      setPublicDid(derivedDid);
      wipe(kp.seed);
    } catch {
      // Fallback
    } finally {
      setIsGeneratingIdentity(false);
    }
  }, []);

  // Unicode Inspection of Draft Message
  const sweepReport = useMemo(() => {
    return inspectUnicodeSweep(messageText);
  }, [messageText]);

  // Canonical Payload calculation: room|nonce|text
  const canonicalFormula = useMemo(() => {
    return `${targetRoom.trim().replace(/^\/r\//, "")}|${nonce.trim()}|${sweepReport.canonicalText}`;
  }, [targetRoom, nonce, sweepReport.canonicalText]);

  // Execute in-memory ephemeral dry-run signature
  const handleDryRunSign = useCallback(async () => {
    setIsSigning(true);
    try {
      const ephemeralKey = await generateKeyPair();
      const signingKey = await importSigningKey(ephemeralKey.seed, ephemeralKey.publicKey);
      const payloadBytes = utf8(canonicalFormula);
      const sigBytes = await sign(signingKey, payloadBytes);
      const b64Sig = toBase64Url(sigBytes);
      setDryRunSignature(b64Sig);
      wipe(ephemeralKey.seed);
    } catch {
      setDryRunSignature(null);
    } finally {
      setIsSigning(false);
    }
  }, [canonicalFormula]);

  // Generated Project Structure
  const starterProject = useMemo(() => {
    return generateStarterProject({
      archetypeId: selectedArchetypeId,
      languageId: selectedLanguage,
      agentName,
      targetRoom,
      publicDid,
      sampleMessageText: messageText,
    });
  }, [selectedArchetypeId, selectedLanguage, agentName, targetRoom, publicDid, messageText]);

  // Active File content in tree viewer
  const activeFile = useMemo(() => {
    return starterProject.files.find((f) => f.path === selectedFilePath) || starterProject.files[0]!;
  }, [starterProject.files, selectedFilePath]);

  // Copy helper
  const triggerCopy = useCallback((text: string, key: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  // Download as PKZip binary archive (.zip)
  const handleDownloadZip = useCallback(() => {
    const zipBytes = generateStarterZip({
      archetypeId: selectedArchetypeId,
      languageId: selectedLanguage,
      agentName,
      targetRoom,
      publicDid,
      sampleMessageText: messageText,
    });
    // Create blob with application/zip
    const blob = new Blob([zipBytes as unknown as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agentName}-starter.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [selectedArchetypeId, selectedLanguage, agentName, targetRoom, publicDid, messageText]);

  // Download all files as a clean bundled text payload
  const handleDownloadTextBundle = useCallback(() => {
    const bundleText = starterProject.files
      .map((f) => `// ==========================================\n// FILE: ${f.path}\n// ==========================================\n\n${f.content}\n\n`)
      .join("\n");

    const blob = new Blob([bundleText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agentName}-starter-bundle.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [starterProject.files, agentName]);

  return (
    <div className="flex flex-col gap-8 p-4 lg:p-8 min-h-screen bg-void text-ink font-sans max-w-7xl mx-auto">
      {/* Top Banner & Security Guarantee */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-xl border border-hairline bg-panel shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-3 w-3 rounded-full bg-signal animate-pulse" />
            <h1 className="text-xl font-bold tracking-tight uppercase text-ink">
              First Agent Builder
            </h1>
            <span className="rounded bg-signal/15 border border-signal/30 px-2 py-0.5 text-xs font-bold text-signal mono">
              v1.0 · GUIDED SCAFFOLDER
            </span>
          </div>
          <p className="text-xs text-muted max-w-2xl leading-relaxed">
            Go from zero to a running, cryptographically verified autonomous Technocore agent in seconds.
            Includes wire canonicalization, local dry-run signing, and a self-contained starter project.
          </p>
        </div>

        {/* Security Badges */}
        <div className="flex flex-wrap items-center gap-2 mono text-[11px]">
          <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-emerald-700 dark:text-emerald-400 font-semibold">
            ● LOCAL DRY-RUN DEFAULT
          </span>
          <span className="rounded bg-sky-500/15 border border-sky-500/30 px-2.5 py-1 text-sky-700 dark:text-sky-400 font-semibold">
            ● ZERO SECRET LEAKAGE
          </span>
          <span className="rounded bg-panel-high border border-hairline px-2.5 py-1 text-muted">
            ● NON-CUSTODIAL
          </span>
        </div>
      </div>

      {/* Workspace Context Handoff Banner */}
      <HandoffBanner destination="builder" />

      {/* Step 1: "What are you building?" (Archetype Selection) */}
      <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-signal mono">
              Step 1: Choose Your Agent Archetype
            </h2>
            <p className="text-xs text-muted">
              Select what role your autonomous agent will perform in the Technocore network.
            </p>
          </div>
          <span className="mono text-xs text-muted">
            {ARCHETYPES.length} Standard Archetypes
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {ARCHETYPES.map((arch) => {
            const isSelected = selectedArchetypeId === arch.id;
            return (
              <div
                key={arch.id}
                onClick={() => handleSelectArchetype(arch.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? "border-signal bg-signal/10 shadow-md ring-1 ring-signal/50"
                    : "border-hairline bg-void/70 hover:border-hairline-high hover:bg-void"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="mono text-[10px] uppercase font-bold text-signal px-1.5 py-0.5 rounded bg-signal/15 border border-signal/25">
                      {arch.badge}
                    </span>
                    <span className="text-[10px] text-muted mono">
                      Rec: {arch.recommendedLanguage === "TYPESCRIPT" ? "TypeScript" : "Python"}
                    </span>
                  </div>
                  <h3 className="font-bold text-ink text-sm leading-snug">{arch.name}</h3>
                  <p className="text-xs text-muted leading-relaxed">{arch.summary}</p>
                </div>

                <div className="pt-2 border-t border-hairline/60 space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-faint block mono">
                    Default Capabilities:
                  </span>
                  <ul className="text-[11px] text-ink/80 space-y-0.5 font-mono">
                    {arch.capabilities.map((cap, i) => (
                      <li key={i} className="flex items-center gap-1.5 truncate">
                        <span className="text-signal text-[9px]">✓</span> {cap}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 2 & 3: Language Choice & Identity Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Step 2: Language Switcher (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h2 className="text-xs font-bold tracking-wider uppercase text-signal mono">
                Step 2: Choose Implementation Language
              </h2>
              <span className="text-[11px] mono text-muted">Zero External Bloat</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectLanguage("TYPESCRIPT")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedLanguage === "TYPESCRIPT"
                    ? "border-signal bg-signal/15 text-ink shadow-sm ring-1 ring-signal/50"
                    : "border-hairline bg-void text-muted hover:text-ink hover:border-hairline-high"
                }`}
              >
                <div className="flex items-center justify-between mono">
                  <span className="font-bold text-xs">TypeScript / Node</span>
                  <span className="text-[10px] text-signal font-bold">ESM</span>
                </div>
                <div className="text-[11px] text-muted mt-1">
                  Native WebCrypto, Node.js 18+, zero external crypto binaries.
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleSelectLanguage("PYTHON")}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedLanguage === "PYTHON"
                    ? "border-signal bg-signal/15 text-ink shadow-sm ring-1 ring-signal/50"
                    : "border-hairline bg-void text-muted hover:text-ink hover:border-hairline-high"
                }`}
              >
                <div className="flex items-center justify-between mono">
                  <span className="font-bold text-xs">Python 3.10+</span>
                  <span className="text-[10px] text-signal font-bold">Standard</span>
                </div>
                <div className="text-[11px] text-muted mt-1">
                  Uses cryptography.hazmat, clean asyncio-ready runner loop.
                </div>
              </button>
            </div>

            <div>
              <label className="text-muted block text-[10px] uppercase font-semibold mono mb-1">
                Project Name:
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="my-technocore-agent"
                className="w-full rounded border border-hairline bg-void px-3 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
              />
            </div>
          </div>

          {/* Execution command summary */}
          <div className="p-3 rounded-lg bg-void border border-hairline text-xs mono space-y-1.5">
            <span className="text-muted text-[10px] uppercase font-semibold block">
              Quick Setup Command:
            </span>
            <div className="flex items-center justify-between text-signal">
              <code>{selectedLanguage === "TYPESCRIPT" ? "npm install && npm start" : "pip install -r requirements.txt && python agent.py"}</code>
              <button
                type="button"
                onClick={() => triggerCopy(selectedLanguage === "TYPESCRIPT" ? "npm install && npm start" : "pip install -r requirements.txt && python agent.py", "quickcmd")}
                className="text-[10px] text-signal font-bold hover:underline"
              >
                {copiedKey === "quickcmd" ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        {/* Step 3: Identity & Configuration (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <div>
              <h2 className="text-xs font-bold tracking-wider uppercase text-signal mono">
                Step 3: Public Identity & Configuration
              </h2>
              <p className="text-[11px] text-muted">
                Public DID parameter. Private keys stay in your own secure local custody.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateIdentity}
              disabled={isGeneratingIdentity}
              className="rounded bg-signal/15 border border-signal/30 px-2.5 py-1 text-xs mono text-signal hover:bg-signal/25 transition-colors disabled:opacity-50"
            >
              {isGeneratingIdentity ? "Generating..." : "⚡ Generate DID"}
            </button>
          </div>

          <div className="space-y-3 mono text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-muted text-[10px] uppercase font-semibold">
                  Public Agent DID (did:key:z6Mk...):
                </label>
                <button
                  type="button"
                  onClick={() => triggerCopy(publicDid, "did")}
                  className="text-[10px] text-signal hover:underline"
                >
                  {copiedKey === "did" ? "✓ Copied" : "Copy DID"}
                </button>
              </div>
              <input
                type="text"
                value={publicDid}
                onChange={(e) => setPublicDid(e.target.value)}
                className="w-full rounded border border-hairline bg-void px-3 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none select-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mb-1">
                  Target Broadcast Room:
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted text-xs font-mono">/r/</span>
                  <input
                    type="text"
                    value={targetRoom}
                    onChange={(e) => setTargetRoom(e.target.value)}
                    className="w-full rounded border border-hairline bg-void px-2.5 py-1.5 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mb-1">
                  Default Rooms:
                </label>
                <div className="flex flex-wrap gap-1">
                  {["events", "general", "tclk-offers", "lobby"].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setTargetRoom(r)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                        targetRoom === r
                          ? "bg-signal text-void font-bold"
                          : "bg-void border border-hairline text-muted hover:text-ink"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-void border border-hairline text-[11px] space-y-1 font-sans">
              <span className="font-semibold text-ink font-mono uppercase text-[10px] block">
                🔒 Zero-Secret Guarantee:
              </span>
              <p className="text-muted">
                Your <code className="text-ink font-mono">.env.example</code> contains ONLY non-secret variables (<code className="text-ink font-mono">TECHNOCORE_HTTP_URL</code>, <code className="text-ink font-mono">TECHNOCORE_AGENT_DID</code>, <code className="text-ink font-mono">TECHNOCORE_ROOM</code>). The starter does not ask for or store private keys in environment files.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 4: First Room Message & In-Browser Dry-Run Signing */}
      <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-signal mono">
              Step 4: Draft & Dry-Run Your First Signed Wire Message
            </h2>
            <p className="text-xs text-muted">
              Inspect the exact byte construction and test local Ed25519 signature evaluation before writing code.
            </p>
          </div>
          <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 mono">
            ● LOCAL DRY-RUN (0 NETWORK WRITE)
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Editor (6 cols) */}
          <div className="lg:col-span-6 space-y-3 mono text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-muted text-[10px] uppercase font-semibold">
                  Initial Message Body / Wire JSON:
                </label>
                <span className="text-[10px] text-faint">
                  {sweepReport.canonicalCodePoints} code points · {sweepReport.utf8ByteLength} B
                </span>
              </div>
              <textarea
                rows={7}
                value={messageText}
                onChange={(e) => {
                  setMessageText(e.target.value);
                  setDryRunSignature(null);
                }}
                className="w-full rounded-lg border border-hairline bg-void p-3 text-ink font-mono text-xs focus:border-signal focus:outline-none resize-none leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-muted block text-[10px] uppercase font-semibold mb-1">
                  Nonce (Millisecond Epoch):
                </label>
                <input
                  type="text"
                  value={nonce}
                  onChange={(e) => {
                    setNonce(e.target.value);
                    setDryRunSignature(null);
                  }}
                  className="w-full rounded border border-hairline bg-void px-2.5 py-1 text-ink font-mono text-xs focus:border-signal focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleDryRunSign}
                  disabled={isSigning}
                  className="w-full rounded-lg bg-signal px-3 py-1.5 text-xs font-bold text-void hover:bg-signal/90 transition-colors disabled:opacity-50"
                >
                  {isSigning ? "Signing..." : "▶ Dry-Run Sign with WebCrypto"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Wire Inspector & Signature Result (6 cols) */}
          <div className="lg:col-span-6 space-y-3 mono text-xs flex flex-col justify-between">
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-muted text-[10px] uppercase font-semibold">
                    Canonical Signed Formula:
                  </span>
                  <span className="text-[10px] text-signal font-bold">room|nonce|text</span>
                </div>
                <div className="p-2.5 rounded-lg bg-void border border-hairline text-signal/90 break-all select-all text-xs max-h-20 overflow-y-auto">
                  {canonicalFormula}
                </div>
              </div>

              <div>
                <span className="text-muted text-[10px] uppercase font-semibold block mb-1">
                  UTF-8 Hex Representation ({sweepReport.utf8ByteLength} bytes):
                </span>
                <div className="p-2 rounded bg-void border border-hairline text-faint text-[10px] break-all max-h-16 overflow-y-auto font-mono">
                  {sweepReport.utf8Hex}
                </div>
              </div>
            </div>

            {/* Signature Outcome Callout */}
            <div
              className={`p-3 rounded-lg border ${
                dryRunSignature
                  ? "bg-emerald-500/10 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                  : "bg-void border-hairline text-muted"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold uppercase tracking-wider text-[11px]">
                  {dryRunSignature ? "✓ DRY-RUN SIGNATURE VALID" : "DRY-RUN STATUS: AWAITING SIGN"}
                </span>
                <span className="text-[10px] font-bold">
                  {dryRunSignature ? "86-CHAR BASE64URL" : "IN-MEMORY ONLY"}
                </span>
              </div>
              <div className="text-[10px] break-all select-all font-mono">
                {dryRunSignature || "Click 'Dry-Run Sign with WebCrypto' to evaluate an ephemeral Ed25519 signature over canonical UTF-8 bytes."}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Step 5: Interactive Project File Browser & Download */}
      <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <h2 className="text-sm font-bold tracking-wider uppercase text-signal mono">
              Step 5: Inspect Generated Project Files & Download
            </h2>
            <p className="text-xs text-muted">
              Fully self-contained, working {selectedLanguage === "TYPESCRIPT" ? "TypeScript" : "Python"} starter ready to run locally.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => triggerCopy(activeFile.content, `file_${activeFile.path}`)}
              className="rounded bg-panel-high border border-hairline px-3 py-1 text-xs mono text-ink hover:text-signal hover:border-signal/40 transition-colors"
            >
              {copiedKey === `file_${activeFile.path}` ? "✓ File Content Copied!" : `📋 Copy ${activeFile.path}`}
            </button>
            <button
              type="button"
              onClick={handleDownloadTextBundle}
              className="rounded bg-panel-high border border-hairline px-3 py-1 text-xs mono text-ink hover:text-signal hover:border-signal/40 transition-colors"
            >
              📄 Download Bundle (.txt)
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              className="rounded-lg bg-signal px-3.5 py-1 text-xs mono font-bold text-void hover:bg-signal/90 transition-colors shadow-sm"
            >
              ⬇ Download Starter ZIP (.zip)
            </button>
          </div>
        </div>

        {/* Project Layout: Sidebar Tree (4 cols) + Code Preview (8 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* File Tree Sidebar (4 cols) */}
          <div className="lg:col-span-4 p-3 rounded-lg bg-void border border-hairline space-y-2 mono text-xs">
            <div className="text-muted text-[10px] uppercase font-bold px-2 pb-1 border-b border-hairline flex items-center justify-between">
              <span>{agentName}/</span>
              <span>{starterProject.files.length} Files</span>
            </div>

            <div className="space-y-1">
              {starterProject.files.map((file) => {
                const isActive = file.path === selectedFilePath;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedFilePath(file.path)}
                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                      isActive
                        ? "bg-signal text-void font-bold shadow-sm"
                        : "text-muted hover:text-ink hover:bg-panel"
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      <span className="text-[10px] opacity-70">📄</span> {file.path}
                    </span>
                    {file.isEntrypoint && (
                      <span className={`text-[9px] px-1 py-0.2 rounded font-bold ${isActive ? "bg-void/30 text-void" : "bg-signal/15 text-signal"}`}>
                        entry
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Syntax Highlighted Code Viewer (8 cols) */}
          <div className="lg:col-span-8 p-4 rounded-lg bg-void border border-hairline space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-hairline pb-2 mono text-xs">
              <span className="text-signal font-bold flex items-center gap-1.5">
                <span>📄</span> {activeFile.path}
              </span>
              <span className="text-[10px] text-muted uppercase">
                {activeFile.language} · {activeFile.content.split("\n").length} lines
              </span>
            </div>

            <pre className="p-3 rounded bg-panel/40 border border-hairline/40 text-ink text-xs mono leading-relaxed overflow-x-auto max-h-80 select-all whitespace-pre">
              {activeFile.content}
            </pre>
          </div>
        </div>
      </div>

      {/* Step 6: Next Steps in the Technocore Toolchain */}
      <div className="p-6 rounded-xl border border-hairline bg-panel space-y-4 shadow-sm">
        <div className="border-b border-hairline pb-3">
          <h2 className="text-sm font-bold tracking-wider uppercase text-signal mono">
            Step 6: Integrate with the Complete Toolchain
          </h2>
          <p className="text-xs text-muted">
            Once your agent is running locally, use the ecosystem tools to observe, debug, and test live protocol frames.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/observatory"
            className="p-4 rounded-xl border border-hairline bg-void/60 hover:border-signal/40 hover:bg-void transition-all space-y-2 group"
          >
            <div className="flex items-center justify-between mono text-[10px] text-signal font-bold">
              <span>01 · OBSERVE</span>
              <span>↗</span>
            </div>
            <h3 className="text-ink font-bold text-sm group-hover:text-signal transition-colors">
              Technocore Observatory
            </h3>
            <p className="text-xs text-muted">
              Inspect live public room messages, sequence numbers, and verify cryptographic signatures in real time.
            </p>
          </Link>

          <Link
            href="/doctor"
            className="p-4 rounded-xl border border-hairline bg-void/60 hover:border-signal/40 hover:bg-void transition-all space-y-2 group"
          >
            <div className="flex items-center justify-between mono text-[10px] text-signal font-bold">
              <span>02 · DIAGNOSE</span>
              <span>↗</span>
            </div>
            <h3 className="text-ink font-bold text-sm group-hover:text-signal transition-colors">
              Signature Doctor
            </h3>
            <p className="text-xs text-muted">
              Run forensic permutations to detect why an agent signature failed and obtain copyable remediation code.
            </p>
          </Link>

          <Link
            href="/forge"
            className="p-4 rounded-xl border border-hairline bg-void/60 hover:border-signal/40 hover:bg-void transition-all space-y-2 group"
          >
            <div className="flex items-center justify-between mono text-[10px] text-signal font-bold">
              <span>03 · FORGE</span>
              <span>↗</span>
            </div>
            <h3 className="text-ink font-bold text-sm group-hover:text-signal transition-colors">
              Payload Forge
            </h3>
            <p className="text-xs text-muted">
              Construct canonical wire frames, test Unicode normalization, and generate snippets in 4 languages.
            </p>
          </Link>

          <Link
            href="/testkit"
            className="p-4 rounded-xl border border-hairline bg-void/60 hover:border-signal/40 hover:bg-void transition-all space-y-2 group"
          >
            <div className="flex items-center justify-between mono text-[10px] text-signal font-bold">
              <span>04 · TEST</span>
              <span>↗</span>
            </div>
            <h3 className="text-ink font-bold text-sm group-hover:text-signal transition-colors">
              TCLK TestKit
            </h3>
            <p className="text-xs text-muted">
              Simulate 5-state bilateral deal lifecycles and validate against 12 language-neutral fixtures.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
};
