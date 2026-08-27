"use client";

/**
 * Step 1 — Create.
 *
 * One action: generate a key pair. No network request, no form, no options. The step's whole job is to draw
 * 32 random bytes, derive a DID from the public half, and show the user what was produced.
 *
 * The lattice shows the *public* key bytes. That is the only key material rendered anywhere in this app,
 * and it is safe by definition — the DID is a transport-encoded copy of exactly those bytes. The seed and
 * the signing key have no visual representation here, which is a design decision, not an omission: a
 * private key on screen is a private key in a screenshot.
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import { createIdentity } from "../../flow/identity.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { DID_KEY_PREFIX, MULTIBASE_LENGTH } from "../../identity/did.ts";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { ByteLattice } from "../ByteLattice.tsx";
import { Disclosure } from "../Disclosure.tsx";
import { EgressLedger } from "../EgressLedger.tsx";
import { Callout, ErrorNotice } from "../feedback.tsx";
import { formatByteCount, formatUtc } from "../format.ts";
import { DataList, DidReadout, ReadoutPanel } from "../readouts.tsx";
import { StatusPill } from "../StatusPill.tsx";
import { StepActions } from "./StepShell.tsx";

export function IdentityStep() {
  const { identity, adopt, transport } = useAgentSession();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FlowFailure | null>(null);

  const create = useCallback(async () => {
    setFailure(null);
    setBusy(true);
    try {
      // `createIdentity` probes for Ed25519 first, so an unsupported browser is reported before any
      // random bytes are drawn — there is no half-created identity to clean up.
      adopt(await createIdentity(), "identity-created");
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  if (identity === null) {
    return (
      <>
        <section className="panel rounded-lg p-5 sm:p-6">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] sm:items-start">
            <div>
              <h2 className="text-ink text-[0.9375rem] font-medium">Generate an Ed25519 key pair</h2>
              <p className="text-muted mt-2 max-w-[46ch] text-[0.8125rem] leading-relaxed">
                Thirty-two random bytes from this device become a signing key. It stays in this tab, and no
                request is made on this step.
              </p>

              <div className="mt-6">
                <StepActions
                  primary={
                    <Button variant="primary" size="lg" busy={busy} onClick={() => void create()}>
                      {busy ? "Generating" : "Create identity"}
                    </Button>
                  }
                  secondary={
                    <Link href="/import" className={buttonClasses("secondary", "lg")}>
                      Import a backup
                    </Link>
                  }
                  note="No wallet, no account, and no email. Nothing is sent anywhere until you choose to post a message."
                />
              </div>
            </div>

            <ByteLattice
              label="Public key"
              bytes={null}
              state={busy ? "working" : "idle"}
              restingRows={4}
              className="sm:pt-1"
            />
          </div>
        </section>

        {failure === null ? null : <ErrorNotice failure={failure} onRetry={() => void create()} />}

        <Disclosure summary="Technical details">
          <div className="flex flex-col gap-5">
            <DataList
              rows={[
                { label: "Algorithm", value: "Ed25519 via WebCrypto", mono: true },
                {
                  label: "Seed",
                  value: "32 bytes from crypto.getRandomValues",
                  mono: true,
                  note: "The operating system's cryptographic random source. Never derived from a passphrase or a mnemonic.",
                },
                {
                  label: "DID method",
                  value: `${DID_KEY_PREFIX}…`,
                  mono: true,
                  note: `Multicodec-prefixed public key, base58btc, ${String(MULTIBASE_LENGTH)} characters. Derived from the public half alone.`,
                },
              ]}
            />
            <EgressLedger entries={[]} transport={transport} />
          </div>
        </Disclosure>
      </>
    );
  }

  return (
    <>
      <ReadoutPanel
        title="Identity"
        aside={
          <div className="flex items-center gap-2">
            <StatusPill tone="signal" srPrefix="Status:">Generated locally</StatusPill>
            <span className="text-faint mono text-[0.6875rem]">{formatUtc(identity.createdAt)}</span>
          </div>
        }
      >
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)] sm:items-start">
          <DidReadout
            did={identity.did}
            hint="Public. Share it freely — it identifies your agent and is what others verify your signatures against."
          />
          <ByteLattice
            label="Public key"
            bytes={identity.publicKey}
            state="settled"
            restingRows={4}
          />
        </div>
      </ReadoutPanel>

      <Callout tone="attention" title="Nothing is recoverable yet">
        The signing key exists in this tab and nowhere else. Close the tab now and the identity is gone for
        good, with no way for anyone — including us — to bring it back.
      </Callout>

      <StepActions
        primary={
          <Link href="/onboarding/backup" className={buttonClasses("primary", "lg")}>
            Continue to backup
          </Link>
        }
        note="Step 2 saves an encrypted backup and makes you open it once, before anything is posted."
      />

      <Disclosure summary="Technical details">
        <div className="flex flex-col gap-5">
          <DataList
            rows={[
              { label: "Algorithm", value: "Ed25519 via WebCrypto", mono: true },
              { label: "Public key", value: formatByteCount(identity.publicKey.length), mono: true },
              {
                label: "Fingerprint",
                value: identity.fingerprint,
                mono: true,
                note: "First 16 hex characters of SHA-256 over the DID. Used as the directory key.",
              },
              {
                label: "Created",
                value: formatUtc(identity.createdAt),
                mono: true,
                note: "Observed by this browser. No server was involved in generating or timestamping this identity.",
              },
            ]}
          />
          <EgressLedger entries={[]} transport={transport} />
        </div>
      </Disclosure>
    </>
  );
}
