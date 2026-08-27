/**
 * The in-memory identity session, and the one-way door at the centre of the security model.
 *
 * Lifecycle:
 *
 * ```
 * createIdentitySession()
 *   ├─ 32 random bytes ─────────────► seed, held in a #private field of this object only
 *   ├─ non-extractable SigningHandle  (can sign forever; cannot ever surrender the key bytes)
 *   │
 *   ├─ exportBackup(passphrase) ────► encrypted envelope, offered as a download
 *   ├─ verifyBackupRestores(file)  ─► proves the saved file really decrypts to this seed
 *   └─ discardSeed() ──────────────► seed overwritten and dropped
 * ```
 *
 * After `discardSeed()` the tab holds only an opaque signing handle. Script running in the page —
 * including injected script — can still *ask for a signature*, but there is no longer anything in
 * memory that can be read out and used elsewhere. That converts the worst case from permanent
 * identity theft into session-scoped abuse. It does not make XSS harmless, and
 * `docs/ARCHITECTURE.md` §7 states that plainly rather than implying otherwise.
 *
 * The seed is never in React state, never in a store, never in a URL, and never serialized.
 */

import { timingSafeEqual, wipe } from "../crypto/bytes.ts";
import { generateKeyPair } from "../crypto/ed25519.ts";
import type { PublicIdentity } from "../types/identity.ts";
import { isoSecondsUtc } from "../util/time.ts";
import { createBackup, restoreBackup, type BackupEnvelope } from "./backup.ts";
import { didFingerprint, publicKeyToDid } from "./did.ts";
import { createSigningHandle, SigningHandle, SigningKeyLeakError } from "./keystore.ts";

/**
 * `none` → nothing exported yet.
 * `exported` → an encrypted file was produced, but we have not proved it is readable.
 * `verified` → the saved file was decrypted back to this exact seed. Only now is discarding safe.
 */
export type BackupState = "none" | "exported" | "verified";

export class SeedUnavailableError extends Error {
  override readonly name = "SeedUnavailableError";
  constructor() {
    super(
      "The private key is no longer in memory for this session. Import the encrypted backup file to " +
        "regain the ability to export a new one.",
    );
  }
}

export class BackupNotVerifiedError extends Error {
  override readonly name = "BackupNotVerifiedError";
  constructor() {
    super("Restore the saved backup file once before discarding the key from memory.");
  }
}

export class IdentitySession {
  readonly identity: PublicIdentity;
  readonly handle: SigningHandle;
  readonly origin: "generated" | "imported";

  #seed: Uint8Array | null;
  #backupState: BackupState;

  constructor(
    identity: PublicIdentity,
    handle: SigningHandle,
    seed: Uint8Array | null,
    origin: "generated" | "imported",
    backupState: BackupState,
  ) {
    this.identity = identity;
    this.handle = handle;
    this.origin = origin;
    this.#seed = seed;
    this.#backupState = backupState;
  }

  get backupState(): BackupState {
    return this.#backupState;
  }

  /** True while the seed is still in memory, i.e. while a new backup can still be produced. */
  get canExportBackup(): boolean {
    return this.#seed !== null;
  }

  /** True once the key exists only as an opaque, non-extractable handle. */
  get hardened(): boolean {
    return this.#seed === null;
  }

  async exportBackup(passphrase: string): Promise<BackupEnvelope> {
    const seed = this.#requireSeed();
    const envelope = await createBackup(seed, this.identity.did, passphrase);
    if (this.#backupState === "none") this.#backupState = "exported";
    return envelope;
  }

  /**
   * Decrypt the file the user actually saved and confirm it yields this exact seed.
   *
   * This is the difference between "we told the user to save a file" and "the file works". Losing the
   * key means losing the identity permanently, so the gate is placed on demonstrated recoverability
   * rather than on a checkbox.
   */
  async verifyBackupRestores(envelope: BackupEnvelope, passphrase: string): Promise<boolean> {
    const seed = this.#requireSeed();
    const restored = await restoreBackup(envelope, passphrase);
    try {
      const matches = restored.did === this.identity.did && timingSafeEqual(restored.seed, seed);
      if (matches) this.#backupState = "verified";
      return matches;
    } finally {
      wipe(restored.seed);
    }
  }

  /**
   * Overwrite and drop the seed. Irreversible for this session.
   *
   * `force` exists for the import path, where the user already holds a working backup file and never
   * needs to re-verify it here.
   */
  discardSeed(options: { readonly force?: boolean } = {}): void {
    if (this.#seed === null) return;
    if (!options.force && this.#backupState !== "verified") throw new BackupNotVerifiedError();
    wipe(this.#seed);
    this.#seed = null;
  }

  #requireSeed(): Uint8Array {
    if (this.#seed === null) throw new SeedUnavailableError();
    return this.#seed;
  }

  toJSON(): never {
    throw new SigningKeyLeakError();
  }

  toString(): string {
    return `[IdentitySession ${this.identity.did}]`;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

async function toPublicIdentity(publicKey: Uint8Array, createdAt: string): Promise<PublicIdentity> {
  const did = publicKeyToDid(publicKey);
  return { did, publicKey, fingerprint: await didFingerprint(did), createdAt };
}

/** Generate a brand-new identity. The seed exists only inside the returned session. */
export async function createIdentitySession(): Promise<IdentitySession> {
  const { seed, publicKey } = await generateKeyPair();
  try {
    const identity = await toPublicIdentity(publicKey, isoSecondsUtc());
    const handle = await createSigningHandle(seed, publicKey);
    return new IdentitySession(identity, handle, seed, "generated", "none");
  } catch (error) {
    wipe(seed);
    throw error;
  }
}

/**
 * Restore from an encrypted backup.
 *
 * `retainExportCapability` defaults to **false**: the user demonstrably already has a working backup
 * file, so there is no reason to keep the seed in memory. Set it only when the user explicitly asks to
 * re-encrypt under a new passphrase, and say so in the UI at that point.
 */
export async function importIdentitySession(
  envelope: BackupEnvelope,
  passphrase: string,
  options: { readonly retainExportCapability?: boolean } = {},
): Promise<IdentitySession> {
  const restored = await restoreBackup(envelope, passphrase);
  let transferred = false;
  try {
    const createdAt = envelope.created_at || isoSecondsUtc();
    const identity = await toPublicIdentity(restored.publicKey, createdAt);
    const handle = await createSigningHandle(restored.seed, restored.publicKey);

    if (options.retainExportCapability) {
      // Ownership of the buffer transfers to the session, which will wipe it on discardSeed().
      transferred = true;
      return new IdentitySession(identity, handle, restored.seed, "imported", "verified");
    }
    return new IdentitySession(identity, handle, null, "imported", "verified");
  } finally {
    if (!transferred) wipe(restored.seed);
  }
}
