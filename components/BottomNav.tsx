"use client";

import { IconActivity, IconChartBar, IconChecklist, IconPlus, IconSettings2 } from "@tabler/icons-react";

interface BottomNavProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  onAddTask: () => void;
}

const LEFT_TABS = [
  { icon: IconActivity, label: "Activity", tab: 0 },
  { icon: IconChecklist, label: "Plan", tab: 1 },
];

const RIGHT_TABS = [
  { icon: IconChartBar, label: "Progress", tab: 2 },
  { icon: IconSettings2, label: "Settings", tab: 3 },
];

export default function BottomNav({ activeTab, onTabChange, onAddTask }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40">
      <div className="mx-auto max-w-6xl px-3">
        <nav className="mx-1 mb-3 flex items-end rounded-2xl border border-neutral-200/70 bg-white/95 backdrop-blur-xl dark:border-white/[0.08] dark:bg-neutral-950/95">
          {LEFT_TABS.map(({ icon: Icon, label, tab }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`flex flex-1 flex-col items-center gap-1 pt-3 pb-3 transition-all duration-200 ${
                  active
                    ? "text-neutral-900 dark:text-white"
                    : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.6} />
                <span className={`text-[10px] leading-none ${active ? "font-bold" : "font-medium"}`}>{label}</span>
              </button>
            );
          })}

          {/* Center add button */}
          <div className="flex flex-col items-center px-3 pb-2.5">
            <button
              type="button"
              onClick={onAddTask}
              aria-label="Add task"
              className="flex h-14 w-14 -translate-y-5 items-center justify-center rounded-full bg-neutral-900 text-white transition-all duration-200 active:scale-95 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <IconPlus size={26} strokeWidth={2.5} />
            </button>
          </div>

          {RIGHT_TABS.map(({ icon: Icon, label, tab }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`flex flex-1 flex-col items-center gap-1 pt-3 pb-3 transition-all duration-200 ${
                  active
                    ? "text-neutral-900 dark:text-white"
                    : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.2 : 1.6} />
                <span className={`text-[10px] leading-none ${active ? "font-bold" : "font-medium"}`}>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
