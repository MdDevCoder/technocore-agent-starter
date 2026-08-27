/**
 * Passphrase strength estimation for the backup step.
 *
 * This is an *estimate*, and the UI says so. It is not a security boundary — a determined offline
 * attacker's success depends on the passphrase, not on this meter. Its only job is to stop someone
 * protecting an irreplaceable identity with `password1`.
 *
 * No dependency: zxcvbn would be more accurate but pulls a ~400 kB dictionary onto the page that
 * handles key material, and the marginal accuracy does not justify that here.
 */

export interface PassphraseAssessment {
  /** 0 (unusable) to 4 (strong). Drives the meter only. */
  readonly score: 0 | 1 | 2 | 3 | 4;
  /** Rough entropy estimate in bits. Presented as approximate. */
  readonly bits: number;
  readonly label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  /** Concrete, actionable notes. Never scolding. */
  readonly notes: readonly string[];
  /** Whether the backup step will accept it. */
  readonly acceptable: boolean;
}

export const MIN_PASSPHRASE_LENGTH = 12;

/**
 * Not a password dictionary — just the handful of strings that show up when someone is trying to get
 * past a form. A real dictionary check belongs server-side, and there is no server here.
 */
const OBVIOUS = [
  "password",
  "passphrase",
  "123456",
  "qwerty",
  "letmein",
  "welcome",
  "iloveyou",
  "admin",
  "technocore",
  "flop",
  "airdrop",
  "crypto",
  "wallet",
  "seedphrase",
];

const CLASSES: ReadonlyArray<readonly [RegExp, number]> = [
  [/[a-z]/, 26],
  [/[A-Z]/, 26],
  [/[0-9]/, 10],
  [/[ \t]/, 1],
  [/[^A-Za-z0-9 \t]/, 33],
];

export function assessPassphrase(passphrase: string): PassphraseAssessment {
  const value = passphrase.normalize("NFC");
  const length = [...value].length;
  const notes: string[] = [];

  if (length === 0) {
    return { score: 0, bits: 0, label: "Too short", notes: [], acceptable: false };
  }

  let alphabet = 0;
  let classCount = 0;
  for (const [pattern, size] of CLASSES) {
    if (pattern.test(value)) {
      alphabet += size;
      classCount++;
    }
  }

  let bits = length * Math.log2(Math.max(alphabet, 2));

  // A long passphrase of a few words beats a short scramble; a repeated character is not length.
  const distinct = new Set([...value.toLowerCase()]).size;
  if (distinct <= 4 && length > 6) {
    bits *= 0.45;
    notes.push("Repeating a few characters does not add much strength.");
  }

  if (/^[a-z]+$/.test(value) && length < 20) {
    notes.push("All lowercase. Mixed case, a digit, or a symbol raises the cost of guessing.");
  }

  const lower = value.toLowerCase();
  if (OBVIOUS.some((word) => lower.includes(word))) {
    bits = Math.min(bits, 28);
    notes.push("Contains a very common word. Guessing tools try these first.");
  }

  if (/(.)\1{3,}/.test(value)) {
    bits = Math.min(bits, 34);
    notes.push("Contains a long run of one character.");
  }

  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf)/i.test(value)) {
    bits = Math.min(bits, 34);
    notes.push("Contains a keyboard or counting sequence.");
  }

  if (length < MIN_PASSPHRASE_LENGTH) {
    notes.unshift(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    return { score: 0, bits: Math.round(bits), label: "Too short", notes, acceptable: false };
  }

  if (classCount === 1 && length >= 20) {
    notes.push("A long multi-word phrase is fine — length is doing the work here.");
  }

  const rounded = Math.round(bits);
  const score: PassphraseAssessment["score"] =
    rounded >= 90 ? 4 : rounded >= 68 ? 3 : rounded >= 50 ? 2 : 1;
  const label = (["Too short", "Weak", "Fair", "Good", "Strong"] as const)[score]!;

  return { score, bits: rounded, label, notes, acceptable: true };
}
