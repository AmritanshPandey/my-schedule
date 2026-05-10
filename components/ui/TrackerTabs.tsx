"use client";

import { memo } from "react";
import { motion } from "framer-motion";

interface TrackerTab {
  id: string;
  label: string;
}

interface TrackerTabsProps {
  tabs: TrackerTab[];
  activeId: string;
  onChange: (id: string) => void;
}

function TrackerTabsInner({ tabs, activeId, onChange }: TrackerTabsProps) {
  if (tabs.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <motion.button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={`flex-none rounded-full px-4 py-2 text-[13px] font-semibold transition-colors whitespace-nowrap ${
              isActive
                ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                : "border border-neutral-200 bg-transparent text-neutral-500 hover:text-neutral-900 dark:border-white/10 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {tab.label}
          </motion.button>
        );
      })}
    </div>
  );
}

export const TrackerTabs = memo(TrackerTabsInner);
