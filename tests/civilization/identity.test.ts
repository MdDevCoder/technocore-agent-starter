import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentIdentity,
  MultiAgentKeystore,
} from "../../src/civilization/index.ts";
import { isValidDid } from "../../src/identity/did.ts";

describe("Multi-Agent Identity & Keystore", () => {
  it("creates an independent agent identity with valid Ed25519 DID", async () => {
    const identity = await createAgentIdentity({
      displayName: "Architect-01",
      role: "System Architect",
    });

    assert.ok(identity.agentId.startsWith("agent_"));
    assert.ok(isValidDid(identity.did));
    assert.equal(identity.displayName, "Architect-01");
    assert.equal(identity.role, "System Architect");

    // Test non-extractability guarantees
    assert.throws(() => {
      JSON.stringify(identity.signingHandle);
    }, /SigningKeyLeakError/);

    assert.equal(identity.signingHandle.toString(), "[SigningHandle — private key withheld]");
  });

  it("manages multiple agents in MultiAgentKeystore without cross-talk", async () => {
    const keystore = new MultiAgentKeystore();

    const agentA = await createAgentIdentity({ displayName: "Agent Alpha", role: "Coder" });
    const agentB = await createAgentIdentity({ displayName: "Agent Beta", role: "Auditor" });

    keystore.register(agentA);
    keystore.register(agentB);

    assert.equal(keystore.size, 2);
    assert.equal(keystore.get(agentA.did)?.displayName, "Agent Alpha");
    assert.equal(keystore.get(agentB.did)?.displayName, "Agent Beta");
    assert.equal(keystore.getByAgentId(agentA.agentId)?.did, agentA.did);

    // Sign different messages and verify signatures are distinct
    const msg = new TextEncoder().encode("mission-handshake");
    const sigA = await agentA.signingHandle.signToBase64Url(msg);
    const sigB = await agentB.signingHandle.signToBase64Url(msg);

    assert.notEqual(sigA, sigB);
    assert.equal(sigA.length, 86);
    assert.equal(sigB.length, 86);
  });
});
