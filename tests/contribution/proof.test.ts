/**
 * The detached contribution proof.
 *
 * This is the artifact that has to survive leaving the app: a small JSON file anybody can verify with no
 * network and no trust in this page. The tests therefore care about three things.
 *
 * The signed bytes. Canonical JSON over exactly `{artifact_url, commit, schema}` — the wrapper's `did` and
 * `signature` are not signed, and signing the wrapper instead would be self-referential and would not
 * verify. That is asserted directly rather than assumed.
 *
 * The commit lower-casing. `commit` is lower-cased before signing, so a proof written with an upper-case
 * hash still verifies, because the verifier rebuilds the payload through the same path. This is a faithful
 * reproduction of the reference behaviour and would be easy to break by "cleaning up".
 *
 * The parser's hostility. Every field of a proof file arrives from somewhere else. A structurally hopeless
 * file must be reported as malformed, not as a signature mismatch — different problems, different fixes.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canonicalBytes, type JsonValue } from "../../src/crypto/canonical.ts";
import { utf8 } from "../../src/crypto/bytes.ts";
import {
  ContributionInputError,
  contributionPayload,
  contributionRecord,
  createContributionProof,
  normalizeCommit,
  parseContributionProof,
  proofFileName,
  ProofFormatError,
  serializeProofFile,
  verifyContributionProof,
  type ContributionProof,
} from "../../src/contribution/proof.ts";
import { createSigningHandle } from "../../src/identity/keystore.ts";
import {
  CONTRIBUTION_PROOF_SCHEMA,
  CONTRIBUTION_RECORD_SCHEMA,
  SIGNATURE,
} from "../../src/technocore/profile.ts";
import { OTHER_DID, RFC_VECTOR_1, VALID_SIGNATURE_SHAPE } from "../vectors.ts";

const URL = "https://github.com/example/repo/commit/abc";
const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const COMMIT_256 = "a".repeat(64);

const handle = () => createSigningHandle(RFC_VECTOR_1.seed, RFC_VECTOR_1.publicKey);

async function signedProof(
  overrides: Partial<{ artifactUrl: string; commit: string }> = {},
): Promise<ContributionProof> {
  return createContributionProof(await handle(), {
    artifactUrl: overrides.artifactUrl ?? URL,
    commit: overrides.commit ?? COMMIT,
  });
}

describe("normalizeCommit", () => {
  it("accepts 40 and 64 hex characters and returns them lower-case", () => {
    assert.equal(normalizeCommit(COMMIT.toUpperCase()), COMMIT);
    assert.equal(normalizeCommit(COMMIT_256.toUpperCase()), COMMIT_256);
  });

  it("trims surrounding whitespace", () => {
    assert.equal(normalizeCommit(`  ${COMMIT}\n`), COMMIT);
  });

  it("rejects anything that is not a full hash", () => {
    for (const input of [
      "",
      "abc",
      COMMIT.slice(0, 39),
      `${COMMIT}0`,
      "g".repeat(40),
      `${COMMIT.slice(0, 39)}z`,
      "a".repeat(63),
      "a".repeat(65),
    ]) {
      assert.equal(normalizeCommit(input), null, JSON.stringify(input));
    }
  });
});

describe("contributionRecord", () => {
  it("carries exactly three keys, in canonical order", () => {
    const record = contributionRecord(URL, COMMIT);
    assert.deepEqual(Object.keys(record), ["artifact_url", "commit", "schema"]);
    assert.equal(record.schema, CONTRIBUTION_RECORD_SCHEMA);
  });

  it("stores the link exactly as supplied, not a normalized form", () => {
    assert.equal(contributionRecord("https://Example.COM/x", COMMIT).artifact_url, "https://Example.COM/x");
  });

  it("reports a bad link against artifact_url and a bad commit against commit", () => {
    assert.throws(
      () => contributionRecord("http://example.com", COMMIT),
      (error: unknown) => error instanceof ContributionInputError && error.field === "artifact_url",
    );
    assert.throws(
      () => contributionRecord(URL, "nope"),
      (error: unknown) => error instanceof ContributionInputError && error.field === "commit",
    );
  });

  it("validates the link before the commit, matching the reference order", () => {
    assert.throws(
      () => contributionRecord("http://example.com", "nope"),
      (error: unknown) => error instanceof ContributionInputError && error.field === "artifact_url",
    );
  });

  it("applies this app's stricter link policy, a superset of the reference check", () => {
    // The reference builder only requires the https:// prefix. A private host clears that bar and is
    // still refused here, so every record this produces is one the reference would also accept.
    assert.throws(
      () => contributionRecord("https://127.0.0.1/x", COMMIT),
      (error: unknown) => error instanceof ContributionInputError && error.field === "artifact_url",
    );
  });
});

describe("contributionPayload", () => {
  it("is canonical JSON over the three signed keys, and nothing else", () => {
    const expected = utf8(
      `{"artifact_url":${JSON.stringify(URL)},"commit":"${COMMIT}","schema":"${CONTRIBUTION_RECORD_SCHEMA}"}`,
    );
    assert.deepEqual(contributionPayload(URL, COMMIT), expected);
  });

  it("is unchanged by the case of the supplied commit", () => {
    assert.deepEqual(contributionPayload(URL, COMMIT.toUpperCase()), contributionPayload(URL, COMMIT));
  });
});

describe("createContributionProof", () => {
  it("signs the record, not the wrapper", async () => {
    const proof = await signedProof();
    const { schema, did, signature, ...rest } = proof;
    assert.equal(schema, CONTRIBUTION_PROOF_SCHEMA);
    assert.equal(did, RFC_VECTOR_1.did);
    assert.match(signature, SIGNATURE.pattern);
    assert.deepEqual(Object.keys(rest), ["artifact_url", "commit"]);

    // The signed bytes are the record's canonical JSON. Signing the wrapper would include `did` and
    // `signature`, which cannot be right for a signature over itself.
    const record = contributionRecord(URL, COMMIT);
    assert.deepEqual(contributionPayload(URL, COMMIT), canonicalBytes(record as unknown as JsonValue));
  });

  it("normalizes the commit into the proof it writes", async () => {
    const proof = await signedProof({ commit: COMMIT.toUpperCase() });
    assert.equal(proof.commit, COMMIT);
  });
});

describe("verifyContributionProof", () => {
  it("verifies a proof this app produced", async () => {
    const result = await verifyContributionProof(await signedProof());
    assert.equal(result.verified, true);
    assert.equal(result.failure, undefined);
    assert.deepEqual(result.payload, contributionPayload(URL, COMMIT));
  });

  it("verifies a round trip through the file format", async () => {
    const proof = await signedProof();
    const result = await verifyContributionProof(parseContributionProof(serializeProofFile(proof)));
    assert.equal(result.verified, true);
  });

  it("still verifies when the file carries an upper-case commit", async () => {
    const proof = await signedProof();
    const result = await verifyContributionProof({ ...proof, commit: proof.commit.toUpperCase() });
    assert.equal(result.verified, true);
  });

  it("fails when the artifact URL is changed", async () => {
    const proof = await signedProof();
    const result = await verifyContributionProof({ ...proof, artifact_url: "https://example.com/other" });
    assert.equal(result.verified, false);
  });

  it("fails when the commit is changed", async () => {
    const proof = await signedProof();
    const result = await verifyContributionProof({ ...proof, commit: COMMIT_256 });
    assert.equal(result.verified, false);
  });

  it("fails when the DID is swapped for another valid one", async () => {
    const proof = await signedProof();
    const result = await verifyContributionProof({ ...proof, did: OTHER_DID });
    assert.equal(result.verified, false);
  });

  it("reports a malformed record rather than a signature mismatch", async () => {
    const proof = await signedProof();
    const result = await verifyContributionProof({ ...proof, artifact_url: "http://example.com" });
    assert.equal(result.verified, false);
    assert.equal(result.failure, "malformed-record");
    assert.equal(result.payload, undefined);
  });
});

describe("serializeProofFile", () => {
  it("writes sorted keys, two-space indent and a trailing newline", async () => {
    const text = serializeProofFile(await signedProof());
    assert.equal(text.endsWith("\n"), true);
    assert.equal(text.startsWith("{\n  \""), true);

    const keys = [...text.matchAll(/^ {2}"([a-z_]+)":/gm)].map((match) => match[1]);
    assert.deepEqual(keys, ["artifact_url", "commit", "did", "schema", "signature"]);
    assert.deepEqual([...keys].sort(), keys);
  });

  it("round-trips through the parser unchanged", async () => {
    const proof = await signedProof();
    assert.deepEqual(parseContributionProof(serializeProofFile(proof)), proof);
  });
});

describe("proofFileName", () => {
  it("uses the first twelve characters of the commit", async () => {
    const proof = await signedProof();
    assert.equal(proofFileName(proof), `technocore-contribution-${COMMIT.slice(0, 12)}.proof.json`);
  });

  it("contains no path separators, so it cannot escape a download directory", async () => {
    const name = proofFileName(await signedProof());
    assert.equal(/^[A-Za-z0-9._-]+$/.test(name), true, name);
  });
});

describe("parseContributionProof", () => {
  const valid = {
    schema: CONTRIBUTION_PROOF_SCHEMA,
    did: RFC_VECTOR_1.did,
    artifact_url: URL,
    commit: COMMIT,
    signature: VALID_SIGNATURE_SHAPE,
  };

  it("accepts a well-formed proof and ignores extra fields", () => {
    const parsed = parseContributionProof(JSON.stringify({ ...valid, extra: "ignored" }));
    assert.deepEqual(parsed, valid);
  });

  it("rejects non-JSON, non-objects and arrays", () => {
    for (const text of ["", "not json", "null", "42", '"a string"', "[]", '[{"schema":"x"}]']) {
      assert.throws(() => parseContributionProof(text), ProofFormatError, JSON.stringify(text));
    }
  });

  it("rejects the wrong schema, including the record schema", () => {
    for (const schema of [CONTRIBUTION_RECORD_SCHEMA, "technocore-contribution-proof-v2", "", 1]) {
      assert.throws(() => parseContributionProof(JSON.stringify({ ...valid, schema })), ProofFormatError);
    }
  });

  it("rejects a missing or non-string required field", () => {
    for (const field of ["did", "artifact_url", "commit", "signature"] as const) {
      const missing: Record<string, unknown> = { ...valid };
      delete missing[field];
      assert.throws(() => parseContributionProof(JSON.stringify(missing)), ProofFormatError, field);
      assert.throws(
        () => parseContributionProof(JSON.stringify({ ...valid, [field]: 42 })),
        ProofFormatError,
        field,
      );
    }
  });

  it("rejects a malformed DID before any signature work happens", () => {
    assert.throws(
      () => parseContributionProof(JSON.stringify({ ...valid, did: "did:web:example.com" })),
      ProofFormatError,
    );
  });

  it("rejects a signature of the wrong shape", () => {
    for (const signature of ["A".repeat(85), "A".repeat(87), `${"A".repeat(85)}=`, `${"A".repeat(85)}+`]) {
      assert.throws(() => parseContributionProof(JSON.stringify({ ...valid, signature })), ProofFormatError);
    }
  });
});
