/**
 * Step 2 orchestration: protect the identity.
 *
 * The gate in this flow lives here. Losing the key means losing the identity permanently — there is no
 * reset, because nobody else holds it — so "we showed the user a download button" is not good enough.
 * The step advances only once the file the user actually saved has been decrypted back to the exact
 * seed in memory, which is what `IdentitySession.verifyBackupRestores` proves.
 *
 * Then, and only then, the seed is dropped. After that the tab holds an opaque non-extractable handle:
 * it can still sign, so the rest of the flow works unchanged, but there is nothing left in memory that
 * could be read out and reused elsewhere. The landing page states this as a property of the product, so
 * it happens automatically rather than behind an optional switch.
 *
 * Nothing in this module logs, and nothing returns the seed. The only secret-bearing value that crosses
 * the boundary is the encrypted envelope, which is useless without the passphrase.
 */

import {
  BackupFormatError,
  backupFileName,
  parseBackupFile,
  serializeBackupFile,
  type BackupEnvelope,
} from "../identity/backup.ts";
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from "../identity/passphrase.ts";
import {
  importIdentitySession,
  type IdentitySession,
} from "../identity/session.ts";

export class WeakPassphraseError extends Error {
  override readonly name = "WeakPassphraseError";
  constructor(message: string) {
    super(message);
  }
}

export interface ExportedBackup {
  readonly envelope: BackupEnvelope;
  /** Suggested filename. Never `agent_key.json`, which belongs to the CLI's plaintext key file. */
  readonly fileName: string;
  /** The exact file contents, pretty-printed with a trailing newline. */
  readonly text: string;
  readonly iterations: number;
  readonly createdAt: string;
}

/**
 * Encrypt the seed under a passphrase and produce the file to save.
 *
 * The strength check is a usability floor, not a security boundary — the file is encrypted either way —
 * but an identity that cannot be recovered is worth one refusal at the door.
 */
export async function exportBackupFile(
  session: IdentitySession,
  passphrase: string,
): Promise<ExportedBackup> {
  const assessment = assessPassphrase(passphrase);
  if (!assessment.acceptable) {
    throw new WeakPassphraseError(
      `Use at least ${MIN_PASSPHRASE_LENGTH} characters. This is the only thing standing between the ` +
        "file and anyone who obtains it.",
    );
  }

  const envelope = await session.exportBackup(passphrase);
  return {
    envelope,
    fileName: await backupFileName(envelope.did),
    text: serializeBackupFile(envelope),
    iterations: envelope.kdf.iterations,
    createdAt: envelope.created_at,
  };
}

export type BackupVerification =
  | {
      readonly status: "verified";
      /** True when the seed was dropped from memory as part of this call. */
      readonly hardened: boolean;
    }
  | {
      /** A valid backup, but of a different identity. Not an error in the file. */
      readonly status: "other-identity";
      readonly did: string;
    };

/**
 * Prove the saved file opens, then harden the session.
 *
 * The DID comparison happens before key derivation on purpose: deriving a 600,000-iteration PBKDF2 key
 * only to report "wrong identity" wastes several seconds of the user's time to reach an answer already
 * visible in the file's plaintext header.
 */
export async function verifyBackupFile(
  session: IdentitySession,
  fileText: string,
  passphrase: string,
): Promise<BackupVerification> {
  const envelope = parseBackupFile(fileText);

  if (envelope.did !== session.identity.did) {
    return { status: "other-identity", did: envelope.did };
  }

  const matches = await session.verifyBackupRestores(envelope, passphrase);
  if (!matches) {
    // The envelope's DID matched and it decrypted, yet the seed differs. `restoreBackup` already
    // rejects a file whose key disagrees with its own DID, so this is not reachable by editing a
    // field — it means the file is internally inconsistent in a way worth naming precisely.
    throw new BackupFormatError(
      "This file opened, but the key inside it is not the key for this session. Export a fresh backup.",
    );
  }

  return { status: "verified", hardened: hardenSession(session) };
}

/**
 * Drop the seed. Irreversible for this session, and safe only after verification.
 *
 * Returns whether anything changed, so the UI can describe what happened rather than assert it.
 */
export function hardenSession(session: IdentitySession): boolean {
  if (session.hardened) return false;
  session.discardSeed();
  return true;
}

export interface ImportOptions {
  /**
   * Keep the seed in memory so a new backup can be re-encrypted under a different passphrase.
   *
   * Off by default: the user demonstrably holds a working file already, so retaining the seed would add
   * exposure for no benefit.
   */
  readonly retainExportCapability?: boolean;
}

/** Restore an identity from an encrypted backup file. Used by the import page and nothing else. */
export async function importBackupFile(
  fileText: string,
  passphrase: string,
  options: ImportOptions = {},
): Promise<IdentitySession> {
  const envelope = parseBackupFile(fileText);
  return importIdentitySession(envelope, passphrase, {
    retainExportCapability: options.retainExportCapability === true,
  });
}

/** Read the public header of a backup file without attempting to decrypt it. */
export interface BackupSummary {
  readonly did: string;
  readonly createdAt: string;
  readonly iterations: number;
}

export function summarizeBackupFile(fileText: string): BackupSummary {
  const envelope = parseBackupFile(fileText);
  return {
    did: envelope.did,
    createdAt: envelope.created_at,
    iterations: envelope.kdf.iterations,
  };
}
