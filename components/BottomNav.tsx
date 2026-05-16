"use client";

import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconCalendarEvent,
  IconClipboardData,
  IconCalendarPlus,
  IconClipboardPlus,
  IconPlus,
  IconBrain,
  IconUpload,
  IconSettings,
} from "@tabler/icons-react";

interface BottomNavProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  onCreateTask: () => void;
  onCreatePlan: () => void;
  onCreateStrategy: () => void;
  onOpenSettings: () => void;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  onCreateTask,
  onCreatePlan,
  onCreateStrategy,
  onOpenSettings,
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="fixed inset-0 z-20 bg-black/[0.03] dark:bg-black/[0.12]"
          />
        )}
      </AnimatePresence>

      <div
        className="fixed inset-x-0 z-30 flex justify-center px-4"
        style={{ bottom: "max(20px, calc(env(safe-area-inset-bottom) + 8px))" }}
      >
        <div ref={navRef} className="relative w-full max-w-md">

          {/* ── EXPANDED CREATE MENU ─────────────────────────────────────── */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.34, 1.1, 0.64, 1] }}
                className="absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-[124px] flex-col items-center"
              >
                <div className="flex items-start gap-6 rounded-[24px] border border-white/[0.10] bg-neutral-950/90 px-5 py-4 shadow-[0_20px_60px_-8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                  {/* ADD TASK */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic("medium"); setExpanded(false); onCreateTask(); }}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Add task"
                  >
                    <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
                      <IconCalendarPlus size={24} strokeWidth={2} className="text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white/75">Task</span>
                  </motion.button>

                  {/* ADD PLAN */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic("medium"); setExpanded(false); onCreatePlan(); }}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Add plan"
                  >
                    <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
                      <IconClipboardPlus size={24} strokeWidth={2} className="text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white/75">Plan</span>
                  </motion.button>

                  {/* UPLOAD STRATEGY */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { haptic("medium"); setExpanded(false); onCreateStrategy(); }}
                    className="flex flex-col items-center gap-1.5"
                    aria-label="Add strategy"
                  >
                    <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
                      <IconUpload size={24} strokeWidth={2} className="text-white" />
                    </div>
                    <span className="text-[11px] font-semibold text-white/75">Strategy</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── FLOATING PLUS BUTTON ─────────────────────────────────────── */}
          <motion.button
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
              shadow-[0_4px_16px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.10)]
              dark:bg-white dark:text-neutral-950
              dark:shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.3)]
            "
          >
            <motion.div
              animate={{ rotate: expanded ? 45 : 0 }}
              transition={{ duration: 0.2, ease: [0.34, 1.1, 0.64, 1] }}
            >
              <IconPlus size={24} strokeWidth={2} />
            </motion.div>
          </motion.button>

          {/* ── NAVBAR ───────────────────────────────────────────────────── */}
          <nav
            role="navigation"
            aria-label="Main navigation"
            className="
              relative flex h-[68px] w-full items-center justify-between rounded-full px-2
              border border-neutral-200/70 bg-white/80 backdrop-blur-md
              shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_32px_-4px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]
              dark:border-white/[0.09] dark:bg-neutral-900/82
              dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_32px_-4px_rgba(0,0,0,0.55)]
            "
          >
            {/* LEFT: Tasks + Plan */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => handleTabChange(0)}
                className={tabClass(activeTab === 0)}
                aria-label="Tasks"
                aria-current={activeTab === 0 ? "page" : undefined}
              >
                <IconCalendarEvent size={20} strokeWidth={2} />
                <span className="text-[10.5px] font-medium leading-none">Tasks</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange(1)}
                className={tabClass(activeTab === 1)}
                aria-label="Plan"
                aria-current={activeTab === 1 ? "page" : undefined}
              >
                <IconClipboardData size={20} strokeWidth={2} />
                <span className="text-[10.5px] font-medium leading-none">Plan</span>
              </button>
            </div>

            {/* CENTER SPACER (plus button lives here absolutely) */}
            <div className="w-[52px] shrink-0" aria-hidden="true" />

            {/* RIGHT: Strategy + Settings */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => handleTabChange(2)}
                className={tabClass(activeTab === 2)}
                aria-label="Strategy"
                aria-current={activeTab === 2 ? "page" : undefined}
              >
                <IconBrain size={20} strokeWidth={2} />
                <span className="text-[10.5px] font-medium leading-none">Strategy</span>
              </button>
              <button
                type="button"
                onClick={() => { haptic("light"); setExpanded(false); onOpenSettings(); }}
                className={tabClass(false)}
                aria-label="Settings"
              >
                <IconSettings size={20} strokeWidth={2} />
                <span className="text-[10.5px] font-medium leading-none">Settings</span>
              </button>
            </div>
          </nav>

        </div>
      </div>
    </>
  );
}
