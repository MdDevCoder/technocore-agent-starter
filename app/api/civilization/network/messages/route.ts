/**
 * Technocore Public Raw & Verified Messages API.
 *
 * Endpoint:
 * GET /api/civilization/network/messages
 *
 * Supports query params:
 * - room: filter by room name
 * - status: filter by verification status
 * - classification: filter by protocol classification
 * - limit: max results (default 50, max 500)
 * - offset: pagination offset
 */

import { NextResponse } from "next/server";
import { getServerObservationStore } from "../../../../../src/civilization/gateway/server.ts";
import type { VerificationStatus, ProtocolClassification } from "../../../../../src/civilization/network/types.ts";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const room = searchParams.get("room") || undefined;
    const status = (searchParams.get("status") as VerificationStatus) || undefined;
    const classification = (searchParams.get("classification") as ProtocolClassification) || undefined;
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
    const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : 0;

    const store = getServerObservationStore();
    const messages = await store.getMessages({
      room,
      status,
      classification,
      limit,
      offset,
    });

    return NextResponse.json(
      {
        success: true,
        count: messages.length,
        data: messages,
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
