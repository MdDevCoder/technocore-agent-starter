"use client";

/**
 * Import an existing identity.
 *
 * The only thing this page accepts is the encrypted backup file this app produces. It never asks for a
 * private key, a seed phrase, a mnemonic or a wallet credential, and it says so on the page — because the
 * shape of that request is exactly what a phishing page uses, and a tool that handles keys should teach the
 * habit of refusing it.
 *
 * The file's header is read before anything is decrypted. `did`, `created_at` and `kdf.iterations` are
 * plaintext by design, so the user can confirm which identity they are about to open without spending
 * 600,000 PBKDF2 iterations to find out. Decryption happens only when they ask for it.
 *
 * The passphrase lives in component state, is never logged, never copied, never placed in a URL, and is
 * cleared the moment it has been spent.
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import { importBackupFile, summarizeBackupFile, type BackupSummary } from "../../flow/backup.ts";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { Disclosure } from "../Disclosure.tsx";
import { MAX_UPLOAD_BYTES, readFileText } from "../download.ts";
import { EgressLedger } from "../EgressLedger.tsx";
import { CheckboxField, FileField, PassphraseField } from "../fields.tsx";
import { Callout, ErrorNotice } from "../feedback.tsx";
import { formatByteCount, formatGrouped, formatUtc } from "../format.ts";
import { DataList, DidReadout, ReadoutPanel } from "../readouts.tsx";
import { resumeStepSlug, stepBySlug } from "../steps.ts";

interface Chosen {
  readonly name: string;
  readonly text: string;
  readonly summary: BackupSummary;
}

export function ImportPanel() {
  const { identity, origin, flowState, adopt } = useAgentSession();

  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [retain, setRetain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const [imported, setImported] = useState(false);

  const pickFile = useCallback(async (selected: File) => {
    setFailure(null);
    setFileError(null);
    setChosen(null);
    try {
      const text = await readFileText(selected);
      // Parsed, not merely accepted. A file that is not a backup should be rejected here rather than
      // after the user has typed a passphrase and waited for key derivation.
      setChosen({ name: selected.name, text, summary: summarizeBackupFile(text) });
    } catch (error) {
      setFileError(toFlowFailure(error).detail);
    }
  }, []);

  const runImport = useCallback(async () => {
    if (chosen === null) return;
    setFailure(null);
    setBusy(true);
    try {
      const session = await importBackupFile(chosen.text, passphrase, {
        retainExportCapability: retain,
      });
      // Spent. Nothing needs it again, and keeping it would only widen the window in which it exists.
      setPassphrase("");
      adopt(session, "identity-imported");
      setImported(true);
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(false);
    }
  }, [chosen, passphrase, retain, adopt]);

  /* ---------- Imported ---------- */

  if (imported && identity !== null) {
    const resume = resumeStepSlug(flowState);
    const resumeStep = stepBySlug(resume);

    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:px-8 sm:py-20">
        <Callout tone="verified" title="Identity restored">
          Your backup decrypted in this tab and the key inside it matches the DID in its own header.
        </Callout>

        <div className="mt-6">
          <ReadoutPanel title="Restored identity">
            <DidReadout did={identity.did} hint="Derived from the key in the file, not read from the file's header." />
            <div className="mt-5">
              <DataList
                dense
                rows={[
                  { label: "Fingerprint", value: identity.fingerprint, mono: true },
                  { label: "Created", value: formatUtc(identity.createdAt), mono: true },
                  {
                    label: "Re-export",
                    value: retain ? "available in this tab" : "not available",
                    note: retain
                      ? "You asked to keep the seed in memory, so a new backup can be encrypted under a different passphrase."
                      : "The seed was wiped after the key handle was created. The file you just opened remains your backup.",
                  },
                ]}
              />
            </div>
          </ReadoutPanel>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={`/onboarding/${resume}`} className={buttonClasses("primary", "lg")}>
            {resumeStep.ordinal === null
              ? `Go to ${resumeStep.name}`
              : `Continue — step ${resumeStep.ordinal}, ${resumeStep.name}`}
          </Link>
          <Link href="/agent" className={buttonClasses("secondary", "lg")}>
            Open the dashboard
          </Link>
        </div>

        <p className="text-faint mt-5 max-w-[58ch] text-[0.75rem] leading-relaxed">
          This identity is held in this tab only. Closing it ends the session — the file you just opened is
          how you come back.
        </p>
      </div>
    );
  }

  /* ---------- Import form ---------- */

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="eyebrow">Import</p>
        <h1 className="display text-ink mt-4 text-[1.75rem] sm:text-[2.125rem]">
          Open an encrypted backup
        </h1>
        <p className="text-muted mt-3 max-w-[56ch] text-[0.9375rem] leading-relaxed">
          Restore an identity you created earlier. The file is read in this tab, decrypted in this tab, and
          never uploaded.
        </p>
      </header>

      {identity === null ? null : (
        <div className="mt-8">
          <Callout tone="attention" title="This tab already holds an identity">
            <p>
              Importing replaces{" "}
              <span className="mono text-signal break-all">{identity.did}</span>
              {origin === "imported" ? " (restored earlier)" : " (created in this tab)"} and clears the
              activity view for it. Anything it has already posted stays posted.
            </p>
          </Callout>
        </div>
      )}

      <section className="panel mt-8 flex flex-col gap-5 rounded-lg p-5 sm:p-6">
        <FileField
          label="Encrypted backup file"
          accept="application/json,.json"
          selected={chosen?.name ?? null}
          onSelect={(selected) => void pickFile(selected)}
          hint={`The JSON file this app saved for you. Up to ${formatByteCount(MAX_UPLOAD_BYTES)}.`}
          error={fileError ?? undefined}
        />

        {chosen === null ? null : (
          <DataList
            dense
            rows={[
              {
                label: "Identity in this file",
                value: chosen.summary.did,
                mono: true,
                note: "Read from the file's plaintext header. Nothing has been decrypted yet.",
              },
              { label: "Created", value: formatUtc(chosen.summary.createdAt), mono: true },
              {
                label: "Key derivation",
                value: `PBKDF2 · ${formatGrouped(chosen.summary.iterations)} iterations`,
                mono: true,
                note: "Deriving the key from your passphrase takes a moment on purpose.",
              },
            ]}
          />
        )}

        <PassphraseField
          intent="open"
          label="Backup passphrase"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          hint="The passphrase you chose when you exported this file. Nobody can reset it."
        />

        <CheckboxField
          checked={retain}
          onChange={setRetain}
          tone={retain ? "attention" : "neutral"}
          label="Keep the ability to export a new backup"
          description="Holds the decrypted key in this tab's memory so it can be re-encrypted under a different passphrase. Leave this off unless you need that — with it off, the key is kept only as a non-extractable handle that can sign but cannot be read out."
        />

        <div>
          <Button
            variant="primary"
            size="lg"
            busy={busy}
            disabled={busy || chosen === null || passphrase.length === 0}
            onClick={() => void runImport()}
          >
            {busy ? "Decrypting" : "Open backup"}
          </Button>
        </div>

        <p className="text-faint max-w-[58ch] text-[0.75rem] leading-relaxed">
          Key derivation and decryption both run here. No part of the file and no part of your passphrase is
          sent anywhere.
        </p>
      </section>

      {/*
        No extra explanation is attached to the failure. `toFlowFailure` already distinguishes a bad file
        from a bad passphrase where that is safe to do, and deliberately does not where it would build a
        guessing oracle — restating it here would only risk contradicting it.
      */}
      {failure === null ? null : (
        <div className="mt-6">
          <ErrorNotice failure={failure} onRetry={() => void runImport()} retryLabel="Try again" />
        </div>
      )}

      <div className="mt-8">
        <Callout tone="fault" title="Never paste a private key or seed phrase — here or anywhere">
          This page accepts one thing: the encrypted backup file this app produced. It will never ask for a
          wallet seed phrase, a mnemonic, a raw private key, or exchange credentials. Any site that does is
          trying to take your funds or your identity.
        </Callout>
      </div>

      <div className="mt-8">
        <Disclosure summary="Technical details">
          <div className="flex flex-col gap-5">
            <DataList
              rows={[
                {
                  label: "Cipher",
                  value: "AES-256-GCM",
                  mono: true,
                  note: "Authenticated. A modified file fails to open instead of decrypting to something else.",
                },
                {
                  label: "Associated data",
                  value: "schema|did",
                  mono: true,
                  note: "Bound into the authentication tag, so the plaintext header cannot be edited to point at another identity.",
                },
                {
                  label: "Consistency check",
                  value: "public key vs header DID",
                  mono: true,
                  note: "The DID is recomputed from the decrypted key and compared with the file's own header before the session is created.",
                },
                {
                  label: "Upload limit",
                  value: formatByteCount(MAX_UPLOAD_BYTES),
                  mono: true,
                  note: "A backup is under a kilobyte. The limit exists so a mis-picked file is rejected instead of read.",
                },
              ]}
            />
            <EgressLedger entries={[]} transport={null} />
          </div>
        </Disclosure>
      </div>

      <p className="text-faint mt-8 text-[0.8125rem] leading-relaxed">
        No backup file?{" "}
        <Link href="/onboarding/identity" className="text-ink underline decoration-dotted underline-offset-4">
          Create a new identity
        </Link>
        .
      </p>
    </div>
  );
}
