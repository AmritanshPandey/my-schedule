"use client";

import { useState } from "react";

interface Tab {
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
}

export default function Tabs({ tabs }: TabsProps) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="mb-6 flex w-full gap-2 rounded-xl border border-neutral-200/80 bg-neutral-100/80 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActive(i)}
            className={`flex h-10 flex-1 items-center justify-center gap-2  rounded-lg text-sm font-medium transition-all duration-200 ${
              active === i
                ? "bg-white border border-neutral-200/80 text-neutral-900 dark:border-white/[0.08] dark:bg-neutral-800 dark:text-white"
                : "bg-transparent text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div key={tabs[active].label} className="animate-panel-in">
        {tabs[active].content}
      </div>
    </div>
  );
}
