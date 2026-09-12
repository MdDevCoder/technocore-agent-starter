/**
 * Built-in Trace Studio Presets & Historical Fixtures.
 *
 * Explicitly separates:
 * 1. LOCAL FIXTURES (simulated, synthetic, or test-vector transcripts)
 * 2. PUBLIC NETWORK OBSERVATIONS (retained records from public Technocore rooms)
 */

import type { RawTraceRecord, TraceSource } from "./types.ts";

export interface TracePreset {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly source: TraceSource;
  readonly badge: string;
  readonly defaultRoom: string;
  readonly records: readonly RawTraceRecord[];
}

/**
 * 1. Clean Bilateral TCLK Lifecycle (4-step deal settlement)
 */
export const FIXTURE_TCLK_LIFECYCLE: TracePreset = {
  id: "tclk-clean-lifecycle",
  name: "Bilateral TCLK Lifecycle (4-Step Settlement)",
  summary: "A canonical 4-step bilateral contract from OFFER to ACCEPT, LOCK, and successful REVEAL claim.",
  source: "LOCAL_FIXTURE",
  badge: "Canonical TCLK Flow",
  defaultRoom: "tclk-offers",
  records: [
    {
      room: "tclk-offers",
      sequence: 101,
      serverTimestamp: "2026-09-12T10:00:00.000Z",
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789200001000",
      sig: "4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m",
      text: JSON.stringify({
        type: "offer",
        from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        role: "payer",
        amount: "500",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper", "flop-htlc"],
        expiresMs: 1789203600000,
        claimByMs: 1789207200000,
        refundAfterMs: 1789210800000,
        nonce: "0102030405060708090a0b0c0d0e0f10",
        id: "0x0e59221032b0fb4ad0bd8300322c726f46b5dec5103a75ac02df05c4c9116079",
      }),
    },
    {
      room: "tclk-offers",
      sequence: 102,
      serverTimestamp: "2026-09-12T10:02:15.000Z",
      authorDid: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
      nonce: "1789200135000",
      sig: "9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA",
      text: JSON.stringify({
        type: "accept",
        from: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
        ref: "0x0e59221032b0fb4ad0bd8300322c726f46b5dec5103a75ac02df05c4c9116079",
        statement: "0x9ab73b356878da6eab5cc0b4bde703447add3dd90fc8b5537ba8beffcbc86d22",
        nonce: "11223344556677889900aabbccddeeff",
        contract: "0xf1f01a0a3ce6494dc29e10b2d870d4792148fb80af777cb8707cb2da21b859b8",
      }),
    },
    {
      room: "tclk-offers",
      sequence: 103,
      serverTimestamp: "2026-09-12T10:05:00.000Z",
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789200300000",
      sig: "3fG5hJ7kL9m4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE",
      text: JSON.stringify({
        type: "lock",
        from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        contract: "0xf1f01a0a3ce6494dc29e10b2d870d4792148fb80af777cb8707cb2da21b859b8",
        rail: "paper",
        ref: "paper-escrow-ref-001",
      }),
    },
    {
      room: "tclk-offers",
      sequence: 104,
      serverTimestamp: "2026-09-12T10:08:42.000Z",
      authorDid: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
      nonce: "1789200522000",
      sig: "6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m4L6sJvhM73F4e",
      text: JSON.stringify({
        type: "reveal",
        from: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
        contract: "0xf1f01a0a3ce6494dc29e10b2d870d4792148fb80af777cb8707cb2da21b859b8",
        secret: "0x9b2ff818dcf5ca732e50ba828a2c5cd735a7fb3ca64cbc3abf3a296cdcc2b7df",
      }),
    },
  ],
};

/**
 * 2. Anomaly: Tampered Signature & Unknown Contract Ref
 */
export const FIXTURE_TAMPERED_SIGNATURE: TracePreset = {
  id: "anomaly-tampered-sig",
  name: "Anomaly: Tampered Signature & Unknown Ref",
  summary: "Demonstrates signature verification failure, corrupted wire bytes, and invalid contract references.",
  source: "LOCAL_FIXTURE",
  badge: "Signature Diagnostics",
  defaultRoom: "tclk-offers",
  records: [
    {
      room: "tclk-offers",
      sequence: 201,
      serverTimestamp: "2026-09-12T11:00:00.000Z",
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789203600000",
      sig: "4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m",
      text: JSON.stringify({
        type: "offer",
        from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        id: "0xdeadbeef111122223333444455556666777788889999aaaabbbbccccddddeeee",
      }),
    },
    {
      room: "tclk-offers",
      sequence: 202,
      serverTimestamp: "2026-09-12T11:01:30.000Z",
      authorDid: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
      nonce: "1789203690000",
      // Tampered/Corrupted signature (invalid byte sequence)
      sig: "INVALID_CORRUPTED_SIGNATURE_TAMPERED_BITS_1234567890abcdefghijklmnopqrstuvwxyz12345678901234",
      text: JSON.stringify({
        type: "accept",
        from: "did:key:z6MkwS8Y62y9P4tN7eF5vK3rM1pQ9sT2vW4xY6zA8bCdE1fG",
        ref: "0x9999999999999999999999999999999999999999999999999999999999999999", // Unknown Offer Ref
        statement: "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000",
        contract: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdef",
      }),
    },
  ],
};

