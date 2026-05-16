"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const BASE =
  "h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[16px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.07]";

const LABEL =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, className = "", ...props },
  ref
) {
  return (
    <div className="w-full">
      {label && <label className={LABEL}>{label}</label>}
      <input ref={ref} {...props} className={`${BASE} ${className}`} />
    </div>
  );
});

export default Input;
