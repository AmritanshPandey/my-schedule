"use client";

/**
 * The iPhone shell's tab bar — five destinations on a floating liquid-glass
 * capsule, the same material and shape as iOS's own tab bar.
 *
 * Creation lives where the thing is made, not in a global menu: Today's
 * header adds a task, Plans' header adds a plan, Routine adds a routine, and
 * Notes adds a note. The bar only navigates.
 *
 * The active tab is a single sliding pill rather than a background that snaps
 * on and off per button — switching tabs then reads as one continuous glide,
 * a "where am I" cue that follows you, instead of one highlight disappearing
 * and an unrelated one appearing a frame later. It is positioned as a
 * percentage of five equal columns, so nothing has to be measured: no
 * ResizeObserver, no position math. The columns must therefore stay equal —
 * no gap between buttons.
 *
 * It slides on `left` rather than `translateX`. The transform version is the
 * one you'd reach for, and it rendered correctly in the style attribute, but
 * the computed transform came back as the identity matrix unless the
 * declaration was flagged !important — something in the cascade here eats a
 * plain inline transform. `left` is a layout property and normally the wrong
 * thing to animate, but this is one small absolutely-positioned element in a
 * fixed-height bar, so there is no reflow worth worrying about, and it
 * measurably works.
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

/** Visual left-to-right order — independent of the tab ids themselves, which
 *  don't run 0..4 (Overview is tab 4, Tracking is tab 8). */
const TABS = [
  { tab: 4, label: "Overview", short: "Overview", Icon: IconLayoutDashboard },
  { tab: 0, label: "Today", short: "Today", Icon: IconCalendarEvent },
  { tab: 1, label: "Plans", short: "Plans", Icon: IconClipboardData },
  { tab: 2, label: "Routine", short: "Routine", Icon: IconRepeat },
  { tab: 8, label: "Tracking", short: "Track", Icon: IconChartLine },
] as const;

export default function IOSBottomNav({ activeTab, onTabChange }: IOSBottomNavProps) {
  const activeIndex = TABS.findIndex((t) => t.tab === activeTab);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "max(16px, calc(env(safe-area-inset-bottom) + 4px))" }}
    >
      <nav
        role="navigation"
        aria-label="Main navigation"
        data-glass
        className="liquid-glass pointer-events-auto relative flex h-[64px] w-full max-w-md items-center rounded-full px-1.5"
      >
        {/* The pill rides behind the buttons; it is decoration, so it is
            hidden from assistive tech and never intercepts a tap. */}
        {activeIndex !== -1 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-[5px] rounded-full bg-black/[0.06] transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:bg-white/[0.13]"
            style={{
              width: `calc((100% - 0.75rem) / ${TABS.length})`,
              left: `calc(0.375rem + ${activeIndex} * (100% - 0.75rem) / ${TABS.length})`,
            }}
          />
        )}

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
              className={`relative z-10 flex h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full transition-colors duration-150 active:scale-[0.96] ${
                active ? "text-[#008236] dark:text-[#2FD46E]" : "text-neutral-600 dark:text-neutral-300"
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
