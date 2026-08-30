/**
 * One presentation shape for every failure the flow can produce.
 *
 * `src/technocore/errors.ts` already models protocol failures well, but the onboarding flow can also
 * fail in ways that are not protocol failures at all: an unsupported browser, a backup file that does
 * not parse, a passphrase that does not open it, a link the policy rejects. Rather than force those
 * into the protocol taxonomy — which would mean inventing codes for things the protocol has no opinion
 * about — this module normalizes everything into a single record the error UI can render.
 *
 * Three rules held throughout:
 *
 * - **Never widen a message.** A `TechnocoreError` keeps its own title, detail, remedy and blocking
 *   flag verbatim. This is a translation layer, not a rewrite.
 * - **Never leak.** Nothing here reads key material, and the fallback path passes an unknown error's
 *   message through `safeExcerpt`, which caps length and strips control characters. Errors thrown by
 *   this codebase never contain key bytes (`SigningHandle` refuses to serialize at all), and a
 *   `DOMException` from WebCrypto carries only an algorithm complaint.
 * - **Never guess `blocking`.** Where the underlying error does not say, the answer is `true`, because
 *   claiming a step is recoverable when it is not is the worse of the two mistakes.
 */

import { AeadError } from "../crypto/aead.ts";
import { CryptoUnsupportedError } from "../crypto/ed25519.ts";
import { KdfError } from "../crypto/kdf.ts";
import { BackupFormatError, BackupIdentityMismatchError } from "../identity/backup.ts";
import { LegacyIdentityFormatError, LegacyIdentityMismatchError } from "../identity/legacy.ts";
import { BackupNotVerifiedError, SeedUnavailableError } from "../identity/session.ts";
import { SigningKeyLeakError } from "../identity/keystore.ts";
import { ContributionDraftError } from "../contribution/record.ts";
import { ContributionInputError, ProofFormatError } from "../contribution/proof.ts";
import {
  presentationFor,
  safeExcerpt,
  TechnocoreError,
  type TechnocoreErrorCode,
} from "../technocore/errors.ts";
import { InvalidRoomError } from "../technocore/profile.ts";
import { MissingSequenceError } from "../technocore/templates.ts";
import { WeakPassphraseError } from "./backup.ts";

export interface FlowFailure {
  readonly title: string;
  readonly detail: string;
  readonly remedy: string;
  readonly severity: "fault" | "attention";
  /** `false` means the step did not complete but the flow is still valid and may continue. */
  readonly blocking: boolean;
  readonly retryable: boolean;
  /** Present only when this came from the protocol taxonomy, so the UI can show the code. */
  readonly code?: TechnocoreErrorCode;
  /** Which input to focus, when the failure is about a specific field. */
  readonly field?: string;
  /** HTTP status, when there was a response. */
  readonly status?: number;
}

const make = (
  parts: Omit<FlowFailure, "severity" | "blocking" | "retryable"> &
    Partial<Pick<FlowFailure, "severity" | "blocking" | "retryable">>,
): FlowFailure => ({
  severity: "fault",
  blocking: true,
  retryable: false,
  ...parts,
});

/** Build a failure directly from a protocol code, for callers that already know what went wrong. */
export function failureFromCode(code: TechnocoreErrorCode, status?: number): FlowFailure {
  const presentation = presentationFor(code);
  return {
    title: presentation.title,
    detail: presentation.detail,
    remedy: presentation.remedy,
    severity: presentation.severity,
    blocking: presentation.blocking,
    retryable: presentation.retryable,
    code,
    ...(status === undefined ? {} : { status }),
  };
}

/**
 * Normalize any thrown value into something renderable.
 *
 * Ordered most-specific first. The `AeadError` case is the interesting one: `unseal` deliberately
 * cannot distinguish a wrong passphrase from an altered file — reporting them separately would build
 * a validation oracle — so a single combined remedy covers both, and says so.
 */
