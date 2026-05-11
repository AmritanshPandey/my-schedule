"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconCheck,
  IconEdit,
  IconPlus,
  IconTrash,
  IconArrowUpRight,
  IconArrowDownRight,
  IconArrowUp,
  IconArrowDown,
} from "@tabler/icons-react";
import ProgressChart from "@/components/ProgressChart";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ConsistencyHeatmap from "@/components/plan/ConsistencyHeatmap";
import MilestoneSheet, { type MilestoneSaveData } from "@/components/plan/MilestoneSheet";
import { computeRoadmapStats } from "@/lib/roadmapEngine";
import { resolveMilestoneStatus } from "@/lib/roadmapDates";
import { computeTrend } from "@/lib/trendUtils";
import type { TrendResult } from "@/lib/trendUtils";
import type {
  Plan,
  Schedule,
  Task,
  Milestone,
  ProgressTracker,
  DayKey,
  GoalDirection,
  MetricEntry,
} from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { timelineCardStyles, accentStyles } from "@/lib/colorSystem";
import { formatDuration, displayToInputTime, inputToDisplayTime } from "@/lib/timeUtils";
import { formatDate, formatDateShort } from "@/lib/dateUtils";
import { DayPill, Pill } from "@/components/ui/Badge";
import { InternalSectionTitle, SectionTextAction } from "@/components/ui/InternalSectionTitle";
import { TrackerTabs } from "@/components/ui/TrackerTabs";

// ── Local constants ───────────────────────────────────────────────────────────

const WEEKDAY_ORDER: DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const WEEKDAY_SHORT: Record<DayKey, string> = {
  sunday: "Su", monday: "Mo", tuesday: "Tu", wednesday: "We",
  thursday: "Th", friday: "Fr", saturday: "Sa",
};

const formatPlanDate = formatDate;

function formatPlanRange(plan: Plan): string {
  if (!plan.startDate && !plan.endDate) return "";
  if (plan.startDate && plan.endDate)
    return `${formatPlanDate(plan.startDate)} – ${formatPlanDate(plan.endDate)}`;
  if (plan.startDate) return `Starts ${formatPlanDate(plan.startDate)}`;
  return `Ends ${formatPlanDate(plan.endDate ?? "")}`;
}

function getUniquePlanTasks(
  planId: string,
  activities: Schedule["activities"]
): Array<{ task: Task; activeDays: DayKey[] }> {
  const seen = new Map<string, { task: Task; activeDays: DayKey[] }>();
  for (const day of DAYS) {
    for (const task of activities[day]) {
      if (task.planId !== planId) continue;
      const key = `${task.title.trim().toLowerCase()}|${task.startTime}|${task.endTime}`;
      if (!seen.has(key)) seen.set(key, { task, activeDays: [day] });
      else seen.get(key)!.activeDays.push(day);
    }
  }
  return Array.from(seen.values());
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: TrendResult }) {
  const isPositive = trend.state === "positive";
  const isUp = trend.direction === "up";
  const colorClass = isPositive
    ? "text-green-600 dark:text-green-400"
    : "text-rose-600 dark:text-rose-400";
  const ArrowIcon = isUp ? IconArrowUpRight : IconArrowDownRight;
  const pctText = trend.pct !== null ? ` by ${Math.abs(trend.pct).toFixed(1)}%` : "";
  return (
    <div className={`inline-flex items-center gap-0.5 mt-1.5 ${colorClass}`}>
      <p className="text-[12px] font-medium">
        Trending {isUp ? "up" : "down"}{pctText}
      </p>
      <ArrowIcon size={13} strokeWidth={2.5} className="shrink-0" />
    </div>
  );
}

// ── Goal direction picker ─────────────────────────────────────────────────────

