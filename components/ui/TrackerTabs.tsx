"use client";

import { memo } from "react";
import { m } from "framer-motion";

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
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <m.button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            whileTap={{ scale: 0.94 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className={`flex-none whitespace-nowrap rounded-[13px] px-[18px] py-[9px] min-h-[44px] text-[14px] font-semibold tracking-[-0.15px] transition-all ${
              isActive
                ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                : "border-[1.5px] border-neutral-200 bg-transparent text-neutral-500 hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
            }`}
            style={isActive ? { transition: "all 180ms var(--ease-out-quint)" } : undefined}
          >
            {tab.label}
          </m.button>
        );
      })}
    </div>
  );
}

export const TrackerTabs = memo(TrackerTabsInner);
