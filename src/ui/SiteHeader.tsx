"use client";

/**
 * Site Header
 *
 * Consolidated information architecture grouped into 4 distinct functional categories:
 * 1. Workspace & Flow (Workspace, Readiness, Health)
 * 2. Build & Author (Builder, Forge, Doctor, TestKit)
 * 3. Network & Trace (Observatory, Trace, Civilization)
 * 4. Identity & Actions (Import, Create Identity)
 *
 * Desktop: Compact grouped dropdown menus preventing header overflow/wrapping at 1024px.
 * Mobile: Fully accessible, structured navigation drawer with categorized sections.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClasses } from "./buttonStyles.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly description?: string;
  readonly badge?: string;
}

interface NavGroup {
  readonly id: string;
  readonly title: string;
  readonly items: readonly NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "workspace-flow",
    title: "Workspace & Flow",
    items: [
      {
        href: "/workspace",
        label: "Workspace",
        description: "Project context, handoffs & quick actions",
      },
      {
        href: "/readiness",
        label: "Readiness Flow",
        description: "7-stage development verification checklist",
        badge: "Guided",
      },
      {
        href: "/health",
        label: "Health Monitor",
        description: "Runtime signals, signing & network health",
      },
      {
        href: "/contributions",
        label: "Contributions",
        description: "Publish, record, verify & preserve contributions",
      },
      {
        href: "/evidence",
        label: "Evidence Vault",
        description: "Preserve & verify signed contribution proofs",
        badge: "Durable",
      },
      {
        href: "/activity",
        label: "Activity",
        description: "Factual development history across tools",
      },
      {
        href: "/demo",
        label: "Guided Demo",
        description: "10-stage deterministic end-to-end platform tour",
        badge: "Interactive",
      },
      {
        href: "/agent",
        label: "Agent Dashboard",
        description: "Active identity state & contribution history",
      },
    ],
  },
  {
    id: "build-author",
    title: "Build & Author",
    items: [
      {
        href: "/start",
        label: "Agent Builder",
        description: "Scaffold, sign & package starter repositories",
      },
      {
        href: "/forge",
        label: "Payload Forge",
        description: "Unicode sweep, canonicalization & code gen",
      },
      {
        href: "/doctor",
        label: "Signature Doctor",
        description: "Forensic mutation analysis & diagnostics",
      },
      {
        href: "/testkit",
        label: "TCLK-TestKit",
        description: "Protocol state machine & deal simulator",
      },
    ],
  },
  {
    id: "network-trace",
    title: "Network & Trace",
    items: [
      {
        href: "/observatory",
        label: "Observatory",
        description: "Live public room explorer & verification",
      },
      {
        href: "/trace",
        label: "Public Trace Studio",
        description: "Deterministic replay & anomaly graph",
      },
      {
        href: "/civilization",
        label: "Civilization",
        description: "Multi-agent autonomous coordination",
      },
    ],
  },
];

function isPathActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteHeader() {
  const pathname = usePathname();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on route change
  useEffect(() => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  }, [pathname]);

  // Click outside to close desktop dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Escape key to close menus
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenDropdown(null);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMouseEnter = useCallback((groupId: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenDropdown(groupId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 150);
  }, []);

  const toggleDropdown = useCallback((groupId: string) => {
    setOpenDropdown((prev) => (prev === groupId ? null : groupId));
  }, []);

  return (
    <header className="border-hairline bg-void/85 sticky top-0 z-50 border-b backdrop-blur-md transition-colors duration-200">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <Link
          href="/"
          className="mono text-ink hover:text-signal flex items-center gap-1.5 sm:gap-2 text-[0.8125rem] font-medium tracking-tight transition-colors shrink-0"
        >
          <span aria-hidden="true" className="text-signal-dim">
            {"//"}
          </span>
          technocore<span className="text-faint">/</span>starter
        </Link>

        {/* Desktop Navigation */}
        <div ref={navRef} className="hidden lg:flex items-center gap-1.5 xl:gap-2">
          {NAV_GROUPS.map((group) => {
            const isOpen = openDropdown === group.id;
            const activeItem = group.items.find((item) => isPathActive(pathname, item.href));
            const isGroupActive = Boolean(activeItem);

            return (
              <div
                key={group.id}
                className="relative"
                onMouseEnter={() => handleMouseEnter(group.id)}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  onClick={() => toggleDropdown(group.id)}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium tracking-wide transition-all duration-150 ${
                    isGroupActive
                      ? "bg-panel border border-signal/40 text-ink shadow-xs"
                      : isOpen
                      ? "bg-panel text-ink shadow-xs border border-hairline"
                      : "text-muted hover:text-ink hover:bg-panel/70 border border-transparent"
                  }`}
                >
                  {activeItem ? (
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-signal shadow-[0_0_6px_var(--color-signal)] shrink-0" />
                      <span className="text-muted font-normal hidden xl:inline">{group.title.split(" ")[0]}:</span>
                      <span className="text-signal font-semibold">{activeItem.label}</span>
                    </span>
                  ) : (
                    <span>{group.title}</span>
                  )}
                  <svg
                    className={`size-3 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-signal" : isGroupActive ? "text-signal" : "text-muted"
                    }`}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2.5 4.5L6 8L9.5 4.5" />
                  </svg>
                </button>

                {/* Dropdown Popover */}
                {isOpen && (
                  <div className="border-hairline bg-void/95 absolute top-full left-0 mt-1.5 w-64 rounded-xl border p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150 z-50">
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const isActive = isPathActive(pathname, item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`group flex flex-col rounded-lg px-3 py-2 transition-all duration-150 ${
                              isActive
                                ? "bg-panel border border-signal/40 text-ink shadow-xs"
                                : "text-muted hover:bg-panel/80 hover:text-ink border border-transparent"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                {isActive && (
                                  <span className="size-1.5 rounded-full bg-signal shadow-[0_0_6px_var(--color-signal)] shrink-0" />
                                )}
                                <span
                                  className={`text-xs font-medium ${
                                    isActive ? "text-signal font-bold" : "group-hover:text-signal"
                                  }`}
                                >
                                  {item.label}
                                </span>
                              </div>
                              {isActive ? (
                                <span className="mono text-[0.625rem] font-bold text-signal bg-signal/15 px-1.5 py-0.5 rounded border border-signal/30">
                                  CURRENT
                                </span>
                              ) : item.badge ? (
                                <span className="mono text-[0.625rem] font-semibold text-signal bg-signal/10 px-1.5 py-0.5 rounded border border-signal/20">
                                  {item.badge}
                                </span>
                              ) : null}
                            </div>
                            {item.description && (
                              <span
                                className={`text-[0.6875rem] line-clamp-1 mt-0.5 ${
                                  isActive ? "text-muted" : "text-faint group-hover:text-muted"
                                }`}
                              >
                                {item.description}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Actions (Import, Create Identity, Theme, Mobile Toggle) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Import link (Desktop) */}
          <Link
            href="/import"
            className={`hidden sm:inline-flex rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isPathActive(pathname, "/import")
                ? "bg-panel border border-signal/40 text-signal font-semibold shadow-xs"
                : "text-muted hover:text-ink hover:bg-panel border border-transparent"
            }`}
          >
            {isPathActive(pathname, "/import") && (
              <span className="size-1.5 rounded-full bg-signal shadow-[0_0_6px_var(--color-signal)] mr-1.5 self-center" />
            )}
            Import
          </Link>

          {/* Primary CTA */}
          <Link
            href="/onboarding/identity"
            className={buttonClasses(
              "primary",
              "sm",
              `text-xs sm:text-[0.8125rem] px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-sm ${
                isPathActive(pathname, "/onboarding") ? "ring-2 ring-signal/60" : ""
              }`
            )}
          >
            Create identity
          </Link>

          <ThemeToggle />

          {/* Mobile Hamburger Toggle (hidden on lg) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden text-muted hover:text-ink hover:bg-panel flex size-8 items-center justify-center rounded-md border border-hairline transition-colors ml-0.5"
          >
            {mobileMenuOpen ? (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Structured Drawer / Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-hairline bg-void/98 border-t px-4 py-5 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-top duration-200">
          <div className="max-w-md mx-auto space-y-5">
            {NAV_GROUPS.map((group) => {
              const activeItem = group.items.find((item) => isPathActive(pathname, item.href));
              return (
                <div key={group.id} className="space-y-1.5">
                  <div className="flex items-center justify-between px-2">
                    <p className="eyebrow text-[0.6875rem] text-faint">{group.title}</p>
                    {activeItem && (
                      <span className="text-[0.625rem] mono text-signal font-semibold flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-signal shadow-[0_0_4px_var(--color-signal)]" />
                        {activeItem.label}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {group.items.map((item) => {
                      const isActive = isPathActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors ${
                            isActive
                              ? "bg-panel border border-signal/40 text-signal font-bold shadow-xs"
                              : "text-muted hover:bg-panel hover:text-ink border border-transparent"
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isActive && (
                              <span className="size-1.5 rounded-full bg-signal shadow-[0_0_6px_var(--color-signal)]" />
                            )}
                            <span className="text-xs">{item.label}</span>
                          </div>
                          {isActive ? (
                            <span className="mono text-[0.625rem] font-bold text-signal bg-signal/15 px-1.5 py-0.5 rounded border border-signal/30">
                              CURRENT
                            </span>
                          ) : item.badge ? (
                            <span className="mono text-[0.625rem] font-semibold text-signal bg-signal/10 px-1.5 py-0.5 rounded border border-signal/20">
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Identity & Actions Group */}
            <div className="space-y-1.5 border-t border-hairline pt-4">
              <p className="eyebrow px-2 text-[0.6875rem] text-faint">Identity &amp; Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/import"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`border-hairline bg-panel hover:bg-panel-high text-ink flex items-center justify-center rounded-lg border py-2 text-xs font-medium transition-colors ${
                    isPathActive(pathname, "/import") ? "border-signal/40 text-signal font-bold" : ""
                  }`}
                >
                  Import backup
                </Link>
                <Link
                  href="/onboarding/identity"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`bg-signal text-void hover:bg-signal-bright flex items-center justify-center rounded-lg py-2 text-xs font-semibold transition-colors ${
                    isPathActive(pathname, "/onboarding") ? "ring-2 ring-signal/60" : ""
                  }`}
                >
                  Create identity
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
