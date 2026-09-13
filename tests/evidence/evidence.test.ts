import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fromBase64Url, toBase64Url, utf8 } from "../../src/crypto/bytes.ts";
import { sha256Hex } from "../../src/crypto/hash.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import { draftRoomMessage, signRoomMessage } from "../../src/technocore/envelope.ts";
import { normalizeMessage } from "../../src/technocore/text.ts";
import { RFC_VECTOR_1, RFC_VECTOR_2, tamper } from "../vectors.ts";

import {
  computeEvidenceIntegrityHash,
  extractHashedFields,
} from "../../src/evidence/integrity.ts";
import {
  formatEvidenceJson,
  formatEvidenceMarkdown,
  importAndVerifyEvidence,
} from "../../src/evidence/format.ts";
import {
  validateEvidenceSchema,
  containsSecrets,
  sanitizeString,
} from "../../src/evidence/schema.ts";
import {
  createContributionEvidence,
  verifyEvidenceRecord,
} from "../../src/evidence/verify.ts";
import type { ContributionEvidenceV1 } from "../../src/evidence/types.ts";

const DID_1 = RFC_VECTOR_1.did;
const NONCE = "1789200000000";
const ROOM = "technocore";
const TEXT = "I published a contribution for Technocore by @flop_labs. It helps people understand how to set up an agent on a Linux VPS.";

async function generateValidRecord() {
  const handle = await createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);
  const normalized = normalizeMessage(TEXT);
  const draft = draftRoomMessage(
    ROOM,
    { text: normalized.text, spans: [{ source: "user", text: normalized.text }] },
    NONCE,
  );
  const signed = await signRoomMessage(handle, draft);
  return {
    room: ROOM,
    seq: 120684,
    did: DID_1,
    nonce: NONCE,
    text: normalized.text,
    signature: signed.sig,
    serverTimestamp: 1789200000000,
    contributionUrl: "https://github.com/MdDevCoder/technocore-agent-starter",
    topic: "Technocore Agent Starter Documentation",
    projectName: "technocore-agent-starter",
    gitCommit: "9e4070a2f4a434c4",
    xUrl: "https://x.com/Muhammad_0423",
  };
}

describe("Evidence Vault — Schema & Security Validation", () => {
  it("validates a well-formed contribution evidence record", async () => {
    const raw = await generateValidRecord();
    const { evidence } = await createContributionEvidence({
      ...raw,
      provenance: "SERVER_RETRIEVED",
      sourceMethod: "GET",
    });

    const validated = validateEvidenceSchema(evidence);
    assert.equal(validated.schema, "technocore-contribution-evidence-v1");
    assert.equal(validated.did, DID_1);
    assert.equal(validated.room, "technocore");
    assert.equal(validated.seq, 120684);
    assert.equal(validated.provenance, "SERVER_RETRIEVED");
    assert.equal(validated.verificationStatus, "VERIFIED");
  });

  it("detects and rejects forbidden secret keywords", () => {
    assert.equal(containsSecrets({ privateKey: "secret" }), true);
    assert.equal(containsSecrets({ seed: "12345" }), true);
    assert.equal(containsSecrets({ password: "pass" }), true);
    assert.equal(containsSecrets({ token: "xyz" }), true);
    assert.equal(containsSecrets({ credential: "abc" }), true);
    assert.equal(containsSecrets({ safeField: "hello" }), false);
  });

  it("rejects records with invalid signatures or bad DIDs", () => {
    // Bad DID
    assert.throws(
      () =>
        validateEvidenceSchema({
          schema: "technocore-contribution-evidence-v1",
          capturedAt: new Date().toISOString(),
          room: "technocore",
          seq: 10,
          did: "invalid-did",
          nonce: "123456",
          text: "hello",
          signature: "A".repeat(86),
          canonicalPayload: "technocore|123456|hello",
          canonicalPayloadSha256: "0".repeat(64),
          sourceEndpoint: "https://technocore.chat",
          sourceMethod: "GET",
          provenance: "SERVER_RETRIEVED",
          verificationStatus: "VERIFIED",
          verificationMethod: "WebCrypto-Ed25519",
          evidenceSha256: "0".repeat(64),
        }),
      /Invalid DID format/,
    );

    // Bad signature length
    assert.throws(
      () =>
        validateEvidenceSchema({
          schema: "technocore-contribution-evidence-v1",
          capturedAt: new Date().toISOString(),
          room: "technocore",
          seq: 10,
          did: DID_1,
          nonce: NONCE,
          text: "hello",
          signature: "too-short",
          canonicalPayload: "technocore|1789200000000|hello",
          canonicalPayloadSha256: "0".repeat(64),
          sourceEndpoint: "https://technocore.chat",
          sourceMethod: "GET",
          provenance: "SERVER_RETRIEVED",
          verificationStatus: "VERIFIED",
          verificationMethod: "WebCrypto-Ed25519",
          evidenceSha256: "0".repeat(64),
        }),
      /Signature must be an 86-character base64url string/,
    );
  });

  it("sanitizes unsafe control characters from strings", () => {
    const dirty = "Hello\x00World\x08Test\tValid\nLine";
    const cleaned = sanitizeString(dirty, 100);
    assert.equal(cleaned, "HelloWorldTest\tValid\nLine");
  });
});

