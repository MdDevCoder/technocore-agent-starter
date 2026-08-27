# Protocol verification harness

Differential test of the browser implementation against a Python oracle transcribed from
`flop_agent.py`. The oracle uses `cryptography`'s Ed25519 (`from_private_bytes(seed)` is semantically
identical to PyNaCl's `SigningKey(seed)`), so signatures are directly comparable — and because
Ed25519 is deterministic, an identical signature proves the signed payload bytes matched exactly.

    python3 -m pip install cryptography
    node differential.test.mjs   # 117 cases, byte-for-byte vs the CLI
    node negative.test.mjs       # 32 assertions: tamper, malformed input, invariants

`candidate.mjs` is the verified reference for the protocol logic; `src/crypto`, `src/identity` and
`src/technocore` are ported from it. Re-run both files after any change to that logic.

No private key material is written to disk by this harness, and no network calls are made.
