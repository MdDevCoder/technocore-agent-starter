"use client";

/**
 * The hero.
 *
 * Rather than illustrate cryptography, this performs it. On mount it takes the Ed25519 seed published
 * in RFC 8032 §7.1 — a test vector, deliberately public, belonging to nobody — derives the public key,
 * signs the empty message, and verifies the result. Every byte in the lattice above is output that the
 * visitor's own browser produced a few milliseconds ago, and because the vector is published, they can
 * check it against the RFC themselves.
 *
 * It is also load-bearing rather than ornamental: this is the WebCrypto Ed25519 capability probe. A
 * browser without native Ed25519 cannot create a Technocore identity at all, and the honest place to
 * discover that is the first screen, not three steps into an onboarding flow. So the failure path is a
 * designed state, not a caught exception — and the lattice stays empty in it, because inventing bytes
 * to fill a grid is exactly the dishonesty this element exists to avoid.
 *
 * The test seed is a constant here and nowhere else. It is not an identity, it is never persisted, and
 * the copy says so plainly, so that nobody mistakes a demonstration for their own key.
 */

import { useEffect, useState } from "react";
import { fromHex } from "../crypto/bytes.ts";
import { importSigningKey, isEd25519Supported, publicKeyFromSeed, sign, verify } from "../crypto/ed25519.ts";
import { ByteLattice, type LatticeState } from "./ByteLattice.tsx";
import { StatusPill } from "./StatusPill.tsx";

/** RFC 8032 §7.1, TEST 1. A published test vector — not a key, not an identity, not a secret. */
const RFC_8032_TEST_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

type Probe =
  | { readonly phase: "working" }
  | { readonly phase: "verified"; readonly signature: Uint8Array; readonly elapsedMs: number }
  | { readonly phase: "unsupported" }
  | { readonly phase: "failed" };

export function HeroLattice() {
  const [probe, setProbe] = useState<Probe>({ phase: "working" });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (!(await isEd25519Supported())) {
          if (!cancelled) setProbe({ phase: "unsupported" });
          return;
        }

        const started = performance.now();
        const seed = fromHex(RFC_8032_TEST_SEED);
        const publicKey = await publicKeyFromSeed(seed);
        const key = await importSigningKey(seed, publicKey);
        const message = new Uint8Array(0);
        const signature = await sign(key, message);
        const ok = await verify(publicKey, signature, message);
        const elapsedMs = performance.now() - started;

        if (cancelled) return;
        setProbe(ok ? { phase: "verified", signature, elapsedMs } : { phase: "failed" });
      } catch {
        // Intentionally opaque. This path can only be a platform capability failure, and there is
        // nothing here worth reporting to the user beyond "your browser cannot do this".
        if (!cancelled) setProbe({ phase: "failed" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const state: LatticeState =
    probe.phase === "verified" ? "verified" : probe.phase === "working" ? "working" : "fault";

  return (
    <div className="relative group animate-fade-in-up delay-200">
      <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-br from-signal/20 via-transparent to-signal/15 blur-xl opacity-60 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
      <figure className="panel bg-graphite/75 backdrop-blur-md relative flex flex-col gap-5 p-5 sm:p-6 border-hairline/80 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
      <ByteLattice
        bytes={probe.phase === "verified" ? probe.signature : null}
        state={state}
        columns={8}
        restingRows={8}
        label="Ed25519 signature over the RFC 8032 test vector"
      />

      <figcaption className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {probe.phase === "verified" ? (
            <>
              <StatusPill tone="verified" srPrefix="Status:">
                signature verified
              </StatusPill>
              <StatusPill tone="neutral" dot={false}>
                {probe.signature.length} bytes · {probe.elapsedMs.toFixed(1)} ms
              </StatusPill>
            </>
          ) : probe.phase === "working" ? (
            <StatusPill tone="neutral" srPrefix="Status:">
              signing
            </StatusPill>
          ) : (
            <StatusPill tone="fault" srPrefix="Status:">
              {probe.phase === "unsupported" ? "Ed25519 unavailable" : "signing failed"}
            </StatusPill>
          )}
        </div>

        {/*
          `aria-live="polite"` rather than `assertive`: this is a page-load demonstration, and
          interrupting a screen reader mid-sentence to announce a successful demo would be rude.
        */}
        <p aria-live="polite" className="text-muted max-w-[46ch] text-[0.8125rem] leading-relaxed">
          {probe.phase === "verified" ? (
            <>
              Signed and verified in this tab just now, using the Ed25519 test key published in RFC 8032
              §7.1. It is a public test vector, not an identity — nothing was generated for you and
              nothing was saved.
            </>
          ) : probe.phase === "working" ? (
            <>Signing a published test vector to confirm this browser can do Ed25519 natively…</>
          ) : probe.phase === "unsupported" ? (
            <>
              This browser does not offer native Ed25519 through WebCrypto, so it cannot create a
              Technocore identity. Current Chrome, Edge, Firefox and Safari 17+ all can.
            </>
          ) : (
            <>
              The signing check did not complete in this browser. Creating an identity here would not be
              reliable, so it is worth trying a current Chrome, Edge, Firefox or Safari.
            </>
          )}
        </p>
      </figcaption>
    </figure>
    </div>
  );
}
