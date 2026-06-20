"use client";

import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "dangerSecondary";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-neutral-950 text-white hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100",
  secondary:
    "border border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.07]",
  ghost:
    "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]",
  destructive:
    "bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40 dark:bg-rose-500 dark:hover:bg-rose-600",
  dangerSecondary:
    "border border-neutral-200 text-neutral-500 hover:border-rose-200 hover:bg-rose-500/10 hover:text-rose-500 dark:border-white/10 dark:text-neutral-400 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/10 dark:hover:text-rose-400",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-xl",
  md: "h-10 px-4 text-[14px] rounded-xl",
  lg: "h-12 px-5 text-[15px] rounded-2xl",
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
        "inline-flex items-center justify-center gap-1.5 font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A63E] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950",
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