export function toFlowFailure(error: unknown): FlowFailure {
  if (error instanceof TechnocoreError) {
    const status = error.context.status;
    return {
      title: error.presentation.title,
      detail: error.presentation.detail,
      remedy: error.presentation.remedy,
      severity: error.presentation.severity,
      blocking: error.presentation.blocking,
      retryable: error.presentation.retryable,
      code: error.code,
      ...(status === undefined ? {} : { status }),
    };
  }

  if (error instanceof CryptoUnsupportedError) return failureFromCode("BROWSER_UNSUPPORTED");

  if (error instanceof AeadError) {
    return make({
      title: "That backup could not be opened",
      detail:
        "The passphrase did not decrypt this file. Authenticated encryption cannot tell a wrong " +
        "passphrase apart from an altered file, so both look identical here — deliberately, because a " +
        "message that distinguished them would help someone guessing.",
      remedy:
        "Check the passphrase, including capitals and spacing, and confirm you selected the file you " +
        "saved from this app. Nothing is retried automatically.",
      retryable: true,
    });
  }

  if (error instanceof BackupIdentityMismatchError) {
    return make({
      title: "This backup does not match the DID it claims",
      detail:
        "The file decrypted, but the key inside it derives a different DID from the one written in the " +
        "file. That means the file has been edited.",
      remedy: "Use an unmodified backup file. Do not continue with this one.",
    });
  }

  if (error instanceof BackupFormatError) {
    return make({
      title: "That file is not a backup this app can read",
      detail: error.message,
      remedy:
        "Choose the .backup.json file this app produced. It never asks for a plaintext key file, a " +
        "seed phrase, or a wallet key.",
      field: "file",
    });
  }

  if (error instanceof LegacyIdentityMismatchError) {
    return make({
      title: "Legacy key or DID mismatch",
      detail: error.message,
      remedy: "Ensure your agent_key.json has not been modified and that the public key corresponds to the private key.",
      field: "file",
    });
  }

  if (error instanceof LegacyIdentityFormatError) {
    return make({
      title: "Invalid legacy identity file",
      detail: error.message,
      remedy: "Select a valid agent_key.json file generated by the Technocore CLI.",
      field: "file",
    });
  }

  if (error instanceof WeakPassphraseError) {
    return make({
      title: "Choose a longer passphrase",
      detail: error.message,
      remedy: "A short phrase of several words is easier to remember and much harder to guess.",
      severity: "attention",
      blocking: false,
      retryable: true,
      field: "passphrase",
    });
  }

  if (error instanceof KdfError) {
    return make({
      title: "The passphrase could not be prepared for encryption",
      detail: error.message,
      remedy: "Try a different passphrase. Nothing was written.",
      retryable: true,
      field: "passphrase",
    });
  }

  if (error instanceof SeedUnavailableError) {
    return make({
      title: "The key is no longer in memory for this session",
      detail: error.message,
      remedy: "Import your encrypted backup file to regain the ability to export a new one.",
    });
  }

  if (error instanceof BackupNotVerifiedError) {
    return make({
      title: "Restore the backup once first",
      detail: error.message,
      remedy: "Re-select the file you saved and enter its passphrase to prove it opens.",
      severity: "attention",
      blocking: false,
      retryable: true,
    });
  }

  if (error instanceof ContributionDraftError) {
    return make({
      title: error.field === "link" ? "That link cannot be used" : "That description cannot be used",
      detail: error.message,
      remedy: error.field === "link"
        ? "Paste the full public link to your work, starting with https://."
        : "Say in a few words what your contribution helps people understand.",
      field: error.field,
    });
  }

  if (error instanceof ContributionInputError) {
    return make({
      title: error.field === "commit" ? "That is not a commit hash" : "That link cannot be used",
      detail: error.message,
      remedy:
        error.field === "commit"
          ? "Paste the full 40- or 64-character hash, or skip the optional proof file."
          : "Paste the full public link to your work, starting with https://.",
      field: error.field,
      blocking: error.field !== "commit",
    });
  }

  if (error instanceof ProofFormatError) {
    return make({
      title: "That proof file could not be read",
      detail: error.message,
      remedy: "Choose a .proof.json file produced by this app or by the reference CLI.",
      field: "file",
    });
  }

  if (error instanceof MissingSequenceError) {
    return make({
      title: "No sequence number yet",
      detail: error.message,
      remedy: "Post the contribution record first. Nothing is assembled from a placeholder.",
      severity: "attention",
      blocking: false,
    });
  }

  if (error instanceof InvalidRoomError) {
    return make({
      title: "Misconfigured room name",
      detail: error.message,
      remedy: "This is a configuration problem in the app rather than something you did. Please report it.",
    });
  }

  if (error instanceof SigningKeyLeakError) {
    // Reaching here means a guard fired correctly. Say so plainly rather than dressing it up.
    return make({
      title: "Blocked by a local safety check",
      detail: "Something in this app tried to serialize the signing key. The attempt was refused.",
      remedy: "Nothing left the browser. Please report this — it is a bug in the app, not in your input.",
    });
  }

  if (error instanceof DOMException && error.name === "AbortError") return failureFromCode("CANCELLED");

  return make({
    title: "Something went wrong in this browser",
    detail: describe(error),
    remedy: "Retry the step. If it happens again, reload the page and import your backup to continue.",
    retryable: true,
  });
}

/**
 * Describe an unknown throw without trusting it.
 *
 * Capped and control-stripped by `safeExcerpt`, and never rendered as HTML by any caller.
 */
function describe(error: unknown): string {
  const raw = error instanceof Error && error.message.length > 0 ? error.message : "";
  const excerpt = safeExcerpt(raw, 180);
  return excerpt.length === 0 ? "The step stopped before it finished, with no further detail." : excerpt;
}
