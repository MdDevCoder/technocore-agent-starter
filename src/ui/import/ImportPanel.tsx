"use client";

/**
 * Import an existing identity or migrate a legacy WSL/Linux identity.
 *
 * Supported formats:
 * 1. Encrypted Technocore Backup (.backup.json) — restores session using PBKDF2 + AES-256-GCM.
 * 2. Existing WSL/Linux CLI Identity (agent_key.json) — validates keypair & DID client-side,
 *    converts to encrypted Technocore backup, and immediately wipes raw private keys from memory.
 *
 * Security Invariants:
 * - All parsing, verification, decryption, and migration run 100% in browser memory.
 * - Raw private keys are NEVER transmitted to the server or logged.
 * - The original DID is strictly preserved.
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  importBackupFile,
  summarizeBackupFile,
  migrateLegacyIdentityFile,
  summarizeLegacyIdentityFile,
  type BackupSummary,
  type ExportedBackup,
  type LegacyIdentitySummary,
} from "../../flow/backup.ts";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { Disclosure } from "../Disclosure.tsx";
import { MAX_UPLOAD_BYTES, readFileText, downloadText } from "../download.ts";
import { EgressLedger } from "../EgressLedger.tsx";
import { CheckboxField, FileField, PassphraseField } from "../fields.tsx";
import { Callout, ErrorNotice } from "../feedback.tsx";
import { formatByteCount, formatGrouped, formatUtc } from "../format.ts";
import { DataList, DidReadout, ReadoutPanel } from "../readouts.tsx";
import { resumeStepSlug, stepBySlug } from "../steps.ts";

type ImportTab = "backup" | "legacy";

interface ChosenBackup {
  readonly name: string;
  readonly text: string;
  readonly summary: BackupSummary;
}

interface ChosenLegacy {
  readonly name: string;
  readonly text: string;
  readonly summary: LegacyIdentitySummary;
}

export function ImportPanel() {
  const { identity, origin, flowState, adopt } = useAgentSession();

  const [tab, setTab] = useState<ImportTab>("backup");

  // Encrypted Backup state
  const [chosenBackup, setChosenBackup] = useState<ChosenBackup | null>(null);
  const [backupFileError, setBackupFileError] = useState<string | null>(null);
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupRetain, setBackupRetain] = useState(false);

  // Legacy WSL/Linux state
  const [chosenLegacy, setChosenLegacy] = useState<ChosenLegacy | null>(null);
  const [legacyFileError, setLegacyFileError] = useState<string | null>(null);
  const [legacyPassphrase, setLegacyPassphrase] = useState("");
  const [legacyRetain, setLegacyRetain] = useState(false);
  const [migratedBackup, setMigratedBackup] = useState<ExportedBackup | null>(null);

  // Shared state
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const [imported, setImported] = useState(false);

  /* ---------- Encrypted Backup Handlers ---------- */

  const pickBackupFile = useCallback(async (selected: File) => {
    setFailure(null);
    setBackupFileError(null);
    setChosenBackup(null);
    try {
      const text = await readFileText(selected);
      setChosenBackup({ name: selected.name, text, summary: summarizeBackupFile(text) });
    } catch (error) {
      setBackupFileError(toFlowFailure(error).detail);
    }
  }, []);

  const runBackupImport = useCallback(async () => {
    if (chosenBackup === null) return;
    setFailure(null);
    setBusy(true);
    try {
      const session = await importBackupFile(chosenBackup.text, backupPassphrase, {
        retainExportCapability: backupRetain,
      });
      setBackupPassphrase("");
      adopt(session, "identity-imported");
      setImported(true);
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(false);
    }
  }, [chosenBackup, backupPassphrase, backupRetain, adopt]);

  /* ---------- Legacy WSL/Linux Handlers ---------- */

  const pickLegacyFile = useCallback(async (selected: File) => {
    setFailure(null);
    setLegacyFileError(null);
    setChosenLegacy(null);
    try {
      const text = await readFileText(selected);
      const summary = await summarizeLegacyIdentityFile(text);
      setChosenLegacy({ name: selected.name, text, summary });
    } catch (error) {
      setLegacyFileError(toFlowFailure(error).detail);
    }
  }, []);

  const runLegacyMigration = useCallback(async () => {
    if (chosenLegacy === null) return;
    setFailure(null);
    setBusy(true);
    try {
      const { session, backup } = await migrateLegacyIdentityFile(chosenLegacy.text, legacyPassphrase, {
        retainExportCapability: legacyRetain,
      });
      setLegacyPassphrase("");
      setMigratedBackup(backup);
      adopt(session, "identity-imported");
      setImported(true);
      // Automatically trigger download of the new encrypted backup file
      downloadText(backup.fileName, backup.text);
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(false);
    }
  }, [chosenLegacy, legacyPassphrase, legacyRetain, adopt]);

  /* ---------- Completed / Imported View ---------- */

  if (imported && identity !== null) {
    const resume = resumeStepSlug(flowState);
    const resumeStep = stepBySlug(resume);

    if (migratedBackup !== null) {
      // Legacy Migration Success Screen
      return (
        <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:px-8 sm:py-20">
          <Callout tone="verified" title="Identity migrated successfully">
            Your original DID has been preserved. The legacy unencrypted key has been securely converted into an
            encrypted Technocore backup.
          </Callout>

          <div className="mt-6">
            <ReadoutPanel title="Migrated identity">
              <DidReadout did={identity.did} hint="Exact original DID preserved from your WSL/Linux identity." />
              <div className="mt-5">
                <DataList
                  dense
                  rows={[
                    { label: "Fingerprint", value: identity.fingerprint, mono: true },
                    { label: "Created", value: formatUtc(identity.createdAt), mono: true },
                    {
                      label: "Encrypted backup",
                      value: migratedBackup.fileName,
                      mono: true,
                      note: "Downloaded automatically. Use this encrypted file to restore this identity in the future.",
                    },
                    {
                      label: "Re-export",
                      value: legacyRetain ? "available in this tab" : "not available",
                      note: legacyRetain
                        ? "You chose to retain the key in memory for this tab."
                        : "Raw key material was immediately wiped from memory. The encrypted backup file is your key.",
                    },
                  ]}
                />
              </div>
            </ReadoutPanel>
          </div>

          <div className="mt-6">
            <Callout tone="attention" title="Protect your migrated identity">
              Your legacy JSON contains an unencrypted private key. After migration, store the encrypted backup safely and delete or secure the old JSON file.
            </Callout>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={() => downloadText(migratedBackup.fileName, migratedBackup.text)}
            >
              Download backup file again
            </Button>
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
            <Link href="/civilization" className={buttonClasses("ghost", "lg")}>
              Civilization Observatory
            </Link>
          </div>

          <p className="text-faint mt-5 max-w-[58ch] text-[0.75rem] leading-relaxed">
            This identity is active in this tab. Closing the tab ends the session — your new encrypted backup file is how you return.
          </p>
        </div>
      );
    }

    // Standard Encrypted Backup Restored Screen
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
                    value: backupRetain ? "available in this tab" : "not available",
                    note: backupRetain
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
          <Link href="/civilization" className={buttonClasses("ghost", "lg")}>
            Civilization Observatory
          </Link>
        </div>

        <p className="text-faint mt-5 max-w-[58ch] text-[0.75rem] leading-relaxed">
          This identity is held in this tab only. Closing it ends the session — the file you just opened is
          how you come back.
        </p>
      </div>
    );
  }

  /* ---------- Import Form with Dual Tabs ---------- */

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <header>
        <p className="eyebrow">Import</p>
        <h1 className="display text-ink mt-4 text-[1.75rem] sm:text-[2.125rem]">
          Import or migrate an identity
        </h1>
        <p className="text-muted mt-3 max-w-[56ch] text-[0.9375rem] leading-relaxed">
          Restore an identity from an encrypted backup, or migrate an existing identity created via the
          Linux/WSL CLI. All validation and encryption happen entirely inside your browser.
        </p>
      </header>

      {identity === null ? null : (
        <div className="mt-8">
          <Callout tone="attention" title="This tab already holds an active identity">
            <p>
              Importing replaces{" "}
              <span className="mono text-signal break-all">{identity.did}</span>
              {origin === "imported" ? " (restored earlier)" : " (created in this tab)"} and clears the
              activity view for it. Anything it has already posted to the network remains unchanged.
            </p>
          </Callout>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="mt-8 flex rounded-lg border border-[var(--color-border)] p-1 bg-[var(--color-surface-subtle)]">
        <button
          type="button"
          onClick={() => {
            setTab("backup");
            setFailure(null);
          }}
          className={`flex-1 rounded-md py-2.5 px-3 text-sm font-medium transition-all ${
            tab === "backup"
              ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm font-semibold"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          Encrypted Technocore Backup
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("legacy");
            setFailure(null);
          }}
          className={`flex-1 rounded-md py-2.5 px-3 text-sm font-medium transition-all ${
            tab === "legacy"
              ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm font-semibold"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-ink)]"
          }`}
        >
          Existing WSL / Linux Identity
        </button>
      </div>

      {tab === "backup" ? (
        /* ================= TAB 1: ENCRYPTED BACKUP ================= */
        <section className="panel mt-6 flex flex-col gap-5 rounded-lg p-5 sm:p-6">
          <div>
            <h2 className="text-ink text-[1.125rem] font-semibold">Open encrypted backup</h2>
            <p className="text-muted mt-1 text-[0.875rem]">
              Restore an identity using the .backup.json file generated by this website.
            </p>
          </div>

          <FileField
            label="Encrypted backup file"
            accept="application/json,.json"
            selected={chosenBackup?.name ?? null}
            onSelect={(selected) => void pickBackupFile(selected)}
            hint={`The JSON backup file this app saved for you. Up to ${formatByteCount(MAX_UPLOAD_BYTES)}.`}
            error={backupFileError ?? undefined}
          />

          {chosenBackup === null ? null : (
            <DataList
              dense
              rows={[
                {
                  label: "Identity in this file",
                  value: chosenBackup.summary.did,
                  mono: true,
                  note: "Read from the file's plaintext header. Nothing has been decrypted yet.",
                },
                { label: "Created", value: formatUtc(chosenBackup.summary.createdAt), mono: true },
                {
                  label: "Key derivation",
                  value: `PBKDF2 · ${formatGrouped(chosenBackup.summary.iterations)} iterations`,
                  mono: true,
                  note: "Deriving the key from your passphrase takes a moment on purpose.",
                },
              ]}
            />
          )}

          <PassphraseField
            intent="open"
            label="Backup passphrase"
            value={backupPassphrase}
            onChange={(event) => setBackupPassphrase(event.target.value)}
            hint="The passphrase you chose when you exported this file. Nobody can reset it."
          />

          <CheckboxField
            checked={backupRetain}
            onChange={setBackupRetain}
            tone={backupRetain ? "attention" : "neutral"}
            label="Keep the ability to export a new backup"
            description="Holds the decrypted key in this tab's memory so it can be re-encrypted under a different passphrase. Leave this off unless you need that."
          />

          <div>
            <Button
              variant="primary"
              size="lg"
              busy={busy}
              disabled={busy || chosenBackup === null || backupPassphrase.length === 0}
              onClick={() => void runBackupImport()}
            >
              {busy ? "Decrypting..." : "Open backup"}
            </Button>
          </div>

          <p className="text-faint max-w-[58ch] text-[0.75rem] leading-relaxed">
            Key derivation and decryption both run here. No part of the file and no part of your passphrase is
            sent anywhere.
          </p>
        </section>
      ) : (
        /* ================= TAB 2: LEGACY WSL/LINUX IDENTITY ================= */
        <section className="panel mt-6 flex flex-col gap-5 rounded-lg p-5 sm:p-6">
          <div>
            <h2 className="text-ink text-[1.125rem] font-semibold">Import existing WSL / Linux identity</h2>
            <p className="text-muted mt-1 text-[0.875rem]">
              Already created an agent using the Technocore Linux/WSL commands? Import your existing identity without creating a new DID.
            </p>
          </div>

          <FileField
            label="Legacy identity file (agent_key.json)"
            accept="application/json,.json"
            selected={chosenLegacy?.name ?? null}
            onSelect={(selected) => void pickLegacyFile(selected)}
            hint={`Select your existing agent_key.json file from your Linux/WSL environment. Up to ${formatByteCount(MAX_UPLOAD_BYTES)}.`}
            error={legacyFileError ?? undefined}
          />

          {chosenLegacy === null ? null : (
            <div className="rounded-md border border-[var(--color-border)] p-4 bg-[var(--color-surface)]">
              <h3 className="text-ink text-sm font-semibold mb-2">Verified Identity in File</h3>
              <DataList
                dense
                rows={[
                  {
                    label: "Original DID",
                    value: chosenLegacy.summary.did,
                    mono: true,
                    note: "Cryptographically verified against the private key and public key in the file.",
                  },
                  { label: "Fingerprint", value: chosenLegacy.summary.fingerprint, mono: true },
                  { label: "Created", value: formatUtc(chosenLegacy.summary.createdAt), mono: true },
                ]}
              />
            </div>
          )}

          <div className="rounded-md border border-[var(--color-border-attention)] p-4 bg-[var(--color-surface-subtle)]">
            <p className="text-xs text-[var(--color-ink)] font-medium">
              🔒 <strong>Security Upgrade Required:</strong> Your legacy JSON file contains an unencrypted private key.
              Enter a strong passphrase below to convert this identity into an encrypted Technocore backup.
            </p>
          </div>

          <PassphraseField
            intent="create"
            label="Choose a passphrase for your encrypted backup"
            value={legacyPassphrase}
            onChange={(event) => setLegacyPassphrase(event.target.value)}
            hint="Choose a strong passphrase. It will protect and encrypt your new backup file using PBKDF2 (600,000 iterations) + AES-256-GCM."
          />

          <CheckboxField
            checked={legacyRetain}
            onChange={setLegacyRetain}
            tone={legacyRetain ? "attention" : "neutral"}
            label="Keep the ability to re-export in this tab"
            description="Keep the key in this tab's memory for re-exporting. If unchecked, the raw key is wiped immediately after generating the encrypted backup."
          />

          <div>
            <Button
              variant="primary"
              size="lg"
              busy={busy}
              disabled={busy || chosenLegacy === null || legacyPassphrase.length === 0}
              onClick={() => void runLegacyMigration()}
            >
              {busy ? "Encrypting & Migrating..." : "Migrate & Protect Identity"}
            </Button>
          </div>

          <p className="text-faint max-w-[58ch] text-[0.75rem] leading-relaxed">
            Your private key is parsed and verified entirely in this browser tab. It is converted into an encrypted backup and never uploaded to any server.
          </p>
        </section>
      )}

      {/* Failure Notification */}
      {failure === null ? null : (
        <div className="mt-6">
          <ErrorNotice
            failure={failure}
            onRetry={() => {
              if (tab === "backup") void runBackupImport();
              else void runLegacyMigration();
            }}
            retryLabel="Try again"
          />
        </div>
      )}

      <div className="mt-8">
        <Callout tone="fault" title="Never upload an unencrypted private key over the internet">
          This browser application runs all cryptography locally. Your private keys never leave your device.
          After migrating your legacy WSL/Linux identity, delete or securely store the old unencrypted JSON file.
        </Callout>
      </div>

      <div className="mt-8">
        <Disclosure summary="Technical details">
          <div className="flex flex-col gap-5">
            <DataList
              rows={[
                {
                  label: "Legacy format",
                  value: "agent_key.json (Ed25519 seed hex + public key hex)",
                  mono: true,
                  note: "Validated client-side against RFC 8032 and W3C did:key specifications.",
                },
                {
                  label: "Converted cipher",
                  value: "AES-256-GCM (PBKDF2-SHA256, 600,000 iterations)",
                  mono: true,
                  note: "Authenticated envelope bound to the canonical DID.",
                },
                {
                  label: "DID consistency",
                  value: "Strict byte-for-byte correspondence",
                  mono: true,
                  note: "Public key is derived from the seed, and the DID is reconstructed and verified before migration.",
                },
                {
                  label: "Zero-server guarantee",
                  value: "Local WebCrypto only",
                  mono: true,
                  note: "No network requests are made during identity import or migration.",
                },
              ]}
            />
            <EgressLedger entries={[]} transport={null} />
          </div>
        </Disclosure>
      </div>

      <p className="text-faint mt-8 text-[0.8125rem] leading-relaxed">
        No identity yet?{" "}
        <Link href="/onboarding/identity" className="text-ink underline decoration-dotted underline-offset-4">
          Create a new identity
        </Link>
        .
      </p>
    </div>
  );
}
