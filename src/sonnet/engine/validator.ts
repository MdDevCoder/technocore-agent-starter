/**
 * Canonical Sonnet Contest Validator (TypeScript Port).
 *
 * Faithfully mirrors `sonnet-game.md` reference Python implementation.
 */

export const WORD_REGEX = /^[A-Za-z]+(?:'[A-Za-z]+)*$/;
export const TOKEN_REGEX = /^([A-Za-z]+(?:'[A-Za-z]+)*)[,.;:!?]?$/;
export const ED25519_DID_REGEX = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;

export const CMUDICT_VOWELS = new Set([
  "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"
]);

export interface LexiconMap {
  readonly [word: string]: number;
}

/**
 * Extracts unique lowercase ASCII letters from a DID string.
 */
export function getAllowedLettersFromDid(did: string): Set<string> {
  const allowed = new Set<string>();
  for (const ch of did.toLowerCase()) {
    if (ch >= "a" && ch <= "z") {
      allowed.add(ch);
    }
  }
  return allowed;
}

/**
 * Validates a single word token against CMUdict lexicon and returns syllable count.
 */
export function getWordSyllables(token: string, lexicon: LexiconMap | Map<string, number>): number {
  if (typeof token !== "string") {
    throw new Error("word: expected string token");
  }
  const match = token.match(TOKEN_REGEX);
  if (!match || !match[1]) {
    throw new Error("word: expected one English word with optional trailing punctuation");
  }
  const cleanWord = match[1].toLowerCase();
  
  let count: number | undefined;
  if (lexicon instanceof Map) {
    count = lexicon.get(cleanWord);
  } else {
    count = lexicon[cleanWord];
  }

  if (count === undefined || count <= 0) {
    throw new Error(`word: '${cleanWord}' is not in the frozen dictionary`);
  }
  return count;
}

/**
 * Validates a word against the contributor's DID and returns syllable count.
 */
export function validateWordContribution(
  token: string,
  verifiedDid: string,
  lexicon: LexiconMap | Map<string, number>
): { readonly syllables: number; readonly cleanWord: string } {
  const syllables = getWordSyllables(token, lexicon);

  if (typeof verifiedDid !== "string" || !ED25519_DID_REGEX.test(verifiedDid)) {
    throw new Error("agent_did: expected the registered Ed25519 did:key");
  }

  const allowed = getAllowedLettersFromDid(verifiedDid);
  const match = token.match(TOKEN_REGEX);
  if (!match || !match[1]) {
    throw new Error("word: expected one English word with optional trailing punctuation");
  }
  const cleanWord = match[1].toLowerCase();

  const missing: string[] = [];
  for (const ch of cleanWord) {
    if (ch >= "a" && ch <= "z" && !allowed.has(ch)) {
      if (!missing.includes(ch)) missing.push(ch);
    }
  }

  if (missing.length > 0) {
    missing.sort();
    throw new Error(`word: letters absent from contributor DID: ${missing.join("")}`);
  }

  return { syllables, cleanWord };
}

/**
 * Validates full poem text (14 lines, 4/4/4/2 stanzas, exact 10 syllables per line).
 */
export function validatePoemText(
  text: string,
  lexicon: LexiconMap | Map<string, number>,
  options: { exactTen?: boolean } = { exactTen: true }
): { readonly valid: boolean; readonly syllablesPerLine: readonly number[]; readonly totalSyllables: number } {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  const stanzas = trimmed.split("\n\n");

  if (stanzas.length > 1) {
    const stanzaLineCounts = stanzas.map((s) => s.split("\n").filter((l) => l.trim().length > 0).length);
    const expected = [4, 4, 4, 2];
    const is4442 = stanzaLineCounts.length === 4 && stanzaLineCounts.every((val, idx) => val === expected[idx]);
    if (!is4442) {
      throw new Error(`stanzas: expected 4/4/4/2 lines, got [${stanzaLineCounts.join(", ")}]`);
    }
  }

  const lines = stanzas.flatMap((s) => s.split("\n").filter((l) => l.trim().length > 0));
  if (lines.length !== 14) {
    throw new Error(`lines: expected 14, got ${lines.length}`);
  }

  const syllablesPerLine: number[] = [];
  let totalSyllables = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const currentLine = lines[i];
    if (!currentLine) continue;
    const tokens = currentLine.trim().split(/\s+/);
    let lineSyllables = 0;

    for (const token of tokens) {
      if (!token) continue;
      const count = getWordSyllables(token, lexicon);
      lineSyllables += count;
    }

    if (lineSyllables > 10 || (options.exactTen && lineSyllables !== 10)) {
      const exp = options.exactTen ? "exactly 10" : "at most 10";
      throw new Error(`line ${lineNum}: syllables must be ${exp}, got ${lineSyllables}`);
    }

    syllablesPerLine.push(lineSyllables);
    totalSyllables += lineSyllables;
  }

  return {
    valid: true,
    syllablesPerLine,
    totalSyllables,
  };
}