describe("Evidence Vault — Deterministic Integrity Hashing", () => {
  it("produces identical SHA-256 hashes for identical public evidence", async () => {
    const raw = await generateValidRecord();
    const { evidence: ev1 } = await createContributionEvidence({
      ...raw,
      capturedAt: "2026-09-13T10:00:00.000Z",
      provenance: "SERVER_RETRIEVED",
    });

    const { evidence: ev2 } = await createContributionEvidence({
      ...raw,
      capturedAt: "2026-09-13T18:30:00.000Z", // Different local capture time!
      provenance: "SERVER_RETRIEVED",
    });

    const hash1 = await computeEvidenceIntegrityHash(ev1);
    const hash2 = await computeEvidenceIntegrityHash(ev2);

    assert.equal(hash1, hash2, "Integrity hash must be deterministic and invariant to capture timestamp");
    assert.equal(ev1.evidenceSha256, hash1);
  });

  it("produces different hashes when any public field changes", async () => {
    const raw = await generateValidRecord();
    const { evidence: base } = await createContributionEvidence({
      ...raw,
      provenance: "SERVER_RETRIEVED",
    });

    const { evidence: alteredSeq } = await createContributionEvidence({
      ...raw,
      seq: 120685,
      provenance: "SERVER_RETRIEVED",
    });

    const hashBase = await computeEvidenceIntegrityHash(base);
    const hashAltered = await computeEvidenceIntegrityHash(alteredSeq);

    assert.notEqual(hashBase, hashAltered);
  });
});

describe("Evidence Vault — Cryptographic Verification Engine", () => {
  it("verifies an authentic WebCrypto Ed25519 contribution message", async () => {
    const raw = await generateValidRecord();
    const verification = await verifyEvidenceRecord(
      raw.room,
      raw.did,
      raw.nonce,
      raw.text,
      raw.signature,
      "SERVER_RETRIEVED",
    );

    assert.equal(verification.verified, true);
    assert.equal(verification.status, "VERIFIED");
    assert.equal(verification.signatureLength, 86);
    assert.equal(verification.canonicalPayload, `${ROOM}|${NONCE}|${raw.text}`);
    assert.equal(verification.canonicalPayloadSha256.length, 64);
  });

  it("rejects a bit-flipped signature", async () => {
    const raw = await generateValidRecord();
    const tamperedSig = toBase64Url(tamper(fromBase64Url(raw.signature)));

    const verification = await verifyEvidenceRecord(
      raw.room,
      raw.did,
      raw.nonce,
      raw.text,
      tamperedSig,
      "SERVER_RETRIEVED",
    );

    assert.equal(verification.verified, false);
    assert.equal(verification.status, "INVALID_SIGNATURE");
  });

  it("rejects verification when room or nonce is mismatched", async () => {
    const raw = await generateValidRecord();
    const wrongRoomVerification = await verifyEvidenceRecord(
      "lobby", // Wrong room!
      raw.did,
      raw.nonce,
      raw.text,
      raw.signature,
      "SERVER_RETRIEVED",
    );

    assert.equal(wrongRoomVerification.verified, false);
    assert.equal(wrongRoomVerification.status, "INVALID_SIGNATURE");
  });
});

