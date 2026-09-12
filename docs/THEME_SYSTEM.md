# Technocore Design System: Theme Architecture & Light Mode Default

## Overview

The Technocore Agent Starter features a dual-theme architecture designed for precision cryptographic instruments and development environments:
- **Light Mode (Default Theme)**: Clean, crisp, high-contrast visual language with white and off-white laboratory surfaces (`#f8fafc` void, `#ffffff` panel), dark ink typography (`#090d16`), deep teal signal accents (`#0d9488`), and accessible status colors.
- **Dark Mode (Optional Theme)**: Deep cyber instrument palette with Obsidian void (`#090b0e`), elevated graphite panels (`#161c26`), luminous ink (`#f8fafc`), and neon signal aqua (`#4fe3c1`).

---

## 1. Default Theme & Resolution Rules

### Priority Order:
1. **Explicit Stored User Preference (`localStorage.getItem("technocore_theme")`)**:
   - `"light"`: Forces Light Mode.
   - `"dark"`: Forces Dark Mode.
   - `"system"`: Dynamically tracks `window.matchMedia("(prefers-color-scheme: dark)")`.
2. **First Visit / Fresh Session / No Stored Preference**:
   - Defaults directly to **`"light"`**.
   - The OS `prefers-color-scheme` does **not** override the application's default light mode unless the user explicitly chooses `"system"`.

---

## 2. Zero-FOUC & SSR Hydration Bootstrap

To prevent any Flash of Unstyled Content (FOUC) or dark-mode flash during server-side rendering and client hydration, an inline bootstrap script executes synchronously inside `<head>` before HTML body rendering:

```html
<script>
  (function() {
    try {
      var t = localStorage.getItem("technocore_theme") || "light";
      var d = t === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
      document.documentElement.setAttribute("data-theme", d);
      if (d === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
        document.documentElement.style.colorScheme = "dark";
      } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
      }
    } catch (e) {}
  })();
</script>
```

---

## 3. Semantic Design Tokens

All styles are centralized in CSS variables declared within `app/globals.css`.

| Semantic Token | Tailwind Utility | Light Mode (Default) | Dark Mode | Role & Intent |
| :--- | :--- | :--- | :--- | :--- |
| `--theme-void` | `bg-void` | `#f8fafc` (Slate 50) | `#090b0e` (Deep Void) | Canvas base background |
| `--theme-graphite` | `bg-graphite` | `#f1f5f9` (Slate 100) | `#12161d` (Subtle Dark) | Inset panels / gutters |
| `--theme-panel` | `bg-panel` | `#ffffff` (Pure White) | `#161c26` (Panel Base) | Cards, modals, work surfaces |
| `--theme-panel-high` | `bg-panel-high`| `#f8fafc` | `#1f2735` | Hovered items, elevated tables |
| `--theme-hairline` | `border-hairline`| `#cbd5e1` (Slate 300) | `#2b3648` (Slate 700) | Structural card & table borders |
| `--theme-hairline-bright`| `border-hairline-bright`| `#94a3b8` | `#43526a` | Focused/active borders |
| `--theme-ink` | `text-ink` | `#090d16` (Deep Navy) | `#f8fafc` (High White) | Primary text & headings |
| `--theme-muted` | `text-muted` | `#334155` (Slate 700) | `#cbd5e1` (Slate 300) | Body copy & secondary readouts |
| `--theme-faint` | `text-faint` | `#64748b` (Slate 500) | `#94a3b8` (Slate 400) | Labels, placeholders, footnotes |
| `--theme-signal` | `text-signal`, `bg-signal` | `#0d9488` (Teal 600) | `#4fe3c1` (Aqua 400) | Cryptographic data (DIDs, keys) |
| `--theme-verified` | `text-verified` | `#16a34a` (Green 600) | `#4ade80` (Green 400) | Valid signatures & verified state |
| `--theme-attention`| `text-attention`| `#d97706` (Amber 600) | `#fbbf24` (Amber 400) | Warnings, pending verification |
| `--theme-fault` | `text-fault` | `#dc2626` (Red 600) | `#f87171` (Red 400) | Signature errors & network faults |

---

## 4. Theme Switching (`useTheme` & `ThemeToggle`)

- **Hook**: `useTheme()` from `@/hooks/useTheme.tsx` exposes:
  - `theme`: Current setting (`"light" | "dark" | "system"`).
  - `resolvedTheme`: Currently active resolved appearance (`"light" | "dark"`).
  - `toggleTheme()`: Instant switch between Light and Dark.
  - `setTheme(theme)`: Sets specific theme mode.
- **Component**: `<ThemeToggle />` in `src/ui/ThemeToggle.tsx`:
  - Micro-animated Sun icon (with rotating rays) shown in Light mode.
  - Smooth celestial Moon transition shown in Dark mode.
  - Accessible `aria-label` and `title` indicating the destination action (e.g., "Switch to dark mode").

---

## 5. Guidelines for Adding New Themed Components

When building or styling new components:
1. **Never use hardcoded presentation classes** like `text-white`, `text-black`, `bg-black/40`, or `border-white/10`.
2. **Use semantic Tailwind utilities**:
   - `bg-panel` for cards, `bg-void` for full-width views.
   - `text-ink` for headings, `text-muted` for body, `text-faint` for meta labels.
   - `border-hairline` for borders and dividers.
   - `text-signal` or `text-verified` for cryptographic outputs.
3. **Interactive buttons & links**:
   - Use `buttonClasses("primary")` or `buttonClasses("secondary")` from `src/ui/buttonStyles.ts`.
4. **Accessible Contrast**:
   - Ensure text in Light Mode satisfies WCAG AA (>= 4.5:1 ratio for normal text).
   - In Light Mode, `--theme-ink` (`#090d16`) over `--theme-void` (`#f8fafc`) yields a **17.8:1** contrast ratio.
