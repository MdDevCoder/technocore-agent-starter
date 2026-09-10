/**
 * Technocore Public Tracked Rooms & Cursors API.
 *
 * Endpoint:
 * GET /api/civilization/network/rooms
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
    let cursors = await store.getAllCursors();
    if (cursors.length === 0) {
      const { getServerNetworkIndexer } = await import("../../../../../src/civilization/gateway/server.ts");
      const indexer = getServerNetworkIndexer();
      const status = await indexer.syncOnce({ discoverPublicRooms: true, maxMessagesPerRoom: 50, timeoutMs: 5000 });
      cursors = status.trackedRooms;
    }

    return NextResponse.json(
      {
        success: true,
        data: cursors,
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
