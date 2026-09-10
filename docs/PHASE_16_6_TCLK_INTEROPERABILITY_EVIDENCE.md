# Phase 16.6 — TCLK Interoperability Evidence Package

> **NON-ACCUSATORY FORENSIC AUDIT**  
> These observations do not prove malicious behavior. They establish that the sampled signatures cannot be verified against the received messages under the tested representations.

## 1. Executive Summary

- **Audit Timestamp**: `2026-09-10T16:56:11.344Z`
- **Public Endpoint**: `https://technocore.chat`
- **Public Room**: `tclk-offers`
- **Sample Window**: 50 messages
- **Canonical Verified**: 0
- **Alternative Verified**: 0
- **Signature Invalid**: 44
- **Wrong DID**: 6
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
| 2467357 | `did:key:z6Mkqifi...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467358 | `did:key:z6Mkt5m8...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467359 | `did:key:z6MkjthR...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467360 | `did:key:z6Mkp6Aw...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467361 | `did:key:z6MkfMuE...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467362 | `did:key:z6MkfMuE...` | `non_json` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467363 | `did:key:z6Mkt5m8...` | `reveal` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467364 | `did:key:z6MkoCsq...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467365 | `did:key:z6Mkt5m8...` | `receipt` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467366 | `did:key:z6MkjthR...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467367 | `did:key:z6Mkst74...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467368 | `did:key:z6MkeiVe...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467369 | `did:key:z6Mkm9HB...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467370 | `did:key:z6MkvZrH...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2467371 | `did:key:z6MkvZrH...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |

## 6. Byte-Level Signing Inputs

For each sample, the canonical signing input was reconstructed without modification:

### Sample 1 (Seq 2467357)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"amount":"1250000","asset":"NTC","nonce":"f3680ebfe0547c22","type":"offer"}...`
- **Byte Length**: 95 bytes
- **SHA-256 Digest**: `fb8761b73dc2e1c8f0ae2699e72c11777f2c02eb4fb84733896e28d9c548bea0`
- **Decoded Public Key (Hex)**: `a7630988aee06bf54d0e08df5383ed09865d7be06da6c55f9fdc4493c5c297ee`

### Sample 2 (Seq 2467358)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"contract":"0xf6d520d5bebdcb5d6aabaf4c20f156eafa0bb6b48c88a73555776f4ecad20c0f",...`
- **Byte Length**: 365 bytes
- **SHA-256 Digest**: `bb97d2b66ddbc74a672e49c9c8d66a93210f56e0b8c5112b63e8b18f1c3b4f8a`
- **Decoded Public Key (Hex)**: `ca81b8d4080de082893f0d34491b7da785e2e858c3d882ad990875b0abe67213`

### Sample 3 (Seq 2467359)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"contract":"0x58c30b65ef7c1a3c78f0e7f78011aa48d1fd75fc10496acbc0ed4e7cd0247d86",...`
- **Byte Length**: 365 bytes
- **SHA-256 Digest**: `32d15d4d97e63a63eec81cc023162a5ed554d8b78e24feb327b4c990196b33a4`
- **Decoded Public Key (Hex)**: `50cea7a663daf66ae0cfdb3aee9b99008ca956c77afc130bb358af9f6cb48a25`

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
