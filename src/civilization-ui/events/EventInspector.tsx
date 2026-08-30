/**
 * Cryptographic Event Inspector Component.
 *
 * Provides deep inspection of signed civilization events:
 * - Canonical JSON payload vs. Detached Ed25519 signature
 * - Real-time WebCrypto cryptographic verification badge
 * - Parent event provenance tracking
 */

"use client";

import React, { useEffect, useState } from "react";
import type { CivilizationEvent } from "../../civilization/types/events.ts";
import { verifyCivilizationEvent } from "../../civilization/events/verifier.ts";

interface EventInspectorProps {
  readonly event: CivilizationEvent;
  readonly onClose: () => void;
}

export const EventInspector: React.FC<EventInspectorProps> = ({
  event,
  onClose,
}) => {
  const [verifyState, setVerifyState] = useState<"VERIFYING" | "VALID" | "INVALID">("VERIFYING");

  useEffect(() => {
    let isMounted = true;
    setVerifyState("VERIFYING");

    verifyCivilizationEvent(event)
      .then((res) => {
        if (isMounted) {
          setVerifyState(res.valid ? "VALID" : "INVALID");
        }
      })
      .catch(() => {
        if (isMounted) setVerifyState("INVALID");
      });

    return () => {
      isMounted = false;
    };
  }, [event]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-hairline bg-void shadow-2xl">
      {/* Header */}
      <div className="border-b border-hairline bg-graphite/60 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal animate-pulse" />
              <span className="eyebrow">EVENT_VERIFIER</span>
            </div>
            <h3 className="mono text-base font-bold text-ink mt-1">{event.eventType}</h3>
            <div className="mono text-xs text-muted mt-0.5">ID: {event.eventId}</div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-panel hover:text-ink transition-colors"
            aria-label="Close Event Inspector"
          >
            ✕
          </button>
        </div>

        {/* Verification Status Badge */}
        <div className="mt-3 flex items-center justify-between rounded border border-hairline bg-panel p-2.5 mono text-xs">
          <span className="text-muted">ED25519_SIGNATURE:</span>
          {verifyState === "VERIFYING" && (
            <span className="text-attention animate-pulse">VERIFYING_KEY...</span>
          )}
          {verifyState === "VALID" && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-verified/40 bg-verified/10 text-verified">
              SIGNATURE VALID ✓
            </span>
          )}
          {verifyState === "INVALID" && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-fault/40 bg-fault/10 text-fault">
              SIGNATURE INVALID ✗
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 mono text-xs">
        {/* Metadata */}
        <div className="rounded border border-hairline bg-panel p-3 space-y-2">
          <div className="flex justify-between">
            <span className="text-faint">AUTHOR_DID:</span>
            <span className="text-ink select-all truncate max-w-[240px]">{event.authorDid}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-faint">TIMESTAMP:</span>
            <span className="text-ink">{event.timestamp}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-faint">PROTOCOL:</span>
            <span className="text-signal">{event.protocol} (v{event.version})</span>
          </div>
          {event.missionId && (
            <div className="flex justify-between">
              <span className="text-faint">MISSION_ID:</span>
              <span className="text-ink">{event.missionId}</span>
            </div>
          )}
        </div>

        {/* Canonical JSON Payload */}
        <div className="space-y-1.5">
          <span className="eyebrow text-[9px]">CANONICAL_SIGNED_PAYLOAD</span>
          <pre className="rounded border border-hairline bg-graphite p-3 text-[11px] text-signal font-mono overflow-x-auto max-h-56">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>

        {/* Detached Signature */}
        <div className="space-y-1.5">
          <span className="eyebrow text-[9px]">DETACHED_SIGNATURE (BASE64URL)</span>
          <div className="rounded border border-hairline bg-panel p-2.5 text-[10px] text-faint break-all select-all font-mono">
            {event.signature}
          </div>
        </div>
      </div>
    </div>
  );
};
