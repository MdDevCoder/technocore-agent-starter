/**
 * Runtime configuration.
 *
 * Isolated from `transport.ts` so the transport layer stays a pure function of its arguments and can
 * be tested without an environment. This is the only module that reads `process.env`.
 *
 * No secret is required to run this app, because the app holds no credentials — worth preserving.
 */

import { DEFAULT_BASE_URL, ROOMS } from "./profile.ts";
import {
  createDirectTransport,
  createProxyTransport,
  DEFAULT_PROXY_PREFIX,
  type TechnocoreTransport,
} from "./transport.ts";

export type TransportMode = "direct" | "proxy";

export interface RuntimeConfig {
  readonly transportMode: TransportMode;
  /** Origin used by the direct transport, and by the proxy route handler upstream. */
  readonly baseUrl: string;
  readonly proxyPrefix: string;
  readonly lobbyRoom: string;
  readonly contributionRoom: string;
}

function readEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[key];
  return value === undefined || value.length === 0 ? undefined : value;
}

/**
 * Resolve configuration.
 *
 * `proxy` is the default because Technocore does not serve permissive CORS headers for direct browser
 * fetch requests. If direct transport is explicitly desired in an environment where CORS or reverse
 * proxying permits it, set `NEXT_PUBLIC_TECHNOCORE_TRANSPORT=direct`.
 */
export function resolveConfig(): RuntimeConfig {
  const mode = readEnv("NEXT_PUBLIC_TECHNOCORE_TRANSPORT");
  return {
    transportMode: mode === "direct" ? "direct" : "proxy",
    baseUrl: readEnv("NEXT_PUBLIC_TECHNOCORE_BASE_URL") ?? readEnv("TECHNOCORE_API_BASE_URL") ?? DEFAULT_BASE_URL,
    proxyPrefix: readEnv("NEXT_PUBLIC_TECHNOCORE_PROXY_PREFIX") ?? DEFAULT_PROXY_PREFIX,
    lobbyRoom: readEnv("NEXT_PUBLIC_TECHNOCORE_LOBBY_ROOM") ?? ROOMS.lobby,
    contributionRoom: readEnv("NEXT_PUBLIC_TECHNOCORE_ROOM") ?? ROOMS.contribution,
  };
}

export function createTransport(config: RuntimeConfig = resolveConfig()): TechnocoreTransport {
  return config.transportMode === "proxy"
    ? createProxyTransport(config.proxyPrefix)
    : createDirectTransport(config.baseUrl);
}
