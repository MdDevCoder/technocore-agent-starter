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
    const cursors = await store.getAllCursors();

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
