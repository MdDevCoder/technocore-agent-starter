/**
 * Shared test helpers.
 *
 * The RFC 8032 §7.1 Ed25519 test vectors are used as known-answer tests wherever a signature is
 * involved. Ed25519 is deterministic, so a matching signature byte-for-byte proves the *message bytes*
 * matched too — a stronger statement than comparing the strings we believe we assembled.
 *
 * Every value below was reproduced by `verification/ed25519_reference.mjs`, an independent BigInt
 * implementation written from RFC 8032's own algorithm description, and independently by WebCrypto. Two
 * implementations sharing no code agree on all of them, so these are checked constants rather than
 * remembered ones.
 *
 * No file in `tests/` reads, writes, or references `agent_key.json`. Every key here is either an RFC
 * vector or generated on the spot.
 */

import { fromHex } from "../src/crypto/bytes.ts";

export interface Ed25519Vector {
  readonly seed: Uint8Array;
  readonly publicKey: Uint8Array;
  readonly message: Uint8Array;
  readonly signature: Uint8Array;
  /** did:key form of `publicKey`, cross-checked against the Python oracle in `verification/`. */
  readonly did: string;
}

const vector = (seed: string, publicKey: string, message: string, signature: string, did: string): Ed25519Vector => ({
  seed: fromHex(seed),
  publicKey: fromHex(publicKey),
  message: fromHex(message),
  signature: fromHex(signature),
  did,
});

/** RFC 8032 §7.1 TEST 1 — empty message. */
export const RFC_VECTOR_1 = vector(
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  "",
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd" +
    "25bf5f0595bbe24655141438e7a100b",
  "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
);

/** RFC 8032 §7.1 TEST 2 — single byte 0x72. */
export const RFC_VECTOR_2 = vector(
  "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
  "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
  "72",
  "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c" +
    "387b2eaeb4302aeeb00d291612bb0c00",
  "did:key:z6MkiaMbhXHNA4eJVCCj8dbzKzTgYDKf6crKgHVHid1F1WCT",
);

/** RFC 8032 §7.1 TEST 3 — two bytes. */
export const RFC_VECTOR_3 = vector(
  "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
  "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
  "af82",
  "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc659" +
    "4a7c15e9716ed28dc027beceea1ec40a",
  "did:key:z6MkwSD8dBdqcXQzKJZQFPy2hh2izzxskndKCjdmC2dBpfME",
);

export const RFC_VECTORS = [RFC_VECTOR_1, RFC_VECTOR_2, RFC_VECTOR_3] as const;

/** A valid-looking DID that is not one of the vectors, for negative tests. */
export const OTHER_DID = RFC_VECTOR_3.did;

export const VALID_SIGNATURE_SHAPE = "A".repeat(86);

/**
 * Malformed DIDs, one per distinct failure mode.
 *
 * Kept as a shared corpus because more than one layer has to reject these: the DID parser, the backup
 * file parser, and the proof file parser all ingest a DID from something a user could have been sent.
 * A `[label, value]` pair rather than a bare list so a failure names the case that slipped through.
 */
export const MALFORMED_DIDS: ReadonlyArray<readonly [string, string]> = [
  ["empty string", ""],
  ["wrong method", "did:web:example.com"],
  ["missing did: scheme", "key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw"],
  ["no multibase prefix", "did:key:6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw"],
  ["wrong multibase prefix (base16 'f')", "did:key:f6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw"],
  ["one character short", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMs"],
  ["one character long", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsww"],
  ["base58 alphabet violation (0)", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMM0w"],
  ["base58 alphabet violation (l)", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMlw"],
  ["base58 alphabet violation (I)", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMIw"],
  ["uppercased whole DID", "DID:KEY:Z6MKTWUPDMLXVVQTZCW4I46R4UGYOSGXRNR3XJN4ZQ7OMMSW"],
  ["trailing whitespace", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw "],
  ["leading whitespace", " did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw"],
  ["embedded newline", "did:key:z6Mktwupdm\nLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMs"],
  ["did:key with a path", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw/x"],
  ["did:key with a fragment", "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw#0"],
  ["prefix only", "did:key:z"],
  ["html injection attempt", "did:key:z<script>alert(1)</script>aaaaaaaaaaaaaaaaaaaaaaaaaa"],
];

/** Flip one bit in a copy of `bytes`. Used to prove a check actually depends on the value. */
export function tamper(bytes: Uint8Array, index = 0): Uint8Array {
  const copy = Uint8Array.from(bytes);
  copy[index] = (copy[index]! ^ 0x01) & 0xff;
  return copy;
}
