/**
 * Transport. One interface, two implementations, chosen by configuration.
 *
 * **Direct** — the browser calls `https://technocore.chat` itself. Fewest moving parts, no server
 * involvement at all, and the app remains a pure static client.
 *
 * **Proxied** — a same-origin Next.js route handler forwards the already-signed request upstream.
 * Needed only if Technocore serves no permissive CORS headers.
 *
 * Which one is required is the single protocol question that could not be answered from the CLI source
 * (`docs/PROTOCOL.md` §8): CORS behaviour is a property of the live server's response headers, not of
 * the client, and `technocore.chat` is unreachable from the environment this was built in. Until it is
 * measured on an unrestricted network, **direct is the default** — the app does not route traffic
 * through a server on a guess.
 *
 * Two things this deliberately does not do:
 *
 * - **No `mode: "no-cors"`.** It would make the request "succeed" with an opaque response the client
 *   cannot read, which means reporting an outcome that was never observed. That is precisely the
 *   false-success behaviour this build exists to avoid.
 * - **No logging of request or response bodies.** Not in the browser, not in the proxy. Status code,
 *   latency and nothing else.
 *
 * Neither implementation ever sees a private key: signing has already happened by the time a request
 * is constructed. The proxy carries public, already-signed data only.
 */

import { classifyTransportFailure, safeExcerpt, TechnocoreError } from "./errors.ts";
import { assertEgressPermitted } from "./egress.ts";
import { DEFAULT_BASE_URL, HEADERS } from "./profile.ts";

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_PROXY_PREFIX = "/api/technocore";

export interface TechnocoreRequest {
  readonly method: "GET" | "POST";
  /** Path with query string, e.g. `/r/technocore?format=json`. Must be on the profile allow-list. */
  readonly path: string;
  /** Serialized JSON body for POSTs. Public, already-signed data only. */
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface TechnocoreResponse {
  readonly ok: boolean;
  readonly status: number;
  /** Raw response text. Untrusted. Never rendered as HTML. */
  readonly text: string;
  /** Parsed body, or `null` when the response was not JSON. */
  readonly json: unknown;
  /** Round-trip time in milliseconds. The only thing worth measuring here. */
  readonly durationMs: number;
}

export interface TechnocoreTransport {
  readonly kind: "direct" | "proxy";
  /** Human-readable description of where requests go. Shown in the egress ledger. */
  readonly describe: string;
  send(request: TechnocoreRequest): Promise<TechnocoreResponse>;
}

/** Browser → Technocore. Requires the API to send permissive CORS headers. */
export function createDirectTransport(baseUrl: string = DEFAULT_BASE_URL): TechnocoreTransport {
  const origin = normalizeOrigin(baseUrl);
  return {
    kind: "direct",
    describe: `Your browser → ${origin}`,
    send: (request) => perform(`${origin}${request.path}`, request),
  };
}

/**
 * Browser → this app's own origin → Technocore.
 *
 * The route handler is a pass-through for the same allow-listed paths; it adds no fields, stores
 * nothing, and holds no credentials.
 */
export function createProxyTransport(prefix: string = DEFAULT_PROXY_PREFIX): TechnocoreTransport {
  const base = prefix.replace(/\/+$/, "");
  return {
    kind: "proxy",
    describe: `Your browser → this site (${base}) → Technocore`,
    send: (request) => perform(`${base}${request.path}`, request),
  };
}

async function perform(url: string, request: TechnocoreRequest): Promise<TechnocoreResponse> {
  // Fails closed: an unexpected path or body shape never reaches the network.
  assertEgressPermitted({ method: request.method, path: request.path, body: request.body });

  const controller = new AbortController();
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const forwardAbort = (): void => controller.abort();
  request.signal?.addEventListener("abort", forwardAbort, { once: true });
  if (request.signal?.aborted === true) controller.abort();

  const started = now();
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: request.method === "POST" ? { ...HEADERS.post } : { ...HEADERS.get },
      ...(request.body === undefined ? {} : { body: request.body }),
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      json: tryParseJson(text),
      durationMs: Math.round(now() - started),
    };
  } catch (error) {
    throw classifyTransportFailure(error, timedOut);
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", forwardAbort);
  }
}

function tryParseJson(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function normalizeOrigin(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TechnocoreError("EGRESS_REFUSED", { excerpt: "configured base URL is not a valid URL" });
  }
  if (parsed.protocol !== "https:") {
    // The CLI's wizard accepts plaintext http:// for artifact links while its own proof builder
    // requires https://. We require https:// everywhere, including for the API origin.
    throw new TechnocoreError("EGRESS_REFUSED", { excerpt: "the Technocore origin must use https" });
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

/**
 * Read a response body excerpt that is safe to surface to a developer.
 *
 * Length-capped and control-stripped. Always rendered as text.
 */
export const excerptOf = (response: TechnocoreResponse): string => safeExcerpt(response.text);
