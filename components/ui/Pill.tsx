"use client";

import type { HTMLAttributes, ReactNode } from "react";

type Variant = "neutral" | "subtle" | "selected" | "success" | "warning" | "danger";
type Size = "sm" | "md";

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  neutral:
    "border-neutral-200 bg-white text-neutral-500 dark:border-white/[0.12] dark:bg-transparent dark:text-neutral-400",
  subtle:
    "border-transparent bg-neutral-100 text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-400",
  selected:
    "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900",
  success:
    "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
  warning:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger:
    "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const sizeClasses: Record<Size, string> = {
  sm: "gap-1 px-2.5 py-1 text-[12px]",
  md: "gap-1.5 px-3 py-1 text-[13px]",
};

export default function Pill({
  variant = "neutral",
  size = "md",
  icon,
  className = "",
  children,
  ...props
}: PillProps) {
  return (
    <span
      {...props}
      className={[
        "inline-flex shrink-0 items-center rounded-full border font-semibold",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {children}
    </span>
  );
}
