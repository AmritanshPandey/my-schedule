/**
 * The planr. wordmark — three descending bars and the name — as it sits at
 * the top of the phone shell's main tabs. Ink follows the theme
 * (currentColor), so it works on both page colors without a second asset.
 */
export default function PlanrWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 text-neutral-950 dark:text-white ${className}`} aria-label="planr.">
      <svg width="22" height="20" viewBox="0 0 22 20" fill="currentColor" aria-hidden="true">
        <rect x="0" y="0.5" width="22" height="4.5" rx="2.25" />
        <rect x="0" y="7.75" width="15" height="4.5" rx="2.25" />
        <rect x="0" y="15" width="8.5" height="4.5" rx="2.25" />
      </svg>
      <span aria-hidden="true" className="text-[26px] font-bold leading-none tracking-[-0.03em]">planr.</span>
    </span>
  );
}
