# Next.js Development vs Production Build Workflow & CSS Asset Isolation

---

## 1. Executive Summary & Root Cause Analysis

### The Problem
During development, the frontend interface was observed falling back to browser default HTML (Times New Roman fonts, unstyled default blue/purple links, zero card styling, and missing dark theme tokens), while the server returned HTTP 200 for HTML requests.

### Root Cause
1. **Shared Build Output Collision (`distDir`)**: By default, both `next dev` and `next build` wrote into the `.next` directory.
2. **Manifest Invalidation During Active Sessions**: When `npm run build` ran while `next dev` was active (or left running in the background), `next build` purged `.next/` and generated hashed production chunks (e.g. `.next/static/css/8c50e2b4f65c9ff8.css`), deleting the dev chunk `.next/static/css/app/layout.css`.
3. **CSS 404 Resolution Failure**: The running `next dev` process continued serving HTML referencing `/_next/static/css/app/layout.css?v=...`, which now returned **HTTP 404 Not Found**. The browser loaded HTML but failed to fetch stylesheets, rendering unstyled default markup.

---

## 2. Architecture & Permanent Solution

### Architectural Diagram
```
DEVELOPMENT WORKFLOW                                PRODUCTION WORKFLOW
====================                                ===================
npm run dev                                         npm run build
     │                                                   │
     ▼                                                   ▼
scripts/dev-server.mjs                              next build
     │                                                   │
     ├─ Port Check & Stale PID Reclaim                   ├─ Production Optimizations
     ├─ Sets NEXT_DIST_DIR=".next-dev"                   ├─ Sets distDir=".next"
     ├─ Isolated Cache in .next-dev/                     ├─ Isolated Artifacts in .next/
     ▼                                                   ▼
next dev -p 3000                                    Production Deployment
     │
     ▼
scripts/check-css-health.mjs
(Probes rendered HTML & verifies CSS HTTP 200)
```

### Key Components

1. **Build Directory Isolation (`next.config.ts`)**:
   ```typescript
   const nextConfig: NextConfig = {
     distDir: process.env.NEXT_DIST_DIR || ".next",
     ...
   };
   ```
   - In Development (`npm run dev`): `NEXT_DIST_DIR=".next-dev"`
   - In Production (`npm run build`): `NEXT_DIST_DIR` is unset, defaulting to `.next`.
   - Result: Running `npm run build` never touches `.next-dev/`, eliminating cross-process manifest invalidation.

2. **Safe Development Controller (`scripts/dev-server.mjs`)**:
   - Cross-platform port listener detection (Windows `netstat -ano` / POSIX `lsof`).
   - Identifies stale or orphaned Node.js dev server processes occupying port 3000 and terminates them cleanly before starting.
   - Enforces `--port 3000` with `.next-dev` isolation.
   - Probes server readiness and executes an automated CSS health check.

3. **CSS Health Diagnostic Tool (`scripts/check-css-health.mjs`)**:
   - Fetches core application routes (`/`, `/doctor`, `/testkit`, `/observatory`, `/civilization`).
   - Extracts all `<link rel="stylesheet">` tags.
   - Verifies each stylesheet returns HTTP 200, `Content-Type: text/css`, size > 1000 bytes, and contains verified design system tokens (`--theme-void`, `--theme-signal`, `font-sans`).
   - Outputs: `"Next.js CSS asset unavailable — stale/mismatched dev server detected."` on any asset failure.

4. **Automated Test Suite (`tests/ui/css_asset_integrity.test.ts`)**:
   - Integrated into `npm test` to prevent regressions.

---

## 3. Developer & Operator Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts Next.js development server with single-instance port protection and `.next-dev` cache isolation. |
| `npm run dev:clean` | Cleans `.next-dev` cache before starting development server. |
| `npm run health:css` | Runs instant diagnostic against running server on port 3000, checking HTML and all CSS assets. |
| `npm run build` | Compiles optimized production bundle into `.next/` without disturbing active dev servers. |
| `npm test` | Runs complete test suite including protocol, cryptography, and CSS asset integrity tests. |
| `npm run verify` | Runs full pre-flight verification: `typecheck`, `lint`, `test`, `test:protocol`. |

---

## 4. Verification Evidence

### Test Run 1: CSS Health Check on Active Dev Server
```
================================================================================
 NEXT.JS CSS ASSET & MANIFEST HEALTH CHECK
 Target Server: http://localhost:3000
================================================================================

Checked 5 routes:
  ✔ [PASS] / (Page HTTP 200)
       └─ [CSS OK] /_next/static/css/app/layout.css -> Status: 200, Size: 143633 B 
  ✔ [PASS] /doctor (Page HTTP 200)
       └─ [CSS OK] /_next/static/css/app/layout.css -> Status: 200, Size: 143633 B 
  ✔ [PASS] /testkit (Page HTTP 200)
       └─ [CSS OK] /_next/static/css/app/layout.css -> Status: 200, Size: 143633 B 
  ✔ [PASS] /observatory (Page HTTP 200)
       └─ [CSS OK] /_next/static/css/app/layout.css -> Status: 200, Size: 143633 B 
  ✔ [PASS] /civilization (Page HTTP 200)
       └─ [CSS OK] /_next/static/css/app/layout.css -> Status: 200, Size: 143633 B 

================================================================================
 ✔ CSS HEALTH CHECK PASSED: All pages and CSS assets verified.
================================================================================
```

### Test Run 2: Concurrency Isolation Proof
1. Started `npm run dev` (running in background on `.next-dev`).
2. Executed `npm run build` (generated production assets in `.next`).
3. Ran `npm run health:css` against running dev server.
4. Result: 5/5 routes PASSED, CSS returned HTTP 200 (143KB), zero 404s.

### Test Run 3: Computed Styles Verification Across Routes
- `/doctor`: Background `rgb(9, 11, 14)`, Fonts `Space Grotesk` / `Inter` / `JetBrains Mono`, styled panels & borders.
- `/testkit`: Background `rgb(9, 11, 14)`, Dark wire frame editor, verified status badges.
- `/observatory`: Background `rgb(9, 11, 14)`, Provenance inspector cards, hairline grid.
- `/civilization`: Background `rgb(9, 11, 14)`, Live event ledger, telemetry panels, custom buttons.
