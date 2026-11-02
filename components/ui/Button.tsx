"use client";

import { forwardRef } from "react";

/**
 * The one text button. Variants, sizes and states are specified in DESIGN.md
 * §5 Buttons; apps/native/src/components/ui/Button.tsx mirrors this file.
 */
export type ButtonVariant = "primary" | "cta" | "secondary" | "ghost" | "destructive" | "destructiveSecondary";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  fullWidth?: boolean;
  /** Shows a spinner in place of `icon`, keeps the width, and ignores clicks. */
  loading?: boolean;
  /** Leading icon; takes the label's colour. Size it per DESIGN.md (15/16/18px). */
  icon?: React.ReactNode;
  /** Trailing icon, for navigation only ("Today ›"). */
  trailingIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200",
  // Affirmative action only (Create / Complete / Log / Start) — the One Signal
  // + Ink-First rules: one green action per screen, ink is the default.
  cta:
    "bg-[#008236] text-white hover:bg-[#006B2C] dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#28BF62]",
  // Translucent washes so the button reads the same on a card, the page, a
  // sheet and the glass header.
  secondary:
    "bg-black/[0.05] text-neutral-900 hover:bg-black/[0.09] dark:bg-white/[0.08] dark:text-neutral-100 dark:hover:bg-white/[0.14]",
  ghost:
    "text-neutral-600 hover:bg-black/[0.05] dark:text-neutral-300 dark:hover:bg-white/[0.08]",
  // #E11D48 is the deepest rose that still reads as "danger"; white on it is
  // 4.70:1. Tailwind's rose-500 is 3.4:1.
  destructive: "bg-[#E11D48] text-white hover:bg-[#BE123C]",
  destructiveSecondary:
    "bg-[#E11D48]/10 text-[#BE123C] hover:bg-[#E11D48]/[0.16] dark:bg-[#E11D48]/[0.14] dark:text-[#FB7185] dark:hover:bg-[#E11D48]/[0.22]",
};

const sizeClasses: Record<Size, string> = {
  sm: "tap-target h-9 px-3.5 text-[13px]",
  md: "h-11 px-4 text-[14px]",
  lg: "h-12 px-5 text-[16px]",
};

const spinnerSize: Record<Size, string> = { sm: "h-[15px] w-[15px]", md: "h-4 w-4", lg: "h-[18px] w-[18px]" };

export const BUTTON_FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#008236] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-[#2FD46E] dark:focus-visible:ring-offset-neutral-950";

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "lg",
    fullWidth = false,
    loading = false,
    icon,
    trailingIcon,
    className = "",
    disabled,
    children,
    onClick,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={[
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
        BUTTON_FOCUS_RING,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className={`${spinnerSize[size]} shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:[animation-duration:1.5s]`}
        />
      ) : (
        icon
      )}
      {children}
      {trailingIcon}
    </button>
  );
});

export default Button;
