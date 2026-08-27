"use client";

/**
 * Confirmation dialog for irreversible actions.
 *
 * A native `<dialog>` opened with `showModal()`, because the browser already implements the hard parts
 * correctly: focus is trapped inside, the rest of the page is inert, Escape closes it, and the element is
 * announced as a modal without any `role`/`aria-modal` bookkeeping. A hand-rolled overlay reimplements all
 * of that and usually forgets the inert part.
 *
 * React stays the single source of truth for whether the dialog is open: the browser's `cancel` event is
 * prevented and turned into an `onCancel` call, so the DOM never closes behind React's back.
 *
 * `requireTyped` exists for the two actions that cannot be undone — discarding an identity that has no
 * verified backup, and clearing stored history. Typing a word is friction on purpose. It is not security
 * theatre: it converts a reflexive click into a deliberate one, which is the only defence available
 * against destroying a key that has no copy anywhere.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonClasses } from "./buttonStyles.ts";
import { cx } from "./cx.ts";
import { TextField } from "./fields.tsx";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly tone?: "danger" | "neutral";
  /** When set, confirmation stays disabled until the user types this exact word. */
  readonly requireTyped?: string;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  tone = "danger",
  requireTyped,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
    if (open) setTyped("");
  }, [open]);

  const armed = requireTyped === undefined || typed.trim() === requireTyped;

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Prevented so the element does not close itself; `onCancel` drives the state that closes it.
        event.preventDefault();
        onCancel();
      }}
      className={cx(
        "panel text-ink m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg p-0 shadow-2xl",
        "backdrop:bg-void/80 backdrop:backdrop-blur-sm",
      )}
    >
      <div className="p-6">
        <h2 className={cx("text-base font-medium", tone === "danger" ? "text-fault" : "text-ink")}>{title}</h2>
        <div className="text-muted mt-3 flex flex-col gap-3 text-[0.8125rem] leading-relaxed">{children}</div>

        {requireTyped === undefined ? null : (
          <div className="mt-5">
            <TextField
              label={`Type ${requireTyped} to confirm`}
              value={typed}
              mono
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClasses("secondary", "md")}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!armed}
            className={buttonClasses(tone === "danger" ? "danger" : "primary", "md")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
