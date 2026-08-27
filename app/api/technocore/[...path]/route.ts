import { assertEgressPermitted } from "../../../../src/technocore/egress.ts";
import { DEFAULT_BASE_URL, HEADERS } from "../../../../src/technocore/profile.ts";

export const dynamic = "force-dynamic";

/** Maximum allowed payload size for Technocore proxy requests (64 KB). */
const MAX_PROXY_BODY_BYTES = 64 * 1024;

/** Rate limit window in milliseconds (60 seconds). */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

/** Maximum allowed requests per IP within the rate limit window. */
const RATE_LIMIT_MAX_REQUESTS = 60;

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimits.get(ip);

  if (!record || now >= record.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count += 1;
  return true;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

/**
 * Same-origin Next.js pass-through proxy for Technocore API calls.
 *
 * Required because Technocore does not serve permissive CORS headers for direct browser fetch calls.
 *
 * Security guarantees:
 * - Rate limited per client IP to prevent abuse (EVF TASK-01).
 * - Strict 64 KB request payload cap to prevent memory exhaustion (EVF TASK-21).
 * - Path traversal and allow-list validation on every request (EVF TASK-03 / TASK-16).
 * - Zero private key, seed, or passphrase exposure (signing happens client-side).
 * - No payload or secret data is ever persisted or logged (EVF TASK-18).
 * - Sanitized, non-leaking error responses (EVF TASK-19).
 */
async function handleProxy(request: Request): Promise<Response> {
  const clientIp = getClientIp(request);
  if (!checkRateLimit(clientIp)) {
    return Response.json(
      { error: "Too many requests. Please wait a moment before retrying." },
      {
        status: 429,
        headers: {
          "Retry-After": "60",
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const url = new URL(request.url);
  const rawPathname = url.pathname.replace(/^\/api\/technocore/, "");

  // Prevent path traversal
  if (rawPathname.includes("..") || rawPathname.includes("\\") || rawPathname.includes("%2e%2e") || rawPathname.includes("%2E%2E")) {
    return Response.json(
      { error: "Invalid path format" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const targetPath = rawPathname + url.search;

  let bodyText: string | undefined;
  if (request.method === "POST") {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PROXY_BODY_BYTES) {
      return Response.json(
        { error: "Payload too large (max 64 KB)" },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }

    try {
      bodyText = await request.text();
    } catch {
      return Response.json(
        { error: "Failed to read request body" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (bodyText.length > MAX_PROXY_BODY_BYTES) {
      return Response.json(
        { error: "Payload too large (max 64 KB)" },
        { status: 413, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  try {
    assertEgressPermitted({
      method: request.method,
      path: targetPath,
      body: bodyText,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Egress policy violation";
    return Response.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const upstreamOrigin = (
    process.env.TECHNOCORE_API_BASE_URL ||
    process.env.NEXT_PUBLIC_TECHNOCORE_BASE_URL ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  const upstreamUrl = `${upstreamOrigin}${targetPath}`;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: request.method === "POST" ? { ...HEADERS.post } : { ...HEADERS.get },
      ...(bodyText ? { body: bodyText } : {}),
      cache: "no-store",
      redirect: "follow",
    });

    const responseBody = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8";

    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { error: "Failed to reach upstream Technocore service" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handleProxy(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleProxy(request);
}