function GoalDirectionPicker({
  value,
  onChange,
}: {
  value: GoalDirection;
  onChange: (v: GoalDirection) => void;
}) {
  const opts: { value: GoalDirection; Icon: typeof IconArrowUp; label: string }[] = [
    { value: "increase_good", Icon: IconArrowUp, label: "Increasing is good" },
    { value: "decrease_good", Icon: IconArrowDown, label: "Decreasing is good" },
  ];
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
        Goal direction
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {opts.map((opt) => {
          const sel = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-all ${
                sel
                  ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-white/20"
              }`}
            >
              <opt.Icon size={14} strokeWidth={2.5} className="shrink-0" />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlanDetailViewProps {
  plan: Plan;
  schedule: Schedule;
  milestones: Milestone[];
  // Task handlers
  onAddTask: (planId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteLinkedTask: (task: Task, activeDays: DayKey[]) => void;
  // Tracker handlers
  onAddTracker: (
    planId: string,
    title: string,
    unit: string,
    goalDirection: GoalDirection
  ) => void;
  onUpdateTracker: (
    trackerId: string,
    data: { title: string; unit: string; goalDirection: GoalDirection }
  ) => void;
  onDeleteTracker: (trackerId: string) => void;
  // Entry handlers
  onOpenAddEntry: (tracker: ProgressTracker) => void;
  onDeleteEntry: (entryId: string) => void;
  // Milestone handlers
  onAddMilestone: (data: MilestoneSaveData) => void;
  onUpdateMilestone: (id: string, data: Partial<Milestone>) => void;
  onDeleteMilestone: (id: string) => void;
  onCompleteMilestone: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlanDetailView({
  plan,
  schedule,
  milestones,
  onAddTask,
  onEditTask,
  onDeleteLinkedTask,
  onAddTracker,
  onUpdateTracker,
  onDeleteTracker,
  onOpenAddEntry,
  onDeleteEntry,
  onAddMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onCompleteMilestone,
}: PlanDetailViewProps) {
  // ── Tab state ───────────────────────────────────────────────────────────
  const [planTab, setPlanTab] = useState<"planning" | "roadmap">("planning");

  // ── Tracker edit state ──────────────────────────────────────────────────
  const [editingTrackerId, setEditingTrackerId] = useState<string | null>(null);
  const [editTrackerDraft, setEditTrackerDraft] = useState({
    title: "",
    unit: "",
    goalDirection: "increase_good" as GoalDirection,
  });

  // ── Add tracker state ───────────────────────────────────────────────────
  const [addingTracker, setAddingTracker] = useState(false);
  const [newTrackerTitle, setNewTrackerTitle] = useState("");
  const [newTrackerUnit, setNewTrackerUnit] = useState("");
  const [newTrackerGoalDirection, setNewTrackerGoalDirection] =
    useState<GoalDirection>("increase_good");

  // ── Selected tracker state ──────────────────────────────────────────────
  const [selectedTrackerIdRaw, setSelectedTrackerId] = useState<string | null>(null);

  // ── Milestone sheet state ───────────────────────────────────────────────
  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false);
  const [milestoneSheetMode, setMilestoneSheetMode] = useState<"create" | "edit">("create");
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  // ── Derived data ────────────────────────────────────────────────────────
  const uniqueTasks = useMemo(
    () => getUniquePlanTasks(plan.id, schedule.activities),
    [plan.id, schedule.activities]
  );

  const trackers = useMemo(
    () => schedule.progressTrackers.filter((t) => t.planId === plan.id),
    [plan.id, schedule.progressTrackers]
  );

  const selectedTrackerId = useMemo(() => {
    if (trackers.length === 0) return null;
    if (selectedTrackerIdRaw && trackers.some((t) => t.id === selectedTrackerIdRaw))
      return selectedTrackerIdRaw;
    return trackers[0].id;
  }, [trackers, selectedTrackerIdRaw]);

  const selectedTracker = useMemo(
    () => (selectedTrackerId ? trackers.find((t) => t.id === selectedTrackerId) ?? null : null),
    [trackers, selectedTrackerId]
  );

  const planMilestones = useMemo(
    () =>
      milestones
        .filter((m) => m.planId === plan.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [milestones, plan.id]
  );

  const roadmapStats = useMemo(
    () =>
      computeRoadmapStats(
        plan.id,
        schedule.activities as unknown as Record<string, Task[]>,
        milestones,
        plan
      ),
    [plan, schedule.activities, milestones]
  );

  const roadmapEndDate = planMilestones[planMilestones.length - 1]?.plannedEndDate ?? plan.endDate;
  const dateRange = plan.startDate && roadmapEndDate
    ? `${formatPlanDate(plan.startDate)} – ${formatPlanDate(roadmapEndDate)}`
    : formatPlanRange(plan);

  // ── Tracker handlers ────────────────────────────────────────────────────

  function handleAddTracker() {
    const title = newTrackerTitle.trim();
    if (!title) return;
    onAddTracker(plan.id, title, newTrackerUnit.trim(), newTrackerGoalDirection);
    setNewTrackerTitle("");
    setNewTrackerUnit("");
    setNewTrackerGoalDirection("increase_good");
    setAddingTracker(false);
  }

  function handleSaveEditTracker(trackerId: string) {
    const title = editTrackerDraft.title.trim();
    if (!title) return;
    onUpdateTracker(trackerId, {
      title,
      unit: editTrackerDraft.unit.trim(),
      goalDirection: editTrackerDraft.goalDirection,
    });
    setEditingTrackerId(null);
  }

  // ── Milestone handlers ──────────────────────────────────────────────────

  function openAddMilestone() {
    setEditingMilestone(null);
    setMilestoneSheetMode("create");
    setMilestoneSheetOpen(true);
  }

  function openEditMilestone(m: Milestone) {
    setEditingMilestone(m);
    setMilestoneSheetMode("edit");
    setMilestoneSheetOpen(true);
  }

  function handleMilestoneSave(data: MilestoneSaveData) {
    if (milestoneSheetMode === "edit" && editingMilestone) {
      onUpdateMilestone(editingMilestone.id, data);
    } else {
      // Assign sortOrder = current length
      onAddMilestone({ ...data, sortOrder: planMilestones.length });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function renderLinkedTaskRow(task: Task, activeDays: DayKey[]) {
    const tone = timelineCardStyles(plan.color);
    const duration = formatDuration(task.startTime, task.endTime);

    return (
      <div
        key={`${task.id}-${activeDays.join("")}`}
        className="flex items-center gap-3 px-1 py-3.5 border-b border-neutral-100 last:border-b-0 dark:border-white/[0.05]"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold leading-tight text-neutral-900 dark:text-white">
            {task.title}
          </p>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <p className={`text-[13px] font-medium shrink-0 ${tone.time}`}>
              {task.startTime} – {task.endTime}
              {duration && ` · ${duration}`}
            </p>
            <div className="flex items-center gap-[5px]">
              {WEEKDAY_ORDER.map((day) => (
                <DayPill key={day} label={WEEKDAY_SHORT[day]} active={activeDays.includes(day)} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onEditTask(task)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 dark:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            <IconEdit size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => onDeleteLinkedTask(task, activeDays)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-500 dark:text-neutral-600 dark:hover:text-rose-400 transition-colors"
          >
            <IconTrash size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  function renderTrackerCard(tracker: ProgressTracker) {
    const entries: MetricEntry[] = schedule.metricEntries
      .filter((e) => e.trackerId === tracker.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    const lastTwo = entries.slice(-2);
    const goalDir = tracker.goalDirection ?? "increase_good";
    const trendResult =
      lastTwo.length === 2
        ? computeTrend({
            previous: lastTwo[0].value,
            current: lastTwo[1].value,
            goalDirection: goalDir,
          })
        : null;
    const isEditingThis = editingTrackerId === tracker.id;

    return (
      <div
        key={tracker.id}
        className="rounded-[24px] border border-neutral-200 bg-white overflow-hidden dark:border-white/[0.08] dark:bg-neutral-900"
      >
        {/* Tracker header */}
        <div className="px-5 pt-5 pb-4">
          {isEditingThis ? (
            <div className="space-y-2">
              <input
                value={editTrackerDraft.title}
                onChange={(e) =>
                  setEditTrackerDraft((d) => ({ ...d, title: e.target.value }))
                }
                placeholder="Tracker name"
                autoFocus
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] transition-colors"
              />
              <input
                value={editTrackerDraft.unit}
                onChange={(e) =>
                  setEditTrackerDraft((d) => ({ ...d, unit: e.target.value }))
                }
                placeholder="Unit (e.g. kg, km, hr)"
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-700 outline-none focus:border-neutral-400 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:focus:border-white/20 dark:focus:bg-white/[0.07] transition-colors"
              />
              <GoalDirectionPicker
                value={editTrackerDraft.goalDirection}
                onChange={(gd) =>
                  setEditTrackerDraft((d) => ({ ...d, goalDirection: gd }))
                }
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSaveEditTracker(tracker.id)}
                  className="inline-flex flex-1 h-9 items-center justify-center gap-1 rounded-xl bg-neutral-950 text-[13px] font-semibold text-white dark:bg-white dark:text-neutral-950"
                >
                  <IconCheck size={16} /> Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTrackerId(null)}
                  className="inline-flex h-9 px-4 items-center gap-1 rounded-xl border border-neutral-200 text-[13px] font-medium text-neutral-500 dark:border-white/10 dark:text-neutral-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-[20px] font-bold text-neutral-950 dark:text-white leading-tight">
                  {tracker.title}
                  {tracker.unit && (
                    <span className="ml-1.5 text-[15px] font-normal text-neutral-400 dark:text-neutral-500">
                      ({tracker.unit})
                    </span>
                  )}
                </h3>
                {trendResult !== null && trendResult.direction !== "neutral" && (
                  <TrendBadge trend={trendResult} />
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTrackerId(tracker.id);
                    setEditTrackerDraft({
                      title: tracker.title,
                      unit: tracker.unit ?? "",
                      goalDirection: tracker.goalDirection ?? "increase_good",
                    });
                  }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
                >
                  <IconEdit size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteTracker(tracker.id)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-500 dark:text-neutral-500 dark:hover:text-rose-400 transition-colors"
                >
                  <IconTrash size={16} strokeWidth={2} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        {!isEditingThis && (
          <div className="px-3 pb-3">
            {entries.length > 0 ? (
              <ProgressChart
                entries={entries}
                color={plan.color}
                metric={{ name: tracker.title, unit: tracker.unit ?? "" }}
              />
            ) : (
              <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] py-8 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
                No entries yet
              </div>
            )}
          </div>
        )}

        {/* Recent entries */}
        {!isEditingThis && (
          <div className="border-t border-neutral-100 dark:border-white/[0.06] px-5 pb-5">
            <div className="flex items-center justify-between py-3.5">
              <p className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                Recent entries
              </p>
              <button
                type="button"
                onClick={() => onOpenAddEntry(tracker)}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
              >
                <IconPlus size={12} strokeWidth={2} />
                Add Entry
              </button>
            </div>
            {entries.length === 0 ? (
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500 pb-1">
                Tap Add Entry to start tracking.
              </p>
            ) : (
              (() => {
                const recent = entries.slice(-5);
                return recent
                  .slice()
                  .reverse()
                  .map((entry, index) => {
                    const chronIdx = recent.length - 1 - index;
                    const prev = chronIdx > 0 ? recent[chronIdx - 1] : null;
                    const entryTrend = prev
                      ? computeTrend({
                          previous: prev.value,
                          current: entry.value,
                          goalDirection: goalDir,
                        })
                      : null;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between py-2.5 border-b border-neutral-100 last:border-b-0 dark:border-white/[0.06]"
                      >
                        <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                          {formatDateShort(entry.date)}
                        </p>
                        <div className="flex items-center gap-2">
                          {entryTrend && entryTrend.direction !== "neutral" && (
                            entryTrend.direction === "up" ? (
                              <IconArrowUpRight
                                size={13}
                                strokeWidth={2.5}
                                className={`shrink-0 ${
                                  entryTrend.state === "positive"
                                    ? "text-green-500"
                                    : "text-rose-500"
                                }`}
                              />
                            ) : (
                              <IconArrowDownRight
                                size={13}
                                strokeWidth={2.5}
                                className={`shrink-0 ${
                                  entryTrend.state === "positive"
                                    ? "text-green-500"
                                    : "text-rose-500"
                                }`}
                              />
                            )
                          )}
                          <span className="text-[14px] font-semibold text-neutral-950 dark:text-white tabular-nums">
                            {entry.value}
                            {tracker.unit && (
                              <span className="text-[11px] font-medium text-neutral-400 ml-0.5">
                                {tracker.unit}
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteEntry(entry.id)}
                            className="h-6 w-6 flex items-center justify-center rounded-lg text-neutral-300 hover:text-rose-500 dark:text-neutral-700 dark:hover:text-rose-400 transition-colors"
                          >
                            <IconTrash size={14} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    );
                  });
              })()
            )}
          </div>
        )}
      </div>
    );
  }

  function renderMilestoneCard(m: Milestone, isCurrentMilestone: boolean) {
    const status = resolveMilestoneStatus(m);
    const isCompleted = status === "completed";
    const isDelayed = status === "delayed";
    const completedDateLabel = m.actualCompletedDate ? formatDate(m.actualCompletedDate) : null;
    const daysLabel = `${m.plannedDurationDays} Day${m.plannedDurationDays === 1 ? "" : "s"}`;
    const rangeLabel = `${formatDate(m.startDate)} - ${formatDate(m.plannedEndDate)}`;

    return (
      <div
        key={m.id}
        className={`relative rounded-2xl border p-4 transition-all duration-200 ${
          isCompleted
            ? "border-green-200/60 bg-green-50/40 dark:border-green-800/30 dark:bg-green-950/20"
            : isDelayed
            ? "border-rose-300 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/20"
            : isCurrentMilestone
            ? "border-green-300 bg-white ring-2 ring-green-100 dark:border-green-600/50 dark:bg-neutral-900 dark:ring-green-900/40"
            : "border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Status indicator */}
          <div className="shrink-0 mt-0.5">
            {isCompleted ? (
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <IconCheck size={13} strokeWidth={3} className="text-white" />
              </div>
            ) : isDelayed ? (
              <div className="w-6 h-6 rounded-full border-2 border-rose-500 bg-rose-100 dark:bg-rose-950 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              </div>
            ) : isCurrentMilestone ? (
              <div className="relative w-6 h-6">
                <div className="absolute inset-0 rounded-full bg-green-400 opacity-30 animate-ping" />
                <div className="relative w-6 h-6 rounded-full border-2 border-green-500 bg-green-100 dark:bg-green-950 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                </div>
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full border-2 border-neutral-300 dark:border-neutral-600" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Labels */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isCurrentMilestone && (
                <span className="inline-flex items-center rounded-full bg-green-500/10 border border-green-500/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                  Current Milestone
                </span>
              )}
              {isCompleted && (
                <span className="inline-flex items-center rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
                  Completed
                </span>
              )}
              {isDelayed && (
                <span className="inline-flex items-center rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                  Delayed
                </span>
              )}
              {status === "upcoming" && (
                <span className="inline-flex items-center rounded-full bg-neutral-500/10 border border-neutral-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Upcoming
                </span>
              )}
            </div>

            <p
              className={`text-[15px] font-semibold leading-snug ${
                isCompleted
                  ? "text-neutral-400 line-through dark:text-neutral-500"
                  : "text-neutral-900 dark:text-white"
              }`}
            >
              {m.title}
            </p>

            {m.description && (
              <p className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                {m.description}
              </p>
            )}

            {/* Date & duration info */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {isCompleted && completedDateLabel && (
                <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                  Completed {completedDateLabel}
                </span>
              )}
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                {rangeLabel}
              </span>
              <span className="inline-flex items-center rounded-full border border-neutral-200 dark:border-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">
                {daysLabel}
              </span>
            </div>

            {/* Mark done action for current milestone */}
            {isCurrentMilestone && (
              <button
                type="button"
                onClick={() => onCompleteMilestone(m.id)}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-green-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-green-600 transition-colors active:scale-95"
              >
                <IconCheck size={13} strokeWidth={3} />
                Mark it Done
              </button>
            )}
          </div>

          {/* Edit/Delete */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => openEditMilestone(m)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-neutral-300 hover:text-neutral-600 dark:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              <IconEdit size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => onDeleteMilestone(m.id)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-neutral-300 hover:text-rose-500 dark:text-neutral-700 dark:hover:text-rose-400 transition-colors"
            >
              <IconTrash size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Overall Status Graph ────────────────────────────────────────────────

  function renderOverallProgressBar() {
    const { statusBarSegments, overallPct, statusSummary } = roadmapStats;

    const segmentMeta = (
      state: "success" | "warning" | "fail" | "future" | "none"
    ): { bar: string; heightPct: number; label: string } => {
      switch (state) {
        case "success":
          return { bar: "bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.22)]", heightPct: 100, label: "Strong day" };
        case "warning":
          return { bar: "bg-amber-400", heightPct: 68, label: "Light day" };
        case "fail":
          return { bar: "bg-rose-400", heightPct: 38, label: "Missed day" };
        case "future":
          return { bar: "bg-neutral-200 dark:bg-white/10", heightPct: 20, label: "Upcoming" };
        default:
          return { bar: "bg-neutral-100 dark:bg-white/[0.05]", heightPct: 12, label: "Outside plan" };
      }
    };

    const counts = statusBarSegments.reduce(
      (acc, segment) => {
        acc[segment.state] += 1;
        return acc;
      },
      { success: 0, warning: 0, fail: 0, future: 0, none: 0 }
    );
    const activeDays = counts.success + counts.warning;
    const trackedDays = counts.success + counts.warning + counts.fail;
    const activeDayLabel = `${activeDays}/${trackedDays || 0}`;
    const recentSegments = statusBarSegments.slice(-14);
    const recentActiveDays = recentSegments.filter((segment) =>
      segment.state === "success" || segment.state === "warning"
    ).length;
    const ringRadius = 40;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const scoreOffset = ringCircumference * (1 - Math.min(100, Math.max(0, overallPct)) / 100);
    const scoreTone =
      overallPct >= 75
        ? {
            stroke: "stroke-green-500",
            text: "text-green-500",
            badge: "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400",
            label: "Strong",
          }
        : overallPct >= 45
        ? {
            stroke: "stroke-amber-400",
            text: "text-amber-500",
            badge: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            label: "Steady",
          }
        : {
            stroke: "stroke-rose-400",
            text: "text-rose-500",
            badge: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
            label: "Needs Focus",
          };

    return (
      <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
        <div className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                Overall Status
              </p>
              <h3 className="mt-1 text-[20px] font-black leading-tight text-neutral-950 dark:text-white">
                Journey Health
              </h3>
              <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${scoreTone.badge}`}>
                {scoreTone.label}
              </span>
            </div>

            <div className="relative flex h-[104px] w-[104px] shrink-0 items-center justify-center">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  fill="none"
                  strokeWidth="9"
                  className="stroke-neutral-100 dark:stroke-white/[0.08]"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={ringRadius}
                  fill="none"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={scoreOffset}
                  className={scoreTone.stroke}
                />
              </svg>
              <div className="text-center">
                <span className={`block text-[24px] font-bold tabular-nums leading-none ${scoreTone.text}`}>
                  {overallPct}%
                </span>
             
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-neutral-200 bg-neutral-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="relative h-[116px] overflow-hidden rounded-[18px] bg-white px-2 pb-3 pt-4 dark:bg-neutral-950/40">
              <div className="pointer-events-none absolute inset-x-2 top-4 h-px bg-neutral-100 dark:bg-white/[0.06]" />
              <div className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-neutral-100 dark:bg-white/[0.06]" />
              <div className="pointer-events-none absolute inset-x-2 bottom-7 h-px bg-neutral-100 dark:bg-white/[0.06]" />
              <div className="relative flex h-full items-end gap-[4px]">
                {statusBarSegments.map((segment) => {
                  const meta = segmentMeta(segment.state);
                  return (
                    <div
                      key={segment.date}
                      title={`${formatDateShort(segment.date)} · ${meta.label}`}
                      className="flex min-w-[4px] flex-1 items-end justify-center"
                    >
                      <div
                        className={`w-full rounded-t-full rounded-b-sm transition-transform duration-150 hover:scale-y-105 ${meta.bar}`}
                        style={{ height: `${meta.heightPct}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-bold text-neutral-400 dark:text-neutral-500">
              <span>{statusBarSegments[0] ? formatDateShort(statusBarSegments[0].date) : "Start"}</span>
              <span>{statusBarSegments[statusBarSegments.length - 1] ? formatDateShort(statusBarSegments[statusBarSegments.length - 1].date) : "Today"}</span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "Active", value: activeDayLabel, valueClass: "text-neutral-950 dark:text-white" },
              { label: "Missed", value: counts.fail, valueClass: "text-rose-500" },
              { label: "14 Days", value: `${recentActiveDays}/14`, valueClass: "text-neutral-950 dark:text-white" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-neutral-200 px-3 py-2.5 dark:border-white/[0.08]">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  {item.label}
                </p>
                <p className={`mt-1 text-[17px] font-black tabular-nums leading-none ${item.valueClass}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "Strong", className: "bg-green-500" },
              { label: "Light", className: "bg-amber-400" },
              { label: "Missed", className: "bg-rose-400" },
              { label: "Upcoming", className: "bg-neutral-300 dark:bg-white/15" },
            ].map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-bold text-neutral-500 dark:bg-white/[0.04] dark:text-neutral-400"
              >
                <span className={`h-2 w-2 rounded-full ${item.className}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <p className="border-t border-neutral-100 px-5 py-3 text-[12px] font-semibold leading-relaxed text-neutral-500 dark:border-white/[0.06] dark:text-neutral-400">
          {statusSummary}
        </p>
      </div>
    );
  }

  // ── Roadmap overview 2×2 grid ────────────────────────────────────────────

  function renderRoadmapOverview() {
    const { currentPhaseName, consistencyPct } = roadmapStats;

    const endDateLabel = roadmapStats.targetDate ? formatPlanDate(roadmapStats.targetDate) : "Ongoing";

    const cards: { label: string; value: string }[] = [
      {
        label: "Current Phase",
        value: currentPhaseName ?? "Starting out",
      },
      {
        label: "Consistency",
        value: `${consistencyPct}%`,
      },
      {
        label: "Est. Completion",
        value: endDateLabel,
      },
      {
        label: "Target Date",
        value: roadmapStats.targetDate ? formatPlanDate(roadmapStats.targetDate) : "—",
      },
    ];

    return (
      <div className="grid grid-cols-2 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              {card.label}
            </p>
            <p className="mt-1 text-[15px] font-semibold text-neutral-900 dark:text-white leading-snug">
              {card.value}
            </p>
          </div>
        ))}
      </div>
    );
  }

  // ── Planning tab ────────────────────────────────────────────────────────

  function renderPlanningTab() {
    return (
      <motion.div
        key="planning"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {/* A. Planned Tasks */}
        <section className="mt-8 px-4">
          <InternalSectionTitle
            title="Planned Tasks"
            className="mb-4"
            actions={
              <SectionTextAction
                label="Add Task"
                icon={<IconPlus size={15} strokeWidth={2} />}
                onClick={() => onAddTask(plan.id)}
              />
            }
          />

          <div className="rounded-[24px] border border-neutral-200 bg-white px-4 dark:border-white/[0.08] dark:bg-neutral-900">
            {uniqueTasks.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[14px] font-medium text-neutral-400 dark:text-neutral-500 max-w-[220px] mx-auto">
                  Link tasks to this plan to keep everything connected.
                </p>
              </div>
            ) : (
              uniqueTasks.map(({ task, activeDays }) =>
                renderLinkedTaskRow(task, activeDays)
              )
            )}
          </div>
        </section>

        {/* B. Consistency Heatmap */}
        <section className="mt-8 px-4">
          <InternalSectionTitle title="Consistency" className="mb-4" />

          <div className="rounded-[24px] border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 overflow-hidden">
            <ConsistencyHeatmap cells={roadmapStats.dailyCells} />
          </div>
        </section>

        {/* C. Progress Tracking */}
        <section className="mt-8 px-4">
          <InternalSectionTitle
            title="Progress Tracking"
            className="mb-4"
            actions={
              <SectionTextAction
                label="Add Tracker"
                icon={<IconPlus size={15} strokeWidth={2} />}
                onClick={() => setAddingTracker(true)}
              />
            }
          />

          {trackers.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-neutral-200 py-10 text-center dark:border-white/[0.08]">
              <p className="text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
                No progress trackers yet.
              </p>
              <button
                type="button"
                onClick={() => setAddingTracker(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04] transition-colors"
              >
                <IconPlus size={16} strokeWidth={2} />
                Create Tracker
              </button>
            </div>
          ) : (
            <>
              {trackers.length > 1 && selectedTrackerId && (
                <div className="mb-4">
                  <TrackerTabs
                    tabs={trackers.map((t) => ({ id: t.id, label: t.title }))}
                    activeId={selectedTrackerId}
                    onChange={setSelectedTrackerId}
                  />
                </div>
              )}
              {selectedTracker && renderTrackerCard(selectedTracker)}
            </>
          )}
        </section>
      </motion.div>
    );
  }

  // ── Roadmap tab ─────────────────────────────────────────────────────────

  function renderRoadmapTab() {
    const firstPendingIndex = planMilestones.findIndex(
      (m) => resolveMilestoneStatus(m) !== "completed"
    );

    return (
      <motion.div
        key="roadmap"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {/* A. Overall Progress */}
        <section className="mt-8 px-4">{renderOverallProgressBar()}</section>

        {/* B. Roadmap Overview */}
        <section className="mt-6 px-4">{renderRoadmapOverview()}</section>

        {/* C. Milestones */}
        <section className="mt-8 px-4">
          <InternalSectionTitle
            title="Milestones"
            className="mb-4"
            actions={
              <SectionTextAction
                label="Add Milestone"
                icon={<IconPlus size={15} strokeWidth={2} />}
                onClick={openAddMilestone}
              />
            }
          />

          {planMilestones.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-neutral-200 py-12 text-center dark:border-white/[0.08]">
              <p className="text-[14px] font-medium text-neutral-400 dark:text-neutral-500 max-w-[220px] mx-auto">
                Add milestones to track your progress journey.
              </p>
              <button
                type="button"
                onClick={openAddMilestone}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04] transition-colors"
              >
                <IconPlus size={16} strokeWidth={2} />
                Add First Milestone
              </button>
            </div>
          ) : (
            <div>
              {planMilestones.map((m, idx) => (
                <div key={m.id}>
                  {renderMilestoneCard(m, idx === firstPendingIndex)}
                  {idx < planMilestones.length - 1 && (
                    <div className="flex justify-center py-2 text-neutral-300 dark:text-neutral-700">
                      <IconArrowDown size={18} strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </motion.div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="pb-32">
      {/* Plan info */}
      <div className="px-4 pt-6 space-y-2">
        <h1 className="text-[32px] font-bold leading-tight text-neutral-950 dark:text-white">
          {plan.title}
        </h1>
        {plan.description && (
          <p className="text-[16px] leading-relaxed text-neutral-600 dark:text-neutral-400">
            {plan.description}
          </p>
        )}
        {dateRange && (
          <p className="text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
            {dateRange}
          </p>
        )}
      </div>

      {/* Segmented tab switcher */}
      <div className="mx-4 mt-6">
        <div className="relative flex rounded-2xl bg-neutral-100 dark:bg-white/[0.06] p-1">
          <motion.div
            layoutId="planTabIndicator"
            className="absolute inset-1 rounded-xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-800"
            style={{
              left: planTab === "planning" ? "4px" : "calc(50% + 2px)",
              right: planTab === "planning" ? "calc(50% + 2px)" : "4px",
            }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
          />
          <button
            type="button"
            onClick={() => setPlanTab("planning")}
            className={`relative flex-1 py-2.5 rounded-xl text-[14px] font-semibold transition-colors duration-200 z-10 ${
              planTab === "planning"
                ? "text-neutral-950 dark:text-white"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            Planning
          </button>
          <button
            type="button"
            onClick={() => setPlanTab("roadmap")}
            className={`relative flex-1 py-2.5 rounded-xl text-[14px] font-semibold transition-colors duration-200 z-10 ${
              planTab === "roadmap"
                ? "text-neutral-950 dark:text-white"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            Roadmap
          </button>
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {planTab === "planning" ? renderPlanningTab() : renderRoadmapTab()}
      </AnimatePresence>

      {/* Milestone sheet */}
      <MilestoneSheet
        mode={milestoneSheetMode}
        milestone={editingMilestone}
        milestones={planMilestones}
        planStartDate={plan.startDate}
        isOpen={milestoneSheetOpen}
        onClose={() => setMilestoneSheetOpen(false)}
        onSave={handleMilestoneSave}
      />

      {/* Add tracker sheet */}
      <BottomSheet
        open={addingTracker}
        onClose={() => {
          setAddingTracker(false);
          setNewTrackerTitle("");
          setNewTrackerUnit("");
          setNewTrackerGoalDirection("increase_good");
        }}
        maxHeight="80vh"
      >
        <div className="space-y-4 p-5 pb-8">
          <SheetHeader
            eyebrow="New"
            title="Create Tracker"
            onClose={() => {
              setAddingTracker(false);
              setNewTrackerTitle("");
              setNewTrackerUnit("");
              setNewTrackerGoalDirection("increase_good");
            }}
          />
          <div className="space-y-2.5">
            <Input
              value={newTrackerTitle}
              onChange={(e) => setNewTrackerTitle(e.target.value)}
              placeholder="Tracker name (e.g. Weight, Distance)"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTrackerTitle.trim()) handleAddTracker();
              }}
            />
            <Input
              value={newTrackerUnit}
              onChange={(e) => setNewTrackerUnit(e.target.value)}
              placeholder="Unit (e.g. kg, km, hr) — optional"
            />
          </div>
          <GoalDirectionPicker
            value={newTrackerGoalDirection}
            onChange={setNewTrackerGoalDirection}
          />
          <div className="rounded-2xl bg-neutral-50 dark:bg-white/[0.04] px-4 py-3">
            <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 mb-1.5">
              Examples
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["Weight", "kg", "decrease_good"],
                  ["Distance", "km", "increase_good"],
                  ["Study Hours", "hr", "increase_good"],
                  ["Calories", "kcal", "increase_good"],
                  ["Water", "ml", "increase_good"],
                ] as [string, string, GoalDirection][]
              ).map(([name, unit, gd]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setNewTrackerTitle(name);
                    setNewTrackerUnit(unit);
                    setNewTrackerGoalDirection(gd);
                  }}
                  className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 transition-colors"
                >
                  {name} / {unit}
                </button>
              ))}
            </div>
          </div>
          <Button fullWidth onClick={handleAddTracker} disabled={!newTrackerTitle.trim()}>
            Create Tracker
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
