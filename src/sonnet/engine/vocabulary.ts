/**
 * Fast In-Memory Vocabulary & Preflight Candidate Matcher.
 */

import { getAllowedLettersFromDid } from "./validator.ts";

export interface CandidateWord {
  readonly word: string;
  readonly syllables: number;
  readonly rhymeKey?: string;
}

export interface DidTeamMember {
  readonly id: string;
  readonly name: string;
  readonly did: string;
  readonly roleDescription: string;
}

export const TEAM_MEMBERS: readonly DidTeamMember[] = [
  {
    id: "Agent_1",
    name: "Agent 1 (Alpha)",
    did: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
    roleDescription: "Deep Vocabulary & Rhyme Foundation (32.6k words)",
  },
  {
    id: "Agent_2",
    name: "Agent 2 (Beta)",
    did: "did:key:z6Mkexnu9EeeRC6epkNxBd2wzkTtYzGDgB2LqFcQRyK7LY1m",
    roleDescription: "L/U Specialist (will, full, blind, line, free)",
  },
  {
    id: "Agent_3",
    name: "Agent 3 (Gamma)",
    did: "did:key:z6MksaSkEjx9k6fE79nhjX2QMkNRNETVKioV9PowELQojvwe",
    roleDescription: "S/O/J Virtuoso & Flow Synthesizer (48.7k words)",
  },
  {
    id: "Agent_4",
    name: "Agent 4 (Delta)",
    did: "did:key:z6MkmhPc35JEQWyugrMbq8AheAP1ZnabAS2NQwecsysatFKG",
    roleDescription: "A/U/S Architect & Rhythm Driver (43.9k words)",
  },
  {
    id: "Agent_5",
    name: "Agent 5 (Epsilon)",
    did: "did:key:z6MktxnssqwUv4tRs9Dvc72DfczbDfYQHs31kdYZNbmZDGHW",
    roleDescription: "S/U/Z Anchor & Metric Stabilizer (17.2k words)",
  },
];

export const UNIVERSAL_FALLBACK_WORDS: readonly CandidateWord[] = [
  { word: "in", syllables: 1 },
  { word: "it", syllables: 1 },
  { word: "me", syllables: 1 },
  { word: "we", syllables: 1 },
  { word: "were", syllables: 1 },
  { word: "time", syllables: 1 },
  { word: "mind", syllables: 1 },
  { word: "find", syllables: 1 },
  { word: "kind", syllables: 1 },
  { word: "wind", syllables: 1 },
  { word: "free", syllables: 1 },
  { word: "tree", syllables: 1 },
  { word: "fine", syllables: 1 },
  { word: "mine", syllables: 1 },
  { word: "fire", syllables: 2 },
  { word: "wire", syllables: 2 },
  { word: "write", syllables: 1 },
  { word: "die", syllables: 1 },
  { word: "tie", syllables: 1 },
  { word: "dry", syllables: 1 },
  { word: "try", syllables: 1 },
  { word: "meet", syllables: 1 },
  { word: "feed", syllables: 1 },
  { word: "deer", syllables: 1 },
  { word: "deed", syllables: 1 },
  { word: "defy", syllables: 2 },
  { word: "define", syllables: 2 },
  { word: "winter", syllables: 2 },
  { word: "tender", syllables: 2 },
  { word: "enter", syllables: 2 },
];

/**
 * Filter word list by active DID, max syllables, and optional search prefix.
 */
export function filterCandidatesForAgent(
  words: readonly CandidateWord[],
  did: string,
  maxSyllables = 10,
  query = ""
): readonly CandidateWord[] {
  const allowed = getAllowedLettersFromDid(did);
  const cleanQuery = query.trim().toLowerCase();

  return words.filter((item) => {
    if (item.syllables > maxSyllables) return false;
    if (cleanQuery && !item.word.includes(cleanQuery)) return false;

    for (const ch of item.word) {
      if (ch >= "a" && ch <= "z" && !allowed.has(ch)) {
        return false;
      }
    }
    return true;
  });
}
