/**
 * Technocore Agent Workspace: Safe Context Handoff & Deep-Linking Engine
 *
 * Facilitates safe, seamless navigation between toolchain consoles without secret exposure.
 *
 * PERMITTED PARAMETERS:
 * - project, lang, archetype, did, room, preset, op, nonce, text, sig, source
 *
 * FORBIDDEN PARAMETERS:
 * - privateKey, seed, password, signingHandle, credentials, backup, token
 */

import type { SafeHandoffParams } from "./types.ts";

export type ToolDestination =
  | "builder"
  | "forge"
  | "doctor"
  | "testkit"
  | "observatory"
  | "trace"
  | "onboarding"
  | "workspace";

const FORBIDDEN_PARAM_KEYS = new Set([
  "privatekey",
  "seed",
  "password",
  "signinghandle",
  "credentials",
  "backup",
  "token",
  "secret",
  "auth",
  "bearer",
  "priv",
]);

/**
 * Builds a safe deep-link URL for a toolchain destination.
 * Automatically discards any sensitive keys.
 */
export function buildHandoffUrl(
  destination: ToolDestination,
  params: Record<string, string | number | boolean | null | undefined> = {},
): string {
  let basePath = "/workspace";
  switch (destination) {
    case "builder":
      basePath = "/start";
      break;
    case "forge":
      basePath = "/forge";
      break;
    case "doctor":
      basePath = "/doctor";
      break;
    case "testkit":
      basePath = "/testkit";
      break;
    case "observatory":
      basePath = "/observatory";
      break;
    case "trace":
      basePath = "/trace";
      break;
    case "onboarding":
      basePath = "/onboarding/identity";
      break;
    case "workspace":
      basePath = "/workspace";
      break;
  }

  const search = new URLSearchParams();

  for (const [key, val] of Object.entries(params)) {
    if (val === null || val === undefined) continue;
    const lowerKey = key.toLowerCase();
    if (FORBIDDEN_PARAM_KEYS.has(lowerKey)) continue;

    const strVal = String(val).trim();
    if (strVal.length > 0) {
      search.set(key, strVal);
    }
  }

  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Extracts and validates safe handoff params from URLSearchParams.
 */
export function extractSafeHandoffParams(
  searchParams: URLSearchParams | { get(name: string): string | null } | null | undefined,
): SafeHandoffParams {
  if (!searchParams) return {};

  const project = searchParams.get("project")?.trim().slice(0, 64) || undefined;
  const lang = searchParams.get("lang")?.trim().slice(0, 32) || undefined;
  const archetype = searchParams.get("archetype")?.trim().slice(0, 64) || undefined;
  const rawDid = searchParams.get("did")?.trim();
  const did =
    rawDid && rawDid.startsWith("did:key:z6Mk") && rawDid.length >= 48 && rawDid.length <= 64
      ? rawDid
      : undefined;
  const rawRoom = searchParams.get("room")?.trim();
  const room = rawRoom ? rawRoom.replace(/^\/r\//, "").slice(0, 64) : undefined;
  const preset = searchParams.get("preset")?.trim().slice(0, 64) || undefined;
  const op = searchParams.get("op")?.trim().slice(0, 64) || undefined;

  return {
    project,
    lang,
    archetype,
    did,
    room,
    preset,
    op,
  };
}
