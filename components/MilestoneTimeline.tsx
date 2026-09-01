"use client";

import { Fragment, useMemo, useRef, useEffect, useState } from "react";
import { IconMap2 } from "@tabler/icons-react";
import type { Schedule, Milestone, Plan, Task } from "@/lib/useScheduleDB";
import { addDaysToISO, localISODate, todayISO as getTodayISO } from "@/lib/dateUtils";
import { calculateMilestoneProgress, type MilestoneProgress } from "@/lib/planProgress";
import { calculateMilestoneState, type MilestoneHealth } from "@/lib/milestoneHealth";

interface MilestoneTimelineProps {
  schedule: Schedule;
}

// ── Layout constants ──────────────────────────────────────────────────────────
const PX_PER_DAY = 42;
const LABEL_W = 116; // sticky left column (px)
const ROW_H = 56;

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoToMs(iso: string): number {
  return new Date(iso + "T00:00:00").getTime();
}

function daysBetween(from: string, to: string): number {
  return Math.round((isoToMs(to) - isoToMs(from)) / 86_400_000);
}

function addDaysISO(iso: string, n: number): string {
  return addDaysToISO(iso, n);
}

function clamp(val: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, val));
}

// ── Status helpers ────────────────────────────────────────────────────────────

type MilestoneStatus = Milestone["status"];

/**
 * The same 5-way visual read the milestone card/detail sheet already use
 * (lib/milestoneHealth.ts). completed/delayed(by date)/upcoming stay exactly
 * as `status` already says — nothing about those is in question. "active" is
 * the one status that used to always read as calm blue right up until the
 * actual deadline passed; splitting it by health means a milestone trending
 * to miss its target shows that *before* the deadline, not just after.
 */
type DotTone = "completed" | "delayed" | "at_risk" | "active" | "upcoming";

function resolveDotTone(status: MilestoneStatus, health: MilestoneHealth | undefined): DotTone {
  if (status !== "active") return status === "upcoming" ? "upcoming" : status;
  if (health === "at_risk") return "at_risk";
  if (health === "delayed") return "delayed";
  return "active";
}

function dotClasses(tone: DotTone, selected: boolean): string {
  const base =
    "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-transform";
  const scale = selected ? "scale-[1.3]" : "hover:scale-110";
  const color =
    tone === "completed"
      ? "bg-emerald-500 border-emerald-500"
      : tone === "delayed"
      ? "bg-rose-400 border-rose-400"
      : tone === "at_risk"
      ? "bg-amber-400 border-amber-400"
      : tone === "active"
      ? "bg-blue-500 border-blue-500"
      : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800";
  return `${base} ${scale} ${color}`;
}

function statusBadgeClasses(tone: DotTone): string {
  if (tone === "completed")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
  if (tone === "delayed")
    return "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400";
  if (tone === "at_risk")
    return "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
  if (tone === "active")
    return "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
  return "bg-neutral-100 text-neutral-600 dark:bg-white/[0.05] dark:text-neutral-400";
}

/** "Active"/"Upcoming" etc — same label a bare `status` would have shown,
 *  except "at_risk" (which isn't a `Milestone["status"]` value at all). */
function toneLabel(tone: DotTone): string {
  return tone === "at_risk" ? "At risk" : tone.charAt(0).toUpperCase() + tone.slice(1);
}

function dotInner(m: Milestone, tone: DotTone): React.ReactNode {
  if (tone === "completed")
    return <span className="text-[8px] font-black text-white">✓</span>;
  if (tone === "delayed" || tone === "at_risk")
    return <span className="text-[8px] font-black text-white">!</span>;
  if (m.linkedActivities.length > 0)
    return (
      <span
        className={`text-[8px] font-bold leading-none ${
          tone === "active" ? "text-white" : "text-neutral-500 dark:text-neutral-300"
        }`}
      >
        {m.linkedActivities.length}
      </span>
    );
  return null;
}

// ── Selected milestone detail panel ──────────────────────────────────────────

