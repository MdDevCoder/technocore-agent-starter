/**
 * Error taxonomy.
 *
 * Two rules shape this file.
 *
 * **Never report a failure that did not happen, and never report success that was not observed.** The
 * CLI's `run-all` prints "AGENT REGISTERED ON TECHNOCORE" even when both network steps threw, because
 * their exceptions are caught, printed as warnings, and the banner runs unconditionally. That is the
 * exact failure mode this taxonomy exists to prevent, which is why every code carries an explicit
 * `blocking` flag: a registry that is full does not invalidate an identity or a posted message.
 *
 * **Say what to do next.** Every code carries a remedy written for the person reading it, not for the
 * developer who wrote it. No stack traces, no HTTP jargon in the primary line.
 */

export type TechnocoreErrorCode =
  | "BROWSER_UNSUPPORTED"
  | "NETWORK_UNREACHABLE"
  | "NETWORK_UNAVAILABLE"
  | "REQUEST_BLOCKED"
  | "TIMEOUT"
  | "UPSTREAM_TIMEOUT"
  | "CANCELLED"
  | "RATE_LIMITED"
  | "REGISTRY_UNCONFIRMED"
  | "SIGNATURE_REJECTED"
  | "INVALID_URL"
  | "INVALID_MESSAGE"
  | "MESSAGE_TOO_LONG"
  | "INVALID_COMMIT"
  | "MALFORMED_RESPONSE"
  | "UPSTREAM_ERROR"
  | "EGRESS_REFUSED"
  | "INVALID_IDENTITY"
  | "BACKUP_VERIFICATION_FAILED"
  | "SESSION_EXPIRED"
  | "PROXY_UNAVAILABLE"
  | "UNKNOWN_ERROR";

export interface ErrorPresentation {
  /** Short, human, no jargon. Becomes the heading of the error state. */
  readonly title: string;
  /** What actually happened, in one or two sentences. */
  readonly detail: string;
  /** What the person can do about it. Always actionable, never "try again later" alone. */
  readonly remedy: string;
  /**
   * `false` means the step did not succeed but the flow is still valid and can continue.
   * Registry capacity is the canonical example: the identity is real and room posting still works.
   */
  readonly blocking: boolean;
  readonly severity: "fault" | "attention";
  /** Whether a retry could plausibly change the outcome. */
  readonly retryable: boolean;
}

