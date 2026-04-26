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
      <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-xl p-1 mb-6 w-full">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActive(i)}
            className={`flex-1 inline-flex items-center justify-center gap-2 h-10 text-sm font-medium rounded-lg ${
              active === i
                ? "bg-neutral-800 text-white"
                : "text-neutral-500"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div>{tabs[active].content}</div>
    </div>
  );
}
