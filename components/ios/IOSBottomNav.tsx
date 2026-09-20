"use client";

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

/** Visual left-to-right order — independent of the tab ids themselves, which
 *  don't run 0..4 (Overview is tab 4, Tracking is tab 8). */
const TABS = [
  { id: 4, label: "Overview", icon: IconLayoutDashboard },
  { id: 0, label: "Today", icon: IconCalendarEvent },
  { id: 1, label: "Plans", icon: IconClipboardData },
  { id: 2, label: "Routine", icon: IconRepeat },
  { id: 8, label: "Tracking", icon: IconChartLine },
] as const;

/**
 * Five tabs, no center action — creating a task/plan/routine/note already has
 * its own home on each of those tabs (Today's "+", the Plans empty state, the
 * Routine tab's own add button, Notes' own compose), so the nav's only job is
 * moving between them, not duplicating creation.
 *
 * The active tab is a single sliding pill rather than a background that
 * snaps on and off per button — switching tabs then reads as one continuous
 * glide (a "where am I" cue that follows you) instead of one highlight
 * disappearing and an unrelated one appearing a frame later. Percentage-based
 * off the five equal columns, so it needs nothing measured: a plain
 * `transition-transform` is enough, no ResizeObserver, no position math.
 */
export default function IOSBottomNav({ activeTab, onTabChange }: IOSBottomNavProps) {
  const activeIndex = TABS.findIndex((t) => t.id === activeTab);

  function changeTab(tab: number) {
    haptic("light");
    onTabChange(tab);
  }

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "max(20px, calc(env(safe-area-inset-bottom) + 8px))" }}
    >
      <nav
        role="navigation"
        aria-label="Main navigation"
        data-glass
        className="relative flex h-[68px] w-full max-w-md items-center rounded-full border border-neutral-200/70 bg-white/80 px-2 shadow-nav backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/70 dark:border-white/[0.09] dark:bg-neutral-900/75 dark:supports-[backdrop-filter]:bg-neutral-900/65"
      >
        <div className="relative flex h-full w-full items-center">
          {activeIndex !== -1 && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ width: `${100 / TABS.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
            >
              <div className="absolute inset-1 rounded-full bg-black/[0.06] dark:bg-white/[0.10]" />
            </div>
          )}

          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeTab(tab.id)}
                aria-label={tab.label}
                aria-current={active ? "page" : undefined}
                className="relative z-10 flex h-full flex-1 flex-col items-center justify-center gap-[2px] transition-transform duration-150 active:scale-[0.96]"
              >
                <Icon
                  size={20}
                  strokeWidth={2}
                  className={`transition-[transform,color] duration-200 motion-reduce:transition-none ${
                    active
                      ? "scale-110 text-neutral-950 dark:text-white"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                />
                <span
                  className={`text-[10.5px] font-medium leading-none transition-colors duration-200 ${
                    active ? "text-neutral-950 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
