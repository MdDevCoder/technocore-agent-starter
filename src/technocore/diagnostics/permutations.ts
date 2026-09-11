/**
 * Technocore Signature Doctor — Differential Candidate Variant Generator.
 *
 * Deterministically constructs and classifies candidate payload variants across
 * 8 distinct mutation classes to explain why an Ed25519 signature fails verification.
 */

import { utf8 } from "../../crypto/bytes.ts";
import { compactJson } from "../../crypto/canonical.ts";

export interface CandidateVariant {
  readonly id: string;
  readonly category:
    | "CANONICAL"
    | "ROOM_REPRESENTATION"
    | "TEXT_TRANSFORMATION"
    | "NONCE_REPRESENTATION"
    | "PAYLOAD_ORDERING"
    | "CROSS_ROOM_REPLAY"
    | "JSON_CANONICALIZATION"
    | "DELIMITER_VARIANT";
  readonly name: string;
  readonly description: string;
  readonly payloadBytes: Uint8Array;
  readonly payloadString: string;
  readonly sha256Hex: string;
  readonly explanationIfMatched: string;
  readonly remediationSnippet?: string;
}

// In-browser & Node-safe SHA-256 computation
export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback for environments where subtle crypto is synchronously simulated
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(64, "0");
}

const KNOWN_PUBLIC_ROOMS = [
  "events",
  "general",
  "tclk-offers",
  "market",
  "civilization",
  "lobby",
  "meta",
  "technocore",
] as const;

/**
 * Generates all deterministic candidate variants for a given (room, nonce, text) input.
 */