const PRESENTATION: Record<TechnocoreErrorCode, ErrorPresentation> = {
  BROWSER_UNSUPPORTED: {
    title: "This browser cannot create a Technocore identity",
    detail:
      "Ed25519 signing is not available in this browser's Web Crypto implementation. Nothing was " +
      "created, and no weaker algorithm was substituted.",
    remedy: "Use Chrome or Edge 137+, Safari 17+, or Firefox 129+, then start again.",
    blocking: true,
    severity: "fault",
    retryable: false,
  },
  NETWORK_UNREACHABLE: {
    title: "Could not reach Technocore",
    detail: "The request did not complete. This is usually connectivity, a VPN, or the service being down.",
    remedy: "Check your connection and retry. Your identity and any signature already produced are unaffected.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  NETWORK_UNAVAILABLE: {
    title: "Network connection unavailable",
    detail: "Could not establish a connection to Technocore network. Connectivity may be offline or blocked.",
    remedy: "Check your internet connection and retry. Your in-memory key state and generated signatures remain intact.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  REQUEST_BLOCKED: {
    title: "The browser blocked the request",
    detail:
      "The request was stopped before reaching Technocore — typically a cross-origin restriction, a " +
      "content blocker, or a browser extension.",
    remedy: "Retry with extensions disabled, or run this app with the server-side proxy transport enabled.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  TIMEOUT: {
    title: "Technocore did not respond in time",
    detail: "The request was cancelled after the timeout elapsed. It may or may not have been received.",
    remedy: "Retry. If the step repeats, read the room to check whether the message already landed.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  UPSTREAM_TIMEOUT: {
    title: "Technocore upstream timed out",
    detail: "The upstream Technocore service did not respond within the allocated timeout window.",
    remedy: "Retry sending the request. Your signed message is preserved and safe to re-transmit.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  CANCELLED: {
    title: "Cancelled",
    detail: "The request was stopped before it finished.",
    remedy: "Start the step again when you are ready.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  RATE_LIMITED: {
    title: "Too many requests",
    detail: "Technocore is rate limiting this client. Nothing was recorded for this attempt.",
    remedy: "Wait about a minute, then retry. Your signature is still valid and will be re-sent as-is.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  REGISTRY_UNCONFIRMED: {
    title: "Directory entry not confirmed",
    detail:
      "Your identity is real and your signed messages still work — the public DID directory just did " +
      "not confirm the entry. The directory has a fixed capacity and is known to reject new entries " +
      "when it is full.",
    remedy:
      "Continue. This step is optional and can be retried later from the agent dashboard. Nothing " +
      "about your identity or your contribution record depends on it.",
    blocking: false,
    severity: "attention",
    retryable: true,
  },
  SIGNATURE_REJECTED: {
    title: "Technocore rejected the signature",
    detail:
      "The server did not accept the signature for this message. That points at the payload bytes, not " +
      "at your key.",
    remedy: "Retry the step, which builds and signs a fresh payload. Report it if it happens twice.",
    blocking: true,
    severity: "fault",
    retryable: true,
  },
  INVALID_URL: {
    title: "That link cannot be used",
    detail: "Contribution links must be absolute https:// URLs with a public hostname and no embedded credentials.",
    remedy: "Paste the full public link to your work, starting with https://.",
    blocking: true,
    severity: "fault",
    retryable: false,
  },
  INVALID_MESSAGE: {
    title: "Nothing left to sign",
    detail: "After removing invisible and control characters, this message had no visible text.",
    remedy: "Write the message again using ordinary visible characters.",
    blocking: true,
    severity: "fault",
    retryable: false,
  },
  MESSAGE_TOO_LONG: {
    title: "Message is too long",
    detail: "Technocore accepts up to 4,096 characters per message.",
    remedy: "Shorten the text and try again.",
    blocking: true,
    severity: "fault",
    retryable: false,
  },
  INVALID_COMMIT: {
    title: "That is not a commit hash",
    detail: "A commit hash is 40 hexadecimal characters (SHA-1) or 64 (SHA-256).",
    remedy: "Paste the full hash, or skip the optional signed proof file.",
    blocking: false,
    severity: "fault",
    retryable: false,
  },
  MALFORMED_RESPONSE: {
    title: "Unreadable response from Technocore",
    detail:
      "The response did not have the shape this client expects, so no result is being claimed either " +
      "way. The step may or may not have taken effect.",
    remedy: "Read the room to check whether your message was recorded before retrying.",
    blocking: true,
    severity: "fault",
    retryable: true,
  },
  UPSTREAM_ERROR: {
    title: "Technocore returned an error",
    detail: "The service responded, but not successfully.",
    remedy: "Retry shortly. Nothing about your identity changed.",
    blocking: true,
    severity: "fault",
    retryable: true,
  },
  EGRESS_REFUSED: {
    title: "Request stopped by a local safety check",
    detail:
      "This app refused to send a request that did not match its allow-list of public, signed payloads. " +
      "Nothing was transmitted.",
    remedy: "This indicates a bug in the app rather than a problem with your input. Please report it.",
    blocking: true,
    severity: "fault",
    retryable: false,
  },
  INVALID_IDENTITY: {
    title: "Invalid or mismatched DID",
    detail: "The derived DID does not match the Ed25519 public key format (did:key:z6Mk...).",
    remedy: "Generate a fresh identity or re-import a valid backup file.",
    blocking: true,
    severity: "fault",
    retryable: false,
  },
  BACKUP_VERIFICATION_FAILED: {
    title: "Backup verification failed",
    detail: "The provided passphrase could not decrypt the backup file, or the decrypted key did not match the DID.",
    remedy: "Check your passphrase for exact spelling and casing, and verify you selected the correct .backup.json file.",
    blocking: true,
    severity: "fault",
    retryable: true,
  },
  SESSION_EXPIRED: {
    title: "Identity session reset",
    detail: "The in-memory signing handle is not present. In accordance with non-custodial security, keys are never held in cookies or localStorage.",
    remedy: "Import your encrypted .backup.json file at /import with your passphrase to restore your session.",
    blocking: true,
    severity: "attention",
    retryable: false,
  },
  PROXY_UNAVAILABLE: {
    title: "Local proxy unreachable",
    detail: "The local Next.js API proxy route (/api/technocore/...) did not respond. The development server may not be running.",
    remedy: "Ensure the Next.js server ('npm run dev') is running on port 3000, then retry.",
    blocking: false,
    severity: "fault",
    retryable: true,
  },
  UNKNOWN_ERROR: {
    title: "Unexpected error",
    detail: "An unexpected condition occurred. No private key or secret material was leaked.",
    remedy: "Retry the operation. If it persists, export your backup and reload the page.",
    blocking: true,
    severity: "fault",
    retryable: true,
  },
};

