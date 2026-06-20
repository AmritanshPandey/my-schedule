"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { AnimatePresence, m } from "framer-motion";
import {
  IconCalendarEvent,
  IconChartBar,
  IconClipboardData,
  IconCalendarPlus,
  IconClipboardPlus,
  IconFileImport,
  IconLayoutDashboard,
  IconPlus,
  IconRepeat,
} from "@tabler/icons-react";

interface BottomNavProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  onCreateTask: () => void;
  onCreatePlan: () => void;
  onCreateRitual: () => void;
  onBulkImport?: () => void;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  onCreateTask,
  onCreatePlan,
  onCreateRitual,
  onBulkImport,
}: BottomNavProps) {
  const [expanded, setExpanded] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  function handleTabChange(tab: number) {
    haptic("light");
    setExpanded(false);
    onTabChange(tab);
  }

  const tabClass = (active: boolean) => `
    flex h-[56px] w-[64px] flex-col items-center justify-center gap-[2px]
    rounded-full transition-all duration-200
    ${active
      ? "bg-black/[0.05] text-neutral-950 dark:bg-white/[0.10] dark:text-white"
      : "text-neutral-500 dark:text-neutral-400"
    }
  `;

  return (
    <>
      {/* BACKDROP */}
      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed inset-0 z-[38] bg-black/[0.03] dark:bg-black/[0.12]"
          />
        )}
      </AnimatePresence>

      <div
        className="fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: "max(20px, calc(env(safe-area-inset-bottom) + 8px))" }}
      >
        <div ref={navRef} className="relative w-full max-w-md">

          {/* ── EXPANDED CREATE MENU ─────────────────────────────────────── */}
          <AnimatePresence>
            {expanded && (
              <m.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.34, 1.1, 0.64, 1] }}
                className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-[156px] flex-col items-center"
              >
                <div className="flex items-start gap-6 rounded-[24px] border border-white/[0.10] bg-neutral-950 px-5 py-4">
                  {/* ADD TASK */}
                  <m.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic("medium"); setExpanded(false); onCreateTask(); }}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Add task"
                  >
                    <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
                      <IconCalendarPlus size={24} strokeWidth={2} className="text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white/75">Task</span>
                  </m.button>

                  {/* ADD PLAN */}
                  <m.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic("medium"); setExpanded(false); onCreatePlan(); }}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Add plan"
                  >
                    <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
                      <IconClipboardPlus size={24} strokeWidth={2} className="text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white/75">Plan</span>
                  </m.button>

                  {/* ADD HABIT */}
                  <m.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic("medium"); setExpanded(false); onCreateRitual(); }}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Add habit"
                  >
                    <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
                      <IconRepeat size={24} strokeWidth={2} className="text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white/75">Habit</span>
                  </m.button>

                  {/* BULK IMPORT */}
                  {onBulkImport && (
                    <m.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { haptic("medium"); setExpanded(false); onBulkImport(); }}
                      className="flex flex-col items-center gap-1.5"
                      aria-label="Paste schedule"
                    >
                      <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
                        <IconFileImport size={24} strokeWidth={2} className="text-white" />
                      </div>
                      <span className="text-[11px] font-semibold text-white/75">Import</span>
                    </m.button>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>

          {/* ── FLOATING PLUS BUTTON ─────────────────────────────────────── */}
          <m.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => { haptic("medium"); setExpanded((v) => !v); }}
            aria-label="Create"
            aria-expanded={expanded}
            className="
              absolute left-1/2 top-1/2 z-40
              flex h-[52px] w-[52px]
              -translate-x-1/2 -translate-y-1/2
              items-center justify-center rounded-full
              bg-neutral-950 text-white
              dark:bg-white dark:text-neutral-950
            "
          >
            <m.div
              animate={{ rotate: expanded ? 45 : 0 }}
              transition={{ duration: 0.2, ease: [0.34, 1.1, 0.64, 1] }}
            >
              <IconPlus size={24} strokeWidth={2} />
            </m.div>
          </m.button>

          {/* ── NAVBAR ───────────────────────────────────────────────────── */}
          <nav
            role="navigation"
            aria-label="Main navigation"
            className="
              relative flex h-[68px] w-full items-center justify-evenly rounded-full px-2
              border border-neutral-200/70 bg-white
              dark:border-white/[0.09] dark:bg-neutral-900
            "
          >
            <button
              type="button"
              onClick={() => handleTabChange(4)}
              className={tabClass(activeTab === 4)}
              aria-label="Overview"
              aria-current={activeTab === 4 ? "page" : undefined}
            >
              <IconLayoutDashboard size={20} strokeWidth={2} />
              <span className="text-[10.5px] font-medium leading-none">Overview</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange(0)}
              className={tabClass(activeTab === 0)}
              aria-label="Today"
              aria-current={activeTab === 0 ? "page" : undefined}
            >
              <IconCalendarEvent size={20} strokeWidth={2} />
              <span className="text-[10.5px] font-medium leading-none">Today</span>
            </button>

            {/* CENTER SPACER (plus button lives here absolutely) */}
            <div className="w-[52px] shrink-0" aria-hidden="true" />

            <button
              type="button"
              onClick={() => handleTabChange(1)}
              className={tabClass(activeTab === 1)}
              aria-label="Plans"
              aria-current={activeTab === 1 ? "page" : undefined}
            >
              <IconClipboardData size={20} strokeWidth={2} />
              <span className="text-[10.5px] font-medium leading-none">Plans</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange(2)}
              className={tabClass(activeTab === 2)}
              aria-label="Routine"
              aria-current={activeTab === 2 ? "page" : undefined}
            >
              <IconRepeat size={20} strokeWidth={2} />
              <span className="text-[10.5px] font-medium leading-none">Routine</span>
            </button>
          </nav>

        </div>
      </div>
    </>
  );
}
