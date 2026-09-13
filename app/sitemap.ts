import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://technocore-agent-starter.vercel.app";
  const now = new Date();

  const routes = [
    "",
    "/demo",
    "/workspace",
    "/readiness",
    "/health",
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
    "/contributions/tclk-testkit",
    "/civilization",
    "/agent",
    "/privacy",
    "/terms",
    "/faq",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" || route.startsWith("/observatory") ? "hourly" : "daily",
    priority: route === "" ? 1.0 : route.startsWith("/onboarding") || route.startsWith("/testkit") ? 0.8 : 0.6,
  }));
}
