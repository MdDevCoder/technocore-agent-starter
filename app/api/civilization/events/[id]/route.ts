/**
 * Single Event Lookup and Verification API Route.
 *
 * GET /api/civilization/events/[id]
 */

import { NextResponse } from "next/server";
import { getServerEventStore } from "../../../../../src/civilization/gateway/server.ts";
import { verifyCivilizationEvent } from "../../../../../src/civilization/events/verifier.ts";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        {
          type: "https://exo-tech.org/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Missing event ID parameter",
        },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const store = getServerEventStore();
    const event = await store.getById(id);

    if (!event) {
      return NextResponse.json(
        {
          type: "https://exo-tech.org/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Event with ID "${id}" was not found in persistent store`,
        },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const verification = await verifyCivilizationEvent(event);

    return NextResponse.json(
      {
        event,
        verified: verification.valid,
        verificationReason: verification.reason,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json(
      {
        type: "https://exo-tech.org/errors/internal-server-error",
        title: "Internal Server Error",
        status: 500,
        detail: message,
      },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
