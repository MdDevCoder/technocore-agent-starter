/**
 * A scripted stand-in for the Technocore transport.
 *
 * Two decisions make this useful rather than merely convenient.
 *
 * It runs the real egress guard. `assertEgressPermitted` is the last check before a request would leave a
 * browser, so a fake that skipped it would let a test pass on a request the app could never actually send.
 * Every request routed through here is therefore checked against the same allow-list production uses.
 *
 * It records what it was asked to send. Assertions in the flow tests are mostly about the request — the
 * exact path, the exact body, the absence of a second attempt after a failure — and those are only
 * checkable if the calls are kept.
 *
 * No network, no timers, no `fetch`. A queue of replies, consumed in order.
 */

import { assertEgressPermitted } from "../../src/technocore/egress.ts";
import { TechnocoreError, type TechnocoreErrorCode } from "../../src/technocore/errors.ts";
import type {
  TechnocoreRequest,
  TechnocoreResponse,
  TechnocoreTransport,
} from "../../src/technocore/transport.ts";

export interface RecordedCall {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body: string | undefined;
}

/** A scripted reply: either a response to return, or an error to throw. */
export type Reply =
  | { readonly kind: "response"; readonly response: TechnocoreResponse }
  | { readonly kind: "throw"; readonly error: unknown };

export interface FakeTransport extends TechnocoreTransport {
  readonly calls: readonly RecordedCall[];
  /** Paths only, in order. The most common assertion, so it gets a shorthand. */
  readonly paths: readonly string[];
  /** Replies still unconsumed. A non-empty tail at the end of a test means a request was never made. */
  readonly remaining: number;
}

/** Build a JSON response. `ok` is derived from the status unless overridden. */
export function jsonResponse(
  body: unknown,
  options: { readonly status?: number; readonly durationMs?: number } = {},
): Reply {
  const status = options.status ?? 200;
  const text = JSON.stringify(body);
  return {
    kind: "response",
    response: {
      ok: status >= 200 && status < 300,
      status,
      text,
      json: body,
      durationMs: options.durationMs ?? 7,
    },
  };
}

/** Build a non-JSON response — an HTML error page, a bare string, an empty body. */
export function textResponse(
  text: string,
  options: { readonly status?: number; readonly durationMs?: number } = {},
): Reply {
  const status = options.status ?? 200;
  return {
    kind: "response",
    response: {
      ok: status >= 200 && status < 300,
      status,
      text,
      json: null,
      durationMs: options.durationMs ?? 7,
    },
  };
}

/** A transport-level failure: the request never got an answer. */
export function networkFailure(code: TechnocoreErrorCode = "NETWORK_UNREACHABLE"): Reply {
  return { kind: "throw", error: new TechnocoreError(code, { step: "test" }) };
}

export function createFakeTransport(replies: readonly Reply[]): FakeTransport {
  const queue = [...replies];
  const calls: RecordedCall[] = [];

  return {
    kind: "direct",
    describe: "fake transport (no network)",
    get calls() {
      return calls;
    },
    get paths() {
      return calls.map((call) => call.path);
    },
    get remaining() {
      return queue.length;
    },
    async send(request: TechnocoreRequest): Promise<TechnocoreResponse> {
      // The real guard, on the real request. A path or body the app could not send fails here too.
      assertEgressPermitted({ method: request.method, path: request.path, body: request.body });

      calls.push({ method: request.method, path: request.path, body: request.body });

      const next = queue.shift();
      if (next === undefined) {
        throw new Error(
          `fake transport: unscripted ${request.method} ${request.path} (call ${calls.length})`,
        );
      }
      if (next.kind === "throw") throw next.error;
      return next.response;
    },
  };
}
