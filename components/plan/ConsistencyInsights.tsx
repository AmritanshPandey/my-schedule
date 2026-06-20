"use client";

import { m } from "framer-motion";
import {
  IconFlame,
  IconTrendingUp,
  IconTrendingDown,
  IconStar,
  IconTarget,
  IconCalendar,
} from "@tabler/icons-react";
import type { ConsistencyInsight, InsightIcon } from "@/lib/consistency/calculateInsights";

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICONS: Record<InsightIcon, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  fire: IconFlame,
  "trend-up": IconTrendingUp,
  "trend-down": IconTrendingDown,
  star: IconStar,
  target: IconTarget,
  calendar: IconCalendar,
};

const ICON_COLORS: Record<InsightIcon, string> = {
  fire: "text-orange-500",
  "trend-up": "text-emerald-500",
  "trend-down": "text-rose-400",
  star: "text-amber-500",
  target: "text-emerald-500",
  calendar: "text-blue-400",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConsistencyInsightsProps {
  insights: ConsistencyInsight[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConsistencyInsights({ insights }: ConsistencyInsightsProps) {
  if (insights.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {insights.map((insight, i) => {
        const Icon = ICONS[insight.icon];
        const iconColor = ICON_COLORS[insight.icon];

        return (
          <m.div
            key={insight.key}
            className="rounded-2xl border border-neutral-200 bg-white px-3.5 py-3 dark:border-white/[0.08] dark:bg-white/[0.04]"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut", delay: i * 0.06 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon size={15} strokeWidth={2.2} className={`shrink-0 ${iconColor}`} />
              <span className="text-[13px] font-bold text-neutral-950 dark:text-white leading-tight">
                {insight.label}
              </span>
            </div>
            <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 leading-snug">
              {insight.description}
            </p>
          </m.div>
        );
      })}
    </div>
  );
}
