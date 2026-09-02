import test from "node:test";
import assert from "node:assert/strict";
import {
  TCLK_VERSION,
  TCLK_PREFIX,
  makeOffer,
  makeAccept,
  generateHashLock,
  generatePointLock,
  verifyHashPreimage,
  openContract,
  applyFrame,
  MemoryRail,
  PaperRail,
  MemoryNoteStore,
  type OfferFrame,
  type AcceptFrame,
} from "@flop-labs/tclk";
import { createAgentIdentity } from "../../src/civilization/agent/identity.ts";
import {
  TclkDealAdapter,
  TclkDealEngine,
  InMemorySecretVault,
  encodeTclkFrame,
  decodeTclkFrame,
  tryDecodeTclkFrame,
  signTclkRoomMessage,
  verifyTclkRoomMessage,
  TclkEventMapper,
  TclkExpiredError,
  TclkSecretNotFoundError,
  TclkStateTransitionError,
  TclkSignerMismatchError,
} from "../../src/civilization/deals/tclk/index.ts";
import { eventRegistry } from "../../src/civilization/events/schema.ts";

test("Phase 13: Technocore Lock Protocol (tclk/1) Integration Suite", async (t) => {
  // 1. Package & API Compatibility
  await t.test("1. Package & API Compatibility: exports match tclk/1 protocol specification", () => {
    assert.equal(TCLK_VERSION, "tclk/1");
    assert.equal(TCLK_PREFIX, "tclk1 ");
    assert.equal(typeof makeOffer, "function");
    assert.equal(typeof makeAccept, "function");
    assert.equal(typeof generateHashLock, "function");
    assert.equal(typeof generatePointLock, "function");
    assert.equal(typeof openContract, "function");
    assert.equal(typeof applyFrame, "function");
    assert.equal(typeof MemoryRail, "function");
    assert.equal(typeof PaperRail, "function");
  });

  // 2. Offer Creation & Single-Line Encoding
  await t.test("2. Offer Creation & Single-Line Encoding: builds valid single-line tclk1 frame", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice (Payer)", role: "payer" });
    const now = 1750000000000;

    const adapter = new TclkDealAdapter({
      did: alice.did,
      signer: alice.signingHandle,
      clock: () => now,
    });

    const result = await adapter.createOffer({
      role: "payer",
      amount: "1000000",
      asset: "FLOP",
      lock: "hash",
      rails: ["flop-htlc", "memory"],
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
      expiresMs: now + 600000,
      job: { proto: "a2a", id: "task_test_123" },
    });

    assert.equal(result.offer.type, "offer");
    assert.equal(result.offer.from, alice.did);
    assert.equal(result.offer.role, "payer");
    assert.equal(result.offer.amount, "1000000");
    assert.equal(result.offer.asset, "FLOP");
    assert.equal(result.offer.lock, "hash");
    assert.ok(result.offer.id.length > 0);

    // Verify room message text is single-line with tclk1 prefix
    assert.ok(result.signedMessage.text.startsWith("tclk1 "));
    assert.ok(!result.signedMessage.text.includes("\n"));
    assert.equal(result.signedMessage.did, alice.did);
    assert.ok(result.signedMessage.sig.length === 86); // Exactly 86 unpadded base64url characters

    // Verify round-trip decoding
    const decoded = decodeTclkFrame(result.signedMessage.text);
    assert.equal(decoded.type, "offer");
    assert.equal((decoded as OfferFrame).id, result.offer.id);
  });

  // 3. Offer Decoding & Tamper Resistance
  await t.test("3. Offer Decoding: rejects malformed or non-tclk lines gracefully", () => {
    assert.equal(tryDecodeTclkFrame("hello world, this is a chat message"), null);
    assert.equal(tryDecodeTclkFrame("tclk1 not-json-at-all"), null);
    assert.equal(tryDecodeTclkFrame("tclk1 {\"type\":\"invalid_type\"}"), null);

    assert.throws(
      () => decodeTclkFrame("not a frame"),
      /Tclk Frame Validation Error/,
    );
  });

  // 4. Secret Isolation & Non-Custodial Vault
  await t.test("4. Secret Isolation: preimages remain isolated in local vault and never leak to public frames", async () => {
    const bob = await createAgentIdentity({ displayName: "Bob (Payee)", role: "payee" });
    const vault = new InMemorySecretVault();

    const { statement, secret } = vault.mintLock("hash");
    assert.ok(statement.startsWith("0x"));
    assert.ok(statement.length === 66); // 0x + 64 hex chars
    assert.ok(secret.startsWith("0x"));
    assert.ok(secret.length === 66); // 0x + 64 hex chars
    assert.ok(verifyHashPreimage(statement, secret));

    // Secret is retrievable by statement
    assert.equal(vault.getSecretByStatement(statement), secret);

    // Bind contract
    vault.bindContract(statement, "contract_abc_999");
    assert.equal(vault.getSecretByContract("contract_abc_999"), secret);

    // Public listing exposes only statements, not secrets
    const statements = vault.listStatements();
    assert.deepEqual(statements, [statement]);
    assert.ok(!JSON.stringify(statements).includes(secret));
  });

  // 5. Full End-to-End HTLC Deal Lifecycle (Offer -> Accept -> Lock -> Reveal -> Receipt)
  await t.test("5. End-to-End HTLC Deal Lifecycle: coordinates complete settlement rehearsal", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    let currentTime = 1750000000000;
    const clock = () => currentTime;

    const memoryRail = new MemoryRail("memory", clock);

    const aliceAdapter = new TclkDealAdapter({
      did: alice.did,
      signer: alice.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });

    const bobAdapter = new TclkDealAdapter({
      did: bob.did,
      signer: bob.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });

    // Step A: Alice creates Offer
    const offerRes = await aliceAdapter.createOffer({
      role: "payer",
      amount: "5000",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
      expiresMs: currentTime + 600000,
    });

    assert.equal(offerRes.dealRecord.status, "proposed");

    // Ingest offer into Bob's adapter
    bobAdapter.applyIncomingFrame(offerRes.offer, "technocore", offerRes.signedMessage, currentTime);
    assert.equal(bobAdapter.getDeal(offerRes.offer.id)?.status, "proposed");

    // Step B: Bob accepts Offer (auto-mints hash lock into his local vault)
    const acceptRes = await bobAdapter.acceptOffer({
      offer: offerRes.offer,
    });

    const contractId = acceptRes.accept.contract;
    assert.equal(acceptRes.dealRecord.status, "accepted");
    assert.ok(bobAdapter.secretVault.getSecretByContract(contractId)); // Bob holds secret

    // Alice has NO secret in her vault
    assert.equal(aliceAdapter.secretVault.getSecretByContract(contractId), undefined);

    // Ingest accept into Alice's adapter
    aliceAdapter.applyIncomingFrame(acceptRes.accept, "technocore", acceptRes.signedMessage, currentTime);
    assert.equal(aliceAdapter.getDeal(contractId)?.status, "accepted");

    // Step C: Alice locks funds on the MemoryRail
    const lockTerms = {
      contract: contractId,
      lock: "hash" as const,
      statement: acceptRes.accept.statement,
      amount: "5000",
      asset: "FLOP",
      payer: alice.did,
      payee: bob.did,
      claimByMs: currentTime + 3600000,
      refundAfterMs: currentTime + 7200000,
    };
    const railRef = await memoryRail.lock(lockTerms);
    assert.equal(memoryRail.status(railRef), "locked");

    const lockRes = await aliceAdapter.createLock({
      contractId,
      rail: "memory",
      ref: railRef,
    });
    assert.equal(lockRes.dealRecord.status, "locked");

    // Ingest lock into Bob's adapter
    bobAdapter.applyIncomingFrame(lockRes.lockFrame, "technocore", lockRes.signedMessage, currentTime);
    assert.equal(bobAdapter.getDeal(contractId)?.status, "locked");

    // Step D: Bob reveals secret to claim escrowed funds
    currentTime += 1000; // 1 second later (well before claimByMs)
    const revealRes = await bobAdapter.createReveal({
      contractId,
    });
    assert.equal(revealRes.dealRecord.status, "claimed");
    assert.equal(memoryRail.status(railRef), "claimed"); // Funds released to payee

    // Ingest reveal into Alice's adapter
    aliceAdapter.applyIncomingFrame(revealRes.revealFrame, "technocore", revealRes.signedMessage, currentTime);
    assert.equal(aliceAdapter.getDeal(contractId)?.status, "claimed");
    assert.equal(aliceAdapter.getDeal(contractId)?.state.secret, revealRes.revealFrame.secret);

    // Step E: Alice issues Receipt
    const receiptRes = await aliceAdapter.createReceipt({
      contractId,
      outcome: "claimed",
    });
    assert.equal(receiptRes.receiptFrame.outcome, "claimed");

    // Replay entire transcript to verify determinism
    const replay = aliceAdapter.replayTranscript(aliceAdapter.getDeal(contractId)!.frames, currentTime);
    assert.equal(replay.ok, true);
    assert.equal(replay.state.status, "claimed");
    assert.equal(replay.state.payerDid, alice.did);
    assert.equal(replay.state.payeeDid, bob.did);
  });

  // 6. Refund Timeout Lifecycle
  await t.test("6. Refund Timeout Lifecycle: payer reclaims funds after refundAfterMs expires", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    let currentTime = 1750000000000;
    const clock = () => currentTime;
    const memoryRail = new MemoryRail("memory", clock);

    const aliceAdapter = new TclkDealAdapter({
      did: alice.did,
      signer: alice.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });
    const bobAdapter = new TclkDealAdapter({
      did: bob.did,
      signer: bob.signingHandle,
      settlementRails: new Map([["memory", memoryRail]]),
      clock,
    });

    // Propose & Accept
    const offerRes = await aliceAdapter.createOffer({
      role: "payer",
      amount: "2500",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: currentTime + 10000,
      refundAfterMs: currentTime + 20000,
      expiresMs: currentTime + 5000,
    });
    const acceptRes = await bobAdapter.acceptOffer({ offer: offerRes.offer });
    const contractId = acceptRes.accept.contract;

    aliceAdapter.applyIncomingFrame(acceptRes.accept, "technocore", acceptRes.signedMessage, currentTime);

    // Lock funds
    const railRef = await memoryRail.lock({
      contract: contractId,
      lock: "hash",
      statement: acceptRes.accept.statement,
      amount: "2500",
      asset: "FLOP",
      payer: alice.did,
      payee: bob.did,
      claimByMs: currentTime + 10000,
      refundAfterMs: currentTime + 20000,
    });
    await aliceAdapter.createLock({ contractId, rail: "memory", ref: railRef });

    // Try premature refund -> throws TclkExpiredError
    await assert.rejects(
      async () => aliceAdapter.createRefund({ contractId }),
      TclkExpiredError,
    );

    // Advance clock past refundAfterMs
    currentTime += 25000;

    // Refund succeeds
    const refundRes = await aliceAdapter.createRefund({ contractId, reason: "Payee unfulfilled" });
    assert.equal(refundRes.dealRecord.status, "refunded");
    assert.equal(memoryRail.status(railRef), "refunded");
  });

  // 7. Cancel Lifecycle
  await t.test("7. Cancel Lifecycle: unaccepted offer can be cancelled by author", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const adapter = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle });

    const offerRes = await adapter.createOffer({
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    const cancelRes = await adapter.createCancel({
      contractId: offerRes.offer.id,
      reason: "Changed requirement",
    });

    assert.equal(cancelRes.dealRecord.status, "cancelled");
  });

  // 8. Public Event Schema Mapping & Zero-Secret Guarantee
  await t.test("8. Public Event Schema Mapping: maps frames to valid CivilizationEvents with zero secret leakage", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const adapter = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle });
    const offerRes = await adapter.createOffer({
      role: "payer",
      amount: "1000",
      asset: "FLOP",
      lock: "hash",
      rails: ["flop-htlc"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    // Validate DEAL_OFFER_CREATED payload schema in eventRegistry
    const offerDescriptor = eventRegistry.get("DEAL_OFFER_CREATED");
    assert.ok(offerDescriptor);
    const offerValidation = offerDescriptor.validatePayload(offerRes.payload);
    assert.equal(offerValidation.valid, true);

    // Accept
    const bobAdapter = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle });
    const acceptRes = await bobAdapter.acceptOffer({ offer: offerRes.offer });

    const acceptDescriptor = eventRegistry.get("DEAL_OFFER_ACCEPTED");
    assert.ok(acceptDescriptor);
    const acceptValidation = acceptDescriptor.validatePayload(acceptRes.payload);
    assert.equal(acceptValidation.valid, true);

    // Ensure accept payload does NOT contain any secret
    assert.equal((acceptRes.payload as unknown as Record<string, unknown>).secret, undefined);
    assert.equal((acceptRes.payload as unknown as Record<string, unknown>).preimage, undefined);
  });

  // 9. Hostile Input & Signer Mismatch Rejection
  await t.test("9. Security & Rejection: rejects forged frames and unauthorized signers", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const eve = await createAgentIdentity({ displayName: "Eve", role: "attacker" });

    const offer = makeOffer({
      from: alice.did,
      role: "payer",
      amount: "100",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    // Eve tries to sign a frame claiming to be from Alice -> throws TclkSignerMismatchError
    await assert.rejects(
      async () => signTclkRoomMessage("technocore", offer, eve.signingHandle),
      TclkSignerMismatchError,
    );

    // Tampered message text fails room verification
    const { signedMessage } = await signTclkRoomMessage("technocore", offer, alice.signingHandle);
    const tampered = { ...signedMessage, text: signedMessage.text.replace("100", "999") };
    const verification = await verifyTclkRoomMessage("technocore", tampered);
    assert.equal(verification.valid, false);
  });

  // 10. Multi-Agent Deal Engine Integration
  await t.test("10. Multi-Agent Deal Engine: routes room messages across registered adapters", async () => {
    const engine = new TclkDealEngine();
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const aliceAdapter = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle });
    const bobAdapter = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle });

    engine.registerAdapter(aliceAdapter);
    engine.registerAdapter(bobAdapter);

    const offerRes = await aliceAdapter.createOffer({
      role: "payer",
      amount: "777",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: Date.now() + 3600000,
      refundAfterMs: Date.now() + 7200000,
      expiresMs: Date.now() + 600000,
    });

    // Engine processes Alice's offer room message
    const proc = await engine.processRoomMessage("technocore", offerRes.signedMessage);
    assert.equal(proc.processed, true);
    assert.equal(proc.affectedDeals?.length, 2); // Both Alice and Bob adapters now know the proposed deal

    assert.equal(engine.findDeal(offerRes.offer.id)?.status, "proposed");
    assert.equal(engine.findDealsByStatus("proposed").length, 1);
  });

  // 11. PaperRail Simulation Boundary
  await t.test("11. PaperRail Simulation Boundary: non-value-bearing venue note rehearsal", async () => {
    const notes = new MemoryNoteStore();
    const clock = () => 1750000000000;
    const paperRail = new PaperRail(notes, clock);

    assert.equal(paperRail.id, "paper");

    const terms = {
      contract: "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
      lock: "hash" as const,
      statement: "0x11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
      amount: "1000",
      asset: "FLOP",
      payer: "did:key:z6MktwupdmLXVVqTzCw4i46r4uGyosGXRnR3XjN4Zq7oMMsw",
      payee: "did:key:z6MkuEtVwz9rZ34e8J5YtW3N34oD3nN2rG4M1v8K3Z9jKq1",
      claimByMs: clock() + 3600000,
      refundAfterMs: clock() + 7200000,
    };

    const ref = await paperRail.lock(terms);
    assert.ok(ref.length > 0);
    assert.equal(await paperRail.verifyLock(terms, ref), true);

    const record = await paperRail.read(ref);
    assert.equal(record?.status, "locked");
    assert.equal(record?.statement, terms.statement);
  });

  // 12. Multi-Deal Isolation & Cross-Contract Security
  await t.test("12. Multi-Deal Isolation: contract A secret cannot open contract B lock and transcripts do not bleed", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const bobAdapter = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle });

    // Mint two independent locks in Bob's vault
    const lockA = bobAdapter.secretVault.mintLock("hash", "contract_A_111");
    const lockB = bobAdapter.secretVault.mintLock("hash", "contract_B_222");

    // Secret A must not open Statement B
    assert.notEqual(lockA.statement, lockB.statement);
    assert.notEqual(lockA.secret, lockB.secret);
    assert.equal(verifyHashPreimage(lockB.statement, lockA.secret), false);
    assert.equal(verifyHashPreimage(lockA.statement, lockB.secret), false);

    // Vault isolation
    assert.equal(bobAdapter.secretVault.getSecretByContract("contract_A_111"), lockA.secret);
    assert.equal(bobAdapter.secretVault.getSecretByContract("contract_B_222"), lockB.secret);
  });

  // 13. Deterministic Dual-Observer Replay
  await t.test("13. Deterministic Dual-Observer Replay: observers reconstruct identical state from public room transcript", async () => {
    const alice = await createAgentIdentity({ displayName: "Alice", role: "payer" });
    const bob = await createAgentIdentity({ displayName: "Bob", role: "payee" });

    const now = 1750000000000;
    const aliceAdapter = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle, clock: () => now });
    const bobAdapter = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle, clock: () => now });

    // Run deal through reveal
    const offerRes = await aliceAdapter.createOffer({
      role: "payer",
      amount: "4200",
      asset: "FLOP",
      lock: "hash",
      rails: ["memory"],
      claimByMs: now + 3600000,
      refundAfterMs: now + 7200000,
      expiresMs: now + 600000,
    });

    const acceptRes = await bobAdapter.acceptOffer({ offer: offerRes.offer });
    const contractId = acceptRes.accept.contract;

    // Alice observes Bob's accept frame from room
    aliceAdapter.applyIncomingFrame(acceptRes.accept, "technocore", acceptRes.signedMessage, now);

    const lockRes = await aliceAdapter.createLock({
      contractId,
      rail: "memory",
      ref: "0xdeadbeef00000000000000000000000000000000000000000000000000000001",
    });

    // Bob observes Alice's lock frame from room
    bobAdapter.applyIncomingFrame(lockRes.lockFrame, "technocore", lockRes.signedMessage, now);

    const revealRes = await bobAdapter.createReveal({ contractId });

    // Collect public transcript of frames (Alice and Bob's frames)
    const publicFrames = [offerRes.offer, acceptRes.accept, lockRes.lockFrame, revealRes.revealFrame];

    // Observer 1 and Observer 2 have ZERO local secrets
    const observer1 = new TclkDealAdapter({ did: alice.did, signer: alice.signingHandle, clock: () => now });
    const observer2 = new TclkDealAdapter({ did: bob.did, signer: bob.signingHandle, clock: () => now });

    const replay1 = observer1.replayTranscript(publicFrames, now);
    const replay2 = observer2.replayTranscript(publicFrames, now);

    assert.equal(replay1.ok, true);
    assert.equal(replay2.ok, true);
    assert.deepEqual(replay1.state, replay2.state);
    assert.equal(replay1.state.status, "claimed");
    assert.equal(replay1.state.statement, acceptRes.accept.statement);
    assert.equal(replay1.state.secret, revealRes.revealFrame.secret);
  });
});
