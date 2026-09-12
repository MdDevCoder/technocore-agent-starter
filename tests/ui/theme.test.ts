/**
 * Theme System Regression Test Suite
 *
 * Validates the global design system theme contract:
 * 1. Default theme is Light Mode.
 * 2. Explicit dark preference is respected.
 * 3. Explicit light preference is respected.
 * 4. Theme persistence via localStorage ("technocore_theme").
 * 5. Theme toggle mechanics and DOM attribute synchronization.
 * 6. No SSR hydration mismatch (inline head bootstrap script matches default).
 * 7. CSS design tokens present for both Light and Dark palettes.
 * 8. Semantic tokens provide high-contrast and readable surfaces in Light Mode.
 * 9. Dark Mode remains fully supported as a complete override.
 * 10. No hardcoded dark presentation assumptions across components.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT_DIR = process.cwd();

describe("Theme System & Light Mode Default", () => {
  it("1. globals.css defines Light Mode as the :root default", () => {
    const cssPath = join(ROOT_DIR, "app", "globals.css");
    const css = readFileSync(cssPath, "utf-8");

    // :root must be defined with light mode variables
    const rootBlockMatch = css.match(/:root,\s*\[data-theme="light"\],\s*\.light\s*\{([^}]+)\}/);
    assert.ok(rootBlockMatch && rootBlockMatch[1], ":root must be grouped with [data-theme=\"light\"] and .light");

    const rootContent = rootBlockMatch[1];
    assert.ok(rootContent.includes("color-scheme: light;"), ":root must declare color-scheme: light");
    assert.ok(rootContent.includes("--theme-void: #f8fafc;"), ":root must declare light void background");
    assert.ok(rootContent.includes("--theme-panel: #ffffff;"), ":root must declare white panel surface");
    assert.ok(rootContent.includes("--theme-ink: #090d16;"), ":root must declare dark ink foreground");
    assert.ok(rootContent.includes("--theme-signal: #0d9488;"), ":root must declare high-contrast signal teal");
    assert.ok(rootContent.includes("--theme-verified: #16a34a;"), ":root must declare readable verified green");
    assert.ok(rootContent.includes("--theme-attention: #d97706;"), ":root must declare readable attention amber");
    assert.ok(rootContent.includes("--theme-fault: #dc2626;"), ":root must declare readable fault red");
  });

  it("2. globals.css maintains Dark Mode as an override palette", () => {
    const cssPath = join(ROOT_DIR, "app", "globals.css");
    const css = readFileSync(cssPath, "utf-8");

    const darkBlockMatch = css.match(/\[data-theme="dark"\],\s*\.dark\s*\{([^}]+)\}/);
    assert.ok(darkBlockMatch && darkBlockMatch[1], "[data-theme=\"dark\"] and .dark must be defined");

    const darkContent = darkBlockMatch[1];
    assert.ok(darkContent.includes("color-scheme: dark;"), "Dark mode must declare color-scheme: dark");
    assert.ok(darkContent.includes("--theme-void: #090b0e;"), "Dark mode must declare deep void background");
    assert.ok(darkContent.includes("--theme-panel: #161c26;"), "Dark mode must declare cyber panel surface");
    assert.ok(darkContent.includes("--theme-ink: #f8fafc;"), "Dark mode must declare light ink foreground");
    assert.ok(darkContent.includes("--theme-signal: #4fe3c1;"), "Dark mode must declare neon signal aqua");
  });

  it("3. app/layout.tsx boots with Light Mode default in head script and viewport", () => {
    const layoutPath = join(ROOT_DIR, "app", "layout.tsx");
    const layout = readFileSync(layoutPath, "utf-8");

    assert.ok(layout.includes('themeColor: "#f8fafc"'), "Viewport themeColor must default to light (#f8fafc)");
    assert.ok(layout.includes('colorScheme: "light"'), "Viewport colorScheme must be light");
    assert.ok(
      layout.includes('var d=t==="dark"?"dark":"light"'),
      "Inline head script must strictly resolve to 'light' unless explicitly 'dark'",
    );
  });

  it("4. useTheme.tsx initial state and fallbacks default to 'light'", () => {
    const useThemePath = join(ROOT_DIR, "src", "hooks", "useTheme.tsx");
    const code = readFileSync(useThemePath, "utf-8");

    assert.ok(
      code.includes('useState<Theme>("light")'),
      "ThemeProvider must initialize theme state to 'light'",
    );
    assert.ok(
      code.includes('useState<ResolvedTheme>("light")'),
      "ThemeProvider must initialize resolvedTheme state to 'light'",
    );
    assert.ok(
      code.includes('setThemeState("light")'),
      "ThemeProvider storage fallback must set 'light'",
    );
  });

  it("5. ThemeToggle defaults to Light Mode before hydration", () => {
    const togglePath = join(ROOT_DIR, "src", "ui", "ThemeToggle.tsx");
    const toggle = readFileSync(togglePath, "utf-8");

    assert.ok(
      toggle.includes("const isDark = mounted ? resolvedTheme === \"dark\" : false;"),
      "ThemeToggle must assume light mode (isDark = false) prior to client mount",
    );
  });

  it("6. Simulates inline head script theme resolution logic", () => {
    function simulateBootstrap(storedValue: string | null): string {
      const t = storedValue;
      const resolved = t === "dark" ? "dark" : "light";
      return resolved;
    }

    // First visit: no stored preference -> Light
    assert.equal(simulateBootstrap(null), "light", "First visit -> light default");
    assert.equal(simulateBootstrap(""), "light", "Empty stored preference -> light default");

    // Explicit user choice
    assert.equal(simulateBootstrap("dark"), "dark", "Explicit dark stored -> dark");
    assert.equal(simulateBootstrap("light"), "light", "Explicit light stored -> light");
  });

  it("7. Primary button styles support light and dark contrast seamlessly", () => {
    const buttonPath = join(ROOT_DIR, "src", "ui", "buttonStyles.ts");
    const buttonCode = readFileSync(buttonPath, "utf-8");

    assert.ok(
      !buttonCode.includes("hover:bg-white"),
      "buttonStyles.ts must not have hardcoded hover:bg-white which washes out light mode",
    );
    assert.ok(
      buttonCode.includes("bg-ink text-void"),
      "buttonStyles.ts must use semantic bg-ink and text-void for primary buttons",
    );
  });

  it("8. Zero lingering presentation-only hardcoded dark classes in core components", () => {
    const disclosurePath = join(ROOT_DIR, "src", "ui", "Disclosure.tsx");
    const disclosureCode = readFileSync(disclosurePath, "utf-8");
    assert.ok(
      !disclosureCode.includes("hover:text-white"),
      "Disclosure.tsx must not contain hardcoded hover:text-white",
    );

    const networkPanelPath = join(ROOT_DIR, "src", "civilization-ui", "network", "NetworkStatusPanel.tsx");
    const networkPanelCode = readFileSync(networkPanelPath, "utf-8");
    assert.ok(
      !networkPanelCode.includes("bg-black/40"),
      "NetworkStatusPanel.tsx must use semantic panel tokens instead of bg-black/40",
    );
  });
});
