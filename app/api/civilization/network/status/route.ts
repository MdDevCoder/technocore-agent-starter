/**
 * Technocore Public Network Indexer Status & Sync API.
 *
 * Endpoint:
 * GET /api/civilization/network/status
 * POST /api/civilization/network/status (Triggers bounded incremental sync pass)
 */

import { NextResponse } from "next/server";
import { getServerNetworkIndexer } from "../../../../../src/civilization/gateway/server.ts";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const indexer = getServerNetworkIndexer();
    let status = await indexer.getStatus();
    if (status.trackedRooms.length === 0) {
      status = await indexer.syncOnce({ discoverPublicRooms: true, maxMessagesPerRoom: 50, timeoutMs: 5000 });
    }

    return NextResponse.json(
      {
        success: true,
        data: status,
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

export async function POST(req: Request) {
  try {
    let body: { rooms?: string[]; discoverPublicRooms?: boolean; maxMessagesPerRoom?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const indexer = getServerNetworkIndexer();
    const syncResult = await indexer.syncOnce({
      rooms: body.rooms,
      discoverPublicRooms: body.discoverPublicRooms ?? true,
      maxMessagesPerRoom: body.maxMessagesPerRoom ?? 100,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Incremental synchronization pass completed",
        data: syncResult,
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
    const message = err instanceof Error ? err.message : "Synchronization pass failed";
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 502,
        headers: CORS_HEADERS,
      },
    );
  }
}
