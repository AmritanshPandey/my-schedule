/**
 * Derived consistency insights.
 * All outputs are computed from stats — nothing is persisted.
 */

import type { DayStats } from "./calculateDailyStats";
import type { WeekStats } from "./calculateWeeklyStats";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsightIcon = "fire" | "trend-up" | "trend-down" | "star" | "target" | "calendar";

export interface ConsistencyInsight {
  key: string;
  icon: InsightIcon;
  label: string;
  description: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function calculateInsights(
  dayStats: DayStats[],
  weekStats: WeekStats[],
  streak: number,
): ConsistencyInsight[] {
  const insights: ConsistencyInsight[] = [];

  // Streak milestone
  if (streak >= 3) {
    insights.push({
      key: "streak",
      icon: "fire",
      label: `${streak}-Day Streak`,
      description: "Keep the momentum going",
    });
  }

  // Best performing day this week (non-future, with at least one scheduled task)
  const activePastDays = dayStats.filter((d) => !d.isFuture && d.scheduled > 0);
  if (activePastDays.length > 0) {
    const best = activePastDays.reduce((a, b) => (a.pct >= b.pct ? a : b));
    if (best.pct > 0) {
      insights.push({
        key: "best_day",
        icon: "star",
        label: `Best Day: ${best.label}`,
        description: `${best.pct}% completion rate`,
      });
    }
  }

  // Week-over-week comparison (current vs last week)
  const currentWeek = weekStats[weekStats.length - 1];
  const lastWeek = weekStats[weekStats.length - 2];

  if (currentWeek && lastWeek && lastWeek.pct > 0) {
    const diff = currentWeek.pct - lastWeek.pct;
    if (diff > 0) {
      insights.push({
        key: "wow_up",
        icon: "trend-up",
        label: `Up ${diff}% vs last week`,
        description: "You're improving week over week",
      });
    } else if (diff < -5) {
      insights.push({
        key: "wow_down",
        icon: "trend-down",
        label: `Down ${Math.abs(diff)}% vs last week`,
        description: "A slight dip — you'll bounce back",
      });
    }
  }

  // On-track encouragement
  if (currentWeek && currentWeek.pct >= 80) {
    insights.push({
      key: "on_track",
      icon: "target",
      label: "On Track",
      description: "Current pace keeps your roadmap on track",
    });
  }

  return insights;
}
