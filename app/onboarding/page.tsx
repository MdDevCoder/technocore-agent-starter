import { redirect } from "next/navigation";

/**
 * `/onboarding` has no screen of its own.
 *
 * It cannot resume where the user left off, because "where they left off" is derived from an identity that
 * lives in the tab's memory and is never sent to a server. So this sends everyone to step 1, which is
 * correct for a first visit and harmless on a return visit: the identity step recognises a session that
 * already exists rather than offering to overwrite it.
 */
export default function OnboardingIndex(): never {
  redirect("/onboarding/identity");
}
