"use client";

/**
 * Interactive Theme Toggle Button.
 *
 * Provides a tactile, micro-animated toggle switch between Dark and Light mode.
 * Features rotating rays for the sun icon, smooth celestial transition for the moon,
 * and high-contrast focus rings.
 */

import React, { useEffect, useState } from "react";
import { useTheme } from "@/hooks/useTheme.tsx";

export function ThemeToggle({ className = "" }: { readonly className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className={`relative inline-flex size-9 items-center justify-center rounded-md border border-hairline bg-panel text-muted hover:border-hairline-bright hover:bg-panel-high hover:text-ink transition-all duration-200 active:scale-95 ${className}`}
    >
      <div className="relative size-4">
        {/* Sun Icon (shown in Light mode) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute inset-0 size-4 transition-all duration-300 ease-out ${
            isDark
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100 text-amber-500"
          }`}
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>

        {/* Moon Icon (shown in Dark mode) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute inset-0 size-4 transition-all duration-300 ease-out ${
            isDark
              ? "rotate-0 scale-100 opacity-100 text-signal"
              : "-rotate-90 scale-0 opacity-0"
          }`}
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </div>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
