"use client";

import { useState } from "react";
import type { Plan, Goal } from "@/lib/useScheduleDB";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { accentStyles } from "@/lib/colorSystem";
import { IconFlame, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";

function parseNumber(val: string): number {
  const m = val.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function getLastNDays(n: number): string[] {
  const result: string[] = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    result.push(d.toISOString().split("T")[0]);
  }
  return result;
}

function getDayTotal(plan: Plan, metric: string, date: string): number {
  return plan.items
    .filter((item) => item.date === date)
    .reduce((acc, item) => {
      const m = item.meta?.find((x) => x.label.toLowerCase() === metric.toLowerCase());
      return acc + parseNumber(m?.value ?? "0");
    }, 0);
}

function getStreak(goal: Goal, plan: Plan): number {
  const today = todayISO();
  const hasTodayEntries = plan.items.some((item) => item.date === today);
  const d = new Date(today + "T00:00:00");
  if (!hasTodayEntries) d.setDate(d.getDate() - 1);

  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const dateStr = d.toISOString().split("T")[0];
    const dayItems = plan.items.filter((item) => item.date === dateStr);
    if (dayItems.length === 0) break;

    const total = dayItems.reduce((acc, item) => {
      const m = item.meta?.find((x) => x.label.toLowerCase() === goal.metric.toLowerCase());
      return acc + parseNumber(m?.value ?? "0");
    }, 0);

    const met =
      goal.direction === "below"
        ? total > 0 && total <= goal.target
        : total >= goal.target;

    if (!met) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function getBarColor(direction: "below" | "above" | undefined, pct: number): string {
  if (!direction) return "bg-neutral-300 dark:bg-neutral-600";
  if (direction === "below") {
    if (pct >= 1) return "bg-rose-400 dark:bg-rose-500";
    if (pct >= 0.8) return "bg-amber-400 dark:bg-amber-500";
    return "bg-emerald-400 dark:bg-emerald-500";
  }
  if (pct >= 1) return "bg-emerald-400 dark:bg-emerald-500";
  if (pct >= 0.5) return "bg-cyan-400 dark:bg-cyan-500";
  return "bg-amber-400 dark:bg-amber-500";
}

function MetricChart({
  dates,
  plan,
  metric,
  goal,
}: {
  dates: string[];
  plan: Plan;
  metric: string;
  goal?: Goal;
}) {
  const today = todayISO();
  const buckets = dates.map((date) => ({
    date,
    label: new Date(date + "T00:00:00")
      .toLocaleDateString("en-US", { weekday: "short" })
      .slice(0, 2),
    value: getDayTotal(plan, metric, date),
    isToday: date === today,
  }));

  const maxBar = Math.max(...buckets.map((b) => b.value), 0.001);
  const maxValue = goal ? Math.max(goal.target * 1.2, maxBar) : maxBar;
  const chartH = 72;
  const goalLineBottom =
    goal && maxValue > 0 ? (goal.target / maxValue) * chartH : null;

  const activeBuckets = buckets.filter((b) => b.value > 0);
  const avg =
    activeBuckets.length > 0
      ? Math.round(
          activeBuckets.reduce((s, b) => s + b.value, 0) / activeBuckets.length
        )
      : 0;

  const streak = goal ? getStreak(goal, plan) : 0;

  const step = dates.length <= 7 ? 1 : dates.length <= 14 ? 2 : 5;

  return (
    <div className="space-y-2.5">
      {/* Bar chart */}
      <div className="relative" style={{ height: chartH + 18 }}>
        {/* Goal line */}
        {goalLineBottom !== null && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center gap-1"
            style={{ bottom: 14 + goalLineBottom }}
          >
            <div className="h-px flex-1 border-t border-dashed border-neutral-300 dark:border-neutral-600" />
            <span className="shrink-0 text-[9px] font-semibold text-neutral-400 dark:text-neutral-500">
              {goal!.target.toLocaleString()}
              {goal!.unit ? ` ${goal!.unit}` : ""}
            </span>
          </div>
        )}

        {/* Bars */}
        <div
          className="absolute bottom-4 left-0 right-0 flex items-end gap-px"
          style={{ height: chartH }}
        >
          {buckets.map((b) => {
            const pct = goal ? b.value / goal.target : 0;
            const barH =
              maxValue > 0
                ? Math.max((b.value / maxValue) * chartH, b.value > 0 ? 2 : 0)
                : 0;
            const color = goal
              ? getBarColor(goal.direction, pct)
              : b.value > 0
              ? "bg-neutral-300 dark:bg-neutral-600"
              : "";
            return (
              <div
                key={b.date}
                title={
                  b.value > 0
                    ? `${Math.round(b.value).toLocaleString()}${goal?.unit ? ` ${goal.unit}` : ""}`
                    : "No data"
                }
                className="group relative flex flex-1 flex-col items-center justify-end"
                style={{ height: chartH }}
              >
                {b.value > 0 && (
                  <div
                    className={`w-full rounded-t-[2px] ${color} ${b.isToday ? "opacity-100 ring-1 ring-inset ring-white/20" : "opacity-65"}`}
                    style={{ height: barH }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* X labels */}
        <div className="absolute bottom-0 left-0 right-0 flex gap-px">
          {buckets.map((b, i) => {
            const show =
              i === 0 || i === buckets.length - 1 || b.isToday || i % step === 0;
            return (
              <div key={b.date} className="flex-1 text-center">
                {show && (
                  <span
                    className={`text-[9px] leading-none ${
                      b.isToday
                        ? "font-bold text-neutral-500 dark:text-neutral-300"
                        : "text-neutral-400 dark:text-neutral-600"
                    }`}
                  >
                    {b.isToday ? "·" : b.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        {goal && (
          <div
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              streak > 0
                ? "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
                : "bg-neutral-100 text-neutral-400 dark:bg-white/[0.06] dark:text-neutral-500"
            }`}
          >
            <IconFlame size={9} />
            {streak} {streak === 1 ? "day" : "days"} streak
          </div>
        )}
        {avg > 0 && (
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
            avg {avg.toLocaleString()}
            {goal?.unit ? ` ${goal.unit}` : ""} / logged day
          </span>
        )}
        {activeBuckets.length > 0 && (
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
            · {activeBuckets.length} of {dates.length} days logged
          </span>
        )}
      </div>
    </div>
  );
}

export default function Analytics({ plans }: { plans: Plan[] }) {
  const [period, setPeriod] = useState<7 | 14 | 30>(14);

  const today = todayISO();
  const dates = getLastNDays(period);

  const plansWithMetrics = plans.filter((p) => (p.metaFields ?? []).length > 0);

  const allGoalsToday = plansWithMetrics.flatMap((plan) =>
    (plan.goals ?? []).map((goal) => {
      const current = getDayTotal(plan, goal.metric, today);
      const met =
        goal.direction === "below"
          ? current > 0 && current <= goal.target
          : current >= goal.target;
      return { goal, plan, current, met };
    })
  );

  const hasAnyData = plansWithMetrics.some((p) =>
    p.items.some((item) => item.date && dates.includes(item.date))
  );

  if (plansWithMetrics.length === 0 || !hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16 text-center dark:border-white/10">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.07]">
          <IconTrendingUp size={22} className="text-neutral-400 dark:text-neutral-500" />
        </div>
        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">No data yet</p>
        <p className="mt-1 max-w-[220px] text-xs text-neutral-400 dark:text-neutral-500">
          Log entries with metrics in your plans and trends will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-1 pb-10">
      {/* Header row: period + today summary */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {([7, 14, 30] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`h-7 rounded-md px-2.5 text-xs font-semibold transition-all duration-150 ${
                period === p
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>

        {allGoalsToday.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-neutral-400 dark:text-neutral-500">Today:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {allGoalsToday.filter((g) => g.met).length} on track
            </span>
            {allGoalsToday.filter((g) => !g.met).length > 0 && (
              <>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  {allGoalsToday.filter((g) => !g.met).length} pending
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Per-plan chart cards */}
      {plansWithMetrics.map((plan) => {
        const metrics = plan.metaFields ?? [];
        const hasPeriodData = plan.items.some(
          (item) => item.date && dates.includes(item.date)
        );

        return (
          <div
            key={plan.id}
            className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-sm dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-black/25"
          >
            {/* Plan header */}
            <div
              className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 dark:border-white/[0.07] ${accentStyles(plan.color).tint}`}
            >
              {(() => {
                const ic = SECTION_ICONS.find((i) => i.name === plan.emoji);
                const PI = (ic ?? SECTION_ICONS[0]).icon;
                return (
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accentStyles(plan.color).iconSolid}`}
                  >
                    <PI size={14} strokeWidth={1.8} />
                  </span>
                );
              })()}
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {plan.title}
              </h3>
              {!hasPeriodData && (
                <span className="ml-auto text-xs text-neutral-400 dark:text-neutral-500">
                  No entries this period
                </span>
              )}
            </div>

            {hasPeriodData ? (
              <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                {metrics.map((metric) => {
                  const goal = (plan.goals ?? []).find(
                    (g) => g.metric.toLowerCase() === metric.toLowerCase()
                  );
                  const hasMetricData = plan.items.some(
                    (item) =>
                      item.date &&
                      dates.includes(item.date) &&
                      item.meta?.some(
                        (m) =>
                          m.label.toLowerCase() === metric.toLowerCase() &&
                          parseNumber(m.value) > 0
                      )
                  );
                  if (!hasMetricData) return null;

                  return (
                    <div key={metric} className="space-y-2 px-4 py-3.5">
                      {/* Metric header */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          {metric}
                        </span>
                        {goal ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                            {goal.direction === "below" ? (
                              <IconTrendingDown size={11} />
                            ) : (
                              <IconTrendingUp size={11} />
                            )}
                            {goal.direction === "below" ? "stay under" : "reach"}{" "}
                            {goal.target.toLocaleString()}
                            {goal.unit ? ` ${goal.unit}` : ""}
                          </span>
                        ) : (
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                            no goal set
                          </span>
                        )}
                      </div>

                      <MetricChart
                        dates={dates}
                        plan={plan}
                        metric={metric}
                        goal={goal}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                No entries logged in this {period}-day window.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
