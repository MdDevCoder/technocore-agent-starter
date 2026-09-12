"use client";

/**
 * Theme Context & Provider for Technocore Autonomous Network.
 *
 * Provides instant, zero-FOUC (flash of unstyled content) theme switching
 * between Dark Mode (deep cyber instrument) and Light Mode (crisp Swiss lab instrument).
 * Persists user preference in localStorage and respects OS system preferences.
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "technocore_theme";

export function ThemeProvider({ children }: { readonly children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from storage on mount (defaults to light mode)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "dark") {
        setThemeState("dark");
        setResolvedTheme("dark");
      } else {
        setThemeState("light");
        setResolvedTheme("light");
      }
    } catch {
      setThemeState("light");
      setResolvedTheme("light");
    }
    setMounted(true);
  }, []);

  // Update DOM and resolved theme whenever theme changes
  useEffect(() => {
    if (!mounted) return;

    function computeResolved(currentTheme: Theme): ResolvedTheme {
      if (currentTheme === "dark") {
        return "dark";
      }
      return "light";
    }

    const resolved = computeResolved(theme);
    setResolvedTheme(resolved);

    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    if (resolved === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.style.colorScheme = "dark";
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage unavailable / private mode
    }

    // Listen for system changes if mode is 'system'
    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = (e: MediaQueryListEvent) => {
        const newResolved = e.matches ? "dark" : "light";
        setResolvedTheme(newResolved);
        root.setAttribute("data-theme", newResolved);
        if (newResolved === "dark") {
          root.classList.add("dark");
          root.classList.remove("light");
          root.style.colorScheme = "dark";
        } else {
          root.classList.add("light");
          root.classList.remove("dark");
          root.style.colorScheme = "light";
        }
      };
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, [theme, mounted]);

  const toggleTheme = React.useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      return next;
    });
  }, []);

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  const contextValue = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "light",
      resolvedTheme: "light",
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
