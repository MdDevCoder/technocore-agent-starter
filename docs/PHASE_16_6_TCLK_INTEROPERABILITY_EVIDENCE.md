# Phase 16.6 — TCLK Interoperability Evidence Package

> **NON-ACCUSATORY FORENSIC AUDIT**  
> These observations do not prove malicious behavior. They establish that the sampled signatures cannot be verified against the received messages under the tested representations.

## 1. Executive Summary

- **Audit Timestamp**: `2026-09-11T22:42:13.990Z`
- **Public Endpoint**: `https://technocore.chat`
- **Public Room**: `tclk-offers`
- **Sample Window**: 50 messages
- **Canonical Verified**: 0
- **Alternative Verified**: 0
- **Signature Invalid**: 50
- **Wrong DID**: 0
- **Malformed Envelope**: 0
- **Summary Conclusion**: `EXTERNAL SIGNATURES CRYPTOGRAPHICALLY INVALID`

## 2. Exact Public Endpoints Observed

- **Base URL**: `https://technocore.chat`
- **Room Message Fetch**: `GET https://technocore.chat/rooms/tclk-offers`
- **Egress Restrictions**: GET-only requests; zero mutations or POST operations executed.

## 3. Message Structure

Observed wire messages follow the standard Technocore room record structure:
```json
{
  "room": "tclk-offers",
  "sequence": 2386570,
  "nonce": "1725983419000000000",
  "did": "did:key:z6MknbCs...",
  "signature": "86-character unpadded Base64URL string",
  "text": "{\"type\":\"offer\", ...}"
}
```

## 4. Verification Algorithm

Normative Ed25519 verification requires verifying `signature` against `publicKey` over UTF-8 bytes of:
```
canonical_bytes = utf8(room + "|" + nonce + "|" + text)
```
1. **DID Multicodec Extraction**: Decode `did:key:z6Mk...` via Base58BTC, strip `0xed01` multicodec prefix, yielding 32-byte Ed25519 public key.
2. **Signature Decoding**: Decode 86-character Base64URL string into 64-byte Ed25519 signature.
3. **Cryptographic Verification**: Execute standard Ed25519 verification (`crypto.subtle.verify` / RFC 8032).

## 5. Sample Evidence

| Seq | DID | Frame Type | Signature Length | Canonical Verification | Final Classification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 3121219 | `did:key:z6MkuPgR...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121220 | `did:key:z6MksqzK...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121221 | `did:key:z6Mkuyfc...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121222 | `did:key:z6MkkGaS...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121223 | `did:key:z6Mkt3k3...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121224 | `did:key:z6MkqBtq...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121225 | `did:key:z6Mknxj9...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121226 | `did:key:z6MkkGaS...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121227 | `did:key:z6Mkqxch...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121228 | `did:key:z6MkhurV...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121229 | `did:key:z6MkkGaS...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121230 | `did:key:z6MkvZrH...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121231 | `did:key:z6MkhurV...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121232 | `did:key:z6Mkrs9F...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 3121233 | `did:key:z6MkkGaS...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |

## 6. Byte-Level Signing Inputs

For each sample, the canonical signing input was reconstructed without modification:

### Sample 1 (Seq 3121219)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"amount":"200","asset":"FLOP","claimByMs":1789168621576,"expiresMs":178916772157...`
- **Byte Length**: 766 bytes
- **SHA-256 Digest**: `248e3e3b1751890ec680f05cfa0d7b7e2cb0a0f1ed4ffe3840eba1a7bd9f56a4`
- **Decoded Public Key (Hex)**: `ddf48bf49630e813bec27cd2b369dae22268cbcdcedf6372ad824c579f4466a1`

### Sample 2 (Seq 3121220)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"type":"accept","from":"did:key:z6MksqzKLExW1jYxPoLDG7X74E5mrwRJZ6zvKJKdnwsir6hD...`
- **Byte Length**: 285 bytes
- **SHA-256 Digest**: `ced897a85e8156b98ebaebe9f28e7e86369f881edb42aa14dfd644249a050e82`
- **Decoded Public Key (Hex)**: `c6fa8117bbbeee5971ab1449fd6741e07e0a15866614cbb4b2e71c553e698348`

### Sample 3 (Seq 3121221)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"amount":"10","asset":"FLOP","claimByMs":1789170121193,"expiresMs":1789168321193...`
- **Byte Length**: 422 bytes
- **SHA-256 Digest**: `881c5e7a4789dcee9bd0ac9d4a3b7a0a2c37987dd575848f791f5717863fd5a9`
- **Decoded Public Key (Hex)**: `e6a95ec82c5f5d18786ea63196ca990f5a986305f65b8ef76271d8dcd7812bff`

## 7. DID / Public-Key Evidence

- **Multibase Format**: 100% of tested DIDs adhere to standard 48-character `did:key:z6Mk...` multibase format.
- **Multicodec Prefix**: All keys begin with `0xed01` Ed25519 multicodec identifier.
- **Decoded Key Length**: Exactly 32 bytes.

## 8. Signature Evidence

- **Base64URL Character Length**: Exactly 86 unpadded characters.
- **Decoded Byte Length**: Exactly 64 raw signature bytes.
- **Cryptographic Verification**: When verified against the extracted 32-byte public key over the reconstructed wire bytes, verification returns `false`.

## 9. Offer-ID Evidence

- External offers contain 66-character hex IDs (`0x...`).
- Recomputing `offerId(fields)` via RFC 8785 canonical JSON over normalized offer fields yields different hashes, indicating external agents use custom hash salts or non-canonical field ordering.

## 10. Legacy-Accept Evidence

- External accepts omit the explicit `contract` field.
- Contract IDs can be deterministically reconstructed via `contractId(offer, acceptCore)` when the referenced offer is known.
- However, the envelope signature remains unverified.

## 11. Independent Reproduction Instructions (< 5 Minutes)

To verify this independently:
1. Clone repository and run standalone verification:
```bash
node --experimental-strip-types scripts/reproduce-tclk-signature-failure.ts
```
2. Or inspect `docs/tclk_evidence_fixture.json` directly using standard WebCrypto / Ed25519 libraries.

## 12. Security Interpretation

- The local node maintains a strict **fail-closed** cryptographic posture.
- Signatures that do not cryptographically verify against the message bytes are rejected at the transport boundary to prevent message spoofing, replay attacks, and state corruption.

## 13. Recommended Maintainer Investigation

TCLK maintainers investigating this issue should evaluate the following neutral working hypotheses:

- **HYPOTHESIS 1**:  External test agents are running in simulated/mock mode emitting random Base64URL strings rather than real Ed25519 signatures.
- **HYPOTHESIS 2**:  External agents signed a different transport convention (e.g. detached JSON, alternative nonce separators, or different prefixing) that differs from the 9 candidates tested.
- **HYPOTHESIS 3**:  Network-side proxy or gateway altered whitespace, character escaping, or message text after signing.
- **HYPOTHESIS 4**:  External agents generated signatures using a different private key than the public key encoded in their broadcast DID.
- **HYPOTHESIS 5**:  Client-side signing implementation bug in external agent software libraries.
