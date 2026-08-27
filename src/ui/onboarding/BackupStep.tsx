"use client";

/**
 * Step 2 — Protect.
 *
 * The step that makes the rest of the flow safe to take part in, and the only one with a gate behind it.
 *
 * Three decisions worth stating.
 *
 * **There is no confirm-passphrase field.** Normally that field exists to catch a typo that would produce
 * an unopenable file — but this step already requires the user to open the file they just saved, with the
 * passphrase typed again, before it will advance. A typo is caught by the real check rather than by a
 * second copy of the input, and the real check also catches a file that failed to save, a browser that
 * blocked the download, and a passphrase the user has already forgotten.
 *
 * **Opening the backup is what unlocks the flow, not downloading it.** `backupState` moves to `exported`
 * when a file is produced and only to `verified` when that file has been decrypted back to the exact seed
 * in memory. `gateFor` requires `verified`. A backup nobody has opened is a hypothesis.
 *
 * **The passphrase lives in component state and is cleared as soon as it is spent.** It is never logged,
 * never copied to the clipboard, never placed in a URL, and never sent anywhere — key derivation and
 * decryption both happen in this tab.
 */

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  exportBackupFile,
  verifyBackupFile,
  type BackupVerification,
  type ExportedBackup,
} from "../../flow/backup.ts";
import { toFlowFailure, type FlowFailure } from "../../flow/failure.ts";
import { useAgentSession } from "../../hooks/AgentSession.tsx";
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "../../identity/passphrase.ts";
import { Button } from "../Button.tsx";
import { buttonClasses } from "../buttonStyles.ts";
import { Disclosure } from "../Disclosure.tsx";
import { downloadText, readFileText } from "../download.ts";
import { EgressLedger } from "../EgressLedger.tsx";
import { FileField, PassphraseField } from "../fields.tsx";
import { Callout, ErrorNotice, Meter } from "../feedback.tsx";
import { formatGrouped, formatUtc } from "../format.ts";
import { DataList } from "../readouts.tsx";
import { StepActions } from "./StepShell.tsx";

/** Strength is advice, so it is never coloured like a verification result. */
const STRENGTH_TONE = ["fault", "fault", "attention", "verified", "verified"] as const;

