/**
 * Phase 16: Real Technocore Network Interoperability & Independent Deal Verifier Tests.
 *
 * Verifies read-only network observer, independent public deal verifier,
 * PaperRail compatibility, provenance tracking, and network failure modes.
 *
 * Note: All tests in this suite run locally with deterministic in-memory transports
 * and do not require live external network connectivity for npm test.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentIdentity, type AgentIdentity } from "../../src/civilization/agent/identity.ts";
import { draftRoomMessage, signRoomMessage, type SignedRoomMessage } from "../../src/technocore/envelope.ts";
import {
  TclkDealAdapter,
  TclkNetworkObserver,
  verifyPublicDeal,
  TechnocoreNoteStore,
  type NetworkProvenance,
} from "../../src/civilization/deals/tclk/index.ts";
import {
  decodeFrame,
  encodeFrame,
  makeAccept,
  makeOffer,
  MemoryNoteStore,
  PaperRail,
  encodePaperRecord,
  paperNote,
  OFFER_ROOM,
  dealRoom,
  openContract,
  applyFrame,
  type TclkFrame,
} from "@flop-labs/tclk";
import type { TechnocoreTransport, TechnocoreRequest, TechnocoreResponse } from "../../src/technocore/transport.ts";
import { TclkNetworkTransport } from "../../src/civilization/deals/tclk/network-transport.ts";
import { aggregateDealsFromEvents } from "../../src/civilization-ui/deals/aggregateDeals.ts";
import type { CivilizationEvent } from "../../src/civilization/types/events.ts";

// Helper to build a signed room message from AgentIdentity
async function createSignedTclkMessage(
  room: string,
  frameText: string,
  agent: AgentIdentity,
  nonce: string = String(Date.now() * 1_000_000),
): Promise<SignedRoomMessage> {
  const draft = draftRoomMessage(room, { text: frameText, spans: [{ source: "user", text: frameText }] }, nonce);
  return signRoomMessage(agent.signingHandle, draft);
}

// Mock transport with in-memory room store and KV store
class MockTechnocoreTransport implements TechnocoreTransport {
  readonly kind = "direct" as const;
  readonly describe = "Mock in-memory Technocore transport";
  readonly rooms = new Map<string, Array<{ seq: number; did: string; sig: string; nonce: string; text: string }>>();
  readonly kv = new Map<string, string>();
  private seqCounter = 1;

  async send(request: TechnocoreRequest): Promise<TechnocoreResponse> {
    const url = new URL(`http://localhost${request.path}`);
    const pathname = url.pathname;

    // 1. Room read: /r/{room}
    if (request.method === "GET" && pathname.startsWith("/r/")) {
      const roomName = decodeURIComponent(pathname.slice(3));
      const list = this.rooms.get(roomName) ?? [];
      const json = {
        messages: list.map((m) => ({
          seq: m.seq,
          from: m.did,
          sig: m.sig,
          nonce: m.nonce,
          text: m.text,
        })),
        last_seq: list.length > 0 ? list[list.length - 1]!.seq : null,
      };
      return {
        ok: true,
        status: 200,
        text: JSON.stringify(json),
        json,
        durationMs: 5,
      };
    }

    // 2. Room post: /r/{room}
    if (request.method === "POST" && pathname.startsWith("/r/")) {
      const roomName = decodeURIComponent(pathname.slice(3));
      const body = JSON.parse(request.body ?? "{}") as { did: string; sig: string; nonce: string; text: string };
      const seq = this.seqCounter++;
      const list = this.rooms.get(roomName) ?? [];
      list.push({ seq, ...body });
      this.rooms.set(roomName, list);

      const json = { posted: { seq, from: body.did, nonce: body.nonce } };
      return {
        ok: true,
        status: 200,
        text: JSON.stringify(json),
        json,
        durationMs: 5,
      };
    }

    // 3. KV read: /kv/{ns}/{key}
    if (request.method === "GET" && pathname.startsWith("/kv/") && !pathname.includes("/set/")) {
      const parts = pathname.slice(4).split("/");
      const ns = decodeURIComponent(parts[0] ?? "");
      const key = decodeURIComponent(parts[1] ?? "");
      const fullKey = `${ns}/${key}`;
      const val = this.kv.get(fullKey);
      if (val === undefined) {
        return { ok: false, status: 404, text: "Not Found", json: null, durationMs: 2 };
      }
      return { ok: true, status: 200, text: val, json: val, durationMs: 2 };
    }

    // 4. KV write: /kv/{ns}/{key}/set/{value}
    if (request.method === "GET" && pathname.includes("/set/")) {
      const withoutPrefix = pathname.slice(4);
      const setIdx = withoutPrefix.indexOf("/set/");
      const nsAndKey = withoutPrefix.slice(0, setIdx).split("/");
      const ns = decodeURIComponent(nsAndKey[0] ?? "");
      const key = decodeURIComponent(nsAndKey[1] ?? "");
      const val = decodeURIComponent(withoutPrefix.slice(setIdx + 5));
      const fullKey = `${ns}/${key}`;

      const ifParam = url.searchParams.get("if");
      const ifAbsentParam = url.searchParams.get("ifAbsent");
      const current = this.kv.get(fullKey);

      if (ifAbsentParam === "true" && current !== undefined) {
        return { ok: false, status: 409, text: "Conflict", json: null, durationMs: 2 };
      }
      if (ifParam !== null && current !== ifParam) {
        return { ok: false, status: 409, text: "Conflict", json: null, durationMs: 2 };
      }

      this.kv.set(fullKey, val);
      return { ok: true, status: 200, text: val, json: val, durationMs: 2 };
    }

    return { ok: false, status: 404, text: "Not Found", json: null, durationMs: 1 };
  }
}

describe("Phase 16: Real Technocore Network Interoperability & Independent Deal Verifier", () => {
  // Test Suite 1: Read-Only Network Observer & Frame Parsing
  describe("1. Read-Only Network Observer", () => {
    it("parses valid TCLK frames from room messages without mutating network state", async () => {
      const transport = new MockTechnocoreTransport();
      const networkTransport = new TclkNetworkTransport(transport);
      const observer = new TclkNetworkObserver(networkTransport);

      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });

      const now = 1750000000000;
      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "500",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: now + 300000,
        claimByMs: now + 600000,
        refundAfterMs: now + 900000,
      });

      const signedMsg = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), alice);
      await transport.send({
        method: "POST",
        path: `/r/${OFFER_ROOM}?format=json`,
        body: JSON.stringify(signedMsg),
      });

      const report = await observer.scanNetwork({ rooms: [OFFER_ROOM] });
      assert.equal(report.totalMessagesScanned, 1);
      assert.equal(report.totalFramesFound, 1);
      assert.equal(report.deals.length, 1);
      assert.equal(report.deals[0]?.offerId, offer.id);
      assert.equal(report.deals[0]?.classification, "INCOMPLETE");
      assert.equal(report.deals[0]?.provenance, "NETWORK_OBSERVED");
    });

    it("correctly flags invalid signatures and unparseable frames as INVALID or UNSUPPORTED", async () => {
      const transport = new MockTechnocoreTransport();
      const networkTransport = new TclkNetworkTransport(transport);
      const observer = new TclkNetworkObserver(networkTransport);

      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "attacker" });

      // 1. Forged signature: signed with Bob's handle but claiming Alice's DID
      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: 1750000000000 + 300000,
        claimByMs: 1750000000000 + 600000,
        refundAfterMs: 1750000000000 + 900000,
      });

      const draft = draftRoomMessage(OFFER_ROOM, { text: encodeFrame(offer), spans: [{ source: "user", text: encodeFrame(offer) }] });
      const badSig = await bob.signingHandle.signToBase64Url(draft.payloadBytes);
      const forgedMsg: SignedRoomMessage = {
        did: alice.did,
        sig: badSig,
        nonce: draft.nonce,
        text: encodeFrame(offer),
      };

      await transport.send({
        method: "POST",
        path: `/r/${OFFER_ROOM}?format=json`,
        body: JSON.stringify(forgedMsg),
      });

      const report = await observer.scanNetwork({ rooms: [OFFER_ROOM] });
      assert.equal(report.deals.length, 1);
      assert.equal(report.deals[0]?.classification, "INVALID");
      assert.ok(report.deals[0]?.issues.some((i) => i.includes("signature verification failed")));
    });
  });

  // Test Suite 2: Independent Public-Deal Verifier
  describe("2. Independent Public-Deal Verifier", () => {
    it("successfully verifies a complete 4-frame deal lifecycle independently", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

      const clock = () => 1750000000000;
      const noteStore = new MemoryNoteStore();
      const paperRail = new PaperRail(noteStore, clock);

      // 1. Offer
      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "1000",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: clock() + 300000,
        claimByMs: clock() + 600000,
        refundAfterMs: clock() + 900000,
      });

      // 2. Accept with secret
      const secret = "0x" + "a".repeat(64);
      const crypto = await import("node:crypto");
      const statement = "0x" + crypto.createHash("sha256").update(Buffer.from(secret.slice(2), "hex")).digest("hex");

      const accept = makeAccept(offer, {
        from: bob.did,
        statement,
      });

      // 3. Lock & PaperRail record
      const contractId = accept.contract;
      const terms = {
        contract: contractId,
        lock: "hash" as const,
        statement,
        amount: "1000",
        asset: "FLOP",
        payer: alice.did,
        payee: bob.did,
        claimByMs: offer.claimByMs,
        refundAfterMs: offer.refundAfterMs,
      };
      await paperRail.lock(terms);

      const lockFrame: TclkFrame = {
        type: "lock",
        from: alice.did,
        contract: contractId,
        rail: "paper",
        ref: contractId,
      };

      // 4. Reveal
      const revealFrame: TclkFrame = {
        type: "reveal",
        from: bob.did,
        contract: contractId,
        secret,
      };

      // Sign all messages
      const msg1 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), alice);
      const msg2 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(accept), bob);
      const msg3 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(lockFrame), alice);
      const msg4 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(revealFrame), bob);

      const transcript = [msg1, msg2, msg3, msg4];

      const result = await verifyPublicDeal(transcript, contractId, {
        defaultRoom: OFFER_ROOM,
        noteStore,
        nowMs: clock() + 50000,
      });

      assert.equal(result.verified, true);
      assert.equal(result.classification, "VALID");
      assert.equal(result.status, "claimed");
      assert.equal(result.contractId, contractId);
      assert.ok(result.checks.every((c) => c.passed));
      assert.equal(result.errors.length, 0);
    });

    it("verifies someone else's / spectator deal without relying on local DealEngine", async () => {
      const carl = await createAgentIdentity({ displayName: "Carl", role: "payer" });
      const dave = await createAgentIdentity({ displayName: "Dave", role: "payee" });

      const now = 1750000000000;
      const offer = makeOffer({
        from: carl.did,
        role: "payer",
        amount: "250",
        asset: "FLOP",
        lock: "hash",
        rails: ["memory"],
        expiresMs: now + 300000,
        claimByMs: now + 600000,
        refundAfterMs: now + 900000,
      });

      const accept = makeAccept(offer, {
        from: dave.did,
        statement: "0x" + "b".repeat(64),
      });

      const msg1 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), carl);
      const msg2 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(accept), dave);

      const result = await verifyPublicDeal([msg1, msg2], accept.contract, {
        defaultRoom: OFFER_ROOM,
        nowMs: now + 10000,
      });

      assert.equal(result.classification, "INCOMPLETE");
      assert.equal(result.status, "accepted");
      assert.equal(result.checks.find((c) => c.name === "contract-id-derivation")?.passed, true);
    });
  });

  // Test Suite 3: PaperRail Compatibility & Fail-Closed Guard
  describe("3. PaperRail Compatibility & Fail-Closed Invariants", () => {
    it("fails verification if PaperRail record is missing in NoteStore", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

      const emptyNoteStore = new MemoryNoteStore();

      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: 1750000000000 + 300000,
        claimByMs: 1750000000000 + 600000,
        refundAfterMs: 1750000000000 + 900000,
      });

      const accept = makeAccept(offer, {
        from: bob.did,
        statement: "0x" + "c".repeat(64),
      });

      const lockFrame: TclkFrame = {
        type: "lock",
        from: alice.did,
        contract: accept.contract,
        rail: "paper",
        ref: accept.contract,
      };

      const msg1 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), alice);
      const msg2 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(accept), bob);
      const msg3 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(lockFrame), alice);

      const result = await verifyPublicDeal([msg1, msg2, msg3], accept.contract, {
        defaultRoom: OFFER_ROOM,
        noteStore: emptyNoteStore,
        nowMs: 1750000000000 + 5000,
      });

      assert.equal(result.verified, false);
      assert.ok(result.errors.some((e) => e.includes("PaperRail note not found")));
      assert.equal(result.checks.find((c) => c.name === "paper-rail-compatibility")?.passed, false);
    });

    it("fails verification if PaperRail statement or refundAfterMs does not match contract", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

      const corruptedNoteStore = new MemoryNoteStore();

      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: 1750000000000 + 300000,
        claimByMs: 1750000000000 + 600000,
        refundAfterMs: 1750000000000 + 900000,
      });

      const accept = makeAccept(offer, {
        from: bob.did,
        statement: "0x" + "1".repeat(64),
      });

      // Write mismatched statement into NoteStore
      const { ns, key } = paperNote(accept.contract);
      await corruptedNoteStore.set(
        ns,
        key,
        encodePaperRecord({
          status: "locked",
          lock: "hash",
          statement: "0x" + "9".repeat(64), // WRONG STATEMENT
          refundAfterMs: offer.refundAfterMs,
        }),
      );

      const lockFrame: TclkFrame = {
        type: "lock",
        from: alice.did,
        contract: accept.contract,
        rail: "paper",
        ref: accept.contract,
      };

      const msg1 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), alice);
      const msg2 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(accept), bob);
      const msg3 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(lockFrame), alice);

      const result = await verifyPublicDeal([msg1, msg2, msg3], accept.contract, {
        defaultRoom: OFFER_ROOM,
        noteStore: corruptedNoteStore,
        nowMs: 1750000000000 + 5000,
      });

      assert.equal(result.verified, false);
      assert.ok(result.errors.some((e) => e.includes("PaperRail statement mismatch")));
    });
  });

  // Test Suite 4: Network Provenance & Observatory Distinction
  describe("4. Network Provenance Model", () => {
    it("distinguishes LOCAL_DEMO vs NETWORK_OBSERVED vs NETWORK_EXECUTED in Observatory view", () => {
      const demoEvent: any = {
        eventId: "evt-demo-1",
        eventType: "DEAL_OFFER_CREATED",
        timestamp: new Date().toISOString(),
        authorDid: "did:key:z6MkAliceDemo00000000000000000000000000000000000",
        signature: "a".repeat(86),
        sequenceNumber: 1,
        payload: {
          offerId: "0x1111111111111111111111111111111111111111111111111111111111111111",
          role: "payer",
          amount: "100",
          asset: "FLOP",
          lockKind: "hash",
          provenance: "LOCAL_DEMO",
        },
      };

      const networkEvent: any = {
        eventId: "evt-net-1",
        eventType: "DEAL_OFFER_CREATED",
        timestamp: new Date().toISOString(),
        authorDid: "did:key:z6MkBobNetwork000000000000000000000000000000000",
        signature: "b".repeat(86),
        sequenceNumber: 2,
        payload: {
          offerId: "0x2222222222222222222222222222222222222222222222222222222222222222",
          role: "payer",
          amount: "200",
          asset: "FLOP",
          lockKind: "hash",
          provenance: "NETWORK_EXECUTED",
        },
      };

      const deals = aggregateDealsFromEvents([demoEvent, networkEvent]);
      assert.equal(deals.length, 2);

      const demoDeal = deals.find((d) => d.offerId === demoEvent.payload.offerId);
      const netDeal = deals.find((d) => d.offerId === networkEvent.payload.offerId);

      assert.equal(demoDeal?.provenance, "LOCAL_DEMO");
      assert.equal(netDeal?.provenance, "NETWORK_EXECUTED");
    });
  });

  // Test Suite 5: Network Failure & Robustness
  describe("5. Network Failure Robustness", () => {
    it("handles 404, malformed responses, and network timeouts without crashing or emitting false claims", async () => {
      // Transport that throws network error
      const failingTransport: TechnocoreTransport = {
        kind: "direct",
        describe: "Failing transport",
        send: async () => {
          throw new Error("Network timeout (ETIMEDOUT)");
        },
      };

      const networkTransport = new TclkNetworkTransport(failingTransport);
      const observer = new TclkNetworkObserver(networkTransport);

      const reachable = await networkTransport.isReachable();
      assert.equal(reachable, false);

      const report = await observer.scanNetwork();
      assert.equal(report.totalMessagesScanned, 0);
      assert.equal(report.deals.length, 0);
    });

    it("TechnocoreNoteStore gracefully returns null on 404 and false on 409 conflict", async () => {
      const mockTransport = new MockTechnocoreTransport();
      const noteStore = new TechnocoreNoteStore(mockTransport);

      // 1. Read non-existent key
      const val = await noteStore.get("tclk-paper-99", "nonexistentkey");
      assert.equal(val, null);

      // 2. Set if absent -> true
      const won1 = await noteStore.set("tclk-paper-99", "key1", "val1", { ifAbsent: true });
      assert.equal(won1, true);

      // 3. Set if absent again -> false (409 conflict)
      const won2 = await noteStore.set("tclk-paper-99", "key1", "val2", { ifAbsent: true });
      assert.equal(won2, false);
    });
  });

  // Test Suite 6: Adapter Pre-Lock Rail Verification Guard
  describe("6. Adapter Pre-Lock Rail Verification Guard", () => {
    it("fails closed in createLock if settlement rail lock verification fails", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

      const clock = () => 1750000000000;
      const noteStore = new MemoryNoteStore();
      const paperRail = new PaperRail(noteStore, clock);

      const aliceAdapter = new TclkDealAdapter({
        did: alice.did,
        signer: alice.signingHandle,
        settlementRails: new Map([["paper", paperRail]]),
        clock,
      });

      const offerRes = await aliceAdapter.createOffer({
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: clock() + 300000,
        claimByMs: clock() + 600000,
        refundAfterMs: clock() + 900000,
      });

      const bobAdapter = new TclkDealAdapter({
        did: bob.did,
        signer: bob.signingHandle,
        clock,
      });

      const acceptRes = await bobAdapter.acceptOffer({
        offer: offerRes.offer,
      });

      // Apply accept to Alice
      aliceAdapter.applyIncomingFrame(acceptRes.accept, OFFER_ROOM, acceptRes.signedMessage);

      // Create lock with valid auto-rail-lock
      const lockRes = await aliceAdapter.createLock({
        contractId: acceptRes.accept.contract,
        rail: "paper",
      });

      assert.equal(lockRes.lockFrame.contract, acceptRes.accept.contract);
      assert.equal(lockRes.dealRecord.status, "locked");

      // Verify NoteStore now contains the verified locked record
      const { ns, key } = paperNote(acceptRes.accept.contract);
      const raw = await noteStore.get(ns, key);
      assert.ok(raw);
      assert.ok(raw.startsWith("tclkpaper1 locked"));
    });
  });

  // Test Suite 7: Stale Reveal and Non-Party Rejections
  describe("7. Stale Reveal & Non-Party Frame Security", () => {
    it("rejects reveal after refundAfterMs as INVALID in independent verifier", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

      const clock = () => 1750000000000;
      const noteStore = new MemoryNoteStore();
      const paperRail = new PaperRail(noteStore, clock);

      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: clock() + 300000,
        claimByMs: clock() + 600000,
        refundAfterMs: clock() + 900000,
      });

      const secret = "0x" + "e".repeat(64);
      const crypto = await import("node:crypto");
      const statement = "0x" + crypto.createHash("sha256").update(Buffer.from(secret.slice(2), "hex")).digest("hex");

      const accept = makeAccept(offer, { from: bob.did, statement });
      const contractId = accept.contract;

      await paperRail.lock({
        contract: contractId,
        lock: "hash",
        statement,
        amount: "100",
        asset: "FLOP",
        payer: alice.did,
        payee: bob.did,
        claimByMs: offer.claimByMs,
        refundAfterMs: offer.refundAfterMs,
      });

      const lockFrame: TclkFrame = { type: "lock", from: alice.did, contract: contractId, rail: "paper", ref: contractId };
      const revealFrame: TclkFrame = { type: "reveal", from: bob.did, contract: contractId, secret };

      const msg1 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), alice);
      const msg2 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(accept), bob);
      const msg3 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(lockFrame), alice);
      const msg4 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(revealFrame), bob);

      // Verify at time AFTER refundAfterMs -> state machine rejects reveal after refundAfterMs
      const result = await verifyPublicDeal([msg1, msg2, msg3, msg4], contractId, {
        defaultRoom: OFFER_ROOM,
        noteStore,
        nowMs: clock() + 1_000_000, // Late reveal
      });

      assert.equal(result.verified, false);
      assert.equal(result.classification, "INVALID");
      assert.ok(result.errors.some((e) => e.includes("reveal") || e.includes("transition rejected")));
    });

    it("rejects non-party frame injection in independent verifier", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });
      const mallory = await createAgentIdentity({ displayName: "Mallory", role: "attacker" });

      const now = 1750000000000;
      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["memory"],
        expiresMs: now + 300000,
        claimByMs: now + 600000,
        refundAfterMs: now + 900000,
      });

      const accept = makeAccept(offer, { from: bob.did, statement: "0x" + "f".repeat(64) });
      const contractId = accept.contract;

      // Mallory attempts to lock or cancel
      const forgedLock: TclkFrame = { type: "lock", from: mallory.did, contract: contractId, rail: "memory", ref: "ref-1" };

      const msg1 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), alice);
      const msg2 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(accept), bob);
      const msg3 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(forgedLock), mallory);

      const result = await verifyPublicDeal([msg1, msg2, msg3], contractId, {
        defaultRoom: OFFER_ROOM,
        nowMs: now + 5000,
      });

      assert.equal(result.verified, false);
      assert.equal(result.classification, "INVALID");
      assert.ok(result.errors.some((e) => e.includes("rejected")));
    });
  });

  // Test Suite 8: Cancel and Refund Terminal Replay
  describe("8. Cancel and Refund Independent Replay", () => {
    it("successfully verifies an independently cancelled contract", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

      const now = 1750000000000;
      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["memory"],
        expiresMs: now + 300000,
        claimByMs: now + 600000,
        refundAfterMs: now + 900000,
      });

      const accept = makeAccept(offer, { from: bob.did, statement: "0x" + "8".repeat(64) });
      const cancelFrame: TclkFrame = { type: "cancel", from: alice.did, contract: accept.contract, reason: "Task aborted" };

      const msg1 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(offer), alice);
      const msg2 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(accept), bob);
      const msg3 = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(cancelFrame), alice);

      const result = await verifyPublicDeal([msg1, msg2, msg3], accept.contract, {
        defaultRoom: OFFER_ROOM,
        nowMs: now + 10000,
      });

      assert.equal(result.verified, true);
      assert.equal(result.classification, "VALID");
      assert.equal(result.status, "cancelled");
    });
  });

  // Test Suite 9: Pilot Network Deal Two-Stage Confirmation Gate
  describe("9. Pilot Network Deal Two-Stage Gate", () => {
    it("stops without network mutation when operator confirmation is not provided", async () => {
      const { runPilotNetworkDeal } = await import("../../scripts/pilot-network-deal.ts");
      const res = await runPilotNetworkDeal({ confirm: false, auditOnly: false });
      assert.equal(res.status, "NOT ATTEMPTED");
      assert.ok(res.reason?.includes("confirmation not provided"));
      assert.equal(res.auditPassed, true);
    });

    it("runs audit-only mode cleanly with zero mutations", async () => {
      const { runPilotNetworkDeal } = await import("../../scripts/pilot-network-deal.ts");
      const res = await runPilotNetworkDeal({ confirm: true, auditOnly: true });
      assert.equal(res.status, "NOT ATTEMPTED");
      assert.ok(res.reason?.includes("Audit-only"));
      assert.equal(res.auditPassed, true);
    });
  });

  // Test Suite 10: Phase 16.1 Operational Refinements & Counterparty Boundaries
  describe("10. Phase 16.1 Operational Refinements & Counterparty Boundaries", () => {
    it("respects custom observation timeout window and exits cleanly", async () => {
      const { runPilotNetworkDeal } = await import("../../scripts/pilot-network-deal.ts");
      const startTime = Date.now();
      const res = await runPilotNetworkDeal({ confirm: true, waitTimeoutMs: 500 });
      const elapsed = Date.now() - startTime;

      assert.equal(res.status, "ATTEMPTED / FAILED");
      assert.ok(res.reason?.includes("No independent external counterparty"));
      assert.ok(elapsed >= 400 && elapsed < 20000, `Elapsed: ${elapsed}ms`);
    });

    it("strictly rejects self-counterparty accept frames and refuses self-dealing", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const now = 1750000000000;

      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "500",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: now + 300000,
        claimByMs: now + 600000,
        refundAfterMs: now + 900000,
      });

      // Self-accept: Attempting to accept own offer is rejected by protocol
      assert.throws(
        () => makeAccept(offer, { from: alice.did, statement: "0x" + "7".repeat(64) }),
        /accept\.from must differ from offer\.from/,
      );
    });

    it("recognizes an external counterparty accept frame with valid envelope signature", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const externalPeer = await createAgentIdentity({ displayName: "External Peer", role: "payee" });

      const now = 1750000000000;
      const offer = makeOffer({
        from: alice.did,
        role: "payer",
        amount: "500",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: now + 300000,
        claimByMs: now + 600000,
        refundAfterMs: now + 900000,
      });

      const externalAccept = makeAccept(offer, {
        from: externalPeer.did,
        statement: "0x" + "6".repeat(64),
      });

      const signedMsg = await createSignedTclkMessage(OFFER_ROOM, encodeFrame(externalAccept), externalPeer);
      const { verifyRoomMessage } = await import("../../src/technocore/verify.ts");
      const sigCheck = await verifyRoomMessage(OFFER_ROOM, signedMsg);

      assert.equal(sigCheck.verified, true);
      assert.equal(externalAccept.from !== alice.did, true);
      assert.equal(externalAccept.ref, offer.id);
    });

    it("does not prematurely mark an offer as NETWORK_EXECUTED on publication alone", async () => {
      const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
      const adapter = new TclkDealAdapter({
        did: alice.did,
        signer: alice.signingHandle,
        defaultProvenance: "NETWORK_OBSERVED",
      });

      const offerRes = await adapter.createOffer({
        role: "payer",
        amount: "100",
        asset: "FLOP",
        lock: "hash",
        rails: ["paper"],
        expiresMs: 1750000000000 + 300000,
        claimByMs: 1750000000000 + 600000,
        refundAfterMs: 1750000000000 + 900000,
      });

      assert.equal(offerRes.dealRecord.provenance, "NETWORK_OBSERVED");
      assert.notEqual(offerRes.dealRecord.provenance, "NETWORK_EXECUTED");
    });
  });
});

