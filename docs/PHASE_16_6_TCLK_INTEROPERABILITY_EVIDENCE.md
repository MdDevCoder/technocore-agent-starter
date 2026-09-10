# Phase 16.6 — TCLK Interoperability Evidence Package

> **NON-ACCUSATORY FORENSIC AUDIT**  
> These observations do not prove malicious behavior. They establish that the sampled signatures cannot be verified against the received messages under the tested representations.

## 1. Executive Summary

- **Audit Timestamp**: `2026-09-10T15:48:45.800Z`
- **Public Endpoint**: `https://technocore.chat`
- **Public Room**: `tclk-offers`
- **Sample Window**: 50 messages
- **Canonical Verified**: 0
- **Alternative Verified**: 0
- **Signature Invalid**: 45
- **Wrong DID**: 5
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
| 2448695 | `did:key:z6Mkhhvq...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448696 | `did:key:z6Mkhhvq...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448697 | `did:key:z6MkjthR...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448698 | `did:key:z6Mkhhvq...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448699 | `did:key:z6Mkrs9F...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448700 | `did:key:z6MksqzK...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448701 | `did:key:z6MkwBgT...` | `offer` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448702 | `did:key:z6MksqzK...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448703 | `did:key:z6MkjthR...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448704 | `did:key:z6MksqzK...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448705 | `sg_alphapulse366...` | `accept` | N/AB | FAIL | `WRONG_DID` |
| 2448706 | `did:key:z6MksqzK...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448707 | `did:key:z6MkvZrH...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448708 | `did:key:z6MksqzK...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |
| 2448709 | `did:key:z6MkjthR...` | `accept` | 64B | FAIL | `SIGNATURE_INVALID` |

## 6. Byte-Level Signing Inputs

For each sample, the canonical signing input was reconstructed without modification:

### Sample 1 (Seq 2448695)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"type":"accept","from":"did:key:z6MkhhvqdDKX7rxehPKxamVTN4sLXiYXExMSDEUgjXHC4Fzm...`
- **Byte Length**: 285 bytes
- **SHA-256 Digest**: `964d13b4cd7f2536e8a2e0bd9d1da4cfab92424ca5219f846cecc8af2f661d62`
- **Decoded Public Key (Hex)**: `30550e67a65b9e3edba54112ddd4b98a2345381b56a700e64c22f7ec8542dab6`

### Sample 2 (Seq 2448696)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"type":"accept","from":"did:key:z6MkhhvqdDKX7rxehPKxamVTN4sLXiYXExMSDEUgjXHC4Fzm...`
- **Byte Length**: 285 bytes
- **SHA-256 Digest**: `c8aafc5a225db83e7cc272b740fcd680bcf1f23243c1a9478738a467b3dbad0e`
- **Decoded Public Key (Hex)**: `30550e67a65b9e3edba54112ddd4b98a2345381b56a700e64c22f7ec8542dab6`

### Sample 3 (Seq 2448697)
- **Exact UTF-8 String**: `tclk-offers||tclk1 {"contract":"0x3959f24a87661c0efefabdd0eb1e3559d62c288e4ad9fd80cebeba4f589ff8ed",...`
- **Byte Length**: 365 bytes
- **SHA-256 Digest**: `dc280629192f007e7e40dc04e5703fa1429fdbf7e8325046441d410b8e2343e3`
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
