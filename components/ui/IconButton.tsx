"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { BUTTON_FOCUS_RING } from "./Button";

/**
 * The one icon-only button: always a circle, always labelled. Variants and
 * sizes are specified in DESIGN.md §5 Buttons and share their names and
 * colours with Button; apps/native/src/components/ui/IconButton.tsx mirrors
 * this file.
 */
export type IconButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "xs" | "sm" | "md" | "lg";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: IconButtonVariant;
  size?: Size;
  /** A toggle's on state: renders as `primary` and sets aria-pressed. */
  selected?: boolean;
  children: ReactNode;
}

const variantClasses: Record<IconButtonVariant, string> = {
  primary:
    "bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200",
  secondary:
    "bg-black/[0.05] text-neutral-800 hover:bg-black/[0.09] dark:bg-white/[0.08] dark:text-neutral-100 dark:hover:bg-white/[0.14]",
  ghost:
    "text-neutral-600 hover:bg-black/[0.05] hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.08] dark:hover:text-white",
  // Quiet until engaged: the trash icon already says what it does.
  destructive:
    "text-neutral-600 hover:bg-[#E11D48]/10 hover:text-[#BE123C] focus-visible:bg-[#E11D48]/10 focus-visible:text-[#BE123C] active:bg-[#E11D48]/10 active:text-[#BE123C] dark:text-neutral-300 dark:hover:bg-[#E11D48]/[0.14] dark:hover:text-[#FB7185] dark:focus-visible:bg-[#E11D48]/[0.14] dark:focus-visible:text-[#FB7185] dark:active:text-[#FB7185]",
};

// xs and sm draw smaller than 44px; `tap-target` grows their hit area to it.
const sizeClasses: Record<Size, string> = {
  xs: "tap-target h-6 w-6",
  sm: "tap-target h-8 w-8",
  md: "tap-target h-10 w-10",
  lg: "h-11 w-11",
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = "secondary", size = "md", selected, className = "", children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={selected}
      {...props}
      className={[
        "inline-flex shrink-0 select-none items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-[0.94] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        BUTTON_FOCUS_RING,
        variantClasses[selected ? "primary" : variant],
        sizeClasses[size],
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
