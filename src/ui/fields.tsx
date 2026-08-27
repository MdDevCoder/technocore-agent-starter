"use client";

/**
 * Form controls.
 *
 * Each control owns its own label, hint and error wiring, because that wiring is exactly what gets
 * dropped when it is left to the caller: `aria-describedby` pointing at both the hint and the error,
 * `aria-invalid` on the control itself, and an error that is announced when it appears rather than only
 * turning red. `useId` generates matching ids on both sides of hydration.
 *
 * The passphrase field is the one with security decisions in it, and they are stated at the field.
 */

import { useId, useState, type ChangeEvent, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cx } from "./cx.ts";

const CONTROL =
  "bg-graphite border-hairline text-ink placeholder:text-faint/70 w-full rounded-md border px-3 " +
  "text-sm transition-colors hover:border-hairline-bright focus:border-hairline-bright " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-fault/60";

function Hint({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p id={id} className="text-faint mt-2 text-[0.75rem] leading-relaxed">
      {children}
    </p>
  );
}

function FieldError({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-fault mt-2 flex items-start gap-1.5 text-[0.75rem] leading-relaxed">
      <span aria-hidden="true" className="bg-fault mt-1.5 size-1 shrink-0 rounded-full" />
      {children}
    </p>
  );
}

function Label({
  htmlFor,
  children,
  optional,
}: {
  readonly htmlFor: string;
  readonly children: ReactNode;
  readonly optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-ink flex items-baseline justify-between gap-3 text-[0.8125rem] font-medium">
      <span>{children}</span>
      {optional ? <span className="text-faint text-[0.6875rem] font-normal">optional</span> : null}
    </label>
  );
}

/** Ties hint and error ids together for `aria-describedby`, omitting the attribute when both are absent. */
function describedBy(hintId: string | null, errorId: string | null): string | undefined {
  const ids = [hintId, errorId].filter((id): id is string => id !== null);
  return ids.length === 0 ? undefined : ids.join(" ");
}

export interface TextFieldProps extends Omit<ComponentPropsWithoutRef<"input">, "className" | "id"> {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string | undefined;
  readonly optional?: boolean;
  /** Set for values that are read character by character — URLs, hashes, sequence numbers. */
  readonly mono?: boolean;
  readonly trailing?: ReactNode;
}

