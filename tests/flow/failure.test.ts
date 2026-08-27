/**
 * Failure presentation.
 *
 * One property here matters more than all the others, and it is easy to break by trying to be helpful:
 * **a wrong passphrase and an altered file must be indistinguishable.** Authenticated decryption cannot
 * tell them apart, and reporting them separately would hand anyone guessing a passphrase a free oracle —
 * "wrong passphrase" means keep guessing, "altered file" means stop. So the test below drives three
 * genuinely different broken inputs through real decryption and asserts the rendered failures are equal,
 * field for field.
 *
 * The rest is translation, and the rule is that translation never widens. A protocol failure keeps its own
 * title, detail, remedy, severity and flags verbatim; an unknown throw is capped and control-stripped
 * before it reaches a screen; and where the underlying error does not say whether a step can continue, the
 * answer is that it cannot, because claiming recoverability falsely is the worse mistake.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AeadError } from "../../src/crypto/aead.ts";
import { CryptoUnsupportedError } from "../../src/crypto/ed25519.ts";
import { KdfError } from "../../src/crypto/kdf.ts";
import { ContributionInputError, ProofFormatError } from "../../src/contribution/proof.ts";
import { ContributionDraftError } from "../../src/contribution/record.ts";
import { exportBackupFile, WeakPassphraseError } from "../../src/flow/backup.ts";
import { failureFromCode, toFlowFailure, type FlowFailure } from "../../src/flow/failure.ts";
import {
  BackupFormatError,
  BackupIdentityMismatchError,
  restoreBackup,
  type BackupEnvelope,
} from "../../src/identity/backup.ts";
import { SigningKeyLeakError } from "../../src/identity/keystore.ts";
import {
  BackupNotVerifiedError,
  createIdentitySession,
  SeedUnavailableError,
} from "../../src/identity/session.ts";
import { presentationFor, TechnocoreError } from "../../src/technocore/errors.ts";
import { InvalidRoomError } from "../../src/technocore/profile.ts";
import { MissingSequenceError } from "../../src/technocore/templates.ts";
import { RFC_VECTOR_2 } from "../vectors.ts";

const PASSPHRASE = "correct horse battery staple";

describe("the wrong passphrase and an altered file are one answer", () => {
  it("renders identically for a wrong passphrase, altered ciphertext, and a swapped DID", async () => {
    const session = await createIdentitySession();
    const { envelope } = await exportBackupFile(session, PASSPHRASE);

    const failures: FlowFailure[] = [];
    for (const [label, attempt] of [
      ["wrong passphrase", () => restoreBackup(envelope, `${PASSPHRASE} not really`)],
      ["altered ciphertext", () => restoreBackup(withFlippedCiphertext(envelope), PASSPHRASE)],
      // The DID is bound in as additional authenticated data, so swapping it breaks decryption too.
      ["swapped DID", () => restoreBackup({ ...envelope, did: RFC_VECTOR_2.did }, PASSPHRASE)],
    ] as const) {
      let failure: FlowFailure | null = null;
      try {
        await attempt();
      } catch (error) {
        assert.ok(error instanceof AeadError, `${label} should surface as an AeadError`);
        failure = toFlowFailure(error);
      }
      assert.ok(failure, `${label} should have failed`);
      failures.push(failure);
    }

    assert.deepEqual(failures[0], failures[1]);
    assert.deepEqual(failures[1], failures[2]);
  });

  it("says why the two cannot be told apart, rather than leaving it looking like a bug", () => {
    const failure = toFlowFailure(new AeadError("backup is not readable"));

    assert.equal(failure.retryable, true);
    assert.equal(failure.detail.includes("cannot tell a wrong"), true, failure.detail);
    // The remedy must not imply the app knows which of the two happened.
    assert.equal(/wrong passphrase\b(?!.*altered)/i.test(failure.remedy), false, failure.remedy);
  });
});

describe("protocol failures pass through unwidened", () => {
  it("copies the taxonomy's own wording and flags, and keeps the code", () => {
    const error = new TechnocoreError("RATE_LIMITED", { step: "post to lobby", status: 429 });
    const failure = toFlowFailure(error);
    const presentation = presentationFor("RATE_LIMITED");

    assert.equal(failure.title, presentation.title);
    assert.equal(failure.detail, presentation.detail);
    assert.equal(failure.remedy, presentation.remedy);
    assert.equal(failure.severity, presentation.severity);
    assert.equal(failure.blocking, presentation.blocking);
    assert.equal(failure.retryable, presentation.retryable);
    assert.equal(failure.code, "RATE_LIMITED");
    assert.equal(failure.status, 429);
  });

  it("omits status entirely when there was no response, rather than reporting a zero", () => {
    const failure = toFlowFailure(new TechnocoreError("NETWORK_UNREACHABLE", { step: "read lobby" }));

    assert.equal(Object.hasOwn(failure, "status"), false);
    assert.equal(failure.code, "NETWORK_UNREACHABLE");
  });

  it("builds the same failure from a bare code as from a thrown error", () => {
    const fromError = toFlowFailure(new TechnocoreError("REGISTRY_UNCONFIRMED", { step: "directory" }));
    assert.deepEqual(failureFromCode("REGISTRY_UNCONFIRMED"), fromError);
  });

  it("reports an unconfirmed directory as non-blocking, because the check-in still stands", () => {
    assert.equal(failureFromCode("REGISTRY_UNCONFIRMED").blocking, false);
  });

  it("reports a cancelled request as cancelled rather than as a browser fault", () => {
    const failure = toFlowFailure(new DOMException("aborted", "AbortError"));
    assert.equal(failure.code, "CANCELLED");
  });

  it("reports an unsupported browser from the crypto layer's own error", () => {
    assert.equal(toFlowFailure(new CryptoUnsupportedError()).code, "BROWSER_UNSUPPORTED");
  });
});

describe("field-attributed failures point at the control to focus", () => {
  it("attributes a rejected link and a rejected topic to their own fields", () => {
    assert.equal(toFlowFailure(new ContributionDraftError("link", "no")).field, "link");
    assert.equal(toFlowFailure(new ContributionDraftError("topic", "no")).field, "topic");
  });

  it("treats a bad commit as skippable and a bad artifact link as not", () => {
    // The detached proof is optional, so a commit that will not parse must not dead-end the flow.
    assert.equal(toFlowFailure(new ContributionInputError("commit", "no")).blocking, false);
    assert.equal(toFlowFailure(new ContributionInputError("artifact_url", "no")).blocking, true);
  });

  it("attributes a file problem to the file, and never asks for a plaintext key", () => {
    const failure = toFlowFailure(new BackupFormatError("This file is not valid JSON."));

    assert.equal(failure.field, "file");
    assert.equal(failure.remedy.includes(".backup.json"), true, failure.remedy);
    assert.equal(failure.remedy.includes("never asks"), true, failure.remedy);
  });

  it("treats a short passphrase as advice, not as a dead end", () => {
    const failure = toFlowFailure(new WeakPassphraseError("Use at least 12 characters."));

    assert.equal(failure.severity, "attention");
    assert.equal(failure.blocking, false);
    assert.equal(failure.retryable, true);
    assert.equal(failure.field, "passphrase");
  });

  it("attributes a key-derivation problem to the passphrase and says nothing was written", () => {
    const failure = toFlowFailure(new KdfError("PBKDF2 is unavailable."));

    assert.equal(failure.field, "passphrase");
    assert.equal(failure.remedy.includes("Nothing was written"), true, failure.remedy);
  });

  it("attributes an unreadable proof file to the file", () => {
    assert.equal(toFlowFailure(new ProofFormatError("not a proof")).field, "file");
  });
});

describe("blocking is never guessed optimistically", () => {
  it("reports an edited backup as blocking, because continuing with it is unsafe", () => {
    const failure = toFlowFailure(new BackupIdentityMismatchError());

    assert.equal(failure.blocking, true);
    assert.equal(failure.remedy.includes("Do not continue"), true, failure.remedy);
  });

  it("reports a missing seed as blocking, with the import path as the way out", () => {
    const failure = toFlowFailure(new SeedUnavailableError());

    assert.equal(failure.blocking, true);
    assert.equal(failure.remedy.includes("backup file"), true, failure.remedy);
  });

  it("reports an unverified backup as non-blocking advice, since nothing has been lost yet", () => {
    const failure = toFlowFailure(new BackupNotVerifiedError());

    assert.equal(failure.blocking, false);
    assert.equal(failure.severity, "attention");
  });

  it("reports a missing sequence as non-blocking, because the record may still be posted", () => {
    const failure = toFlowFailure(new MissingSequenceError());

    assert.equal(failure.blocking, false);
    assert.equal(failure.severity, "attention");
  });

  it("reports a misconfigured room as this app's problem, not the user's", () => {
    const failure = toFlowFailure(new InvalidRoomError('"LOBBY" is not a valid Technocore room name'));

    assert.equal(failure.remedy.includes("rather than something you did"), true, failure.remedy);
  });

  it("reports a fired key-leak guard as a refusal, and says nothing left the browser", () => {
    const failure = toFlowFailure(new SigningKeyLeakError());

    assert.equal(failure.title, "Blocked by a local safety check");
    assert.equal(failure.detail.includes("refused"), true, failure.detail);
    assert.equal(failure.remedy.includes("Nothing left the browser"), true, failure.remedy);
  });
});

describe("unknown throws are rendered without being trusted", () => {
  it("caps the message and strips control characters before it reaches a screen", () => {
    const escape = String.fromCharCode(0x1b);
    const message = `${escape}[31mfailed${escape}[0m `.repeat(60);
    const failure = toFlowFailure(new Error(message));

    assert.equal(failure.detail.length <= 180, true, String(failure.detail.length));
    assert.equal(failure.detail.includes(escape), false);
    assert.equal(failure.retryable, true);
  });

  it("substitutes a sentence when there is no message at all", () => {
    for (const thrown of [new Error(""), "a string", null, undefined, 42, {}]) {
      const failure = toFlowFailure(thrown);
      assert.equal(
        failure.detail,
        "The step stopped before it finished, with no further detail.",
        JSON.stringify(thrown),
      );
    }
  });

  it("always produces something renderable, whatever it was handed", () => {
    const errors: readonly unknown[] = [
      new TechnocoreError("UPSTREAM_ERROR", { step: "post" }),
      new AeadError("nope"),
      new BackupIdentityMismatchError(),
      new BackupFormatError("nope"),
      new WeakPassphraseError("nope"),
      new KdfError("nope"),
      new SeedUnavailableError(),
      new BackupNotVerifiedError(),
      new ContributionDraftError("link", "nope"),
      new ContributionInputError("commit", "nope"),
      new ProofFormatError("nope"),
      new MissingSequenceError(),
      new InvalidRoomError("nope"),
      new SigningKeyLeakError(),
      new CryptoUnsupportedError(),
      new DOMException("aborted", "AbortError"),
      "just a string",
    ];

    for (const error of errors) {
      const failure = toFlowFailure(error);
      for (const [field, value] of Object.entries({
        title: failure.title,
        detail: failure.detail,
        remedy: failure.remedy,
      })) {
        assert.equal(value.length > 0, true, `${String(error)}: empty ${field}`);
        assert.equal(value.trim(), value, `${String(error)}: untrimmed ${field}`);
      }
      assert.equal(["fault", "attention"].includes(failure.severity), true, String(error));
    }
  });
});

/** Flip one character of the ciphertext, keeping it valid base64 of the same length. */
function withFlippedCiphertext(envelope: BackupEnvelope): BackupEnvelope {
  const original = envelope.cipher.ciphertext;
  const first = original.slice(0, 1);
  return {
    ...envelope,
    cipher: { ...envelope.cipher, ciphertext: `${first === "A" ? "B" : "A"}${original.slice(1)}` },
  };
}
