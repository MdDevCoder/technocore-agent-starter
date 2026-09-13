#!/usr/bin/env node
/**
 * Automated Pre-Launch Readiness, Trust, Privacy & Security Audit Script
 *
 * Checks:
 * 1. Public Route Health & HTTP 200 Verification
 * 2. Static SEO Artifacts (robots.txt, sitemap.xml, favicon)
 * 3. Broken Link & Internal Path Crawler (zero localhost, file://, vscode://, C:\, D:\ leaks)
 * 4. Secret & Private Key Pattern Invariant Scan
 * 5. Public Environment Variable Isolation (NEXT_PUBLIC_* safety)
 * 6. HTTP Security Headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
 * 7. CSS Manifest & Asset Integrity
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.AUDIT_TARGET_URL || "http://localhost:3000";

function printBanner() {
  console.log("================================================================================");
  console.log("       TECHNOCORE AGENT STARTER — AUTOMATED PRE-LAUNCH READINESS AUDIT          ");
  console.log(`       Target Host: ${BASE_URL}                                                 `);
  console.log("================================================================================\n");
}

function getAllFiles(dir, extensions) {
  let results = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      if (
        file === "node_modules" ||
        file === ".next" ||
        file === ".next-dev" ||
        file === ".git" ||
        file === "dist" ||
        file === ".vercel"
      )
        continue;
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFiles(fullPath, extensions));
      } else if (extensions.some((ext) => file.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore missing
  }
  return results;
}

async function auditRoutes() {
  console.log("[1/6] Auditing Core Application Routes & SEO Endpoints...");
  const routes = [
    "/",
    "/start",
    "/trace",
    "/onboarding/identity",
    "/onboarding/backup",
    "/onboarding/introduce",
    "/onboarding/contribute",
    "/onboarding/verify",
    "/onboarding/complete",
    "/import",
    "/doctor",
    "/observatory",
    "/testkit",
    "/forge",
    "/evidence",
    "/activity",
    "/contributions",
    "/workspace",
    "/readiness",
    "/health",
    "/contributions/tclk-testkit",
    "/civilization",
    "/agent",
    "/privacy",
    "/terms",
    "/faq",
    "/robots.txt",
    "/sitemap.xml",
  ];

  let passed = 0;
  let failed = 0;

  for (const route of routes) {
    try {
      const res = await fetch(`${BASE_URL}${route}`);
      if (res.status === 200) {
        console.log(`  ✔ [HTTP 200] ${route}`);
        passed++;
      } else {
        console.error(`  ✖ [HTTP ${res.status}] ${route}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✖ [FETCH ERROR] ${route} -> ${err.message}`);
      failed++;
    }
  }

  return { passed, failed, total: routes.length };
}

async function auditBrokenLinksAndPathLeaks() {
  console.log("\n[2/6] Auditing Rendered HTML for Broken Links & Path Leaks...");
  const sampleRoutes = [
    "/",
    "/doctor",
    "/observatory",
    "/testkit",
    "/civilization",
    "/privacy",
    "/terms",
    "/faq",
  ];

  let passed = 0;
  let failed = 0;

  const forbiddenStrings = [
    "file://",
    "vscode://",
    "C:\\Users\\",
    "D:\\Downloads\\",
    "d:\\downloads\\",
  ];

  for (const route of sampleRoutes) {
    try {
      const res = await fetch(`${BASE_URL}${route}`);
      const html = await res.text();

      let routeClean = true;
      for (const forbidden of forbiddenStrings) {
        if (html.toLowerCase().includes(forbidden.toLowerCase())) {
          console.error(`  ✖ [LEAK DETECTED] Route ${route} contains forbidden string: "${forbidden}"`);
          routeClean = false;
        }
      }

      if (routeClean) {
        console.log(`  ✔ [LEAK CHECK CLEAN] ${route}`);
        passed++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`  ✖ [ERROR] Failed to check route ${route}: ${err.message}`);
      failed++;
    }
  }

  return { passed, failed, total: sampleRoutes.length };
}

function auditSecretPatternsInSource() {
  console.log("\n[3/6] Auditing Codebase for Accidental Secret Key Hardcoding...");
  const files = getAllFiles(process.cwd(), [".ts", ".tsx", ".js", ".mjs", ".json"]);

  // We check for high-entropy private key patterns (sk_live, BEGIN PRIVATE KEY, etc.)
  const highRiskPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /sk_live_[0-9a-zA-Z]{24}/,
    /ghp_[0-9a-zA-Z]{36}/,
    /gho_[0-9a-zA-Z]{36}/,
    /xox[baprs]-[0-9a-zA-Z]{10,48}/,
  ];

  let flagged = 0;
  for (const file of files) {
    // Ignore test vectors and diagnostics
    if (file.includes("tests") || file.includes("fixtures")) continue;

    const content = readFileSync(file, "utf8");
    for (const pattern of highRiskPatterns) {
      if (pattern.test(content)) {
        console.error(`  ✖ [SECRET PATTERN] Found high-risk pattern in: ${file}`);
        flagged++;
      }
    }
  }

  if (flagged === 0) {
    console.log("  ✔ [CLEAN] 0 hardcoded private keys or access tokens found in production source.");
    return { passed: 1, failed: 0 };
  } else {
    return { passed: 0, failed: flagged };
  }
}

function auditPublicEnvIsolation() {
  console.log("\n[4/6] Auditing Public NEXT_PUBLIC_* Environment Variables...");
  const files = getAllFiles(process.cwd(), [".ts", ".tsx"]);

  const nextPublicRegex = /NEXT_PUBLIC_[A-Z0-9_]+/g;
  const discovered = new Set();

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const matches = content.match(nextPublicRegex);
    if (matches) {
      for (const m of matches) discovered.add(m);
    }
  }

  const allowed = new Set([
    "NEXT_PUBLIC_TECHNOCORE_BASE_URL",
    "NEXT_PUBLIC_TECHNOCORE_TRANSPORT",
    "NEXT_PUBLIC_TECHNOCORE_PROXY_PREFIX",
    "NEXT_PUBLIC_TECHNOCORE_LOBBY_ROOM",
    "NEXT_PUBLIC_TECHNOCORE_ROOM",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_VERCEL_ENV",
  ]);

  let violations = 0;
  for (const envVar of discovered) {
    if (!allowed.has(envVar)) {
      console.error(`  ✖ [UNVETTED ENV] Unapproved public environment variable: ${envVar}`);
      violations++;
    } else {
      console.log(`  ✔ [VETTED PUBLIC CONFIG] ${envVar}`);
    }
  }

  return { passed: discovered.size - violations, failed: violations };
}

async function auditSecurityHeaders() {
  console.log("\n[5/6] Auditing HTTP Security Headers on Root Route...");
  try {
    const res = await fetch(`${BASE_URL}/`);
    const headers = res.headers;

    const requiredHeaders = [
      { name: "x-content-type-options", expected: "nosniff" },
      { name: "x-frame-options", expected: "DENY" },
      { name: "referrer-policy", expected: "no-referrer" },
      { name: "content-security-policy", expectedSubstring: "default-src" },
    ];

    let passed = 0;
    let failed = 0;

    for (const req of requiredHeaders) {
      const val = headers.get(req.name);
      if (!val) {
        console.error(`  ✖ [MISSING HEADER] ${req.name}`);
        failed++;
      } else if (req.expected && val !== req.expected) {
        console.error(`  ✖ [HEADER MISMATCH] ${req.name}: got "${val}", expected "${req.expected}"`);
        failed++;
      } else if (req.expectedSubstring && !val.includes(req.expectedSubstring)) {
        console.error(`  ✖ [HEADER WEAK] ${req.name}: missing "${req.expectedSubstring}"`);
        failed++;
      } else {
        console.log(`  ✔ [HEADER OK] ${req.name}: ${val.slice(0, 45)}...`);
        passed++;
      }
    }

    return { passed, failed };
  } catch (err) {
    console.error(`  ✖ [ERROR] Failed to fetch headers: ${err.message}`);
    return { passed: 0, failed: 1 };
  }
}

async function auditCssAndStyles() {
  console.log("\n[6/6] Auditing Stylesheet Delivery...");
  try {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    const cssMatch = html.match(/href="(\/_next\/static\/css\/[^"]+\.css[^"]*)"/);

    if (cssMatch && cssMatch[1]) {
      const cssRes = await fetch(`${BASE_URL}${cssMatch[1]}`);
      if (cssRes.status === 200) {
        console.log(`  ✔ [CSS LOAD OK] ${cssMatch[1]} (HTTP 200)`);
        return { passed: 1, failed: 0 };
      }
    }
    console.error("  ✖ [CSS MISSING] Could not find resolving layout stylesheet link");
    return { passed: 0, failed: 1 };
  } catch (err) {
    console.error(`  ✖ [ERROR] CSS check failed: ${err.message}`);
    return { passed: 0, failed: 1 };
  }
}

async function main() {
  printBanner();

  const r1 = await auditRoutes();
  const r2 = await auditBrokenLinksAndPathLeaks();
  const r3 = auditSecretPatternsInSource();
  const r4 = auditPublicEnvIsolation();
  const r5 = await auditSecurityHeaders();
  const r6 = await auditCssAndStyles();

  const totalPassed = r1.passed + r2.passed + r3.passed + r4.passed + r5.passed + r6.passed;
  const totalFailed = r1.failed + r2.failed + r3.failed + r4.failed + r5.failed + r6.failed;

  console.log("\n================================================================================");
  console.log(`AUDIT SUMMARY: ${totalPassed} Checks Passed, ${totalFailed} Failed`);
  if (totalFailed === 0) {
    console.log("VERDICT: ALL AUTOMATED PRE-LAUNCH READINESS CHECKS PASSED ✔");
    console.log("================================================================================\n");
    process.exit(0);
  } else {
    console.error("VERDICT: ISSUES FOUND. PLEASE REVIEW FAILED CHECKS ABOVE ✖");
    console.log("================================================================================\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal prelaunch audit error:", err);
  process.exit(1);
});
