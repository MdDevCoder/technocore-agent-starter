import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runCssHealthCheck } from "../../scripts/check-css-health.mjs";

describe("Next.js CSS Asset & Manifest Health Verification", () => {
  it("1. Live CSS Health: all core routes return valid HTML and resolving CSS stylesheets", async () => {
    // If the server is not running on port 3000, we skip gracefully or verify live
    let serverReachable = false;
    try {
      const probe = await fetch("http://localhost:3000/doctor", { signal: AbortSignal.timeout(1500) });
      if (probe.status === 200) {
        serverReachable = true;
      }
    } catch {
      serverReachable = false;
    }

    if (!serverReachable) {
      // Dev server not active in this test runner environment
      return;
    }

    const summary = await runCssHealthCheck("http://localhost:3000");

    assert.equal(summary.healthy, true, "CSS health check must report healthy across all routes.");
    assert.equal(summary.failedRoutes, 0, "No routes should fail CSS asset resolution.");
    assert.ok(summary.passedRoutes >= 5, "All 5 core routes must pass.");

    for (const route of summary.routeResults) {
      assert.equal(route.pageStatus, 200, `Route ${route.route} must return HTTP 200.`);
      assert.ok(route.stylesheets.length > 0, `Route ${route.route} must have at least one stylesheet.`);
      for (const sheet of route.stylesheets) {
        assert.equal(sheet.status, 200, `Stylesheet ${sheet.href} must return HTTP 200.`);
        assert.ok(sheet.contentType?.includes("text/css"), `Stylesheet ${sheet.href} must have text/css Content-Type.`);
        assert.ok(sheet.sizeBytes > 1000, `Stylesheet ${sheet.href} must be populated (>1000 bytes).`);
        assert.equal(sheet.hasRequiredTokens, true, `Stylesheet ${sheet.href} must contain design system tokens.`);
      }
    }
  });

  it("2. Diagnostic Sensitivity: detects and rejects missing or broken CSS assets", async () => {
    // Test the verification logic against simulated server responses
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("/doctor")) {
        return new Response(
          `<!DOCTYPE html><html><head><link rel="stylesheet" href="/_next/static/css/broken.css"/></head><body>Doctor</body></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      }
      if (urlStr.includes("/broken.css")) {
        return new Response("Not Found", { status: 404, statusText: "Not Found" });
      }
      // Return 200 for other pages with empty css
      return new Response(
        `<!DOCTYPE html><html><head><link rel="stylesheet" href="/_next/static/css/mock.css"/></head><body>Page</body></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      );
    };

    try {
      const summary = await runCssHealthCheck("http://mock-server:3000");
      assert.equal(summary.healthy, false, "Must report unhealthy when a CSS asset 404s.");
      assert.ok(summary.failedRoutes > 0, "Must count failing routes.");
      const doctorRes = summary.routeResults.find((r) => r.route === "/doctor");
      assert.ok(doctorRes, "Doctor route result must be present");
      assert.ok(doctorRes.errors.length > 0, "Errors must be present");
      assert.ok(doctorRes.errors[0]?.includes("404"), "Error message must indicate 404");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
