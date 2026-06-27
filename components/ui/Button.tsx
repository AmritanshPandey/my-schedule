"use client";

import { forwardRef } from "react";

type Variant = "primary" | "cta" | "secondary" | "ghost" | "destructive" | "dangerSecondary";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-neutral-950 text-white hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100",
  // Affirmative action only (Create / Complete / Log / Start) — the One Signal
  // + Ink-First rules: one green action per screen, ink is the default.
  cta:
    "bg-[#00A63E] text-white hover:bg-[#008236] disabled:opacity-40 dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#2FD46E]/90",
  secondary:
    "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.05]",
  ghost:
    "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]",
  destructive:
    "bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40 dark:bg-rose-500 dark:hover:bg-rose-600",
  dangerSecondary:
    "border border-neutral-200 text-neutral-500 hover:border-rose-200 hover:bg-rose-500/10 hover:text-rose-500 dark:border-white/10 dark:text-neutral-400 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/10 dark:hover:text-rose-400",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] rounded-full",
  md: "h-11 px-4 text-[14px] rounded-full",
  lg: "h-12 px-5 text-[15px] rounded-full",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "lg",
    fullWidth = false,
    className = "",
    children,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={[
        "inline-flex items-center justify-center gap-1.5 font-semibold transition-colors active:scale-[0.98] disabled:cursor-not-allowed focus-visible:outline-none",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
});

export default Button;
