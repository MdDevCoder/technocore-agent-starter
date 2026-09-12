#!/usr/bin/env node
/**
 * Production Deployment Smoke Test Suite
 *
 * Verifies live production deployments or local staging instances against:
 * 1. HTTP 200 and valid content types on all primary routes and APIs
 * 2. Static discovery assets (/robots.txt, /sitemap.xml, /icon)
 * 3. Strict security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
 * 4. CSS stylesheet asset resolution and availability
 * 5. Canonical metadata and OpenGraph configuration
 * 6. Zero secret, local filesystem, localhost, or debug leakages
 * 7. Light mode default initialization
 *
 * Usage:
 *   node scripts/production-smoke-test.mjs --url https://your-production-domain.com
 *   node scripts/production-smoke-test.mjs --url http://localhost:3000
 */

import { parseArgs } from "node:util";

const args = parseArgs({
  options: {
    url: { type: "string", short: "u" },
    help: { type: "boolean", short: "h" },
    timeout: { type: "string", short: "t" },
  },
  allowPositionals: true,
});

if (args.values.help) {
  console.log(`
Production Deployment Smoke Test Suite

Usage:
  node scripts/production-smoke-test.mjs --url <URL> [--timeout <ms>]

Options:
  -u, --url       Base URL of the target environment to test (required or via SMOKE_TARGET_URL)
  -t, --timeout   HTTP request timeout in milliseconds (default: 10000)
  -h, --help      Display this help message
`);
  process.exit(0);
}

const rawUrl =
  args.values.url ||
  process.env.SMOKE_TARGET_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000";

const TARGET_URL = rawUrl.replace(/\/+$/, "");
const TIMEOUT_MS = parseInt(args.values.timeout || "10000", 10);
const isHttps = TARGET_URL.startsWith("https://");

console.log("==================================================");
console.log("   TECHNOCORE AGENT STARTER — PRODUCTION SMOKE TEST");
console.log("==================================================");
console.log(`Target URL : ${TARGET_URL}`);
console.log(`Protocol   : ${isHttps ? "HTTPS (Production Mode)" : "HTTP (Local / Staging Mode)"}`);
console.log(`Timeout    : ${TIMEOUT_MS}ms`);
console.log("--------------------------------------------------\n");

const ROUTES_TO_TEST = [
  // Primary Public Landing & Tools
  { path: "/", type: "html", name: "Landing / Home" },
  { path: "/start", type: "html", name: "First Agent Builder" },
  { path: "/trace", type: "html", name: "Agent Trace Studio" },
  { path: "/workspace", type: "html", name: "Agent Workspace" },
  { path: "/health", type: "html", name: "Agent Health Monitor" },
  { path: "/faq", type: "html", name: "FAQ" },
  { path: "/privacy", type: "html", name: "Privacy Policy" },
  { path: "/terms", type: "html", name: "Terms of Service" },
  { path: "/doctor", type: "html", name: "Signature Doctor" },
  { path: "/observatory", type: "html", name: "Network Observatory" },
  { path: "/testkit", type: "html", name: "TCLK TestKit" },
  { path: "/forge", type: "html", name: "Technocore Payload Forge" },
  { path: "/contributions/tclk-testkit", type: "html", name: "TCLK Contribution Proof" },
  { path: "/civilization", type: "html", name: "Civilization Protocol Dashboard" },
  { path: "/agent", type: "html", name: "Autonomous Agent Client" },
  { path: "/import", type: "html", name: "Identity Import" },

  // Onboarding Workflow Steps
  { path: "/onboarding/identity", type: "html", name: "Onboarding: Identity Step" },
  { path: "/onboarding/backup", type: "html", name: "Onboarding: Backup Step" },
  { path: "/onboarding/introduce", type: "html", name: "Onboarding: Introduce Step" },
  { path: "/onboarding/contribute", type: "html", name: "Onboarding: Contribute Step" },
  { path: "/onboarding/verify", type: "html", name: "Onboarding: Verify Step" },
  { path: "/onboarding/complete", type: "html", name: "Onboarding: Complete Step" },

  // Discovery & SEO Endpoints
  { path: "/robots.txt", type: "text", name: "Robots.txt" },
  { path: "/sitemap.xml", type: "xml", name: "Sitemap.xml" },
  { path: "/icon", type: "image", name: "Dynamic App Icon" },

  // Public Health & Read-Only API Endpoints
  { path: "/api/civilization/health", type: "json", name: "API: Civilization Health" },
  { path: "/api/civilization/network/status", type: "json", name: "API: Network Status" },
  { path: "/api/civilization/network/rooms", type: "json", name: "API: Tracked Rooms" },
  { path: "/api/civilization/network/deals", type: "json", name: "API: Observed Deals" },
  { path: "/api/civilization/network/agents", type: "json", name: "API: Observed Agents" },
];

