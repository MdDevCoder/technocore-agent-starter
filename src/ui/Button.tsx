"use client";

/**
 * Button — the interactive primitive.
 *
 * The styling lives in `./buttonStyles.ts` rather than here, and that separation is load-bearing: this
 * module is a client boundary, so every one of its runtime exports becomes a proxy that the server may
 * render but may not call. Server components need to call `buttonClasses` to style navigation links, so
 * it has to sit outside the boundary. See the comment in that file.
 *
 * This component is a client component because a button exists to be pressed — handlers, `busy` state
 * transitions and focus behaviour all belong on the client. Anything purely presentational stays out.
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonStyles.ts";

// Type-only re-exports. These are erased at compile time, so they create no runtime export and
// therefore no client-reference proxy — importing them from here is safe from either environment.
export type { ButtonSize, ButtonVariant } from "./buttonStyles.ts";

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "className"> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
  /**
   * A real operation is in flight. Sets `aria-busy` and blocks re-entry, and the caller should swap
   * the label to the present participle so the change is announced rather than only animated.
   */
  readonly busy?: boolean;
  readonly children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  busy = false,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled ?? busy}
      aria-busy={busy || undefined}
      className={buttonClasses(variant, size, className)}
    >
      {children}
    </button>
  );
}
