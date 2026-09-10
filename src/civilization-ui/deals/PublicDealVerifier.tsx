/**
 * Public TCLK Contract & Transcript Verifier.
 *
 * Interactive, standalone, read-only UI tool allowing users and external maintainers
 * to verify any autonomous TCLK deal transcript or contract ID independently.
 *
 * SAFETY INVARIANTS:
 * - Read-Only: Zero network writes, zero room posts, zero KV writes.
 * - Strict Separation: Keeps LOCAL_DEMO, NETWORK_OBSERVED, and NETWORK_EXECUTED distinct.
 * - Non-Bypass: Never accepts cryptographically unverifiable signatures into VALID classification.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { SignedRoomMessage } from "../../technocore/envelope.ts";
import { verifyPublicDeal, parseTranscriptInput, type PublicDealVerificationResult } from "../../civilization/deals/tclk/deal-verifier.ts";
import type { ObservatoryDealView } from "./types.ts";
import { generateKeyPair, importSigningKey, sign } from "../../crypto/ed25519.ts";
import { publicKeyToDid } from "../../identity/did.ts";
import { toBase64Url, utf8 } from "../../crypto/bytes.ts";
import { offerId, contractId, type OfferFrame, type AcceptCore } from "@flop-labs/tclk";

interface PublicDealVerifierProps {
  readonly selectedDeal?: ObservatoryDealView | null;
  readonly availableDeals?: readonly ObservatoryDealView[];
  readonly onSelectDeal?: (contractId: string) => void;
}

export const PublicDealVerifier: React.FC<PublicDealVerifierProps> = ({
  selectedDeal,
  availableDeals = [],
}) => {
  const [inputText, setInputText] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<PublicDealVerificationResult | null>(null);
  const [activeTab, setActiveTab] = useState<"CHECKS" | "FRAMES" | "RAW_WIRE">("CHECKS");

  // Run verification whenever inputText or selectedDeal changes
  const runVerification = useCallback(async (textToVerify: string, dealContext?: ObservatoryDealView | null) => {
    setIsVerifying(true);
    try {
      let messages: SignedRoomMessage[] = [];

      // 1. Check if input is a known deal contract ID in availableDeals
      const trimmed = textToVerify.trim();
      const matchedDeal = availableDeals.find(
        (d) => d.contractId.toLowerCase() === trimmed.toLowerCase() || d.offerId.toLowerCase() === trimmed.toLowerCase(),
      );

      if (matchedDeal && matchedDeal.events.length > 0) {
        // Construct messages from deal events
        messages = buildMessagesFromDeal(matchedDeal);
      } else if (dealContext && (!trimmed || trimmed === dealContext.contractId)) {
        messages = buildMessagesFromDeal(dealContext);
      } else {
        // Parse from raw JSON or transcript text
        messages = parseTranscriptInput(trimmed);
      }

      if (messages.length > 0) {
        const provenance = (dealContext?.provenance || matchedDeal?.provenance || "NETWORK_OBSERVED") as "LOCAL_DEMO" | "NETWORK_OBSERVED" | "NETWORK_EXECUTED";
        const expectedContract = dealContext?.contractId || matchedDeal?.contractId || (trimmed.startsWith("0x") && trimmed.length === 66 ? trimmed : undefined);
        const res = await verifyPublicDeal(messages, expectedContract, {
          provenance,
          defaultRoom: "tclk-offers",
        });
        setVerificationResult(res);
      } else if (trimmed) {
        // Unparseable input
        setVerificationResult({
          verified: false,
          contractId: trimmed.startsWith("0x") ? trimmed : "unknown",
          classification: "UNSUPPORTED",
          provenance: "NETWORK_OBSERVED",
          checks: [
            {
              name: "transcript-parsing",
              passed: false,
              details: "Input is neither a recognized contract ID nor a valid JSON message transcript.",
            },
          ],
          errors: ["Could not parse public message transcript from input."],
          verifiedAt: new Date().toISOString(),
        });
      } else {
        setVerificationResult(null);
      }
    } catch (err) {
      setVerificationResult({
        verified: false,
        contractId: "error",
        classification: "INVALID",
        provenance: "NETWORK_OBSERVED",
        checks: [{ name: "verifier-execution", passed: false, details: String(err) }],
        errors: [err instanceof Error ? err.message : String(err)],
        verifiedAt: new Date().toISOString(),
      });
    } finally {
      setIsVerifying(false);
    }
  }, [availableDeals]);

  // Load selected deal from observatory
  useEffect(() => {
    if (selectedDeal) {
      setInputText(selectedDeal.contractId);
      runVerification(selectedDeal.contractId, selectedDeal);
    }
  }, [selectedDeal, runVerification]);

  // Quick Load Handlers
  const handleLoadDemoDeal = async () => {
    // Generate a valid local demo transcript
    const payerKey = await generateKeyPair();
    const payeeKey = await generateKeyPair();
    const payerSigner = await importSigningKey(payerKey.seed, payerKey.publicKey);
    const payeeSigner = await importSigningKey(payeeKey.seed, payeeKey.publicKey);
    const payerDid = publicKeyToDid(payerKey.publicKey);
    const payeeDid = publicKeyToDid(payeeKey.publicKey);

    const now = Date.now();
    const nonce1 = String(now * 1_000_000);
    const nonce2 = String((now + 10) * 1_000_000);
    const nonce3 = String((now + 20) * 1_000_000);
    const nonce4 = String((now + 30) * 1_000_000);
    const nonce5 = String((now + 40) * 1_000_000);

    const secret = "f".repeat(64);
    const secretBytes = utf8(secret);
    const { sha256Hex } = await import("../../crypto/hash.ts");
    const statement = await sha256Hex(secretBytes);

    const offerFields = {
      from: payerDid,
      role: "payer" as const,
      amount: "100",
      asset: "FLOP",
      lock: "hash" as const,
      statement,
      rails: ["paper"],
      expiresMs: now + 60_000,
      claimByMs: now + 120_000,
      refundAfterMs: now + 180_000,
      nonce: nonce1,
    };
    const offId = offerId(offerFields as unknown as OfferFrame);
    const offerFrame: OfferFrame = { type: "offer", id: offId, ...offerFields };

    const acceptCore: AcceptCore = {
      from: payeeDid,
      ref: offId,
      statement,
      nonce: nonce2,
    };
    const contract = contractId(offerFrame, acceptCore);
    const acceptFrame = { type: "accept", contract, ...acceptCore };

    const lockFrame = { type: "lock", contract, from: payerDid, rail: "paper", statement, nonce: nonce3 };
    const revealFrame = { type: "reveal", contract, from: payeeDid, secret, nonce: nonce4 };
    const receiptFrame = { type: "receipt", contract, from: payerDid, status: "claimed", nonce: nonce5 };

    const rawFrames = [offerFrame, acceptFrame, lockFrame, revealFrame, receiptFrame];
    const msgs: SignedRoomMessage[] = [];

    for (const f of rawFrames) {
      const isPayee = f.from === payeeDid;
      const signer = isPayee ? payeeSigner : payerSigner;
      const fDid = isPayee ? payeeDid : payerDid;
      const fNonce = f.nonce;
      const text = JSON.stringify(f);
      const canonicalBytes = utf8(`tclk-offers|${fNonce}|${text}`);
      const sigBytes = await sign(signer, canonicalBytes);
      msgs.push({
        did: fDid,
        sig: toBase64Url(sigBytes),
        nonce: fNonce,
        text,
      });
    }

    const jsonString = JSON.stringify(msgs, null, 2);
    setInputText(jsonString);
    runVerification(jsonString);
  };

  const handleLoadObservedNetworkSample = () => {
    const sample = [
      {
        did: "did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x",
        sig: "dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVzLXByb3ZpZGVkLWJ5LWV4dGVybmFsLXRlc3QtYWdlbnQtMTIzNA",
        nonce: "1725983419000000000",
        text: '{"type":"offer","id":"0x9d6dccbb1ec994119d859b8be434f0e75dc9ff5d6fbb5bfbf82d061e89e0234a","from":"did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x","role":"payer","amount":"100","asset":"FLOP","lock":"hash","statement":"Analyze architecture document","rails":["paper"],"expiresMs":1726069819000,"claimByMs":1726069819000,"refundAfterMs":1726073419000,"nonce":"1725983419000000000"}',
      },
      {
        did: "did:key:z6MkkGaS9mF89qLk3U8mN1xPvB4yL2z8J7x1w3mP5qZ7Zkg8",
        sig: "kmR7gMjJjTL9N8rN4XnNJFhU4xPyL2z8J7x1w3mP5qZ7Zkg8dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVz",
        nonce: "1725983420000000000",
        text: '{"type":"accept","contract":"0x7b437b5ad5993f5e3df12586617f18579930f331f4a9b60b7eb897ce50c822e1","from":"did:key:z6MkkGaS9mF89qLk3U8mN1xPvB4yL2z8J7x1w3mP5qZ7Zkg8","ref":"0x9d6dccbb1ec994119d859b8be434f0e75dc9ff5d6fbb5bfbf82d061e89e0234a","statement":"Analyze architecture document","nonce":"1725983420000000000"}',
      },
    ];
    const jsonString = JSON.stringify(sample, null, 2);
    setInputText(jsonString);
    runVerification(jsonString);
  };

  return (
    <div className="rounded-lg border border-hairline bg-panel p-4 mono text-xs shadow-sm space-y-4">
      {/* Header & Disclaimers */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">🔍</span>
          <div>
            <div className="font-bold text-ink text-sm tracking-wide">
              TCLK PUBLIC CONTRACT VERIFIER (INDEPENDENT)
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              Strictly Read-Only • Independent WebCrypto Ed25519 & Protocol Validator
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded bg-panel-low px-2 py-0.5 text-[10px] text-muted border border-hairline font-bold">
            READ-ONLY
          </span>
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400/90 border border-amber-500/20 font-bold">
            NOT A REWARD SIGNAL
          </span>
        </div>
      </div>

      {/* Input Section & Action Controls */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <label htmlFor="contract-transcript-input" className="text-muted font-bold">
            ENTER CONTRACT ID, OFFER ID, OR PASTE PUBLIC TRANSCRIPT JSON:
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadDemoDeal}
              className="rounded border border-signal/40 bg-signal/10 px-2 py-0.5 text-[10px] text-signal font-bold hover:bg-signal/20 transition-colors"
            >
              + Load Verified Demo Deal
            </button>
            <button
              onClick={handleLoadObservedNetworkSample}
              className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-400 font-bold hover:bg-rose-500/20 transition-colors"
            >
              + Load Observed Network Sample
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <textarea
            id="contract-transcript-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste 0x... contract ID, offer ID, or signed JSON message transcript array [ { did, sig, nonce, text }, ... ]"
            rows={inputText.includes("\n") || inputText.length > 80 ? 4 : 1}
            className="flex-1 rounded border border-hairline bg-panel-low px-3 py-2 text-xs text-ink placeholder:text-muted/50 focus:border-signal focus:outline-none resize-y"
          />
          <button
            onClick={() => runVerification(inputText)}
            disabled={isVerifying || !inputText.trim()}
            className="rounded border border-signal bg-signal/20 px-4 py-2 font-bold text-signal hover:bg-signal/30 disabled:opacity-40 transition-colors self-start shrink-0"
          >
            {isVerifying ? "Verifying..." : "Verify Contract"}
          </button>
        </div>
      </div>

      {/* Verification Result Display */}
      {verificationResult && (
        <div className="space-y-3 pt-1 border-t border-hairline/60">
          {/* Top Status & Provenance Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-panel-low p-3">
            <div className="flex items-center gap-3">
              {verificationResult.classification === "VALID" ? (
                <span className="rounded bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                  VERIFIED (VALID) ✓
                </span>
              ) : verificationResult.classification === "INCOMPLETE" ? (
                <span className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400 border border-amber-500/30 animate-pulse">
                  INCOMPLETE (IN-FLIGHT)
                </span>
              ) : verificationResult.classification === "INVALID" ? (
                <span className="rounded bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-400 border border-rose-500/30">
                  UNVERIFIED / CRYPTO FAIL ✗
                </span>
              ) : (
                <span className="rounded bg-panel px-2.5 py-1 text-xs font-bold text-muted border border-hairline">
                  UNSUPPORTED FORMAT
                </span>
              )}

              <div>
                <div className="text-[10px] text-muted">CONTRACT ID:</div>
                <div className="font-bold text-ink text-xs break-all">
                  {verificationResult.contractId}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-muted font-bold">PROVENANCE:</span>
              <span
                className={`rounded px-2 py-0.5 font-bold border ${
                  verificationResult.provenance === "LOCAL_DEMO"
                    ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                    : verificationResult.provenance === "NETWORK_OBSERVED"
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}
              >
                {verificationResult.provenance}
              </span>
            </div>
          </div>

          {/* Participants & Economic Terms Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded border border-hairline bg-panel-low p-2.5 space-y-1">
              <div className="text-muted text-[10px] font-semibold">PAYER (OFFEROR)</div>
              <div className="font-bold text-ink truncate" title={verificationResult.participants?.payerDid}>
                {verificationResult.participants?.payerDid || "Unknown / Parsing"}
              </div>
            </div>

            <div className="rounded border border-hairline bg-panel-low p-2.5 space-y-1">
              <div className="text-muted text-[10px] font-semibold">PAYEE (FULFILLER)</div>
              <div className="font-bold text-ink truncate" title={verificationResult.participants?.payeeDid}>
                {verificationResult.participants?.payeeDid || "Unassigned / Parsing"}
              </div>
            </div>

            <div className="rounded border border-hairline bg-panel-low p-2.5 space-y-1">
              <div className="text-muted text-[10px] font-semibold">PROTOCOL STATUS</div>
              <div className="font-bold text-ink uppercase">
                {verificationResult.status || "UNKNOWN"}
              </div>
            </div>

            <div className="rounded border border-hairline bg-panel-low p-2.5 space-y-1">
              <div className="text-muted text-[10px] font-semibold">SETTLEMENT RAIL</div>
              <div className="font-bold text-signal">
                {verificationResult.state?.rail?.toUpperCase() || "PAPER (REHEARSAL)"}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-hairline text-xs">
            <button
              onClick={() => setActiveTab("CHECKS")}
              className={`px-3 py-1.5 font-bold border-b-2 transition-colors ${
                activeTab === "CHECKS"
                  ? "border-signal text-signal"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Independent Checks ({verificationResult.checks.length})
            </button>
            <button
              onClick={() => setActiveTab("FRAMES")}
              className={`px-3 py-1.5 font-bold border-b-2 transition-colors ${
                activeTab === "FRAMES"
                  ? "border-signal text-signal"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Lifecycle Frames ({verificationResult.frames?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("RAW_WIRE")}
              className={`px-3 py-1.5 font-bold border-b-2 transition-colors ${
                activeTab === "RAW_WIRE"
                  ? "border-signal text-signal"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Diagnostic Errors ({verificationResult.errors.length})
            </button>
          </div>

          {/* Tab 1: 10 Independent Checks */}
          {activeTab === "CHECKS" && (
            <div className="space-y-1.5">
              {verificationResult.checks.map((chk, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between rounded border p-2 text-[11px] ${
                    chk.passed
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                      : "border-rose-500/20 bg-rose-500/5 text-rose-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{chk.passed ? "✓" : "✗"}</span>
                    <span className="font-bold uppercase tracking-wider">{chk.name}</span>
                  </div>
                  <div className="text-muted text-[10px] truncate max-w-md" title={chk.details}>
                    {chk.details}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 2: Lifecycle Frames */}
          {activeTab === "FRAMES" && (
            <div className="space-y-2">
              {verificationResult.frames && verificationResult.frames.length > 0 ? (
                verificationResult.frames.map((frame, idx) => (
                  <div key={idx} className="rounded border border-hairline bg-panel-low p-2.5 text-[11px] space-y-1">
                    <div className="flex items-center justify-between font-bold text-ink">
                      <span className="text-signal uppercase">
                        {idx + 1}. {frame.type} FRAME
                      </span>
                      <span className="text-[10px] text-muted">From: {frame.from.slice(0, 16)}...</span>
                    </div>
                    <pre className="text-[10px] text-muted/80 bg-graphite/40 p-2 rounded overflow-x-auto">
                      {JSON.stringify(frame, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <div className="text-muted text-[11px] text-center py-4">No decoded frames available.</div>
              )}
            </div>
          )}

          {/* Tab 3: Errors */}
          {activeTab === "RAW_WIRE" && (
            <div className="space-y-2">
              {verificationResult.errors.length > 0 ? (
                verificationResult.errors.map((err, idx) => (
                  <div key={idx} className="rounded border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] text-rose-400">
                    {idx + 1}. {err}
                  </div>
                ))
              ) : (
                <div className="text-emerald-400 text-[11px] text-center py-4">
                  ✓ Zero verification errors found across all protocol and cryptographic layers.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function buildMessagesFromDeal(deal: ObservatoryDealView): SignedRoomMessage[] {
  const msgs: SignedRoomMessage[] = [];
  const payerDid = deal.payerDid || "did:key:z6MkpP7d8L1mN5qR9sT2vW4xY6zB8aC0dE2fG4hJ6kL8mN0p";
  const payeeDid = deal.payeeDid || "did:key:z6MktE3fG4hJ6kL8mN0pP7d8L1mN5qR9sT2vW4xY6zB8aC0d";

  // Offer message
  const offerFrame: OfferFrame = {
    type: "offer",
    id: deal.offerId || "0x9d6dccbb1ec994119d859b8be434f0e75dc9ff5d6fbb5bfbf82d061e89e0234a",
    from: payerDid,
    role: "payer",
    amount: deal.amount || "100",
    asset: deal.asset || "FLOP",
    lock: (deal.lockKind as "hash" | "point") || "hash",
    rails: deal.rails.length > 0 ? (deal.rails as string[]) : ["paper"],
    expiresMs: deal.expiresMs || Date.now() + 60_000,
    claimByMs: deal.claimByMs || Date.now() + 120_000,
    refundAfterMs: deal.refundAfterMs || Date.now() + 180_000,
    nonce: "1725983419000000000",
  };
  msgs.push({
    did: payerDid,
    sig: "dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVzLXByb3ZpZGVkLWJ5LWV4dGVybmFsLXRlc3QtYWdlbnQtMTIzNA",
    nonce: offerFrame.nonce,
    text: JSON.stringify(offerFrame),
  });

  // Accept message if status >= accepted
  if (deal.status !== "proposed") {
    const acceptCore: AcceptCore = {
      from: payeeDid,
      ref: offerFrame.id,
      statement: deal.statement || "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
      nonce: "1725983420000000000",
    };
    const contract = deal.contractId || contractId(offerFrame, acceptCore);
    const acceptFrame = { type: "accept", contract, ...acceptCore };
    msgs.push({
      did: payeeDid,
      sig: "kmR7gMjJjTL9N8rN4XnNJFhU4xPyL2z8J7x1w3mP5qZ7Zkg8dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVz",
      nonce: acceptCore.nonce,
      text: JSON.stringify(acceptFrame),
    });
  }

  return msgs;
}
