/**
 * Server-Sent Events (SSE) Live Civilization Event Stream API.
 *
 * Endpoint:
 * GET /api/civilization/events/stream?after=10
 *
 * Streams newly committed Civilization Events in real-time to Observatory clients,
 * remote agent daemons, and connected monitoring nodes.
 *
 * Supports cursor resumption: If `after` query parameter or `Last-Event-ID` header is provided,
 * backfills historical missed events first before attaching to the live broadcast stream.
 */

import { getServerEventStore, getServerIngestionGateway, getServerProductionConfig } from "../../../../../src/civilization/gateway/server.ts";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  const config = getServerProductionConfig();
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": config.corsAllowedOrigins.join(", "),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Last-Event-ID",
    },
  });
}

export async function GET(request: Request) {
  const config = getServerProductionConfig();
  const corsAllowed = config.corsAllowedOrigins.join(", ");

  const url = new URL(request.url);
  const lastEventIdHeader = request.headers.get("Last-Event-ID");
  const afterSeqParam = url.searchParams.get("after");

  // Validate cursor parameter if provided
  if (afterSeqParam !== null) {
    if (!/^\d+$/.test(afterSeqParam.trim())) {
      return new Response(
        JSON.stringify({
          type: "https://exo-tech.org/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid query parameter 'after': must be a non-negative integer.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": corsAllowed,
          },
        },
      );
    }
  }

  const startingAfterSequence = Number(afterSeqParam ?? lastEventIdHeader ?? "0");

  const store = getServerEventStore();
  const gateway = getServerIngestionGateway(store);
  const broadcaster = gateway.getBroadcaster();

  const stream = new ReadableStream({
    async start(controller) {
      const subscriberId = `sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const encoder = new TextEncoder();

      // 1. Send initial connection confirmation
      controller.enqueue(encoder.encode(`event: connected\ndata: {"subscriberId":"${subscriberId}","connectedAt":"${new Date().toISOString()}"}\n\n`));

      // 2. Backfill missed events if requested starting from cursor
      let currentSequence = startingAfterSequence;
      try {
        const head = await store.getHeadSequence();
        if (currentSequence < head) {
          const missedEvents = await store.getAfterSequence(currentSequence, 100);
          for (const evt of missedEvents) {
            const chunk = `id: ${evt.sequenceNum}\nevent: civilization-event\ndata: ${JSON.stringify(evt)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
            currentSequence = evt.sequenceNum;
          }
        }
      } catch (backfillErr) {
        console.warn("[SSE Stream] Backfill warning:", backfillErr);
      }

      // 3. Attach to live broadcaster
      const unsubscribe = broadcaster.subscribe(subscriberId, (event) => {
        try {
          const chunk = `id: ${event.sequenceNum}\nevent: civilization-event\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Client disconnected
          unsubscribe();
        }
      });

      // 4. Send keepalive heartbeat every 15s
      const heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeatTimer);
          unsubscribe();
        }
      }, 15000);

      // 5. Handle stream cancellation
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatTimer);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": corsAllowed,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
