/**
 * Tests for Capability Attestation Issuance and Signature Verification.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import { CapabilityAttestationIssuer } from "../../src/civilization/evolution/attestation.ts";
import { verifyCivilizationEvent } from "../../src/civilization/events/verifier.ts";

describe("Capability Attestation Issuer", () => {
  const issuer = new CapabilityAttestationIssuer();

  it("creates valid CapabilityAttestation record and signs event", async () => {
    const verifierIdentity = await createAgentIdentity({ displayName: "Evaluator Agent", role: "Independent Evaluator" });
    const claimantDid = "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw";

    const record = issuer.createAttestationRecord({
      attestationId: "att_001",
      issuerIdentity: verifierIdentity,
      agentDid: claimantDid,
      capabilityName: "database-performance",
      claimedProficiency: 85,
      verifiedProficiency: 88,
      evidenceReferences: ["evt_001", "evt_002", "evt_003"],
      benchmarkProofId: "proof_bm_001",
    });

    assert.equal(record.capabilityName, "database-performance");
    assert.equal(record.verifiedProficiency, 88);
    assert.equal(record.confidence, "high");

    const signedEvent = await issuer.emitSignedAttestationEvent({
      attestationId: "att_001",
      issuerIdentity: verifierIdentity,
      agentDid: claimantDid,
      capabilityName: "database-performance",
      claimedProficiency: 85,
      verifiedProficiency: 88,
      evidenceReferences: ["evt_001", "evt_002", "evt_003"],
      benchmarkProofId: "proof_bm_001",
    });

    assert.equal(signedEvent.eventType, "CAPABILITY_ATTESTED");
    assert.equal(signedEvent.authorDid, verifierIdentity.did);

    const verification = await verifyCivilizationEvent(signedEvent);
    assert.equal(verification.valid, true, "Expected valid Ed25519 signature on attestation event");
  });
});