export interface TechnocoreErrorContext {
  /** HTTP status, when there was a response. */
  readonly status?: number;
  /** A short, already-sanitized excerpt of a response body. Never rendered as HTML. */
  readonly excerpt?: string;
  /** Which protocol step produced this. */
  readonly step?: string;
}

export class TechnocoreError extends Error {
  override readonly name = "TechnocoreError";
  readonly code: TechnocoreErrorCode;
  readonly presentation: ErrorPresentation;
  readonly context: TechnocoreErrorContext;

  constructor(code: TechnocoreErrorCode, context: TechnocoreErrorContext = {}) {
    const presentation = PRESENTATION[code];
    super(`${code}: ${presentation.title}`);
    this.code = code;
    this.presentation = presentation;
    this.context = context;
  }

  get blocking(): boolean {
    return this.presentation.blocking;
  }
}

export const presentationFor = (code: TechnocoreErrorCode): ErrorPresentation => PRESENTATION[code];

/**
 * Turn a `fetch` rejection into a code.
 *
 * A browser deliberately does not tell JavaScript whether a failed cross-origin request failed
 * because of CORS or because the host was unreachable — both surface as an opaque `TypeError`. So this
 * does not pretend to know. `REQUEST_BLOCKED` and `NETWORK_UNREACHABLE` are distinguished only where
 * there is real evidence: an `AbortError` is a timeout or a cancellation, and everything else is
 * reported as blocked-or-unreachable with a remedy that covers both.
 */
export function classifyTransportFailure(error: unknown, timedOut: boolean): TechnocoreError {
  if (error instanceof TechnocoreError) return error;
  if (timedOut) return new TechnocoreError("TIMEOUT");
  if (error instanceof DOMException && error.name === "AbortError") return new TechnocoreError("CANCELLED");
  if (error instanceof Error && error.name === "AbortError") return new TechnocoreError("CANCELLED");
  return new TechnocoreError("REQUEST_BLOCKED");
}

/** Map an HTTP status onto the taxonomy. Only statuses with a defensible meaning are special-cased. */
export function classifyHttpStatus(status: number, excerpt?: string): TechnocoreError {
  const context: TechnocoreErrorContext = excerpt === undefined ? { status } : { status, excerpt };
  if (status === 429) return new TechnocoreError("RATE_LIMITED", context);
  if (status === 400 || status === 401 || status === 403) {
    // A signed room post rejected with a 4xx is, in practice, a signature or payload complaint.
    return new TechnocoreError("SIGNATURE_REJECTED", context);
  }
  return new TechnocoreError("UPSTREAM_ERROR", context);
}

/**
 * Trim an untrusted response body down to something safe to show a developer.
 *
 * Length-capped, control characters stripped, and only ever rendered as text.
 */
export function safeExcerpt(body: string, limit = 200): string {
  return body
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .trim()
    .slice(0, limit);
}
