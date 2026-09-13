#!/usr/bin/env node

/**
 * Next.js CSS Asset & Manifest Health Diagnostic
 *
 * Verifies that the running Next.js server is serving HTML pages AND that all
 * referenced stylesheet assets are actively resolvable, return HTTP 200, have
 * valid text/css content type, and contain expected application styles.
 *
 * Failure indicates a stale or corrupted dev server / build manifest mismatch.
 */

const DEFAULT_PORT = parseInt(process.env.PORT || "3000", 10);
const DEFAULT_HOST = process.env.HOST || "localhost";
const BASE_URL = process.env.APP_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

const ROUTES_TO_CHECK = [
  "/",
  "/doctor",
  "/testkit",
  "/observatory",
  "/forge",
  "/civilization",
  "/evidence",
  "/activity",
  "/contributions",
];

const REQUIRED_CSS_TOKENS = [
  "--theme-void",
  "--theme-signal",
  "font-sans",
  "background-color",
];

async function checkRoute(route, baseUrl) {
  const pageUrl = `${baseUrl}${route}`;
  const result = {
    route,
    pageUrl,
    pageStatus: 0,
    stylesheets: [],
    errors: [],
  };

  try {
    const pageRes = await fetch(pageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "TechnocoreCssHealthCheck/1.0",
      },
    });

    result.pageStatus = pageRes.status;
    if (pageRes.status !== 200) {
      result.errors.push(`Page returned HTTP ${pageRes.status} (expected 200)`);
      return result;
    }

    const html = await pageRes.text();

    // Extract all <link rel="stylesheet" ...> tags
    const linkMatches = Array.from(html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi));
    
    // Also extract href if rel comes after href
    const altLinkMatches = Array.from(html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["'][^>]*>/gi));

    const hrefs = new Set();

    for (const match of linkMatches) {
      const tag = match[0];
      const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        hrefs.add(hrefMatch[1]);
      }
    }

    for (const match of altLinkMatches) {
      if (match[1]) {
        hrefs.add(match[1]);
      }
    }

    if (hrefs.size === 0) {
      // Check if inline styles exist or if page is missing styles entirely
      const hasStyleTag = /<style\b[^>]*>/i.test(html);
      if (!hasStyleTag) {
        result.errors.push(`No stylesheet <link> or <style> tags found in rendered HTML`);
      }
    }

    for (const href of hrefs) {
      const cssUrl = new URL(href, pageUrl).href;
      const cssResult = {
        href,
        cssUrl,
        status: 0,
        contentType: null,
        sizeBytes: 0,
        hasRequiredTokens: false,
        error: null,
      };

      try {
        const cssRes = await fetch(cssUrl, {
          headers: {
            Accept: "text/css,*/*;q=0.1",
            "User-Agent": "TechnocoreCssHealthCheck/1.0",
          },
        });

        cssResult.status = cssRes.status;
        cssResult.contentType = cssRes.headers.get("content-type") || "";

        if (cssRes.status !== 200) {
          cssResult.error = `HTTP ${cssRes.status}`;
          result.errors.push(`Stylesheet asset ${href} returned HTTP ${cssRes.status}`);
        } else {
          const cssText = await cssRes.text();
          cssResult.sizeBytes = cssText.length;

          if (cssText.length < 50) {
            cssResult.error = `CSS content suspiciously small (${cssText.length} bytes)`;
            result.errors.push(`Stylesheet asset ${href} is empty or too small`);
          } else {
            // Check for expected design tokens / styles
            const matchedToken = REQUIRED_CSS_TOKENS.some((token) => cssText.includes(token));
            cssResult.hasRequiredTokens = matchedToken;
            if (!matchedToken) {
              // Warning or error if design system tokens are absent
              cssResult.error = "Design tokens not found in CSS";
              result.errors.push(`Stylesheet asset ${href} does not contain expected design tokens`);
            }
          }
        }
      } catch (fetchErr) {
        cssResult.error = fetchErr.message;
        result.errors.push(`Failed to fetch stylesheet ${href}: ${fetchErr.message}`);
      }

      result.stylesheets.push(cssResult);
    }
  } catch (err) {
    result.errors.push(`Failed to fetch page ${pageUrl}: ${err.message}`);
  }

  return result;
}

export async function runCssHealthCheck(baseUrl = BASE_URL) {
  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl,
    healthy: true,
    totalRoutes: ROUTES_TO_CHECK.length,
    passedRoutes: 0,
    failedRoutes: 0,
    routeResults: [],
  };

  for (const route of ROUTES_TO_CHECK) {
    const routeRes = await checkRoute(route, baseUrl);
    summary.routeResults.push(routeRes);
    if (routeRes.errors.length === 0 && routeRes.pageStatus === 200) {
      summary.passedRoutes++;
    } else {
      summary.failedRoutes++;
      summary.healthy = false;
    }
  }

  return summary;
}

// CLI runner
if (process.argv[1] && process.argv[1].endsWith("check-css-health.mjs")) {
  const args = process.argv.slice(2);
  let targetUrl = BASE_URL;

  const urlIdx = args.indexOf("--url");
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    targetUrl = args[urlIdx + 1];
  }

  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    targetUrl = `http://${DEFAULT_HOST}:${args[portIdx + 1]}`;
  }

  console.log("=".repeat(80));
  console.log(` NEXT.JS CSS ASSET & MANIFEST HEALTH CHECK`);
  console.log(` Target Server: ${targetUrl}`);
  console.log("=".repeat(80));

  runCssHealthCheck(targetUrl).then((summary) => {
    console.log(`\nChecked ${summary.totalRoutes} routes:`);
    for (const r of summary.routeResults) {
      const statusIcon = r.errors.length === 0 ? "✔ [PASS]" : "✖ [FAIL]";
      console.log(`  ${statusIcon} ${r.route} (Page HTTP ${r.pageStatus})`);
      for (const s of r.stylesheets) {
        const sIcon = !s.error ? "  └─ [CSS OK]" : "  └─ [CSS FAIL]";
        console.log(`     ${sIcon} ${s.href} -> Status: ${s.status}, Size: ${s.sizeBytes} B ${s.error ? `(${s.error})` : ""}`);
      }
      for (const e of r.errors) {
        console.log(`     └─ ERROR: ${e}`);
      }
    }

    console.log("\n" + "=".repeat(80));
    if (summary.healthy) {
      console.log(" ✔ CSS HEALTH CHECK PASSED: All pages and CSS assets verified.");
      console.log("=".repeat(80));
      process.exit(0);
    } else {
      console.error("\n ✖ Next.js CSS asset unavailable — stale/mismatched dev server detected.");
      console.error("   The running Next.js process is serving HTML pointing to missing CSS hashes.");
      console.error("   Action: Restart development server with 'npm run dev' to rebuild asset manifests.");
      console.error("=".repeat(80));
      process.exit(1);
    }
  }).catch((err) => {
    console.error(`\n✖ Fatal error during CSS health check: ${err.message}`);
    console.error("Next.js CSS asset unavailable — stale/mismatched dev server detected.");
    process.exit(1);
  });
}
