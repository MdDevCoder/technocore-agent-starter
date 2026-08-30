/**
 * Civilization Network Operational Health & Telemetry API.
 *
 * Endpoint:
 * GET /api/civilization/health
 *
 * Returns operational metrics: uptime, total ingested, persisted, rejected,
 * rate limit hits, signature failures, policy rejections, head sequence, and live subscribers.
 * Zero private keys, passphrases, or secrets are ever exposed.
 */

import { NextResponse } from "next/server";
import { getServerEventStore, getServerIngestionGateway } from "../../../../src/civilization/gateway/server.ts";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const store = getServerEventStore();
    const gateway = getServerIngestionGateway(store);
    const observability = gateway.getObservability();
    const broadcaster = gateway.getBroadcaster();

    const headSequence = await store.getHeadSequence();
    const subscriberCount = broadcaster.getSubscriberCount();
    const metrics = observability.getMetrics(subscriberCount);

    return NextResponse.json(
      {
        status: "HEALTHY",
        network: "technocore-alpha-v1",
        headSequence,
        activeSubscribers: subscriberCount,
        metrics,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "no-cache",
        },
      },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(
      {
        status: "DEGRADED",
        error: errorMsg,
      },
      {
        status: 503,
        headers: CORS_HEADERS,
      },
    );
  }
}
