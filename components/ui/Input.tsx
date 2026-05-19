"use client";

import { forwardRef, useEffect, useRef } from "react";
import { typography } from "@/components/ui/Typography";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const BASE =
  "h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[16px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]";

const LABEL = `mb-1.5 block ${typography.eyebrow}`;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, className = "", autoFocus, ...props },
  ref
) {
  const innerRef = useRef<HTMLInputElement>(null);

  // Delay focus by ~300 ms so the sheet spring animation completes before the
  // keyboard opens. Native autoFocus fires on mount (mid-animation) and causes
  // the sheet to jump as the viewport shrinks for the keyboard simultaneously.
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => innerRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full">
      {label && <label className={LABEL}>{label}</label>}
      <input
        ref={(el) => {
          innerRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        {...props}
        className={`${BASE} ${className}`}
      />
    </div>
  );
});

export default Input;