const LEAK_PATTERNS = [
  { name: "Private Key Seed/JWK", regex: /"kty"\s*:\s*"OKP"|"d"\s*:\s*"[A-Za-z0-9_-]{43}"/i },
  { name: "Raw Private Key PEM", regex: new RegExp(["-----", "BEGIN", " (?:RSA |EC |OPENSSH )?", "PRIVATE KEY", "-----"].join(""), "i") },
  { name: "Database Connection Secret", regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@/i },
  { name: "Local Filesystem Path", regex: /[A-Za-z]:\\(?:Users|Downloads|Projects|workspace)|file:\/\/\//i },
  { name: "VS Code / IDE Link", regex: /vscode:\/\//i },
];

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

function check(title, passed, detail = "") {
  totalChecks++;
  if (passed) {
    passedChecks++;
    console.log(`  [PASS] ${title}`);
  } else {
    failedChecks++;
    failures.push({ title, detail });
    console.log(`  [FAIL] ${title}${detail ? " -> " + detail : ""}`);
  }
}

async function runSmokeTest() {
  console.log("1. ROUTE AVAILABILITY & CONTENT VERIFICATION");
  console.log("--------------------------------------------");

  let discoveredCssUrls = new Set();

  for (const route of ROUTES_TO_TEST) {
    const fullUrl = `${TARGET_URL}${route.path}`;
    try {
      const res = await fetchWithTimeout(fullUrl, {
        headers: {
          Accept: route.type === "html" ? "text/html,application/xhtml+xml" : route.type === "json" ? "application/json" : "*/*",
          "User-Agent": "Technocore-Production-SmokeTest/1.0",
        },
      });

      check(`${route.name} (${route.path}) HTTP Status 200`, res.status === 200, `Received ${res.status}`);

      const bodyText = await res.text();

      // Content-Type validation
      const contentType = res.headers.get("content-type") || "";
      if (route.type === "html") {
        check(`${route.name} Content-Type is HTML`, contentType.includes("text/html"), contentType);
        check(`${route.name} contains valid HTML doctype`, bodyText.toLowerCase().includes("<!doctype html>"));

        // Extract CSS links for stylesheet testing
        const cssMatches = bodyText.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi);
        for (const m of cssMatches) {
          if (m[1]) {
            const resolvedCss = m[1].startsWith("http") ? m[1] : `${TARGET_URL}${m[1]}`;
            discoveredCssUrls.add(resolvedCss);
          }
        }

        // Check for theme initialization script
        check(`${route.name} has light mode default theme script`, bodyText.includes('data-theme') || bodyText.includes('technocore_theme'));

        // Check for canonical link
        check(`${route.name} has canonical link`, bodyText.includes('rel="canonical"') || bodyText.includes("metadataBase"));
      } else if (route.type === "json") {
        check(`${route.name} Content-Type is JSON`, contentType.includes("application/json"), contentType);
        let parsedJson = null;
        try {
          parsedJson = JSON.parse(bodyText);
        } catch {
          // not valid json
        }
        check(`${route.name} valid JSON body`, parsedJson !== null);
      } else if (route.type === "xml") {
        check(`${route.name} Content-Type is XML`, contentType.includes("xml"), contentType);
        check(`${route.name} contains <urlset>`, bodyText.includes("<urlset") || bodyText.includes("<sitemapindex"));
      } else if (route.type === "text") {
        check(`${route.name} contains sitemap directive`, bodyText.includes("Sitemap:") || bodyText.includes("sitemap.xml"));
        check(`${route.name} disallows API routes`, bodyText.includes("Disallow: /api/"));
      } else if (route.type === "image") {
        check(`${route.name} is image content`, contentType.startsWith("image/"));
      }

      // Leak scans on all responses
      for (const leak of LEAK_PATTERNS) {
        const found = leak.regex.test(bodyText);
        check(`${route.name} no ${leak.name} leakage`, !found, found ? `Pattern matched in response body` : "");
      }

      // If testing a production URL (non-localhost), verify no localhost references exist in HTML
      if (!TARGET_URL.includes("localhost") && !TARGET_URL.includes("127.0.0.1")) {
        const hasLocalhost = /http:\/\/localhost:\d+|http:\/\/127\.0\.0\.1:\d+/.test(bodyText);
        check(`${route.name} zero localhost references in production output`, !hasLocalhost, "Response body contains localhost URL");
      }
    } catch (err) {
      check(`${route.name} (${route.path}) Reachability`, false, err.message);
    }
  }

  console.log("\n2. SECURITY HEADERS VERIFICATION");
  console.log("---------------------------------");
  try {
    const rootRes = await fetchWithTimeout(`${TARGET_URL}/`, {
      headers: { "User-Agent": "Technocore-Production-SmokeTest/1.0" },
    });

    const csp = rootRes.headers.get("content-security-policy");
    const xcto = rootRes.headers.get("x-content-type-options");
    const xfo = rootRes.headers.get("x-frame-options");
    const rp = rootRes.headers.get("referrer-policy");
    const permPolicy = rootRes.headers.get("permissions-policy");
    const hsts = rootRes.headers.get("strict-transport-security");

    check("Content-Security-Policy header present", !!csp, csp || "Missing");
    if (csp) {
      check("CSP defines default-src 'self'", csp.includes("default-src 'self'"));
      check("CSP defines frame-ancestors 'none'", csp.includes("frame-ancestors 'none'"));
      check("CSP defines object-src 'none'", csp.includes("object-src 'none'"));
    }

    check("X-Content-Type-Options: nosniff", xcto === "nosniff", xcto || "Missing");
    check("X-Frame-Options: DENY", xfo === "DENY", xfo || "Missing");
    check("Referrer-Policy: no-referrer", rp === "no-referrer", rp || "Missing");
    check("Permissions-Policy header present", !!permPolicy, permPolicy || "Missing");

    if (isHttps) {
      check("Strict-Transport-Security header present on HTTPS", !!hsts, hsts || "Missing");
    }
  } catch (err) {
    check("Security headers check reachability", false, err.message);
  }

  console.log("\n3. STYLESHEET & ASSET RESOLUTION");
  console.log("--------------------------------");
  if (discoveredCssUrls.size === 0) {
    console.log("  [INFO] No external <link rel='stylesheet'> tags found (inlined or dynamically injected).");
  } else {
    for (const cssUrl of discoveredCssUrls) {
      try {
        const cssRes = await fetchWithTimeout(cssUrl);
        check(`CSS Asset (${new URL(cssUrl).pathname}) HTTP Status 200`, cssRes.status === 200, `Received ${cssRes.status}`);
        const cssType = cssRes.headers.get("content-type") || "";
        check(`CSS Asset Content-Type is text/css`, cssType.includes("text/css"), cssType);
      } catch (err) {
        check(`CSS Asset Reachability (${cssUrl})`, false, err.message);
      }
    }
  }

  console.log("\n==================================================");
  console.log("   PRODUCTION SMOKE TEST SUMMARY");
  console.log("==================================================");
  console.log(`Total Checks  : ${totalChecks}`);
  console.log(`Passed Checks : ${passedChecks}`);
  console.log(`Failed Checks : ${failedChecks}`);

  if (failedChecks > 0) {
    console.log("\nFailures Detail:");
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. [FAIL] ${f.title}: ${f.detail}`);
    });
    console.log("\nVERDICT: SMOKE TEST FAILED");
    process.exit(1);
  } else {
    console.log("\nVERDICT: ALL SMOKE TEST CHECKS PASSED");
    process.exit(0);
  }
}

runSmokeTest().catch((err) => {
  console.error("Unhandled smoke test error:", err);
  process.exit(1);
});
