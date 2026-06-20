"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "outline" | "soft" | "ghost" | "dangerGhost";
type Size = "tiny" | "xxs" | "xs" | "sm" | "md";
type Radius = "lg" | "xl" | "full";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: Variant;
  size?: Size;
  radius?: Radius;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  outline:
    "border border-neutral-200 text-neutral-400 hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/[0.07]",
  soft:
    "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-400 dark:hover:bg-white/[0.10]",
  ghost:
    "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-white/[0.07] dark:hover:text-neutral-300",
  dangerGhost:
    "text-neutral-400 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:bg-rose-500/10 focus-visible:text-rose-500 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 dark:focus-visible:bg-rose-500/10 dark:focus-visible:text-rose-400",
};

const sizeClasses: Record<Size, string> = {
  tiny: "h-[18px] w-[18px]",
  xxs: "h-6 w-6",
  xs: "h-8 w-8",
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

const radiusClasses: Record<Radius, string> = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    variant = "ghost",
    size = "sm",
    radius = "xl",
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
      aria-label={label}
      {...props}
      className={[
        "tap-target inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variantClasses[variant],
        sizeClasses[size],
        radiusClasses[radius],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
});

export default IconButton;
