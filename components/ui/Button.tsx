"use client";

import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
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
    "border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5",
  ghost:
    "text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-white/5",
  destructive:
    "bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 dark:bg-red-600 dark:hover:bg-red-700",
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
        "inline-flex items-center justify-center gap-1.5 font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed",
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
