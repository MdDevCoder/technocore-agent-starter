/**
 * Production Civilization Event Ingestion and Query API Route.
 *
 * Endpoints:
 * - POST /api/civilization/events: Ingest and persist a cryptographically signed event.
 * - GET  /api/civilization/events: Query sequential events from persistent store.
 */

import { NextResponse } from "next/server";
import { getServerEventStore, getServerIngestionGateway, getServerProductionConfig } from "../../../../src/civilization/gateway/server.ts";
import type { CivilizationEventType } from "../../../../src/civilization/types/events.ts";

export const dynamic = "force-dynamic";

function getCorsHeaders(): Record<string, string> {
  const config = getServerProductionConfig();
  const allowed = config.corsAllowedOrigins.join(", ");
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export async function POST(request: Request) {
  const cors = getCorsHeaders();
  const config = getServerProductionConfig();

  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > config.maxPayloadSizeBytes) {
      return NextResponse.json(
        {
          type: "https://exo-tech.org/errors/payload-too-large",
          title: "Payload Too Large",
          status: 413,
          detail: `Request body exceeds limit (${contentLength} bytes received, max: ${config.maxPayloadSizeBytes})`,
        },
        { status: 413, headers: cors },
      );
    }

    let body: unknown;
    try {
      const rawText = await request.text();
      if (rawText.length > config.maxPayloadSizeBytes) {
        return NextResponse.json(
          {
            type: "https://exo-tech.org/errors/payload-too-large",
            title: "Payload Too Large",
            status: 413,
            detail: `Request body exceeds character limit (${rawText.length} chars)`,
          },
          { status: 413, headers: cors },
        );
      }
      body = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          type: "https://exo-tech.org/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid JSON format in request body",
        },
        { status: 400, headers: cors },
      );
    }

    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "true";
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? undefined;

    const gateway = getServerIngestionGateway();
    const result = await gateway.ingestEvent(body, {
      dryRun,
      clientIp,
      maxPayloadSizeBytes: config.maxPayloadSizeBytes,
      maxClockSkewSeconds: config.maxClockSkewSeconds,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          type: "https://exo-tech.org/errors/ingestion-failed",
          title: result.statusCode === 409 ? "Conflict" : result.statusCode === 422 ? "Unprocessable Entity" : result.statusCode === 429 ? "Too Many Requests" : result.statusCode === 403 ? "Forbidden" : "Bad Request",
          status: result.statusCode,
          detail: result.error,
          errors: result.details,
          receipt: result.receipt,
        },
        { status: result.statusCode, headers: cors },
      );
    }

    return NextResponse.json(
      {
        success: true,
        receipt: result.receipt,
      },
      { status: 201, headers: cors },
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
      { status: 500, headers: cors },
    );
  }
}

export async function GET(request: Request) {
  const cors = getCorsHeaders();

  try {
    const url = new URL(request.url);
    const afterParam = url.searchParams.get("after");
    const limitParam = url.searchParams.get("limit");
    const authorDid = url.searchParams.get("authorDid") ?? undefined;
    const missionId = url.searchParams.get("missionId") ?? undefined;
    const eventType = (url.searchParams.get("eventType") as CivilizationEventType) ?? undefined;

    // Strict parameter validation against injection / NaN / negative bounds
    if (afterParam !== null) {
      if (!/^\d+$/.test(afterParam.trim())) {
        return NextResponse.json(
          {
            type: "https://exo-tech.org/errors/bad-request",
            title: "Bad Request",
            status: 400,
            detail: "Invalid query parameter 'after': must be a non-negative integer.",
          },
          { status: 400, headers: cors },
        );
      }
    }

    if (limitParam !== null) {
      if (!/^\d+$/.test(limitParam.trim())) {
        return NextResponse.json(
          {
            type: "https://exo-tech.org/errors/bad-request",
            title: "Bad Request",
            status: 400,
            detail: "Invalid query parameter 'limit': must be a positive integer.",
          },
          { status: 400, headers: cors },
        );
      }
    }

    const afterSeq = afterParam ? parseInt(afterParam, 10) : 0;
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 50;
    const limit = Math.min(500, Math.max(1, parsedLimit));

    const store = getServerEventStore();
    const headSequence = await store.getHeadSequence();

    let events;
    if (authorDid || missionId || eventType) {
      events = await store.queryEvents({
        fromSequence: afterSeq + 1,
        authorDid,
        missionId,
        eventType,
        limit,
      });
    } else {
      events = await store.getAfterSequence(afterSeq, limit);
    }

    return NextResponse.json(
      {
        events,
        headSequence,
        returnedCount: events.length,
      },
      { status: 200, headers: cors },
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
      { status: 500, headers: cors },
    );
  }
}
