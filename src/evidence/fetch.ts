/**
 * Technocore Contribution Evidence Vault — Public Network Fetcher
 *
 * Performs read-only GET queries to inspect live public room streams for retained records.
 * STRICT: Zero POST/PUT/DELETE, zero mutations, zero fabricated responses.
 */

import { DEFAULT_BASE_URL } from "../technocore/profile.ts";

export interface LiveRecordLookupResult {
  readonly found: boolean;
  readonly reason?: string;
  readonly record?: {
    readonly room: string;
    readonly seq: number;
    readonly serverTimestamp: string | number;
    readonly did: string;
    readonly nonce: string;
    readonly text: string;
    readonly signature: string;
    readonly sourceEndpoint: string;
    readonly sourceMethod: "GET";
    readonly provenance: "SERVER_RETRIEVED";
  };
}

/**
 * Fetch a specific signed room message from Technocore by room and sequence number.
 * Uses public read-only GET requests with fallback support.
 */
export async function fetchLiveContributionRecord(
  room: string,
  targetSeq: number,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<LiveRecordLookupResult> {
  const cleanRoom = room.trim().toLowerCase().replace(/^\/r\//, "");
  if (!cleanRoom) {
    return { found: false, reason: "Room name is required." };
  }

  const endpoint = `${baseUrl}/r/${encodeURIComponent(cleanRoom)}?format=json&limit=100`;

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return {
        found: false,
        reason: `HTTP ${res.status}: Failed to reach public room endpoint.`,
      };
    }

    const data = await res.json();
    const messages: unknown[] = Array.isArray(data)
      ? data
      : data && Array.isArray((data as Record<string, unknown>).messages)
        ? ((data as Record<string, unknown>).messages as unknown[])
        : [];

    if (messages.length === 0) {
      return {
        found: false,
        reason: "RECORD NOT CURRENTLY RETAINED (No active messages returned in room buffer).",
      };
    }

    // Search for matching sequence number
    for (const item of messages) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;

      const itemSeq = typeof m.seq === "number" ? m.seq : parseInt(String(m.seq || m.sequence || 0), 10);
      if (itemSeq === targetSeq) {
        const did = String(m.did || m.author || m.from || "");
        const nonce = String(m.nonce || m.timestamp || "");
        const text = String(m.text || m.content || m.message || "");
        const signature = String(m.sig || m.signature || "");
        const serverTimestamp = (m.server_time || m.received_at || m.created_at || Date.now()) as string | number;

        if (!did || !nonce || !text || !signature) {
          return {
            found: false,
            reason: "Matching sequence found but record fields are incomplete or malformed.",
          };
        }

        return {
          found: true,
          record: {
            room: cleanRoom,
            seq: itemSeq,
            serverTimestamp,
            did,
            nonce,
            text,
            signature,
            sourceEndpoint: endpoint,
            sourceMethod: "GET",
            provenance: "SERVER_RETRIEVED",
          },
        };
      }
    }

    return {
      found: false,
      reason: `RECORD NOT CURRENTLY RETAINED: Sequence ${targetSeq} is no longer present in the live retention window of /r/${cleanRoom}.`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      found: false,
      reason: `Network query failed: ${errorMsg}`,
    };
  }
}
