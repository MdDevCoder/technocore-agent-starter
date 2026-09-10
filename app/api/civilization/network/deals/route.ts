/**
 * Technocore Public Observed Deals API.
 *
 * Endpoint:
 * GET /api/civilization/network/deals
 *
 * Returns observed TCLK protocol messages (offers, accepts, reveals, disputes)
 * from public channels.
 */

import { NextResponse } from "next/server";
import { getServerObservationStore } from "../../../../../src/civilization/gateway/server.ts";

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
    const store = getServerObservationStore();
    const deals = await store.getObservedDeals();

    return NextResponse.json(
      {
        success: true,
        count: deals.length,
        data: deals,
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      },
    );
  }
}
