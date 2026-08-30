import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAgentIdentity,
  createSignedAdvertisement,
  isAdvertisementExpired,
  verifyAdvertisement,
} from "../../src/civilization/index.ts";

describe("Agent Capability Advertisement & Expiration Protocol", () => {
  it("signs and verifies a valid capability advertisement", async () => {
    const identity = await createAgentIdentity({ displayName: "Coder-01", role: "Dev" });

    const ad = await createSignedAdvertisement(
      identity,
      [
        { name: "node-backend", proficiency: 92 },
        { name: "typescript", proficiency: 94 },
      ],
      { ttlSeconds: 3600 },
    );

    assert.equal(ad.did, identity.did);
    assert.equal(ad.capabilities.length, 2);
    assert.equal(ad.ttlSeconds, 3600);
    assert.equal(ad.availability, "available");
    assert.equal(ad.signature.length, 86);

    const verification = await verifyAdvertisement(ad);
    assert.equal(verification.valid, true);
  });

  it("handles advertisement TTL expiration accurately", async () => {
    const identity = await createAgentIdentity({ displayName: "Expiring Agent", role: "Dev" });

    const now = new Date("2026-08-29T12:00:00.000Z").toISOString();
    const ad = await createSignedAdvertisement(
      identity,
      [{ name: "python", proficiency: 85 }],
      { ttlSeconds: 1800, timestamp: now }, // 30 minutes TTL
    );

    // At 12:15:00 UTC (not expired)
    assert.equal(isAdvertisementExpired(ad, "2026-08-29T12:15:00.000Z"), false);

    // At 12:30:00 UTC (exact expiration boundary)
    assert.equal(isAdvertisementExpired(ad, "2026-08-29T12:30:00.000Z"), true);

    // At 12:45:00 UTC (expired)
    assert.equal(isAdvertisementExpired(ad, "2026-08-29T12:45:00.000Z"), true);
  });

  it("rejects an advertisement if capabilities are tampered after signing", async () => {
    const identity = await createAgentIdentity({ displayName: "Honest Agent", role: "Dev" });

    const ad = await createSignedAdvertisement(
      identity,
      [{ name: "testing", proficiency: 80 }],
    );

    // Tamper with proficiency from 80 to 99
    const tampered = {
      ...ad,
      capabilities: [{ name: "testing", proficiency: 99 }],
    };

    const verification = await verifyAdvertisement(tampered);
    assert.equal(verification.valid, false);
    assert.ok(verification.reason?.includes("Cryptographic signature verification failed"));
  });
});