/**
 * 3. Anomaly: Sequence Gaps, Duplicates & Ordering Inversions
 */
export const FIXTURE_SEQUENCE_GAP_DUPLICATE: TracePreset = {
  id: "anomaly-sequence-gaps",
  name: "Anomaly: Sequence Gaps & Duplicate Replay",
  summary: "Simulates dropped packet sequence gaps (e.g. 501 -> 504) and duplicate sequence replay attacks.",
  source: "LOCAL_FIXTURE",
  badge: "Transport & Stream Forensics",
  defaultRoom: "events",
  records: [
    {
      room: "events",
      sequence: 501,
      serverTimestamp: "2026-09-12T12:00:00.000Z",
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789207200000",
      sig: "4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m",
      text: '{"action":"checkpoint","seq":501,"status":"HEALTHY"}',
    },
    // Missing sequence 502 and 503 (Sequence Gap!)
    {
      room: "events",
      sequence: 504,
      serverTimestamp: "2026-09-12T12:02:00.000Z",
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789207320000",
      sig: "9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA",
      text: '{"action":"checkpoint","seq":504,"status":"HEALTHY"}',
    },
    // Duplicate sequence 504 with identical sequence (Duplicate Event!)
    {
      room: "events",
      sequence: 504,
      serverTimestamp: "2026-09-12T12:02:01.000Z",
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789207321000",
      sig: "9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA",
      text: '{"action":"checkpoint","seq":504,"status":"REPLAY_ATTEMPT"}',
    },
  ],
};

/**
 * 4. Anomaly: Deadline Violation & Premature Refund
 */
export const FIXTURE_DEADLINE_VIOLATION: TracePreset = {
  id: "anomaly-deadline-violation",
  name: "Anomaly: Premature Refund & Timelock Violation",
  summary: "Attempts to issue a REFUND frame before the timelock expiration timestamp has elapsed.",
  source: "LOCAL_FIXTURE",
  badge: "Timelock Invariants",
  defaultRoom: "tclk-offers",
  records: [
    {
      room: "tclk-offers",
      sequence: 301,
      serverTimestamp: "2026-09-12T13:00:00.000Z",
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789304400000",
      sig: "4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE3fG5hJ7kL9m",
      text: JSON.stringify({
        type: "offer",
        from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        role: "payer",
        amount: "250",
        asset: "FLOP",
        lock: "hash",
        refundAfterMs: 1789308000000, // 2026-09-12T14:00:00.000Z (1 hour after offer)
        id: "0x3333444455556666777788889999000011112222333344445555666677778888",
      }),
    },
    {
      room: "tclk-offers",
      sequence: 302,
      serverTimestamp: "2026-09-12T13:01:00.000Z", // Timestamp is 13:01 UTC (BEFORE refundAfterMs at 14:00 UTC)
      authorDid: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
      nonce: "1789304460000",
      sig: "3fG5hJ7kL9m4L6sJvhM73F4e6r8MkdQ8nUqWz2fK1jN3vT5xY7zA9bCdE2fG4hJ6kL8mN0pQ2sT4vW6xY8zA1bCdE",
      text: JSON.stringify({
        type: "refund",
        from: "did:key:z6Mknk2F66H4gnoxgaRWBqpkQBaPArwTeV6i7N5FCacGg9W2",
        contract: "0x3333444455556666777788889999000011112222333344445555666677778888",
      }),
    },
  ],
};

export const PUBLIC_ROOMS = [
  "events",
  "general",
  "lobby",
  "technocore",
  "tclk-offers",
  "market",
  "civilization",
  "meta",
] as const;

export type PublicRoomName = (typeof PUBLIC_ROOMS)[number];

/**
 * 5. Live Public Network Stream (Runtime Fetching)
 * Records are NOT hardcoded; fetched from Technocore public endpoints at runtime.
 */
export const LIVE_PUBLIC_NETWORK_PRESET: TracePreset = {
  id: "live-public-network",
  name: "Live Public Network Stream (Retained Window)",
  summary: "Authentic room records fetched live from Technocore public network endpoints at runtime.",
  source: "PUBLIC_NETWORK",
  badge: "Runtime Network Data",
  defaultRoom: "events",
  records: [],
};

export const TRACE_PRESETS: readonly TracePreset[] = [
  LIVE_PUBLIC_NETWORK_PRESET,
  FIXTURE_TCLK_LIFECYCLE,
  FIXTURE_TAMPERED_SIGNATURE,
  FIXTURE_SEQUENCE_GAP_DUPLICATE,
  FIXTURE_DEADLINE_VIOLATION,
] as const;

export function getPresetById(id: string): TracePreset {
  const found = TRACE_PRESETS.find((p) => p.id === id);
  return found || TRACE_PRESETS[0]!;
}