describe("Evidence Vault — Strict Provenance Distinction", () => {
  it("retains PROVENANCE = MANUAL_HISTORICAL for manual entries even when verified", async () => {
    const raw = await generateValidRecord();
    const { evidence, verification } = await createContributionEvidence({
      ...raw,
      provenance: "MANUAL_HISTORICAL",
      sourceMethod: "MANUAL",
      sourceEndpoint: "MANUAL_ENTRY",
    });

    assert.equal(evidence.provenance, "MANUAL_HISTORICAL");
    assert.equal(evidence.sourceMethod, "MANUAL");
    assert.equal(evidence.verificationStatus, "VERIFIED");
    assert.equal(verification.status, "VERIFIED");

    const md = formatEvidenceMarkdown(evidence);
    assert.match(md, /MANUALLY PROVIDED HISTORICAL RECORD/);
    assert.doesNotMatch(md, /SERVER-RETRIEVED EVIDENCE/);
  });

  it("labels live GET results as SERVER-RETRIEVED EVIDENCE", async () => {
    const raw = await generateValidRecord();
    const { evidence } = await createContributionEvidence({
      ...raw,
      provenance: "SERVER_RETRIEVED",
      sourceMethod: "GET",
      sourceEndpoint: "https://technocore.chat/r/technocore?format=json",
    });

    assert.equal(evidence.provenance, "SERVER_RETRIEVED");
    assert.equal(evidence.sourceMethod, "GET");

    const md = formatEvidenceMarkdown(evidence);
    assert.match(md, /SERVER-RETRIEVED EVIDENCE/);
    assert.doesNotMatch(md, /MANUALLY PROVIDED HISTORICAL RECORD/);
  });
});

describe("Evidence Vault — Import Re-Verification", () => {
  it("imports and re-verifies a valid canonical evidence JSON", async () => {
    const raw = await generateValidRecord();
    const { evidence } = await createContributionEvidence({
      ...raw,
      provenance: "SERVER_RETRIEVED",
    });

    const json = formatEvidenceJson(evidence);
    const result = await importAndVerifyEvidence(json);

    assert.equal(result.ok, true);
    assert.equal(result.status, "VALID_EVIDENCE");
    assert.equal(result.evidence?.evidenceSha256, evidence.evidenceSha256);
  });

  it("detects tampering when an imported payload or hash is modified", async () => {
    const raw = await generateValidRecord();
    const { evidence } = await createContributionEvidence({
      ...raw,
      provenance: "SERVER_RETRIEVED",
    });

    // Tamper with text inside json
    const tampered = {
      ...evidence,
      text: "Tampered contribution text that does not match signature",
    };

    const result = await importAndVerifyEvidence(JSON.stringify(tampered));
    assert.equal(result.ok, false);
    assert.equal(result.status, "SIGNATURE_INVALID");
  });

  it("detects hash mismatch when evidenceSha256 was falsified", async () => {
    const raw = await generateValidRecord();
    const { evidence } = await createContributionEvidence({
      ...raw,
      provenance: "SERVER_RETRIEVED",
    });

    const tamperedHash = {
      ...evidence,
      evidenceSha256: "f".repeat(64), // Falsified hash
    };

    const result = await importAndVerifyEvidence(JSON.stringify(tamperedHash));
    assert.equal(result.ok, false);
    assert.equal(result.status, "HASH_MISMATCH");
    assert.match(result.reason || "", /Integrity hash mismatch/);
  });
});

describe("Evidence Vault — Formatting & Non-Permanent Disclaimers", () => {
  it("includes mandatory non-permanent archive notices in Markdown export", async () => {
    const raw = await generateValidRecord();
    const { evidence } = await createContributionEvidence({
      ...raw,
      provenance: "SERVER_RETRIEVED",
    });

    const md = formatEvidenceMarkdown(evidence);
    assert.match(
      md,
      /Locally preserved evidence of a Technocore signed record\. Technocore room retention may change independently of this local copy\./,
    );
    assert.doesNotMatch(md, /permanent archive/i);
    assert.doesNotMatch(md, /official archive/i);
    assert.doesNotMatch(md, /immutable proof/i);
    assert.doesNotMatch(md, /FLOP Labs certification/i);
  });
});
