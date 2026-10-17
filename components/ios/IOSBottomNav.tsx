"use client";

/**
 * The iPhone shell's tab bar — five destinations on a floating liquid-glass
 * capsule, the same material and shape as iOS's own tab bar.
 *
 * Creation lives where the thing is made, not in a global menu: Today's
 * header adds a task, Plans' header adds a plan, Routine adds a routine, and
 * Notes adds a note. The bar only navigates.
 */
import {
  IconChartLine,
  IconCalendarEvent,
  IconClipboardData,
  IconLayoutDashboard,
  IconRepeat,
} from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";

interface IOSBottomNavProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
}

const TABS = [
  { tab: 4, label: "Overview", short: "Overview", Icon: IconLayoutDashboard },
  { tab: 0, label: "Today", short: "Today", Icon: IconCalendarEvent },
  { tab: 1, label: "Plans", short: "Plans", Icon: IconClipboardData },
  { tab: 2, label: "Routine", short: "Routine", Icon: IconRepeat },
  { tab: 8, label: "Tracking", short: "Track", Icon: IconChartLine },
] as const;

export default function IOSBottomNav({ activeTab, onTabChange }: IOSBottomNavProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "max(16px, calc(env(safe-area-inset-bottom) + 4px))" }}
    >
      <nav
        role="navigation"
        aria-label="Main navigation"
        data-glass
        className="liquid-glass pointer-events-auto flex h-[64px] w-full max-w-md items-center gap-0.5 rounded-full px-1.5"
      >
        {TABS.map(({ tab, label, short, Icon }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              // Re-tapping the active tab still fires: it pops back to the
              // tab's root (e.g. from a plan to the plan list).
              onClick={() => { haptic("light"); onTabChange(tab); }}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={`flex h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full transition-colors duration-150 active:scale-[0.96] ${
                active
                  ? "bg-black/[0.06] text-[#008236] dark:bg-white/[0.13] dark:text-[#2FD46E]"
                  : "text-neutral-600 dark:text-neutral-300"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
              <span className={`text-[10.5px] leading-none ${active ? "font-bold" : "font-semibold"}`}>{short}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
