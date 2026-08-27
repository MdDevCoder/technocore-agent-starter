/**
 * Step 1 orchestration: create an identity.
 *
 * The behaviour worth pinning is what happens on a browser that cannot do Ed25519. The wrong answers are
 * both tempting: fall back to a different algorithm (silently producing an identity that is not a
 * Technocore identity), or draw the random bytes first and report the problem afterwards. This module does
 * neither, and the tests below say so by injecting the probe rather than waiting for an old browser.
 *
 * There is also no network call here, deliberately: the CLI publishes to the DID directory immediately
 * after key generation, and a full directory would then make a perfectly valid identity look like a
 * failure.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIdentity } from "../../src/flow/identity.ts";
import { isValidDid } from "../../src/identity/did.ts";
import { createIdentitySession } from "../../src/identity/session.ts";
import { TechnocoreError } from "../../src/technocore/errors.ts";

describe("createIdentity", () => {
  it("returns a session whose DID is valid and whose handle signs", async () => {
    const session = await createIdentity();

    assert.equal(isValidDid(session.identity.did), true);
    assert.equal(session.origin, "generated");
    assert.equal(session.canExportBackup, true);
    assert.equal(session.hardened, false);
    assert.equal(session.backupState, "none");

    const signature = await session.handle.signToBase64Url(new Uint8Array([1, 2, 3]));
    assert.equal(signature.length, 86);
  });

  it("refuses on a browser without Ed25519 instead of substituting another algorithm", async () => {
    let created = false;
    await assert.rejects(
      () =>
        createIdentity({
          probe: async () => false,
          create: async () => {
            created = true;
            return createIdentitySession();
          },
        }),
      (error: unknown) => error instanceof TechnocoreError && error.code === "BROWSER_UNSUPPORTED",
    );
    assert.equal(created, false, "no key material should be drawn once the probe has failed");
  });

  it("probes before creating, so nothing is generated that will be thrown away", async () => {
    const order: string[] = [];
    await createIdentity({
      probe: async () => {
        order.push("probe");
        return true;
      },
      create: async () => {
        order.push("create");
        return createIdentitySession();
      },
    });
    assert.deepEqual(order, ["probe", "create"]);
  });

  it("lets a creation failure through rather than reporting a half-built identity", async () => {
    await assert.rejects(
      () =>
        createIdentity({
          probe: async () => true,
          create: async () => {
            throw new Error("entropy source unavailable");
          },
        }),
      /entropy source unavailable/,
    );
  });

  it("produces a distinct identity on each call", async () => {
    const [first, second] = await Promise.all([createIdentity(), createIdentity()]);
    assert.notEqual(first.identity.did, second.identity.did);
  });
});
