"use client";

interface SectionHeaderProps {
  /** Small uppercase label above the title */
  eyebrow: string;
  /** Main section title */
  title: string;
  /** Optional right-side content (button, pill, etc.) */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent section heading used throughout Plan Detail and other views.
 *
 * Renders:
 *   EYEBROW
 *   Title           [action]
 */
export function SectionHeader({ eyebrow, title, action, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-end justify-between ${className}`}>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 text-[16px] font-semibold text-neutral-950 dark:text-white">
          {title}
        </h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
