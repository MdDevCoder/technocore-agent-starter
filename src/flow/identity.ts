/**
 * Step 1 orchestration: create an identity.
 *
 * Deliberately thin, and deliberately free of network calls. The CLI's `run_all` publishes to the DID
 * directory immediately after generating a key, but there is no cryptographic reason for those to be
 * the same step, and joining them costs something real: a directory that is full would make identity
 * creation *look* like it failed when the identity is perfectly valid. So directory publication moves
 * to the introduce step, where it sits beside the other network operation and can fail without
 * implicating anything else.
 *
 * The capability probe runs first so an unsupported browser is reported before any random bytes are
 * drawn. `isEd25519Supported` is memoized upstream and actually generates a key rather than sniffing a
 * user agent.
 */

import { isEd25519Supported } from "../crypto/ed25519.ts";
import { createIdentitySession, type IdentitySession } from "../identity/session.ts";
import { TechnocoreError } from "../technocore/errors.ts";

export interface CreateIdentityOptions {
  /** Injectable for tests. Defaults to the real WebCrypto probe. */
  readonly probe?: () => Promise<boolean>;
  readonly create?: () => Promise<IdentitySession>;
}

/**
 * Generate a new identity in this browser.
 *
 * Throws `TechnocoreError("BROWSER_UNSUPPORTED")` when Ed25519 is unavailable — never a substituted
 * weaker algorithm, and never a partially-created session.
 */
export async function createIdentity(options: CreateIdentityOptions = {}): Promise<IdentitySession> {
  const probe = options.probe ?? isEd25519Supported;
  if (!(await probe())) throw new TechnocoreError("BROWSER_UNSUPPORTED", { step: "create identity" });
  return (options.create ?? createIdentitySession)();
}
