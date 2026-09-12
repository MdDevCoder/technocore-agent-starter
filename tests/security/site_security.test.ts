/**
 * Production Readiness & Comprehensive Web Security Regression Suite
 *
 * Automated verification for:
 * 1. Zero Private Key & Seed Exposure
 * 2. NEXT_PUBLIC Environment Variable Isolation
 * 3. Dangerous Sinks & Script Injection (XSS) Prevention
 * 4. URL Policy, Open Redirect, and SSRF Blocklists
 * 5. Proxy Path Traversal & Egress Policy Enforcement
 * 6. Production Security Headers & Anti-Clickjacking
 * 7. Source Map & Version Banner Suppression
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../../next.config.ts";
import { checkContributionUrl } from "../../src/contribution/urlPolicy.ts";
import { assertEgressPermitted } from "../../src/technocore/egress.ts";

function getAllFiles(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  try {
    const list = readdirSync(dir);
    for (const file of list) {
      if (file === "node_modules" || file === ".next" || file === ".next-dev" || file === ".git") continue;
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getAllFiles(fullPath, extensions));
      } else if (extensions.some((ext) => file.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore missing directory
  }
  return results;
}

describe("1. Private Key & Credential Isolation Guarantees", () => {
  it("never includes unencrypted private keys or seed variables in NEXT_PUBLIC_* env names", () => {
    const srcFiles = getAllFiles(join(process.cwd(), "src"), [".ts", ".tsx"]);
    const appFiles = getAllFiles(join(process.cwd(), "app"), [".ts", ".tsx"]);
    const allFiles = [...srcFiles, ...appFiles];

    const nextPublicRegex = /NEXT_PUBLIC_[A-Z0-9_]+/g;
    const discoveredVars = new Set<string>();

    for (const file of allFiles) {
      const content = readFileSync(file, "utf8");
      const matches = content.match(nextPublicRegex);
      if (matches) {
        for (const m of matches) {
          discoveredVars.add(m);
        }
      }
    }

    const forbiddenKeywords = ["KEY", "SECRET", "SEED", "TOKEN", "PASS", "PRIVATE", "AUTH"];
    for (const envVar of discoveredVars) {
      const upper = envVar.toUpperCase();
      const isAllowedPublicConfig =
        upper === "NEXT_PUBLIC_TECHNOCORE_BASE_URL" ||
        upper === "NEXT_PUBLIC_TECHNOCORE_TRANSPORT" ||
        upper === "NEXT_PUBLIC_TECHNOCORE_PROXY_PREFIX" ||
        upper === "NEXT_PUBLIC_TECHNOCORE_LOBBY_ROOM" ||
        upper === "NEXT_PUBLIC_TECHNOCORE_ROOM" ||
        upper === "NEXT_PUBLIC_SITE_URL" ||
        upper === "NEXT_PUBLIC_VERCEL_ENV";

      if (!isAllowedPublicConfig) {
        const hasSecretKeyword = forbiddenKeywords.some((kw) => upper.includes(kw));
        assert.equal(
          hasSecretKeyword,
          false,
          `Forbidden sensitive keyword in public env variable: ${envVar}`
        );
      }
    }
  });

  it(".gitignore strictly excludes identity keys, private keys, and environment files", () => {
    const gitignore = readFileSync(join(process.cwd(), ".gitignore"), "utf8");
    assert.ok(gitignore.includes("agent_key.json"), ".gitignore must block agent_key.json");
    assert.ok(gitignore.includes("*.key"), ".gitignore must block *.key");
    assert.ok(gitignore.includes("*.pem"), ".gitignore must block *.pem");
    assert.ok(gitignore.includes(".env"), ".gitignore must block .env");
    assert.ok(gitignore.includes("*.technocore-identity.json"), ".gitignore must block identity backups");
  });
});

describe("2. XSS & Dangerous Sink Audit", () => {
  it("zero unvetted dangerouslySetInnerHTML sinks across the entire application", () => {
    const srcFiles = getAllFiles(join(process.cwd(), "src"), [".ts", ".tsx"]);
    const appFiles = getAllFiles(join(process.cwd(), "app"), [".ts", ".tsx"]);

    const dangerousSetInnerHtmlRegex = /<[A-Za-z0-9_]+\s+[^>]*dangerouslySetInnerHTML\s*=/;
    for (const file of srcFiles) {
      const content = readFileSync(file, "utf8");
      assert.equal(
        dangerousSetInnerHtmlRegex.test(content),
        false,
        `Unexpected dangerouslySetInnerHTML sink in ${file}`
      );
    }

    for (const file of appFiles) {
      if (!file.endsWith("layout.tsx")) {
        const content = readFileSync(file, "utf8");
        assert.equal(
          dangerousSetInnerHtmlRegex.test(content),
          false,
          `Unexpected dangerouslySetInnerHTML sink in ${file}`
        );
      }
    }
  });

  it("zero usage of eval() or Function constructor in client and server code", () => {
    const srcFiles = getAllFiles(join(process.cwd(), "src"), [".ts", ".tsx"]);
    const appFiles = getAllFiles(join(process.cwd(), "app"), [".ts", ".tsx"]);
    const allFiles = [...srcFiles, ...appFiles];

    for (const file of allFiles) {
      const content = readFileSync(file, "utf8");
      assert.equal(content.includes("eval("), false, `Forbidden eval() in ${file}`);
      assert.equal(content.includes("new Function("), false, `Forbidden new Function() in ${file}`);
    }
  });
});

describe("3. SSRF, Open Redirect & URL Policy Defense", () => {
  it("rejects local and private hostnames (localhost, 127.0.0.1, 10.x, 192.168.x)", () => {
    const blockedUrls = [
      "https://localhost:3000",
      "https://localhost/admin",
      "https://127.0.0.1/status",
      "https://0.0.0.0",
      "https://[::1]:8080",
      "https://10.0.0.1/secret",
      "https://192.168.1.1/router",
      "https://172.16.0.1/config",
      "https://internal.service.local",
      "https://test.invalid",
    ];

    for (const url of blockedUrls) {
      const res = checkContributionUrl(url);
      assert.equal(
        res.ok,
        false,
        `Expected SSRF/local URL to be rejected: ${url}`
      );
    }
  });

  it("rejects cloud metadata IP addresses (169.254.169.254 AWS/GCP/Azure IMDS)", () => {
    const imdsUrls = [
      "https://169.254.169.254/latest/meta-data/",
      "https://169.254.169.254/metadata/v1",
    ];

    for (const url of imdsUrls) {
      const res = checkContributionUrl(url);
      assert.equal(res.ok, false, `Expected Cloud IMDS URL to be rejected: ${url}`);
    }
  });

  it("accepts valid, public HTTPS URLs from verified domains", () => {
    const allowedUrls = [
      "https://github.com/MdDevCoder/technocore-agent-starter",
      "https://x.com/Muhammad_0423/status/1234567890",
      "https://gitlab.com/example/repo",
    ];

    for (const url of allowedUrls) {
      const res = checkContributionUrl(url);
      assert.equal(res.ok, true, `Expected valid public URL to pass: ${url}`);
    }
  });
});

describe("4. Technocore Reverse Proxy Egress Invariants", () => {
  it("permits only authorized Technocore room paths", () => {
    assert.doesNotThrow(() => {
      assertEgressPermitted({
        method: "GET",
        path: "/r/lobby?format=json",
      });
    });

    assert.doesNotThrow(() => {
      assertEgressPermitted({
        method: "GET",
        path: "/kv/did/1234567890abcdef",
      });
    });
  });

  it("rejects path traversal attempts and arbitrary egress targets", () => {
    const maliciousPaths = [
      "/../../etc/passwd",
      "/admin/wipe",
      "/r/lobby/../../../secret",
      "//evil.com/payload",
      "/api/v1/internal",
    ];

    for (const p of maliciousPaths) {
      assert.throws(
        () => {
          assertEgressPermitted({
            method: "GET",
            path: p,
          });
        },
        /EGRESS_REFUSED/,
        `Expected egress violation on ${p}`
      );
    }
  });
});

describe("5. HTTP Security Headers & Production Configuration", () => {
  it("next.config.ts configures strict anti-clickjacking and nosniff headers", async () => {
    assert.equal(nextConfig.poweredByHeader, false, "X-Powered-By must be disabled");
    assert.equal(nextConfig.productionBrowserSourceMaps, false, "Production source maps must be disabled");

    if (typeof nextConfig.headers === "function") {
      const headersConfig = await nextConfig.headers();
      const globalRule = headersConfig.find((r) => r.source === "/:path*");
      assert.ok(globalRule, "Must have global header rules for /:path*");

      const headerMap = new Map(globalRule.headers.map((h) => [h.key.toLowerCase(), h.value]));
      assert.equal(headerMap.get("x-content-type-options"), "nosniff");
      assert.equal(headerMap.get("x-frame-options"), "DENY");
      assert.equal(headerMap.get("referrer-policy"), "no-referrer");
      assert.ok(headerMap.get("strict-transport-security")?.includes("max-age=63072000"));
      assert.ok(headerMap.get("permissions-policy")?.includes("camera=()"));
    }
  });
});
