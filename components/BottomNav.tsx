"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconCalendarEvent,
  IconClipboardData,
  IconCalendarPlus,
  IconClipboardPlus,
  IconPlus,
} from "@tabler/icons-react";

interface BottomNavProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  onCreateTask: () => void;
  onCreatePlan: () => void;
}

export default function BottomNav({
  activeTab,
  onTabChange,
  onCreateTask,
  onCreatePlan,
}: BottomNavProps) {
  const [expanded, setExpanded] = useState(false);

  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <>
      {/* BACKDROP */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.16,
              ease: "easeOut",
            }}
            className="fixed inset-0 z-20 bg-black/[0.03]"
          />
        )}
      </AnimatePresence>

      <div className="fixed inset-x-0 z-30 flex justify-center px-4" style={{ bottom: "max(20px, calc(env(safe-area-inset-bottom) + 8px))" }}>
        <div ref={navRef} className="relative w-[360px]">
          {/* EXPANDED MENU */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{
                  opacity: 0,
                  y: 6,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 4,
                }}
                transition={{
                  duration: 0.18,
                  ease: "easeOut",
                }}
                className="
                  absolute
                  left-1/2
                  top-1/2
                  z-30
                  flex
                  -translate-x-1/2
                  -translate-y-[124px]
                  flex-col
                  items-center
                "
              >
                {/* MENU SURFACE */}
                <div
                  className="
                    flex
                    items-start
                    gap-8
                    rounded-[24px]
                    bg-neutral-900
                    px-4
                    py-4
                    border
                    border-white/[0.08]
                  "
                >
                  {/* ADD TASK */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setExpanded(false);
                      onCreateTask();
                    }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div
                      className="
                        flex
                        h-[52px]
                        w-[64px]
                        items-center
                        justify-center
                        rounded-[18px]
                        bg-white/[0.08]
                      "
                    >
                      <IconCalendarPlus
                        size={22}
                        strokeWidth={1.9}
                        className="text-white"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-white/70">
                      Task
                    </span>
                  </motion.button>

                  {/* ADD PLAN */}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setExpanded(false);
                      onCreatePlan();
                    }}
                    className="flex flex-col items-center gap-1.5"
                  >
                    <div
                      className="
                        flex
                        h-[52px]
                        w-[64px]
                        items-center
                        justify-center
                        rounded-[18px]
                        bg-white/[0.08]
                      "
                    >
                      <IconClipboardPlus
                        size={22}
                        strokeWidth={1.9}
                        className="text-white"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-white/70">
                      New Plan
                    </span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FLOATING CREATE BUTTON */}
          <motion.button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label="Create"
            whileTap={{ scale: 0.96 }}
            className="
              absolute
              left-1/2
              top-1/2
              z-40
              flex
              h-[56px]
              w-[56px]
              -translate-x-1/2
              -translate-y-1/2
              items-center
              justify-center
              rounded-full
              bg-black
              text-white
              dark:bg-white
              dark:text-neutral-950
            "
          >
            <motion.div
              animate={{
                rotate: expanded ? 45 : 0,
              }}
              transition={{
                duration: 0.18,
                ease: "easeOut",
              }}
            >
              <IconPlus
                size={24}
                strokeWidth={2}
              />
            </motion.div>
          </motion.button>

          {/* NAVBAR */}
          <nav
            className="
              relative
              flex
              h-[72px]
              w-full
              items-center
              justify-between
              rounded-full
              border
              border-neutral-200/80
              bg-white
              px-2
              dark:border-white/[0.08]
              dark:bg-neutral-800
            "
          >
            {/* TASKS */}
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                onTabChange(0);
              }}
              className={`
                flex
                h-[56px]
                w-[96px]
                flex-col
                items-center
                justify-center
                gap-[2px]
                rounded-full
                transition-all
                duration-200
                ${
                  activeTab === 0
                    ? "bg-black/[0.04] text-neutral-950 dark:bg-white/[0.08] dark:text-white"
                    : "text-neutral-500 dark:text-neutral-500"
                }
              `}
            >
              <IconCalendarEvent
                size={24}
                strokeWidth={2}
              />

              <span className="text-[12px] font-medium leading-none">
                Tasks
              </span>
            </button>

            {/* CENTER SPACER */}
            <div className="w-[56px]" />

            {/* PLAN */}
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                onTabChange(1);
              }}
              className={`
                flex
                h-[56px]
                w-[96px]
                flex-col
                items-center
                justify-center
                gap-[2px]
                rounded-full
                transition-all
                duration-200
                ${
                  activeTab === 1
                    ? "bg-black/[0.04] text-neutral-950 dark:bg-white/[0.08] dark:text-white"
                    : "text-neutral-500 dark:text-neutral-500"
                }
              `}
            >
              <IconClipboardData
                size={24}
                strokeWidth={2}
              />

              <span className="text-[12px] font-medium leading-none">
                Plan
              </span>
            </button>
          </nav>
        </div>
      </div>
    </>
  );
}