export function BackupStep() {
  const { session, identity, backup, hardened, canExportBackup, refresh, log } = useAgentSession();

  const [passphrase, setPassphrase] = useState("");
  const [openPassphrase, setOpenPassphrase] = useState("");
  const [exported, setExported] = useState<ExportedBackup | null>(null);
  const [file, setFile] = useState<{ readonly name: string; readonly text: string } | null>(null);
  const [otherIdentity, setOtherIdentity] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "verify" | null>(null);
  const [failure, setFailure] = useState<FlowFailure | null>(null);
  const [downloadBlocked, setDownloadBlocked] = useState(false);

  const assessment = passphrase.length === 0 ? null : assessPassphrase(passphrase);

  const runExport = useCallback(async () => {
    if (session === null) return;
    setFailure(null);
    setDownloadBlocked(false);
    setBusy("export");
    try {
      const result = await exportBackupFile(session, passphrase);
      const saved = downloadText(result.fileName, result.text);
      // `exportBackup` has already moved the session to `exported`, so the getters must be re-read.
      refresh();
      setExported(result);
      if (!saved) {
        setDownloadBlocked(true);
      } else {
        log({
          kind: "backup-exported",
          summary: "Encrypted backup saved",
          detail: { note: `${result.fileName} · PBKDF2 ${formatGrouped(result.iterations)} iterations` },
        });
      }
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(null);
    }
  }, [session, passphrase, refresh, log]);

  const pickFile = useCallback(async (selected: File) => {
    setFailure(null);
    setOtherIdentity(null);
    try {
      setFile({ name: selected.name, text: await readFileText(selected) });
    } catch (error) {
      setFile(null);
      setFailure(toFlowFailure(error));
    }
  }, []);

  const runVerify = useCallback(async () => {
    if (session === null || file === null) return;
    setFailure(null);
    setOtherIdentity(null);
    setBusy("verify");
    try {
      const result: BackupVerification = await verifyBackupFile(session, file.text, openPassphrase);
      refresh();

      if (result.status === "other-identity") {
        setOtherIdentity(result.did);
        return;
      }

      // Spent. Neither passphrase is needed again, and holding them would only widen the window in which
      // they exist in this tab's memory.
      setPassphrase("");
      setOpenPassphrase("");
      log({
        kind: "backup-verified",
        summary: result.hardened
          ? "Backup opened and verified — signing key hardened"
          : "Backup opened and verified",
      });
    } catch (error) {
      setFailure(toFlowFailure(error));
    } finally {
      setBusy(null);
    }
  }, [session, file, openPassphrase, refresh, log]);

  if (session === null || identity === null) {
    return (
      <Callout tone="fault" title="No identity in this tab">
        Create or import an identity before protecting it.
      </Callout>
    );
  }

  /* ---------- Already protected ---------- */

  if (backup === "verified") {
    return (
      <>
        <Callout tone="verified" title="This identity is protected">
          <p>
            {hardened
              ? "Your backup opened successfully, and the seed has been dropped from this tab's memory. " +
                "Signing still works through a non-extractable key handle."
              : "Your backup opened successfully, so the file you hold can restore this identity."}
          </p>
        </Callout>

        <Callout tone="attention" title="Keep the file and the passphrase apart">
          The file is useless without the passphrase, and the passphrase is useless without the file. Store
          them in two different places, and remember that no one can reset either of them for you.
        </Callout>

        <StepActions
          primary={
            <Link href="/onboarding/introduce" className={buttonClasses("primary", "lg")}>
              Introduce your agent
            </Link>
          }
          note="Step 3 signs a short check-in and posts it to the Technocore lobby. It is the first step that makes a network request."
        />

        <Disclosure summary="Technical details">
          <div className="flex flex-col gap-5">
            <BackupCryptoDetails
              iterations={exported?.iterations ?? null}
              fileName={exported?.fileName ?? null}
              createdAt={exported?.createdAt ?? null}
            />
            <EgressLedger entries={[]} transport={null} />
          </div>
        </Disclosure>
      </>
    );
  }

  /* ---------- Open the file you saved ---------- */

  if (backup === "exported") {
    return (
      <>
        <Callout tone="attention" title="Now open the file you just saved">
          <p>
            This is the step that proves your backup works. Choose the file, type the same passphrase, and
            it will be decrypted here and compared against the key in memory.
          </p>
        </Callout>

        {downloadBlocked ? (
          <Callout tone="fault" title="The download did not start" role="alert">
            <p>
              Your browser blocked the file, so there is nothing saved yet. Allow downloads for this page,
              then use <span className="text-ink font-medium">Export again</span> below — your passphrase is
              still held in this tab, so the file will be identical.
            </p>
          </Callout>
        ) : null}

        <section className="panel flex flex-col gap-5 rounded-lg p-5 sm:p-6">
          <FileField
            label="Your backup file"
            accept="application/json,.json"
            selected={file?.name ?? null}
            onSelect={(selected) => void pickFile(selected)}
            hint={
              exported === null
                ? "The file you saved a moment ago."
                : `Look for ${exported.fileName} in your downloads.`
            }
          />

          <PassphraseField
            intent="open"
            label="Passphrase"
            value={openPassphrase}
            onChange={(event) => setOpenPassphrase(event.target.value)}
            hint="The same passphrase you used to encrypt the file. Deriving the key takes a moment on purpose."
          />

          <StepActions
            primary={
              <Button
                variant="primary"
                size="lg"
                busy={busy === "verify"}
                disabled={busy !== null || file === null || openPassphrase.length === 0}
                onClick={() => void runVerify()}
              >
                {busy === "verify" ? "Opening backup" : "Open backup and continue"}
              </Button>
            }
            secondary={
              // Re-exports under the passphrase still held in component state, so the file is byte-identical
              // to the one already produced. Hidden rather than disabled once that state is gone, because a
              // button that cannot explain why it is dead is worse than no button.
              passphrase.length === 0 ? undefined : (
                <Button
                  variant="ghost"
                  size="lg"
                  busy={busy === "export"}
                  disabled={busy !== null}
                  onClick={() => void runExport()}
                >
                  Export again
                </Button>
              )
            }
            note="Nothing is uploaded. The file is read in this tab and the passphrase never leaves it."
          />
        </section>

        {otherIdentity === null ? null : (
          <Callout tone="attention" title="That file is a different identity" role="alert">
            <p>
              It is a valid backup, but for{" "}
              <span className="mono text-signal break-all">{otherIdentity}</span> — not the identity in this
              tab. Choose the file you saved a moment ago.
            </p>
          </Callout>
        )}

        {failure === null ? null : (
          <ErrorNotice failure={failure} onRetry={() => void runVerify()} retryLabel="Try again" />
        )}

        <Disclosure summary="Technical details">
          <div className="flex flex-col gap-5">
            <BackupCryptoDetails
              iterations={exported?.iterations ?? null}
              fileName={exported?.fileName ?? null}
              createdAt={exported?.createdAt ?? null}
            />
            <EgressLedger entries={[]} transport={null} />
          </div>
        </Disclosure>
      </>
    );
  }

  /* ---------- Create the backup ---------- */

  return (
    <>
      {canExportBackup ? null : (
        <Callout tone="fault" title="This session cannot export a backup">
          It was restored without keeping the seed in memory, which is the safer default. Import your backup
          again with the export option enabled if you need to re-encrypt it under a new passphrase.
        </Callout>
      )}

      <section className="panel flex flex-col gap-5 rounded-lg p-5 sm:p-6">
        <PassphraseField
          intent="create"
          label="Backup passphrase"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          hint={`At least ${String(MIN_PASSPHRASE_LENGTH)} characters. A few unrelated words are stronger and easier to remember than a short, complicated one.`}
        />

        {assessment === null ? null : (
          <div className="flex flex-col gap-2">
            <Meter
              label="Passphrase strength"
              value={assessment.score}
              max={4}
              readout={`${assessment.label} · ~${String(assessment.bits)} bits`}
              tone={STRENGTH_TONE[assessment.score]}
            />
            {assessment.notes.length === 0 ? null : (
              <ul className="text-faint flex flex-col gap-1 text-[0.75rem] leading-relaxed">
                {assessment.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <StepActions
          primary={
            <Button
              variant="primary"
              size="lg"
              busy={busy === "export"}
              disabled={busy !== null || !canExportBackup || assessment?.acceptable !== true}
              onClick={() => void runExport()}
            >
              {busy === "export" ? "Encrypting" : "Save encrypted backup"}
            </Button>
          }
          note="Encryption happens here. The file that lands in your downloads contains your key sealed under this passphrase — nothing readable, and nothing that works without it."
        />
      </section>

      <Callout tone="fault" title="There is no recovery without this file">
        Lose both the file and the passphrase and the identity is gone permanently. This website does not
        store your private key or passphrase — recovery is strictly non-custodial and in your hands.
      </Callout>

      {failure === null ? null : (
        <ErrorNotice failure={failure} onRetry={() => void runExport()} retryLabel="Try again" />
      )}

      <Disclosure summary="Technical details">
        <div className="flex flex-col gap-5">
          <BackupCryptoDetails iterations={null} fileName={null} createdAt={null} />
          <EgressLedger entries={[]} transport={null} />
        </div>
      </Disclosure>
    </>
  );
}

/**
 * The backup format, stated plainly.
 *
 * The plaintext header is called out because it is a real property of the file worth knowing before saving
 * it somewhere shared: the DID, the creation time and the iteration count are readable without the
 * passphrase, by design, so a file can be identified without being decrypted.
 */
function BackupCryptoDetails({
  iterations,
  fileName,
  createdAt,
}: {
  readonly iterations: number | null;
  readonly fileName: string | null;
  readonly createdAt: string | null;
}) {
  return (
    <DataList
      rows={[
        {
          label: "Key derivation",
          value: "PBKDF2-HMAC-SHA-256",
          mono: true,
          note:
            iterations === null
              ? "600,000 iterations, salted per file."
              : `${formatGrouped(iterations)} iterations, salted per file.`,
        },
        {
          label: "Cipher",
          value: "AES-256-GCM",
          mono: true,
          note: "Authenticated, so a tampered file fails to open rather than decrypting to something wrong.",
        },
        {
          label: "Associated data",
          value: "schema|did",
          mono: true,
          note: "Bound into the authentication tag, so the header cannot be edited to point at another identity.",
        },
        {
          label: "Readable header",
          value: "did, created_at, kdf.iterations",
          mono: true,
          note: "Plaintext on purpose, so you can tell which identity a file belongs to without decrypting it.",
        },
        ...(fileName === null
          ? []
          : [{ label: "File", value: fileName, mono: true } as const]),
        ...(createdAt === null
          ? []
          : [{ label: "Exported", value: formatUtc(createdAt), mono: true } as const]),
      ]}
    />
  );
}
