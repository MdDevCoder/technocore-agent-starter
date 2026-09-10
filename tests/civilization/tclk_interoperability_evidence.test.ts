/**
 * TCLK Interoperability Evidence Package & Independent Reproducer Test Suite.
 *
 * Verifies that the evidence package generator and standalone verification pipeline
 * accurately and deterministically audit wire payloads, reconstruct exact signing inputs,
 * separate crypto from semantics, and maintain strict zero-mutation / zero-leakage invariants.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, importSigningKey, sign } from "../../src/crypto/ed25519.ts";
import { publicKeyToDid } from "../../src/identity/did.ts";
import { toBase64Url, utf8 } from "../../src/crypto/bytes.ts";
import { sha256Hex } from "../../src/crypto/hash.ts";
import { offerId, contractId, OFFER_ROOM, type OfferFrame, type AcceptCore } from "@flop-labs/tclk";
import type { RoomMessageRecord } from "../../src/technocore/room.ts";
import type { TechnocoreTransport, TechnocoreRequest, TechnocoreResponse } from "../../src/technocore/transport.ts";
import {
  buildEvidenceSample,
  buildEvidencePackage,
  formatEvidenceMarkdown,
  TclkInteroperabilityEvidenceExporter,
} from "../../src/civilization/deals/tclk/interoperability-evidence.ts";

describe("TCLK Interoperability Evidence Package", () => {
  // 1. Deterministic fixture export
  it("generates deterministic fixture export from observed room records", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);
    const nonce = "1725983419000000000";
    const text = '{"type":"offer","id":"0x1234","from":"' + did + '"}';
    const canonicalBytes = utf8(`tclk-offers|${nonce}|${text}`);
    const sigBytes = await sign(signingKey, canonicalBytes);
    const signature = toBase64Url(sigBytes);

    const records: RoomMessageRecord[] = [
      {
        sequence: 100,
        nonce,
        did,
        signature,
        text,
      },
    ];

    const pkg = await buildEvidencePackage(records, { room: "tclk-offers" });
    assert.equal(pkg.packageVersion, "1.0.0");
    assert.equal(pkg.sampleSource.sampleCount, 1);
    assert.equal(pkg.classificationCounts.canonicalValid, 1);
    assert.equal(pkg.samples[0]?.protocolClassification, "CANONICAL_VALID");
    assert.equal(pkg.samples[0]?.signingInput.byteLength, canonicalBytes.length);
  });

  // 2. DID decoding
  it("decodes valid Ed25519 DIDs and classifies invalid DIDs as WRONG_DID", async () => {
    const validKey = await generateKeyPair();
    const validDid = publicKeyToDid(validKey.publicKey);

    const validRecord: RoomMessageRecord = {
      sequence: 101,
      nonce: "1725983419000000000",
      did: validDid,
      signature: "dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVzLXByb3ZpZGVkLWJ5LWV4dGVybmFsLXRlc3QtYWdlbnQtMTIzNA",
      text: '{"type":"offer"}',
    };

    const invalidRecord: RoomMessageRecord = {
      sequence: 102,
      nonce: "1725983419000000000",
      did: "did:key:invalid1234567890",
      signature: "dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVzLXByb3ZpZGVkLWJ5LWV4dGVybmFsLXRlc3QtYWdlbnQtMTIzNA",
      text: '{"type":"offer"}',
    };

    const validSample = await buildEvidenceSample(validRecord);
    assert.equal(validSample.signingInput.decodedPublicKeyLength, 32);
    assert.notEqual(validSample.protocolClassification, "WRONG_DID");

    const invalidSample = await buildEvidenceSample(invalidRecord);
    assert.equal(invalidSample.protocolClassification, "WRONG_DID");
  });

  // 3. Signature decoding
  it("decodes 86-character Base64URL signatures and rejects malformed lengths as MALFORMED", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);

    const malformedRecord: RoomMessageRecord = {
      sequence: 103,
      nonce: "1725983419000000000",
      did,
      signature: "short-signature",
      text: '{"type":"offer"}',
    };

    const sample = await buildEvidenceSample(malformedRecord);
    assert.equal(sample.protocolClassification, "MALFORMED");
  });

  // 4. Exact signing input reconstruction
  it("reconstructs exact canonical signing input and computes exact SHA-256 digest", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);
    const nonce = "1725983419000000000";
    const text = 'tclk1 {"type":"accept","ref":"0xabc"}';

    const record: RoomMessageRecord = {
      sequence: 104,
      nonce,
      did,
      signature: "dGVzdC1zaWduYXR1cmUtZm9yLXRjbGstb2ZmZXJzLWJ5dGVzLXByb3ZpZGVkLWJ5LWV4dGVybmFsLXRlc3QtYWdlbnQtMTIzNA",
      text,
    };

    const expectedString = `tclk-offers|${nonce}|${text}`;
    const expectedBytes = utf8(expectedString);
    const expectedSha256 = await sha256Hex(expectedBytes);

    const sample = await buildEvidenceSample(record);
    assert.equal(sample.signingInput.utf8String, expectedString);
    assert.equal(sample.signingInput.byteLength, expectedBytes.length);
    assert.equal(sample.signingInput.sha256Hex, expectedSha256);
  });

  // 5. Canonical verification failure reproduction
  it("reproduces canonical verification failure when simulated test signature is provided", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);
    const nonce = "1725983419000000000";
    const text = '{"type":"offer","id":"0x9d6d"}';

    // 64 bytes of random data encoded to base64url (valid shape, invalid signature)
    const randomBytes = new Uint8Array(64).fill(42);
    const fakeSignature = toBase64Url(randomBytes);

    const record: RoomMessageRecord = {
      sequence: 105,
      nonce,
      did,
      signature: fakeSignature,
      text,
    };

    const sample = await buildEvidenceSample(record);
    assert.equal(sample.protocolClassification, "SIGNATURE_INVALID");
    assert.equal(sample.alternativeRepresentations[0]?.verified, false);
  });

  // 6. Alternative representation testing
  it("detects and classifies alternative valid representations (e.g. RAW_TEXT_ONLY)", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);
    const text = '{"type":"offer","id":"0x9999"}';

    // Sign RAW_TEXT_ONLY
    const sigBytes = await sign(signingKey, utf8(text));
    const signature = toBase64Url(sigBytes);

    const record: RoomMessageRecord = {
      sequence: 106,
      nonce: "1725983419000000000",
      did,
      signature,
      text,
    };

    const sample = await buildEvidenceSample(record);
    assert.equal(sample.protocolClassification, "ALTERNATIVE_VALID");
    const rawTextCand = sample.alternativeRepresentations.find((c) => c.name === "RAW_TEXT_ONLY");
    assert.equal(rawTextCand?.verified, true);
  });

  // 7. Classification determinism
  it("ensures deterministic classification across multiple runs", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);
    const record: RoomMessageRecord = {
      sequence: 107,
      nonce: "1725983419000000000",
      did,
      signature: toBase64Url(new Uint8Array(64).fill(7)),
      text: '{"type":"lock","contract":"0xcontract"}',
    };

    const run1 = await buildEvidencePackage([record]);
    const run2 = await buildEvidencePackage([record]);

    assert.equal(run1.classificationCounts.signatureInvalid, run2.classificationCounts.signatureInvalid);
    assert.equal(run1.samples[0]?.protocolClassification, run2.samples[0]?.protocolClassification);
    assert.equal(run1.samples[0]?.signingInput.sha256Hex, run2.samples[0]?.signingInput.sha256Hex);
  });

  // 8. Offer-ID evidence
  it("evaluates canonical vs custom offer ID derivations", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);
    const nonce = "1725983419000000000";

    const offerCore = {
      from: did,
      role: "payer" as const,
      amount: "100",
      asset: "FLOP",
      lock: "hash" as const,
      statement: "Benchmark analysis",
      rails: ["paper"],
      expiresMs: 1726069819000,
      claimByMs: 1726069819000,
      refundAfterMs: 1726073419000,
      nonce,
    };
    const canonicalId = offerId(offerCore as unknown as OfferFrame);

    // 1. Offer with canonical ID
    const canonicalOfferRecord: RoomMessageRecord = {
      sequence: 108,
      nonce,
      did,
      signature: toBase64Url(new Uint8Array(64).fill(1)),
      text: JSON.stringify({ type: "offer", id: canonicalId, ...offerCore }),
    };

    const sample1 = await buildEvidenceSample(canonicalOfferRecord);
    assert.ok(sample1.offerIdEvidence);
    assert.equal(sample1.offerIdEvidence.isMatch, true);
    assert.equal(sample1.offerIdEvidence.observedOfferId, canonicalId);

    // 2. Offer with custom ID
    const customOfferRecord: RoomMessageRecord = {
      sequence: 109,
      nonce,
      did,
      signature: toBase64Url(new Uint8Array(64).fill(2)),
      text: JSON.stringify({ type: "offer", id: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", ...offerCore }),
    };

    const sample2 = await buildEvidenceSample(customOfferRecord);
    assert.ok(sample2.offerIdEvidence);
    assert.equal(sample2.offerIdEvidence.isMatch, false);
    assert.ok(sample2.offerIdEvidence.mismatchReason?.includes("differs from normative SHA-256"));
  });

  // 9. Legacy accept evidence
  it("evaluates legacy accepts missing contract and reconstructs derived contractId", async () => {
    const payerKey = await generateKeyPair();
    const payeeKey = await generateKeyPair();
    const payerDid = publicKeyToDid(payerKey.publicKey);
    const payeeDid = publicKeyToDid(payeeKey.publicKey);
    const nonce = "1725983419000000000";

    const offerFields = {
      from: payerDid,
      role: "payer" as const,
      amount: "50",
      asset: "FLOP",
      lock: "hash" as const,
      statement: "Data verification",
      rails: ["paper"],
      expiresMs: 1726069819000,
      claimByMs: 1726069819000,
      refundAfterMs: 1726073419000,
      nonce,
    };
    const offId = offerId(offerFields as unknown as OfferFrame);
    const offerFrame: OfferFrame = { type: "offer", id: offId, ...offerFields };

    const acceptCore: AcceptCore = {
      from: payeeDid,
      ref: offId,
      statement: "I accept terms",
      nonce: "1725983420000000000",
    };
    const expectedContractId = contractId(offerFrame, acceptCore);

    // Legacy accept omitting "contract"
    const acceptRecord: RoomMessageRecord = {
      sequence: 110,
      nonce: acceptCore.nonce,
      did: payeeDid,
      signature: toBase64Url(new Uint8Array(64).fill(3)),
      text: JSON.stringify({ type: "accept", ...acceptCore }),
    };

    const knownOffers = new Map<string, OfferFrame>([[offId, offerFrame]]);
    const sample = await buildEvidenceSample(acceptRecord, { knownOffers });

    assert.ok(sample.legacyAcceptEvidence);
    assert.equal(sample.legacyAcceptEvidence.semanticCompleteness, "MISSING_CONTRACT");
    assert.equal(sample.legacyAcceptEvidence.derivedContractId, expectedContractId);
  });

  // 10. Zero network mutation
  it("asserts strictly zero network mutations (GET-only transport verification)", async () => {
    const mutations: string[] = [];

    const mockTransport: TechnocoreTransport = {
      kind: "direct",
      describe: "Mock GET-only Transport",
      async send(req: TechnocoreRequest): Promise<TechnocoreResponse> {
        if (req.method !== "GET") {
          mutations.push(`${req.method} ${req.path}`);
          throw new Error(`${req.method} forbidden in read-only forensics`);
        }
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({
            messages: [
              {
                sequence: 111,
                nonce: "1725983419000000000",
                did: "did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x",
                signature: toBase64Url(new Uint8Array(64).fill(1)),
                text: '{"type":"offer"}',
              },
            ],
          }),
          json: {
            messages: [
              {
                sequence: 111,
                nonce: "1725983419000000000",
                did: "did:key:z6MknbCs9j1g652wM61p3Q9RkG82M5u1qj6mK8p3uW4y2v1x",
                signature: toBase64Url(new Uint8Array(64).fill(1)),
                text: '{"type":"offer"}',
              },
            ],
          },
          durationMs: 5,
        };
      },
    };

    const exporter = new TclkInteroperabilityEvidenceExporter(mockTransport);
    const result = await exporter.exportLiveEvidence({ room: "tclk-offers", limit: 10 });

    assert.equal(mutations.length, 0);
    assert.equal(result.samples.length, 1);
  });

  // 11. Zero secret leakage
  it("guarantees zero secret keys, seeds, passphrases, or unrevealed secrets in output", async () => {
    const keyPair = await generateKeyPair();
    const did = publicKeyToDid(keyPair.publicKey);

    const record: RoomMessageRecord = {
      sequence: 112,
      nonce: "1725983419000000000",
      did,
      signature: toBase64Url(new Uint8Array(64).fill(5)),
      text: '{"type":"offer","id":"0x1234"}',
    };

    const pkg = await buildEvidencePackage([record]);
    const jsonString = JSON.stringify(pkg);
    const mdString = formatEvidenceMarkdown(pkg);

    const forbiddenTerms = ["privateKey", "secretVault", "unrevealedSecret", "private_key", "signingSeed", "passphrase"];
    for (const term of forbiddenTerms) {
      assert.equal(jsonString.includes(term), false, `Forbidden secret term '${term}' leaked in JSON package!`);
      assert.equal(mdString.includes(term), false, `Forbidden secret term '${term}' leaked in Markdown export!`);
    }
  });

  // 12. Standalone verifier parity
  it("maintains verification parity between evidence package and standalone verifier logic", async () => {
    const keyPair = await generateKeyPair();
    const signingKey = await importSigningKey(keyPair.seed, keyPair.publicKey);
    const did = publicKeyToDid(keyPair.publicKey);
    const nonce = "1725983419000000000";
    const text = '{"type":"offer","amount":"250"}';

    // Real signed canonical message
    const canonicalBytes = utf8(`tclk-offers|${nonce}|${text}`);
    const sigBytes = await sign(signingKey, canonicalBytes);
    const signature = toBase64Url(sigBytes);

    const record: RoomMessageRecord = {
      sequence: 113,
      nonce,
      did,
      signature,
      text,
    };

    const sample = await buildEvidenceSample(record);
    assert.equal(sample.protocolClassification, "CANONICAL_VALID");
    assert.equal(sample.signingInput.decodedSignatureLength, 64);
    assert.equal(sample.signingInput.decodedPublicKeyLength, 32);
    assert.equal(sample.alternativeRepresentations[0]?.verified, true);
  });
});
