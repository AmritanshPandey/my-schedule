"use client";

/**
 * Flat skeleton placeholder — an opacity pulse on a recessed panel tone
 * (gradient shimmer is banned by the design system). Size it with className
 * (h-*, w-*) like any div.
 */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-skeleton rounded-xl bg-neutral-100 dark:bg-white/[0.05] ${className}`}
    />
  );
}
