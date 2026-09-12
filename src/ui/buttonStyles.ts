/**
 * Button styling, deliberately in its own module with **no client directive**.
 *
 * This split is a React Server Components requirement, not a stylistic one. Every export of a client
 * module becomes a client *reference proxy* at runtime: the server can render it as a component, but it
 * cannot call it. `buttonClasses` is a plain string function that server components legitimately need to
 * call — a styled `<Link>` is how navigations are rendered — so it cannot live in `Button.tsx`. Keeping
 * it here makes this shared code, compiled into whichever graph imports it.
 *
 * The symptom of getting this wrong is worth recording, because it does not appear until a production
 * build: `Attempted to call buttonClasses() from the server but buttonClasses is on the client`, thrown
 * during prerender rather than at type-check time.
 *
 * Why a styled anchor at all, rather than a polymorphic `as` prop on `Button`: a real `<Link>` stays
 * middle-clickable, copyable and crawlable, which `as` tends to quietly cost.
 *
 * Notice what is missing: there is no accent-coloured button anywhere in this system. The palette
 * reserves signal-aqua for genuine cryptographic material — a real byte, a real signature, a real DID —
 * so if a button were aqua, the accent would stop meaning anything the moment the user saw their first
 * verified signature. Emphasis is carried achromatically instead, by inverting the primary action
 * against the dark field.
 */

import { cx } from "./cx.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex items-center justify-center gap-2 rounded-md border font-medium " +
  "whitespace-nowrap transition-[background-color,border-color,color,opacity] duration-150 " +
  "ease-out-quint disabled:pointer-events-none disabled:opacity-40 aria-busy:pointer-events-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "shimmer-btn border-transparent bg-ink text-void hover:opacity-90 hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] active:scale-[0.98]",
  secondary: "border-hairline bg-panel text-ink hover:border-hairline-bright hover:bg-panel-high hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] active:scale-[0.98]",
  ghost: "border-transparent bg-transparent text-muted hover:bg-panel hover:text-ink active:scale-[0.98]",
  danger: "border-fault/35 bg-transparent text-fault hover:border-fault/60 hover:bg-fault/10 active:scale-[0.98]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[0.9375rem]",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], className);
}