function MilestoneDetail({
  milestone,
  plan,
  tone,
  onClose,
}: {
  milestone: Milestone;
  plan: Plan;
  tone: DotTone;
  onClose: () => void;
}) {
  const dateLabel = new Date(
    milestone.plannedEndDate + "T00:00:00"
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mx-4 mt-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px]">{plan.emoji}</span>
            <p className="text-[13px] font-bold text-neutral-900 dark:text-white">
              {milestone.title}
            </p>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClasses(tone)}`}
            >
              {toneLabel(tone)}
            </span>
          </div>
          {/* Description */}
          {milestone.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              {milestone.description}
            </p>
          )}
          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500">
            <span>📅 Target: {dateLabel}</span>
            {milestone.linkedActivities.length > 0 && (
              <span>
                🔗 {milestone.linkedActivities.length} task
                {milestone.linkedActivities.length !== 1 ? "s" : ""} linked
              </span>
            )}
            {milestone.linkedTrackers.length > 0 && (
              <span>📊 {milestone.linkedTrackers.length} tracker linked</span>
            )}
          </div>
        </div>
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-[16px] leading-none text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MilestoneTimeline({ schedule }: MilestoneTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const todayISO = getTodayISO();

  const { rangeStart, totalDays, todayOffset, planRows, monthMarks } = useMemo(() => {
    const allMs = (schedule.milestones ?? []).filter((m) => m.plannedEndDate);

    if (allMs.length === 0) {
      return {
        rangeStart: addDaysISO(todayISO, -21),
        totalDays: 120,
        todayOffset: 21,
        planRows: [],
        monthMarks: [] as { label: string; offsetDays: number }[],
      };
    }

    // Widest date range across all milestones
    const startDates = allMs.map((m) => m.startDate).filter(Boolean).sort();
    const endDates = allMs.map((m) => m.plannedEndDate).sort();
    const earliestMs = startDates[0] ?? endDates[0];
    const latestMs = endDates[endDates.length - 1];

    // Show at least 4 weeks before today and 8 weeks after today
    const rangeStart = addDaysISO(
      earliestMs < addDaysISO(todayISO, -28) ? earliestMs : addDaysISO(todayISO, -28),
      -7
    );
    const rangeEndMin = addDaysISO(todayISO, 56);
    const rangeEndRaw = latestMs > rangeEndMin ? latestMs : rangeEndMin;
    const rangeEnd = addDaysISO(rangeEndRaw, 14);

    const totalDays = Math.max(daysBetween(rangeStart, rangeEnd), 90);
    const todayOffset = clamp(daysBetween(rangeStart, todayISO), 0, totalDays);

    // Group milestones by plan (only plans that have milestones with dates)
    const planRows = schedule.plans
      .map((plan) => {
        const milestones = (schedule.milestones ?? [])
          .filter((m) => m.planId === plan.id && m.plannedEndDate)
          .sort((a, b) => a.plannedEndDate.localeCompare(b.plannedEndDate));
        return { plan, milestones };
      })
      .filter(({ milestones }) => milestones.length > 0);

    // Month label markers
    const monthMarks: { label: string; offsetDays: number }[] = [];
    const cur = new Date(rangeStart + "T00:00:00");
    cur.setDate(1);
    if (localISODate(cur) < rangeStart) cur.setMonth(cur.getMonth() + 1);
    while (true) {
      const iso = localISODate(cur);
      if (iso > rangeEnd) break;
      monthMarks.push({
        label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        offsetDays: clamp(daysBetween(rangeStart, iso), 0, totalDays),
      });
      cur.setMonth(cur.getMonth() + 1);
    }

    return { rangeStart, totalDays, todayOffset, planRows, monthMarks };
  }, [schedule.milestones, schedule.plans, todayISO]);

  // Live linked-task/subtask completion per milestone, computed once for
  // every milestone across every plan row (not per-dot) — same memoization
  // pattern used elsewhere for per-plan/per-milestone activities scans.
  const progressById = useMemo(() => {
    const map = new Map<string, MilestoneProgress>();
    for (const { plan, milestones } of planRows) {
      for (const m of milestones) {
        map.set(m.id, calculateMilestoneProgress(m, schedule.activities as unknown as Record<string, Task[]>, plan));
      }
    }
    return map;
  }, [planRows, schedule.activities]);

  // Live health per milestone — same engine and memoization pattern as
  // progressById above, feeding resolveDotTone so an "active" milestone's dot
  // reflects whether it's actually on pace, not just that it hasn't finished.
  const healthById = useMemo(() => {
    const map = new Map<string, MilestoneHealth>();
    for (const { plan, milestones } of planRows) {
      for (const m of milestones) {
        map.set(m.id, calculateMilestoneState({
          milestone: m, plan,
          activities: schedule.activities as unknown as Record<string, Task[]>,
          trackers: schedule.progressTrackers, metricEntries: schedule.metricEntries,
          trackingStart: schedule.preferences?.startDate,
        }).health);
      }
    }
    return map;
  }, [planRows, schedule.activities, schedule.progressTrackers, schedule.metricEntries, schedule.preferences?.startDate]);

  // Scroll so today is roughly 1/3 from the left on mount
  useEffect(() => {
    if (scrollRef.current) {
      const targetScroll = todayOffset * PX_PER_DAY - 80;
      scrollRef.current.scrollLeft = Math.max(0, targetScroll);
    }
  }, [todayOffset]);

  const selectedMilestone = selectedId
    ? (schedule.milestones ?? []).find((m) => m.id === selectedId) ?? null
    : null;
  const selectedPlan = selectedMilestone
    ? schedule.plans.find((p) => p.id === selectedMilestone.planId) ?? null
    : null;

  // ── Empty state ────────────────────────────────────────────────────────────

  if (planRows.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900 px-5 py-5">
        <div className="mb-3 flex items-center gap-1.5">
          <IconMap2 size={13} strokeWidth={2.2} className="text-neutral-400 dark:text-neutral-500" />
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            Milestone Roadmap
          </p>
        </div>
        <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
          No milestones with target dates yet. Add milestones from a plan.
        </p>
      </div>
    );
  }

  const totalPx = totalDays * PX_PER_DAY;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900 py-4">
      {/* Section header */}
      <div className="mb-3 flex items-center gap-1.5 px-4">
        <IconMap2 size={13} strokeWidth={2.2} className="text-neutral-400 dark:text-neutral-500" />
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          Milestone Roadmap
        </p>
      </div>

      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className="overflow-x-auto pb-1"
        style={{ scrollbarWidth: "thin" }}
      >
        <div
          className="relative select-none"
          style={{ width: LABEL_W + totalPx + 24, minWidth: "100%" }}
        >
          {/* ── Month labels ─────────────────────────────────────── */}
          <div className="relative mb-0.5" style={{ height: 18 }}>
            {monthMarks.map(({ label, offsetDays }) => (
              <span
                key={label}
                className="absolute top-0 text-[9.5px] font-semibold text-neutral-400 dark:text-neutral-500"
                style={{ left: LABEL_W + offsetDays * PX_PER_DAY + 4 }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* ── Plan rows ────────────────────────────────────────── */}
          {planRows.map(({ plan, milestones }) => (
            <div
              key={plan.id}
              className="relative flex items-center"
              style={{ height: ROW_H }}
            >
              {/* Sticky plan label */}
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-white pl-4 pr-3 dark:bg-neutral-900"
                style={{ width: LABEL_W }}
              >
                <span className="shrink-0 text-[14px] leading-none">{plan.emoji}</span>
                <p className="min-w-0 truncate text-[11px] font-semibold leading-tight text-neutral-700 dark:text-neutral-300">
                  {plan.title}
                </p>
              </div>

              {/* Track + nodes */}
              <div className="relative overflow-visible" style={{ width: totalPx }}>
                {/* Baseline track */}
                <div
                  className="absolute top-1/2 h-[1.5px] -translate-y-1/2 rounded-full bg-neutral-100 dark:bg-white/[0.07]"
                  style={{ left: 0, width: totalPx }}
                />

                {/* Today line */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] rounded-full bg-emerald-400/50 dark:bg-emerald-500/50"
                  style={{ left: todayOffset * PX_PER_DAY - 1 }}
                />

                {/* Milestone dots */}
                {milestones.map((m) => {
                  const endOffset = clamp(
                    daysBetween(rangeStart, m.plannedEndDate),
                    0,
                    totalDays
                  );
                  const cx = endOffset * PX_PER_DAY;
                  const isSelected = selectedId === m.id;
                  const progress = progressById.get(m.id);
                  const tone = resolveDotTone(m.status, healthById.get(m.id));
                  // Only the plain "upcoming" dot gets a progress ring — every
                  // other tone (completed/delayed/at_risk/active) already has
                  // a strong, sufficient solid-color read of its own; a ring
                  // on top of those would be noise, not signal. Static fill
                  // (not an animation), so no reduced-motion guard is needed.
                  const showProgressRing =
                    tone === "upcoming" &&
                    !!progress?.hasLinkedTasks &&
                    (progress.pct ?? 0) > 0;

                  return (
                    <Fragment key={m.id}>
                      {showProgressRing && (
                        <div
                          aria-hidden="true"
                          className="absolute top-1/2 h-[24px] w-[24px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                          style={{
                            left: cx,
                            background: `conic-gradient(rgb(16 185 129) ${(progress!.pct as number) * 3.6}deg, transparent 0deg)`,
                          }}
                        />
                      )}
                      <button
                        type="button"
                        className={dotClasses(tone, isSelected)}
                        style={{ left: cx }}
                        onClick={() => setSelectedId(isSelected ? null : m.id)}
                        title={tone === "at_risk" ? `${m.title} — at risk` : m.title}
                      >
                        {dotInner(m, tone)}
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Today text label */}
          <div
            className="absolute bottom-0 z-10"
            style={{ left: LABEL_W + todayOffset * PX_PER_DAY - 13 }}
          >
            <span className="text-[9px] font-bold text-emerald-500 dark:text-emerald-400">
              today
            </span>
          </div>
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4">
        {(
          [
            { cls: "bg-emerald-500", label: "Completed" },
            { cls: "bg-blue-500", label: "Active" },
            { cls: "bg-amber-400", label: "At risk" },
            { cls: "bg-rose-400", label: "Delayed" },
            {
              cls: "border border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800",
              label: "Upcoming",
            },
          ] as const
        ).map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 rounded-full ${cls}`} />
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{label}</span>
          </div>
        ))}
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          · number = linked tasks
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          · ring = task progress (upcoming milestones)
        </span>
      </div>

      {/* ── Selected milestone detail ────────────────────────────────────── */}
      {selectedMilestone && selectedPlan && (
        <MilestoneDetail
          milestone={selectedMilestone}
          plan={selectedPlan}
          tone={resolveDotTone(selectedMilestone.status, healthById.get(selectedMilestone.id))}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
