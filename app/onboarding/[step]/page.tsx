import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OnboardingRoute } from "@/ui/onboarding/OnboardingRoute.tsx";
import { isStepSlug, STEP_SLUGS, stepBySlug } from "@/ui/steps.ts";

/**
 * One route for all six screens.
 *
 * The step list is data, so the routes are generated from it rather than being six near-identical files
 * that could drift apart. `dynamicParams = false` means an unknown slug is a 404 at the framework level;
 * the `isStepSlug` check below still runs, because it is what narrows the string for the component.
 *
 * The page itself is a server component and stays one. It knows the step's title and purpose, which are
 * static, and knows nothing about the user's progress, which is the intended arrangement: progress is a
 * function of an in-memory identity, and a server that could read it would be a server that had been
 * sent it.
 */
export const dynamicParams = false;

export function generateStaticParams(): { step: string }[] {
  return STEP_SLUGS.map((step) => ({ step }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly step: string }>;
}): Promise<Metadata> {
  const { step } = await params;
  if (!isStepSlug(step)) return {};

  const definition = stepBySlug(step);
  return {
    title: definition.ordinal === null ? definition.name : `${definition.name} · Step ${definition.ordinal}`,
    description: definition.purpose,
    // These are workspace screens, not content. Indexing them would put pages that read "this step is not
    // open yet" into search results while the landing page does the explaining.
    robots: { index: false, follow: true },
  };
}

export default async function OnboardingStepPage({
  params,
}: {
  readonly params: Promise<{ readonly step: string }>;
}) {
  const { step } = await params;
  if (!isStepSlug(step)) notFound();

  return <OnboardingRoute slug={step} />;
}
