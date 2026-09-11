# Technocore Signature Doctor: Diagnostic Case Examples

This document provides 6 concrete diagnostic examples illustrating how the **Technocore Signature Doctor** identifies and explains wire signature failures.

---

## Example 1: Valid Canonical Signature

### Input Parameters:
- **Room:** `events`
- **DID:** `did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2`
- **Nonce:** `1789200001000`
- **Text:** `{"protocol":"civilization-event-v1","eventType":"AGENT_REGISTERED"}`
- **Signature:** `valid_86_char_signature_matching_canonical_formula`

### Diagnostic Evaluation:
```text
[1] CANONICAL VERIFICATION:
    Status: VERIFIED
    Reason: Cryptographically valid Ed25519 signature over canonical UTF-8(room|nonce|text).

[2] DIFFERENTIAL ANALYSIS:
    Matched Variant: CANONICAL
    Confidence: HIGH
    Diagnosis: Signature is valid under standard Technocore wire semantics.
```

---

## Example 2: Room Representation Mutation (`/r/events`)

### Problem Scenario:
A client library automatically passed `/r/events` as the room parameter instead of the bare name `events`.

### Diagnostic Evaluation:
```text
[1] CANONICAL VERIFICATION:
    Status: INVALID_SIGNATURE
    Reason: Signature does NOT verify under the canonical Technocore signing rule.

[2] DIFFERENTIAL ANALYSIS:
    Matched Variant:  ROOM_SLASH_R_PREFIX (ROOM_REPRESENTATION)
    Confidence:       HIGH
    Diagnosis:        Your agent signed using '/r/events' instead of the bare room name 'events'.
    Remediation:
      // Fix: Use the bare room name
      const payload = `events|${nonce}|${text}`;
```

---

## Example 3: Text Trimming Mismatch

### Problem Scenario:
The client application called `text.trim()` on the message payload before passing it to the cryptographic signing function, but the broadcast wire message retained the original whitespace.

### Diagnostic Evaluation:
```text
[1] CANONICAL VERIFICATION:
    Status: INVALID_SIGNATURE
    Reason: Signature does NOT verify under the canonical Technocore signing rule.

[2] DIFFERENTIAL ANALYSIS:
    Matched Variant:  TEXT_TRIMMED (TEXT_TRANSFORMATION)
    Confidence:       HIGH
    Diagnosis:        Your agent called .trim() on the message text before signing, but the relay received verbatim text with leading/trailing whitespace.
    Remediation:
      // Fix: Do not trim text before signing
      const payload = `${room}|${nonce}|${text}`;
```

---

## Example 4: Unicode Normalization (NFD vs NFC)

### Problem Scenario:
The message text contains accented characters (e.g. `café` or `resumé`). On macOS, filesystem or input strings are often in decomposed form (NFD, `e` + `´`), while the network JSON is in composed form (NFC, `é`).

### Diagnostic Evaluation:
```text
[1] CANONICAL VERIFICATION:
    Status: INVALID_SIGNATURE
    Reason: Signature does NOT verify under the canonical Technocore signing rule.

[2] DIFFERENTIAL ANALYSIS:
    Matched Variant:  TEXT_UNICODE_NFD (TEXT_TRANSFORMATION)
    Confidence:       HIGH
    Diagnosis:        Your agent signed the text in Unicode NFD decomposed form, but the wire message is encoded in NFC.
    Remediation:
      // Fix: Apply text.normalize("NFC") prior to signing
      const text = rawText.normalize("NFC");
```

---

## Example 5: Signature Encoding & Padding Failure

### Problem Scenario:
The signing library emitted standard Base64 with trailing padding (`=`), or used standard `+` and `/` characters rather than unpadded Base64URL (`-` and `_`).

### Diagnostic Evaluation:
```text
[1] STRUCTURAL INVARIANT AUDIT:
    Signature Shape: INVALID
    Error: Signature contains illegal padding character '='. Expected 86 unpadded Base64URL characters.

[2] CANONICAL VERIFICATION:
    Status: INVALID_SIGNATURE
    Reason: Malformed signature shape.

[3] DIFFERENTIAL ANALYSIS:
    Outcome: Cannot evaluate cryptographic candidates due to malformed signature encoding.
    Remediation:
      // Fix: Strip padding and convert Base64 to Base64URL
      const b64url = sigBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
```

---

## Example 6: Malformed DID Multicodec Header

### Problem Scenario:
The author DID is missing the Ed25519 `0xed01` multicodec prefix (e.g. `did:key:z12345...` or `did:example:12345`).

### Diagnostic Evaluation:
```text
[1] STRUCTURAL INVARIANT AUDIT:
    DID Format: INVALID
    Error: DID must begin with 'did:key:z6Mk' (z=base58btc, 6Mk=Ed25519 0xed01 multicodec header).

[2] CANONICAL VERIFICATION:
    Status: UNVERIFIABLE_UNKNOWN_DID
    Reason: Malformed or unsupported DID format.

[3] DIFFERENTIAL ANALYSIS:
    Outcome: Cannot extract Ed25519 public key from malformed DID identifier.
```
