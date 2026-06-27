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

export const FORM_CONTROL_BASE =
  "w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 text-[16px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]";

export const FORM_INPUT_CLASS = `${FORM_CONTROL_BASE} h-11 px-4`;
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
