/**
 * Real-Time Server-Sent Events (SSE) Stream for Public Network Telemetry & Observations.
 *
 * Endpoint:
 * GET /api/civilization/network/stream
 *
 * Broadcasts:
 * - `network-sync-status`: Real-time updates when synchronization passes finish or status changes.
 * - `network-observation`: Real-time streaming of new public room messages as indexed.
 * - `network-cursor`: Real-time room cursor movements and sequence tracking.
 * - Heartbeat keepalives (: ping\n\n) every 15 seconds.
 */

import { getServerNetworkIndexer, getServerProductionConfig } from "../../../../../src/civilization/gateway/server.ts";

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
  const indexer = getServerNetworkIndexer();

  const stream = new ReadableStream({
    async start(controller) {
      const subscriberId = `net_sse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const encoder = new TextEncoder();

      // 1. Connection confirmation
      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"subscriberId":"${subscriberId}","connectedAt":"${new Date().toISOString()}"}\n\n`),
      );

      // 2. Initial network status push
      try {
        const initialStatus = await indexer.getStatus();
        controller.enqueue(
          encoder.encode(`event: network-sync-status\ndata: ${JSON.stringify(initialStatus)}\n\n`),
        );
      } catch (err) {
        console.warn("[Network SSE Stream] Failed to fetch initial status:", err);
      }

      // 3. Attach indexer listeners
      const unsubObs = indexer.onObservation((obs) => {
        try {
          const chunk = `id: ${obs.sequence}\nevent: network-observation\ndata: ${JSON.stringify(obs)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Closed
        }
      });

      const unsubStatus = indexer.onStatusChange((status) => {
        try {
          const chunk = `event: network-sync-status\ndata: ${JSON.stringify(status)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Closed
        }
      });

      const unsubCursor = indexer.onCursorUpdate((cursor) => {
        try {
          const chunk = `id: ${cursor.lastSequence}\nevent: network-cursor\ndata: ${JSON.stringify(cursor)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Closed
        }
      });

      // 4. Keepalive heartbeat every 15s
      const heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      const cleanup = () => {
        clearInterval(heartbeatTimer);
        unsubObs();
        unsubStatus();
        unsubCursor();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      // 5. Cleanup on abort
      request.signal.addEventListener("abort", () => {
        cleanup();
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