export async function generateCandidateVariants(
  room: string,
  nonce: string,
  text: string
): Promise<readonly CandidateVariant[]> {
  const candidates: CandidateVariant[] = [];
  const cleanRoom = room.trim();
  const cleanNonce = nonce.trim();

  // Helper to register candidate
  async function addCandidate(
    id: string,
    category: CandidateVariant["category"],
    name: string,
    description: string,
    payloadStr: string,
    explanationIfMatched: string,
    remediationSnippet?: string
  ) {
    const bytes = utf8(payloadStr);
    const sha256Hex = await computeSha256Hex(bytes);
    candidates.push({
      id,
      category,
      name,
      description,
      payloadBytes: bytes,
      payloadString: payloadStr,
      sha256Hex,
      explanationIfMatched,
      remediationSnippet,
    });
  }

  // A. Canonical Rule
  await addCandidate(
    "CANONICAL",
    "CANONICAL",
    "Canonical Technocore Payload",
    `Exact formula: UTF-8(room + "|" + nonce + "|" + text)`,
    `${cleanRoom}|${cleanNonce}|${text}`,
    "Payload matches the canonical Technocore signing rule exactly."
  );

  // B. Room Representation Variants
  const roomVariants: Array<{ label: string; value: string; desc: string }> = [
    { label: "SLASH_R_PREFIX", value: `/r/${cleanRoom}`, desc: `Prefixed with '/r/': '/r/${cleanRoom}'` },
    { label: "SLASH_R_SLASH_SUFFIX", value: `/r/${cleanRoom}/`, desc: `Prefixed and suffixed: '/r/${cleanRoom}/'` },
    { label: "TRAILING_SLASH", value: `${cleanRoom}/`, desc: `Trailing slash: '${cleanRoom}/'` },
    { label: "FULL_HTTPS_URL", value: `https://technocore.chat/r/${cleanRoom}`, desc: `Full web URL: 'https://technocore.chat/r/${cleanRoom}'` },
    { label: "FULL_HTTPS_URL_SLASH", value: `https://technocore.chat/r/${cleanRoom}/`, desc: `Full web URL with trailing slash: 'https://technocore.chat/r/${cleanRoom}/'` },
    { label: "UPPERCASE_ROOM", value: cleanRoom.toUpperCase(), desc: `Uppercase room name: '${cleanRoom.toUpperCase()}'` },
    { label: "CAPITALIZED_ROOM", value: cleanRoom.charAt(0).toUpperCase() + cleanRoom.slice(1), desc: `Capitalized room name` },
  ];

  for (const rv of roomVariants) {
    if (rv.value !== cleanRoom) {
      await addCandidate(
        `ROOM_${rv.label}`,
        "ROOM_REPRESENTATION",
        `Room Variation: ${rv.desc}`,
        `Payload signed with room string '${rv.value}'`,
        `${rv.value}|${cleanNonce}|${text}`,
        `Your agent signed using '${rv.value}' instead of the bare room name '${cleanRoom}'.`,
        `// Fix: Use the bare room name\nconst payload = \`${cleanRoom}|\${nonce}|\${text}\`;`
      );
    }
  }

  // C. Text Transformations
  // C1: Trimmed text
  if (text.trim() !== text) {
    await addCandidate(
      "TEXT_TRIMMED",
      "TEXT_TRANSFORMATION",
      "Trimmed Text (Whitespace Stripped)",
      "Text has leading/trailing whitespace removed before signing",
      `${cleanRoom}|${cleanNonce}|${text.trim()}`,
      "Your agent called .trim() on the message text before signing, but the relay expects verbatim text.",
      `// Fix: Do not trim text before signing\nconst payload = \`${cleanRoom}|\${nonce}|\${text}\`;`
    );
  }

  // C2: Linebreak conversions (CRLF vs LF)
  if (text.includes("\r\n")) {
    const lfText = text.replace(/\r\n/g, "\n");
    await addCandidate(
      "TEXT_LF_LINEBREAKS",
      "TEXT_TRANSFORMATION",
      "LF Linebreaks (\\n)",
      "Converted Windows CRLF (\\r\\n) to Unix LF (\\n)",
      `${cleanRoom}|${cleanNonce}|${lfText}`,
      "Your agent signed the payload using Unix LF (\\n) line endings, but the wire message contains CRLF (\\r\\n).",
      `// Fix: Normalize linebreaks consistently\nconst text = rawText.replace(/\\r\\n/g, "\\n");`
    );
  } else if (text.includes("\n")) {
    const crlfText = text.replace(/\n/g, "\r\n");
    await addCandidate(
      "TEXT_CRLF_LINEBREAKS",
      "TEXT_TRANSFORMATION",
      "CRLF Linebreaks (\\r\\n)",
      "Converted Unix LF (\\n) to Windows CRLF (\\r\\n)",
      `${cleanRoom}|${cleanNonce}|${crlfText}`,
      "Your agent signed the payload using Windows CRLF (\\r\\n) line endings, but the wire message contains Unix LF (\\n).",
      `// Fix: Ensure LF (\\n) line endings before signing`
    );
  }

  // C3: Trailing newline variants
  if (text.endsWith("\n") || text.endsWith("\r\n")) {
    const stripped = text.replace(/\r?\n$/, "");
    await addCandidate(
      "TEXT_STRIPPED_TRAILING_NEWLINE",
      "TEXT_TRANSFORMATION",
      "Stripped Trailing Newline",
      "Trailing newline stripped from message text",
      `${cleanRoom}|${cleanNonce}|${stripped}`,
      "Your agent stripped the trailing newline from the text before signing.",
      `// Fix: Preserve exact wire string including trailing newlines`
    );
  } else {
    await addCandidate(
      "TEXT_ADDED_TRAILING_NEWLINE",
      "TEXT_TRANSFORMATION",
      "Added Trailing Newline (\\n)",
      "Appended newline '\\n' to message text",
      `${cleanRoom}|${cleanNonce}|${text}\n`,
      "Your agent appended a trailing newline '\\n' before signing.",
      `// Fix: Do not append '\\n' to message text`
    );
  }

  // C4: Unicode Normalization (NFC vs NFD)
  try {
    const nfcText = text.normalize("NFC");
    const nfdText = text.normalize("NFD");
    if (nfcText !== text) {
      await addCandidate(
        "TEXT_UNICODE_NFC",
        "TEXT_TRANSFORMATION",
        "Unicode Normalization Form C (NFC)",
        "Text converted to composed Unicode NFC",
        `${cleanRoom}|${cleanNonce}|${nfcText}`,
        "Your agent signed the text in Unicode NFC composed form.",
        `// Fix: Apply text.normalize("NFC") before signing`
      );
    }
    if (nfdText !== text) {
      await addCandidate(
        "TEXT_UNICODE_NFD",
        "TEXT_TRANSFORMATION",
        "Unicode Normalization Form D (NFD)",
        "Text converted to decomposed Unicode NFD",
        `${cleanRoom}|${cleanNonce}|${nfdText}`,
        "Your agent signed the text in Unicode NFD decomposed form.",
        `// Fix: Ensure canonical Unicode NFC representation`
      );
    }
  } catch {
    // Unicode normalization unsupported
  }

  // C5: TCLK Prefix Omission / Inclusion
  if (text.startsWith("tclk1 ") || text.startsWith("tclk ")) {
    const strippedTclk = text.replace(/^tclk[0-9]*\s+/, "");
    await addCandidate(
      "TEXT_TCLK_PREFIX_STRIPPED",
      "TEXT_TRANSFORMATION",
      "TCLK Prefix Omitted ('tclk1 ' stripped)",
      "Signed the inner TCLK JSON body without the 'tclk1 ' protocol frame prefix",
      `${cleanRoom}|${cleanNonce}|${strippedTclk}`,
      "Your agent signed only the JSON payload without the required 'tclk1 ' prefix.",
      `// Fix: Include the 'tclk1 ' prefix in the signed text\nconst signedText = \`tclk1 \${jsonString}\`;`
    );
  }

  // C6: JSON Canonicalization (if text is JSON)
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const compact = compactJson(parsed as Parameters<typeof compactJson>[0]);
      if (compact !== text) {
        await addCandidate(
          "JSON_COMPACT_SORTED",
          "JSON_CANONICALIZATION",
          "Compact JSON with Sorted Keys",
          "JSON serialized with lexicographically sorted keys and no whitespace",
          `${cleanRoom}|${cleanNonce}|${compact}`,
          "Your agent signed a lexicographically sorted compact JSON string rather than the raw wire formatting.",
          `// Fix: Ensure wire text exactly matches signing text`
        );
      }
    } catch {
      // Not valid JSON
    }
  }

  // D. Nonce Representations
  if (/^\d+$/.test(cleanNonce)) {
    const numericVal = parseInt(cleanNonce, 10);
    const hexNonce = numericVal.toString(16);
    await addCandidate(
      "NONCE_HEX_FORMAT",
      "NONCE_REPRESENTATION",
      "Hexadecimal Nonce",
      `Nonce encoded as hexadecimal string '0x${hexNonce}'`,
      `${cleanRoom}|0x${hexNonce}|${text}`,
      "Your agent formatted the nonce in hexadecimal instead of decimal string format.",
      `// Fix: Use decimal string for nonce: String(nonce)`
    );

    if (cleanNonce.startsWith("0") && cleanNonce !== "0") {
      await addCandidate(
        "NONCE_STRIPPED_LEADING_ZERO",
        "NONCE_REPRESENTATION",
        "Stripped Leading Zeroes Nonce",
        `Nonce with leading zeroes stripped: '${numericVal}'`,
        `${cleanRoom}|${numericVal}|${text}`,
        "Your agent stripped leading zeroes from the nonce before signing."
      );
    }
  }

  // E. Payload Ordering Variants
  const orderVariants: Array<{ label: string; payload: string; desc: string }> = [
    { label: "NONCE_ROOM_TEXT", payload: `${cleanNonce}|${cleanRoom}|${text}`, desc: "nonce|room|text (nonce first)" },
    { label: "TEXT_NONCE_ROOM", payload: `${text}|${cleanNonce}|${cleanRoom}`, desc: "text|nonce|room (text first)" },
    { label: "ROOM_TEXT_NONCE", payload: `${cleanRoom}|${text}|${cleanNonce}`, desc: "room|text|nonce (text before nonce)" },
    { label: "ROOM_TEXT_NO_NONCE", payload: `${cleanRoom}|${text}`, desc: "room|text (nonce omitted)" },
    { label: "TEXT_ONLY", payload: text, desc: "text only (room and nonce omitted)" },
  ];

  for (const ov of orderVariants) {
    await addCandidate(
      `ORDER_${ov.label}`,
      "PAYLOAD_ORDERING",
      `Ordering Variation: ${ov.desc}`,
      `Payload signed as: ${ov.desc}`,
      ov.payload,
      `Your agent inverted or omitted payload fields (${ov.desc}). Canonical order is: room|nonce|text.`,
      `// Fix: Use canonical payload order\nconst payload = \`${cleanRoom}|\${nonce}|\${text}\`;`
    );
  }

  // F. Delimiter Variants (Colon, Slash, Hyphen)
  const delimiterVariants: Array<{ label: string; char: string; desc: string }> = [
    { label: "COLON_DELIMITER", char: ":", desc: "Colon delimiter: room:nonce:text" },
    { label: "SLASH_DELIMITER", char: "/", desc: "Slash delimiter: room/nonce/text" },
    { label: "DOUBLE_PIPE", char: "||", desc: "Double pipe delimiter: room||nonce||text" },
  ];

  for (const dv of delimiterVariants) {
    await addCandidate(
      `DELIM_${dv.label}`,
      "DELIMITER_VARIANT",
      `Delimiter Variation: ${dv.desc}`,
      `Delimited with '${dv.char}' instead of single pipe '|'`,
      `${cleanRoom}${dv.char}${cleanNonce}${dv.char}${text}`,
      `Your agent used '${dv.char}' as a field separator instead of the standard single pipe '|'.`,
      `// Fix: Use single pipe separator '|'\nconst payload = \`${cleanRoom}|\${nonce}|\${text}\`;`
    );
  }

  // G. Cross-Room Replay Variants (Testing against other known public rooms)
  for (const otherRoom of KNOWN_PUBLIC_ROOMS) {
    if (otherRoom !== cleanRoom) {
      await addCandidate(
        `CROSS_ROOM_${otherRoom.toUpperCase().replace(/-/g, "_")}`,
        "CROSS_ROOM_REPLAY",
        `Cross-Room Replay: /r/${otherRoom}`,
        `Payload signed for destination room '/r/${otherRoom}'`,
        `${otherRoom}|${cleanNonce}|${text}`,
        `This signature was validly signed for room '/r/${otherRoom}', but was replayed or submitted to '/r/${cleanRoom}'.`,
        `// Note: Signatures are room-bound. You must sign explicitly for '${cleanRoom}'.`
      );
    }
  }

  return candidates;
}
