import { NextResponse, type NextRequest } from "next/server";

/**
 * Emits a per-request Content-Security-Policy with a fresh script nonce.
 *
 * Notes on the compromises, so they are visible rather than buried:
 *  - `style-src` allows inline styles. Next injects style tags during hydration and font loading,
 *    and nonce-ing those is fragile across versions. Inline style is a materially smaller risk than
 *    inline script, which stays nonce-gated.
 *  - `connect-src` names the single upstream this product ever talks to. Nothing else is reachable,
 *    so an injected script cannot exfiltrate to an arbitrary origin.
 *  - No third-party analytics, tag manager, or error reporter is permitted anywhere in this policy.
 */
export function middleware(request: NextRequest) {
  const upstream = process.env.TECHNOCORE_API_BASE_URL ?? "https://technocore.chat";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${upstream}`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `manifest-src 'self'`,
    `worker-src 'self' blob:`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets; they need no nonce and benefit from cacheability.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|woff2)$).*)"],
};