export function TextField({ label, hint, error, optional, mono, trailing, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = hint === undefined ? null : `${id}-hint`;
  const errorId = error === undefined ? null : `${id}-error`;

  return (
    <div>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <div className="relative mt-2">
        <input
          {...rest}
          id={id}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy(hintId, errorId)}
          className={cx(CONTROL, "h-10", mono === true && "mono", trailing !== undefined && "pr-24")}
        />
        {trailing === undefined ? null : (
          <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
        )}
      </div>
      {hintId !== null ? <Hint id={hintId}>{hint}</Hint> : null}
      {errorId !== null && error !== undefined ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export interface TextAreaFieldProps extends Omit<ComponentPropsWithoutRef<"textarea">, "className" | "id"> {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string | undefined;
  readonly optional?: boolean;
  /** Rendered at the label line — a live character budget belongs beside the label, not below the field. */
  readonly meter?: ReactNode;
}

export function TextAreaField({ label, hint, error, optional, meter, ...rest }: TextAreaFieldProps) {
  const id = useId();
  const hintId = hint === undefined ? null : `${id}-hint`;
  const errorId = error === undefined ? null : `${id}-error`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} optional={optional}>
          {label}
        </Label>
        {meter}
      </div>
      <textarea
        {...rest}
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(hintId, errorId)}
        className={cx(CONTROL, "mt-2 resize-y py-2.5 leading-relaxed")}
      />
      {hintId !== null ? <Hint id={hintId}>{hint}</Hint> : null}
      {errorId !== null && error !== undefined ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export interface PassphraseFieldProps extends Omit<TextFieldProps, "type" | "trailing" | "mono"> {
  /** `create` sets `new-password` so a manager offers to generate and store one; `open` sets `current-password`. */
  readonly intent: "create" | "open";
}

/**
 * Passphrase input.
 *
 * The reveal toggle is deliberate: a mistyped passphrase on the export step produces a file that cannot
 * be opened, and the flow's whole purpose is to prevent exactly that. Autocomplete is set so a password
 * manager can store the value, autocapitalize and spellcheck are off because both corrupt passphrases on
 * mobile keyboards, and the value is never logged, never copied to the clipboard by this app, and never
 * placed in a request body.
 */
export function PassphraseField({ intent, ...rest }: PassphraseFieldProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <TextField
      {...rest}
      type={revealed ? "text" : "password"}
      autoComplete={intent === "create" ? "new-password" : "current-password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-pressed={revealed}
          className="text-faint hover:text-ink hover:bg-panel-high rounded-sm px-2 py-1 text-[0.6875rem] transition-colors"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      }
    />
  );
}

export interface CheckboxFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly tone?: "neutral" | "attention";
}

/**
 * Checkbox.
 *
 * A real `<input type="checkbox">` rather than a styled div: it is focusable, toggles on Space, is
 * announced correctly, and participates in form reset without any of that being reimplemented.
 */
export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  disabled,
  tone = "neutral",
}: CheckboxFieldProps) {
  const id = useId();
  const descriptionId = description === undefined ? undefined : `${id}-description`;

  return (
    <div
      className={cx(
        "flex gap-3 rounded-md border p-3.5 transition-colors",
        tone === "attention" ? "border-attention/25 bg-attention/5" : "border-hairline bg-graphite/60",
        disabled === true && "opacity-50",
      )}
    >
      {/*
        The tick is an inline SVG revealed with `peer-checked`, rather than a CSS `content` escape. A
        pseudo-element carrying an escaped code point is one Tailwind-version change away from rendering
        the literal characters, and a checkbox that shows `\2713` when ticked is a memorable bug.
      */}
      <span className="relative mt-0.5 grid size-4 shrink-0 place-items-center">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled}
          aria-describedby={descriptionId}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
          className={cx(
            "peer border-hairline-bright bg-graphite size-4 cursor-pointer appearance-none rounded-xs border",
            "checked:border-ink checked:bg-ink transition-colors",
            disabled === true && "cursor-not-allowed",
          )}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="text-void pointer-events-none absolute size-3 opacity-0 peer-checked:opacity-100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <label htmlFor={id} className="text-ink cursor-pointer text-[0.8125rem] leading-relaxed font-medium">
          {label}
        </label>
        {description === undefined ? null : (
          <p id={descriptionId} className="text-muted mt-1 text-[0.75rem] leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export interface FileFieldProps {
  readonly label: string;
  readonly hint?: ReactNode;
  readonly error?: string | undefined;
  readonly accept?: string;
  readonly disabled?: boolean;
  readonly onSelect: (file: File) => void;
  /** The name of the currently selected file, if any. Shown so the choice is visible after the dialog closes. */
  readonly selected?: string | null;
}

/**
 * File picker.
 *
 * The native input is visually replaced but not removed from the accessibility tree — it remains the
 * focusable, labelled control, and the styled surface is `aria-hidden`. A div-with-a-click-handler would
 * lose keyboard operation and the file dialog's own semantics.
 */
export function FileField({
  label,
  hint,
  error,
  accept,
  disabled,
  onSelect,
  selected,
}: FileFieldProps) {
  const id = useId();
  const hintId = hint === undefined ? null : `${id}-hint`;
  const errorId = error === undefined ? null : `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div
        className={cx(
          "group relative mt-2 rounded-md border border-dashed p-4 transition-colors",
          error === undefined ? "border-hairline-bright hover:border-faint" : "border-fault/60",
          disabled === true && "opacity-50",
        )}
      >
        <input
          type="file"
          id={id}
          accept={accept}
          disabled={disabled}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy(hintId, errorId)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file !== undefined) onSelect(file);
            // Cleared so re-selecting the same file fires `change` again — otherwise a retry after a
            // wrong passphrase silently does nothing.
            event.target.value = "";
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <div aria-hidden="true" className="flex items-center gap-3">
          <span className="border-hairline text-faint group-hover:text-muted grid size-9 shrink-0 place-items-center rounded-md border transition-colors">
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
              <path d="M8 11V3.5m0 0L5.5 6M8 3.5 10.5 6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2.5 10.5v1a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 text-[0.8125rem]">
            {typeof selected === "string" && selected.length > 0 ? (
              <>
                <span className="mono text-ink block truncate">{selected}</span>
                <span className="text-faint text-[0.75rem]">Choose a different file</span>
              </>
            ) : (
              <>
                <span className="text-ink block">Choose a file</span>
                <span className="text-faint text-[0.75rem]">Nothing is uploaded — it is read in this tab</span>
              </>
            )}
          </span>
        </div>
      </div>
      {hintId !== null ? <Hint id={hintId}>{hint}</Hint> : null}
      {errorId !== null && error !== undefined ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
