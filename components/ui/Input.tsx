"use client";

import { forwardRef, useCallback, useEffect, useRef } from "react";
import { typography } from "@/components/ui/Typography";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  autoGrow?: boolean;
}

// Shared chrome for every form control: hairline border, surface fill, and the
// accent border shift on focus (no ring — the global focus-visible ring exempts
// inputs; see globals.css).
//
// `color-scheme: dark` is load-bearing, not decoration: native controls
// (<select>, input[type=date/time]) paint their own dropdown, calendar and
// highlight chrome. Without it the browser renders that chrome from the LIGHT
// scheme, which shows up as a blue-tinted fill sitting next to correctly-dark
// siblings. Any control that reuses this chrome gets it automatically.
const FORM_CONTROL_CHROME =
  "min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-emerald-600/60 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-emerald-400/50 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]";

export const FORM_CONTROL_BASE = `w-full ${FORM_CONTROL_CHROME} text-[16px] font-medium`;

export const FORM_INPUT_CLASS = `${FORM_CONTROL_BASE} h-11 px-4`;

/**
 * Compact control for settings rows — same chrome as the full-size fields, in a
 * shorter box. Width is left to the caller so a row can stretch on mobile and
 * sit at a fixed width from `sm` up.
 *
 * Text stays 16px on purpose: globals.css enforces
 * `font-size: max(16px, 1em) !important` on input/select/textarea so iOS never
 * zooms on focus. A smaller `text-*` here would be dead code that reads like a
 * real size — several of these controls used to carry `text-[12px]` and all
 * rendered at 16px anyway.
 */
export const SETTINGS_CONTROL_CLASS = `${FORM_CONTROL_CHROME} h-10 px-3 pr-9 text-[16px] font-semibold`;

/** The square icon button that pairs with a SETTINGS_CONTROL_CLASS field. */
export const SETTINGS_ICON_BUTTON_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700 disabled:cursor-default disabled:opacity-35 disabled:hover:border-neutral-200 disabled:hover:text-neutral-500 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20 dark:hover:text-neutral-200 dark:disabled:hover:border-white/10 dark:disabled:hover:text-neutral-400";
export const FORM_TEXTAREA_CLASS = `${FORM_CONTROL_BASE} min-h-[76px] max-h-36 resize-none px-4 py-3 leading-snug`;
export const FORM_LABEL = `mb-1.5 block ${typography.eyebrow}`;

function delayedFocus<T extends HTMLInputElement | HTMLTextAreaElement>(
  ref: React.RefObject<T | null>,
  autoFocus?: boolean,
) {
  if (!autoFocus) return undefined;
  const t = setTimeout(() => ref.current?.focus(), 300);
  return () => clearTimeout(t);
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, className = "", autoFocus, ...props },
  ref
) {
  const innerRef = useRef<HTMLInputElement>(null);

  // Delay focus by ~300 ms so the sheet spring animation completes before the
  // keyboard opens. Native autoFocus fires on mount (mid-animation) and causes
  // the sheet to jump as the viewport shrinks for the keyboard simultaneously.
  useEffect(() => {
    return delayedFocus(innerRef, autoFocus);
  }, [autoFocus]);

  return (
    <div className="w-full">
      {label && <label className={FORM_LABEL}>{label}</label>}
      <input
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        {...props}
        className={`${FORM_INPUT_CLASS} ${className}`}
      />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, className = "", autoFocus, autoGrow = true, value, onInput, ...props },
  ref
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);

  const syncHeight = useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 144);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > 144 ? "auto" : "hidden";
  }, [autoGrow]);

  useEffect(() => {
    return delayedFocus(innerRef, autoFocus);
  }, [autoFocus]);

  useEffect(() => {
    syncHeight();
  }, [syncHeight, value]);

  return (
    <div className="w-full">
      {label && <label className={FORM_LABEL}>{label}</label>}
      <textarea
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }}
        value={value}
        onInput={(e) => {
          syncHeight();
          onInput?.(e);
        }}
        {...props}
        className={`${FORM_TEXTAREA_CLASS} ${className}`}
      />
    </div>
  );
});

export default Input;
