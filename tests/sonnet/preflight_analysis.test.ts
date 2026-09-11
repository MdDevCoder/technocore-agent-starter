import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getAllowedLettersFromDid,
  getWordSyllables,
  validateWordContribution,
  validatePoemText,
  TOKEN_REGEX,
} from "../../src/sonnet/engine/validator.ts";
import {
  TEAM_MEMBERS,
  UNIVERSAL_FALLBACK_WORDS,
  filterCandidatesForAgent,
} from "../../src/sonnet/engine/vocabulary.ts";

describe("Sonnet Preflight & Contest Rule Engine", () => {
  const sampleLexicon = new Map<string, number>([
    ["the", 1],
    ["night", 1],
    ["is", 1],
    ["calm", 1],
    ["and", 1],
    ["clear", 1],
    ["upon", 2],
    ["the", 1],
    ["hill", 1],
    ["time", 1],
    ["mind", 1],
    ["free", 1],
    ["tree", 1],
    ["deep", 1],
    ["fire", 2],
    ["divine", 2],
    ["forever", 3],
    ["eternal", 3],
  ]);

  it("extracts exact lowercase letters from DID including did:key: prefix", () => {
    const did1 = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
    const allowed = getAllowedLettersFromDid(did1);
    
    // Inherent did:key: and z6Mk letters must be present
    assert.ok(allowed.has("d"));
    assert.ok(allowed.has("i"));
    assert.ok(allowed.has("k"));
    assert.ok(allowed.has("e"));
    assert.ok(allowed.has("y"));
    assert.ok(allowed.has("z"));
    assert.ok(allowed.has("a"));
    assert.ok(allowed.has("m"));

    // Numbers must not be in letter set
    assert.ok(!allowed.has("6"));
    assert.ok(!allowed.has("2"));
    assert.ok(!allowed.has(":"));
  });

  it("validates word contribution with case-insensitivity and allowed punctuation", () => {
    const did1 = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
    
    // 'Night,' is allowed for did1 (letters: n, i, g, h, t - all present)
    const res1 = validateWordContribution("Night,", did1, sampleLexicon);
    assert.equal(res1.cleanWord, "night");
    assert.equal(res1.syllables, 1);

    // 'Time!' is allowed (letters: t, i, m, e)
    const res2 = validateWordContribution("Time!", did1, sampleLexicon);
    assert.equal(res2.cleanWord, "time");
    assert.equal(res2.syllables, 1);
  });

  it("rejects words containing letters absent from contributor DID", () => {
    const did1 = "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2";
    // did1 is missing 'l', 's', 'u'
    assert.throws(
      () => validateWordContribution("hill", did1, sampleLexicon),
      /letters absent from contributor DID: l/
    );
  });

  it("validates that all universal fallback words are writable by all 5 team DIDs", () => {
    for (const member of TEAM_MEMBERS) {
      const allowed = getAllowedLettersFromDid(member.did);
      for (const fallback of UNIVERSAL_FALLBACK_WORDS) {
        for (const ch of fallback.word) {
          assert.ok(
            allowed.has(ch),
            `Member ${member.name} (${member.id}) must be able to write fallback word '${fallback.word}', but is missing '${ch}'`
          );
        }
      }
    }
  });

  it("verifies team combined alphabet covers all 26 letters of the English alphabet", () => {
    const combined = new Set<string>();
    for (const member of TEAM_MEMBERS) {
      for (const ch of getAllowedLettersFromDid(member.did)) {
        combined.add(ch);
      }
    }
    assert.equal(combined.size, 26, "Combined team alphabet must cover 100% of English letters");
  });

  it("validates full poem 14-line 4/4/4/2 and exact 10-syllable mechanical constraint", () => {
    // 14 lines, exactly 10 syllables per line (10 'the' = 10 syl)
    const lines = Array.from({ length: 14 }, () => "the the the the the the the the the the");
    const formatted = `${lines.slice(0, 4).join("\n")}\n\n${lines.slice(4, 8).join("\n")}\n\n${lines.slice(8, 12).join("\n")}\n\n${lines.slice(12, 14).join("\n")}`;

    const res = validatePoemText(formatted, sampleLexicon, { exactTen: true });
    assert.equal(res.valid, true);
    assert.equal(res.totalSyllables, 140);
    assert.equal(res.syllablesPerLine.length, 14);
    assert.ok(res.syllablesPerLine.every((s) => s === 10));
  });

  it("rejects poem lines exceeding or under-shooting 10 syllables when exactTen is enabled", () => {
    const shortLine = "the the the"; // 3 syllables
    const lines = Array.from({ length: 14 }, () => "the the the the the the the the the the");
    lines[0] = shortLine;
    const formatted = `${lines.slice(0, 4).join("\n")}\n\n${lines.slice(4, 8).join("\n")}\n\n${lines.slice(8, 12).join("\n")}\n\n${lines.slice(12, 14).join("\n")}`;

    assert.throws(() => validatePoemText(formatted, sampleLexicon, { exactTen: true }), /syllables must be exactly 10/);
  });
});
