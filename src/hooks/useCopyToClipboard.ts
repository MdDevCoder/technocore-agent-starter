"use client";

/**
 * Copy-to-clipboard, with an honest failure state.
 *
 * The clipboard API needs a secure context and, in some browsers, a permission the user may have
 * refused. When it is unavailable this hook reports `unavailable` rather than pretending: the caller
 * then leaves the value on screen as selectable text, which is the actual fallback. There is no
 * `document.execCommand("copy")` path — it is deprecated, requires a throwaway textarea holding the
 * value in the DOM, and silently no-ops often enough that it would produce exactly the false success
 * this app avoids everywhere else.
 *
 * Nothing secret is ever passed to this hook. Copy buttons exist for the DID, a signature, a sequence
 * number and a share text — all public. The seed and the passphrase have no copy affordance anywhere,
 * and the backup file is delivered as a download rather than as clipboard text so it does not sit in the
 * system clipboard waiting to be pasted somewhere unintended.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "unavailable" | "failed";

export interface CopyToClipboard {
  readonly state: CopyState;
  /** Resolves to whether the value actually reached the clipboard. */
  readonly copy: (value: string) => Promise<boolean>;
  readonly reset: () => void;
}

export function useCopyToClipboard(resetAfterMs = 1600): CopyToClipboard {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // A copy that lands just before navigation must not set state on an unmounted component.
  useEffect(() => clear, [clear]);

  const reset = useCallback(() => {
    clear();
    setState("idle");
  }, [clear]);

  const copy = useCallback(
    async (value: string): Promise<boolean> => {
      clear();

      if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
        setState("unavailable");
        return false;
      }

      try {
        await navigator.clipboard.writeText(value);
        setState("copied");
      } catch {
        setState("failed");
        return false;
      }

      timer.current = setTimeout(() => setState("idle"), resetAfterMs);
      return true;
    },
    [clear, resetAfterMs],
  );

  return { state, copy, reset };
}
