"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  IconCalendar,
  IconRepeat,
  IconClock,
  IconChevronRight,
  IconListCheck,
  IconAlertTriangle,
  IconSparkles,
  IconSend,
} from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";
import ProgressChart from "@/components/ProgressChart";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
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
import { timelineCardStyles } from "@/lib/colorSystem";
import { formatDuration } from "@/lib/timeUtils";
import { formatDate, formatDateShort } from "@/lib/dateUtils";
import { DayPill } from "@/components/ui/Badge";
import { InternalSectionTitle, SectionIconButton } from "@/components/ui/InternalSectionTitle";
import { TrackerTabs } from "@/components/ui/TrackerTabs";
import AccuracyCalendar from "@/components/plan/AccuracyCalendar";
import {
  streamGenerateTasks,
  parseGeneratedTasks,
  type AIGeneratedTask,
  streamGenerateMilestones,
  parseGeneratedMilestones,
  type AIGeneratedMilestone,
} from "@/lib/aiActions";
import { streamOllamaChat, parseAIAction, PLAN_COACH_PROMPT, buildPlanContext } from "@/lib/ai";
import AIActionSheet, { type ResultItem } from "@/components/ai/AIActionSheet";



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
      <ArrowIcon size={12} strokeWidth={1.5} className="shrink-0" />
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
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-all ${sel
                ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-200 bg-neutral-50 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-white/20"
                }`}
            >
              <opt.Icon size={16} strokeWidth={1.5} className="shrink-0" />
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
    data: { title: string; unit: string; goalDirection: GoalDirection; goalValue?: number }
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
  // AI
  ollamaUrl?: string;
  ollamaModel?: string;
  onAddGeneratedTasks?: (tasks: AIGeneratedTask[], planId: string) => void;
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
  ollamaUrl,
  ollamaModel,
  onAddGeneratedTasks,
}: PlanDetailViewProps) {
  // ── Tab state ───────────────────────────────────────────────────────────
  const [planTab, setPlanTab] = useState<"planning" | "roadmap" | "strategy">("planning");

  // ── AI task generation state ────────────────────────────────────────────
  const [genSheetOpen, setGenSheetOpen] = useState(false);
  // Stores full AIGeneratedTask objects keyed by id so we can commit with subtasks intact
  const parsedTasksRef = useRef<Record<string, AIGeneratedTask>>({});

  async function* genTasksStream(goal: string, picks: string[]): AsyncGenerator<string> {
    if (!ollamaUrl || !ollamaModel) return;
    const contextHints = [goal.trim(), ...picks].filter(Boolean).join(". ");
    yield* streamGenerateTasks(ollamaUrl, ollamaModel, {
      title: plan.title,
      description: contextHints || plan.description,
    });
  }

  function parseTaskResults(raw: string): ResultItem[] {
    const tasks = parseGeneratedTasks(raw);
    parsedTasksRef.current = {};
    return tasks.map((t, i) => {
      const id = String(i);
      parsedTasksRef.current[id] = t;
      return {
        id,
        label: t.title,
        meta: `${t.day.charAt(0).toUpperCase() + t.day.slice(1)} · ${t.startTime}–${t.endTime}${t.subtasks.length > 0 ? ` · ${t.subtasks.length} subtasks` : ""}`,
        badge: t.icon,
      };
    });
  }

  function commitTasks(items: ResultItem[]) {
    if (!onAddGeneratedTasks) return;
    const tasks = items
      .map((r) => parsedTasksRef.current[r.id])
      .filter(Boolean) as AIGeneratedTask[];
    if (tasks.length > 0) onAddGeneratedTasks(tasks, plan.id);
  }

  // ── Tracker edit state ──────────────────────────────────────────────────
  const [editingTrackerId, setEditingTrackerId] = useState<string | null>(null);
  const [editTrackerDraft, setEditTrackerDraft] = useState<{
    title: string;
    unit: string;
    goalDirection: GoalDirection;
    goalValue?: number;
  }>({
    title: "",
    unit: "",
    goalDirection: "increase_good",
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

  // ── AI Coach state ──────────────────────────────────────────────────────
  type ChatMessage = {
    role: "user" | "assistant";
    content: string;
    suggestedMilestones?: AIGeneratedMilestone[];
  };
  const [coachMessages, setCoachMessages] = useState<ChatMessage[]>(() =>
    ollamaUrl && ollamaModel
      ? [{ role: "assistant" as const, content: `I'm here to help you build out "${plan.title}". What's your main goal for this plan?` }]
      : []
  );
  const [coachInput, setCoachInput] = useState("");
  const [coachStreaming, setCoachStreaming] = useState(false);
  const [milestonesGenerating, setMilestonesGenerating] = useState(false);
  const [acceptedMilestoneIds, setAcceptedMilestoneIds] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Task detail sheet ────────────────────────────────────────────────────
  const [viewingTask, setViewingTask] = useState<{ task: Task; activeDays: DayKey[] } | null>(null);

  // ── Milestone detail sheet ───────────────────────────────────────────────
  const [viewingMilestone, setViewingMilestone] = useState<Milestone | null>(null);

  // ── Section edit modes ──────────────────────────────────────────────────
  const [trackersEditMode, setTrackersEditMode] = useState(false);

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

  // Greet when Ollama becomes available mid-session (was unconfigured at mount)
  useEffect(() => {
    if (ollamaUrl && ollamaModel && coachMessages.length === 0) {
      setCoachMessages([{ role: "assistant", content: `I'm here to help you build out "${plan.title}". What's your main goal for this plan?` }]);
    }
  }, [ollamaUrl, ollamaModel]); // eslint-disable-line react-hooks/exhaustive-deps

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
      goalValue: editTrackerDraft.goalValue,
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

  // ── AI Coach handlers ───────────────────────────────────────────────────

  async function handleSendCoachMessage() {
    if (!ollamaUrl || !ollamaModel || !coachInput.trim() || coachStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: coachInput.trim() };
    const newMessages = [...coachMessages, userMsg];
    setCoachMessages(newMessages);
    setCoachInput("");
    setCoachStreaming(true);
    const assistantIdx = newMessages.length;
    setCoachMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    let accumulated = "";
    try {
      const systemPrompt = `${PLAN_COACH_PROMPT}\n\n${buildPlanContext(plan)}`;
      const history = newMessages.map((m) => ({ role: m.role, content: m.content }));
      for await (const chunk of streamOllamaChat(ollamaUrl, ollamaModel, history, systemPrompt)) {
        accumulated += chunk;
        setCoachMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: "assistant", content: accumulated };
          return updated;
        });
      }
      const action = parseAIAction(accumulated);
      if (action?.type === "suggest_milestones") {
        setCoachMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: "assistant", content: accumulated, suggestedMilestones: action.payload.milestones };
          return updated;
        });
      }
    } catch {
      setCoachMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = { role: "assistant", content: "Sorry, I couldn't reach the AI. Is Ollama running?" };
        return updated;
      });
    } finally {
      setCoachStreaming(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function handleAutoGenerateMilestones() {
    if (!ollamaUrl || !ollamaModel || milestonesGenerating) return;
    setMilestonesGenerating(true);
    const msgIdx = coachMessages.length;
    setCoachMessages((prev) => [...prev, { role: "assistant", content: "Generating milestones…" }]);
    let accumulated = "";
    try {
      for await (const chunk of streamGenerateMilestones(ollamaUrl, ollamaModel, {
        title: plan.title, description: plan.description,
        startDate: plan.startDate, endDate: plan.endDate,
      })) {
        accumulated += chunk;
      }
      const milestones = parseGeneratedMilestones(accumulated);
      setCoachMessages((prev) => {
        const updated = [...prev];
        updated[msgIdx] = milestones.length > 0
          ? { role: "assistant", content: `Here are ${milestones.length} milestone suggestions for "${plan.title}":`, suggestedMilestones: milestones }
          : { role: "assistant", content: "Couldn't generate milestones. Try describing your plan goals in the chat." };
        return updated;
      });
    } catch {
      setCoachMessages((prev) => {
        const updated = [...prev];
        updated[msgIdx] = { role: "assistant", content: "Couldn't reach AI. Is Ollama running?" };
        return updated;
      });
    } finally {
      setMilestonesGenerating(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function handleAcceptMilestone(msgIdx: number, mIdx: number, milestone: AIGeneratedMilestone) {
    const key = `${msgIdx}-${mIdx}`;
    if (acceptedMilestoneIds.has(key)) return;
    const today = new Date().toISOString().slice(0, 10);
    const startDate = plan.startDate ?? today;
    const targetDate = milestone.targetDate;
    const plannedEndDate = targetDate ?? today;
    const plannedDurationDays = targetDate
      ? Math.max(1, Math.ceil((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86_400_000))
      : 30;
    onAddMilestone({
      title: milestone.title,
      description: milestone.description || "",
      startDate,
      plannedDurationDays,
      plannedEndDate,
      status: "upcoming",
      linkedActivities: [],
      linkedTrackers: [],
      sortOrder: planMilestones.length + acceptedMilestoneIds.size,
      targetDate,
    } as MilestoneSaveData);
    setAcceptedMilestoneIds((prev) => new Set([...prev, key]));
  }

  function handleAcceptAllMilestones(msgIdx: number, milestones: AIGeneratedMilestone[]) {
    milestones.forEach((m, mIdx) => {
      if (!acceptedMilestoneIds.has(`${msgIdx}-${mIdx}`)) {
        handleAcceptMilestone(msgIdx, mIdx, m);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function renderLinkedTaskRow(task: Task, activeDays: DayKey[]) {
    const tone = timelineCardStyles(plan.color);
    const duration = formatDuration(task.startTime, task.endTime);
    const subtaskCount = task.subtasks?.length ?? 0;
    const isRoutine = task.taskType === "session";
    const hasTime = task.startTime || task.endTime;

    return (
      <button
        key={`${task.id}-${activeDays.join("")}`}
        type="button"
        onClick={() => setViewingTask({ task, activeDays })}
        className="w-full flex items-center gap-3 px-1 py-3.5 border-b border-neutral-100 last:border-b-0 dark:border-white/[0.05] text-left transition-colors active:bg-neutral-50 dark:active:bg-white/[0.03]"
      >
        <div className="flex-1 min-w-0">
          {/* Line 1: Title */}
          <p className="text-[16px] font-semibold leading-tight text-neutral-900 dark:text-white">
            {task.title}
          </p>
          {/* Line 2: Time + duration + subtask count */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {hasTime && (
              <p className={`text-[13px] font-medium shrink-0 ${tone.time}`}>
                {task.startTime}{task.endTime && ` – ${task.endTime}`}
                {duration && ` · ${duration}`}
              </p>
            )}
            {subtaskCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">
                <IconListCheck size={13} strokeWidth={2} />
                {subtaskCount}
              </span>
            )}
          </div>
          {/* Line 3: Routine badge (only for routine tasks) */}
          {isRoutine && (
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:bg-amber-900/25 dark:text-amber-400">
                <IconRepeat size={10} strokeWidth={2.5} />
                Routine
              </span>
            </div>
          )}
          {/* Line 4: Active days */}
          <div className="flex items-center gap-[5px] mt-2">
            {WEEKDAY_ORDER.map((day) => (
              <DayPill key={day} label={WEEKDAY_SHORT[day]} active={activeDays.includes(day)} />
            ))}
          </div>
        </div>
        <IconChevronRight size={16} strokeWidth={2} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
      </button>
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
              <input
                type="number"
                inputMode="decimal"
                value={editTrackerDraft.goalValue ?? ""}
                onChange={(e) =>
                  setEditTrackerDraft((d) => ({
                    ...d,
                    goalValue: e.target.value ? Number(e.target.value) : undefined,
                  }))
                }
                placeholder={`Goal value${editTrackerDraft.unit ? ` (${editTrackerDraft.unit})` : ""} — optional`}
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
              {trackersEditMode && (
                <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTrackerId(tracker.id);
                      setEditTrackerDraft({
                        title: tracker.title,
                        unit: tracker.unit ?? "",
                        goalDirection: tracker.goalDirection ?? "increase_good",
                        goalValue: tracker.goalValue,
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
              )}
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
                goalValue={tracker.goalValue}
              />
            ) : (
              <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] py-8 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
                No entries yet
              </div>
            )}
          </div>
        )}

        {/* Stats strip */}
        {!isEditingThis && entries.length > 0 && (() => {
          const last = entries[entries.length - 1];
          const avg = entries.reduce((s, e) => s + e.value, 0) / entries.length;
          const unit = tracker.unit ? ` ${tracker.unit}` : "";
          const fmtAvg = Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
          return (
            <div className="flex items-stretch divide-x divide-neutral-100 border-t border-neutral-100 dark:divide-white/[0.06] dark:border-white/[0.06]">
              {[
                { label: "Last",   value: `${last.value}${unit}` },
                { label: "Avg",    value: `${fmtAvg}${unit}` },
                { label: "Logged", value: `${entries.length}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex-1 px-4 py-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[15px] font-bold tabular-nums text-neutral-950 dark:text-white">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* All entries */}
        {!isEditingThis && (
          <div className="border-t border-neutral-100 dark:border-white/[0.06] px-5 pb-5">
            <div className="flex items-center justify-between py-3.5">
              <p className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                {entries.length > 0 ? `${entries.length} entr${entries.length === 1 ? "y" : "ies"}` : "Entries"}
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
              <div className={entries.length > 6 ? "max-h-[280px] overflow-y-auto overscroll-contain" : ""}>
                {[...entries].reverse().map((entry, index) => {
                  const chronIdx = entries.length - 1 - index;
                  const prev = chronIdx > 0 ? entries[chronIdx - 1] : null;
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
                              size={16}
                              strokeWidth={1.5}
                              className={`shrink-0 ${entryTrend.state === "positive" ? "text-green-500" : "text-rose-500"}`}
                            />
                          ) : (
                            <IconArrowDownRight
                              size={16}
                              strokeWidth={1.5}
                              className={`shrink-0 ${entryTrend.state === "positive" ? "text-green-500" : "text-rose-500"}`}
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
                          <IconTrash size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderMilestoneCard(m: Milestone, isLast: boolean) {
    const status = resolveMilestoneStatus(m);
    const isCompleted = status === "completed";
    const isActive   = status === "active";
    const isDelayed  = status === "delayed";
    const daysLabel = `${m.plannedDurationDays} Day${m.plannedDurationDays === 1 ? "" : "s"}`;
    const rangeLabel = `${formatDate(m.startDate)} – ${formatDate(m.plannedEndDate)}`;

    return (
      <button
        type="button"
        onClick={() => { haptic("light"); setViewingMilestone(m); }}
        className="relative w-full flex gap-[14px] px-1 pt-[14px] pb-[18px] text-left"
      >
        {/* Connector line to next item */}
        {!isLast && (
          <div
            className={`absolute w-0 ${
              isCompleted
                ? "border-l-2 border-solid border-green-500"
                : isDelayed
                  ? "border-l-2 border-dashed border-amber-400 dark:border-amber-600"
                  : "border-l-2 border-dashed border-green-200 dark:border-green-800/60"
            }`}
            style={{ top: 44, bottom: 0, left: 17 }}
          />
        )}

        {/* Marker */}
        <div
          aria-hidden="true"
          className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-neutral-950 ${
            isCompleted
              ? "bg-green-500 text-white"
              : isDelayed
                ? "border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                : isActive
                  ? "border-2 border-green-500 bg-green-100 dark:bg-green-950"
                  : "border-[2.5px] border-green-500 bg-white dark:bg-neutral-950"
          }`}
        >
          {isCompleted ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <polyline points="20,6 9,17 4,12" />
            </svg>
          ) : isDelayed ? (
            <IconAlertTriangle size={11} strokeWidth={2.5} className="text-amber-500" />
          ) : isActive ? (
            <div className="h-[9px] w-[9px] rounded-full bg-green-500" />
          ) : null}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          {isActive && (
            <p className="mb-0.5 text-[12px] font-bold tracking-[-0.1px] text-green-600 dark:text-green-400">
              Current Milestone
            </p>
          )}
          {isDelayed && (
            <p className="mb-0.5 text-[12px] font-bold tracking-[-0.1px] text-amber-600 dark:text-amber-400">
              Overdue
            </p>
          )}
          <p className={`mb-1 text-[16px] leading-snug tracking-[-0.3px] ${
            isCompleted
              ? "font-semibold line-through text-neutral-400 dark:text-neutral-500"
              : "font-bold text-neutral-950 dark:text-white"
          }`}>
            {m.title}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[12.5px] font-medium ${
              isCompleted ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-500 dark:text-neutral-400"
            }`}>
              {rangeLabel}
            </span>
            <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-[10px] py-[3px] text-[10.5px] font-bold ${
              isActive
                ? "border-neutral-950 bg-neutral-950 text-neutral-50 dark:border-white dark:bg-white dark:text-neutral-950"
                : isDelayed
                  ? "border-amber-400/60 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
                  : "border-neutral-200 text-neutral-500 dark:border-white/[0.12] dark:text-neutral-400"
            }`}>
              {daysLabel}
            </span>
          </div>
        </div>

        <IconChevronRight size={16} strokeWidth={2} className="shrink-0 self-center text-neutral-300 dark:text-neutral-600" />
      </button>
    );
  }



  // ── Roadmap overview ─────────────────────────────────────────────────────

  function renderRoadmapOverview() {
    const { currentPhaseName, consistencyPct, overallPct, statusSummary, statusBarSegments } = roadmapStats;
    const targetLabel = roadmapStats.targetDate ? formatPlanDate(roadmapStats.targetDate) : "—";

    // Last 28 days only — readable on any screen width
    const allBars = statusBarSegments.length > 0
      ? statusBarSegments
      : Array(28).fill({ state: "none" as const });
    const dayStrip = allBars.slice(-28);

    return (
      <div className="space-y-[10px]">
        {/* Overall Progress card */}
        <div className="rounded-2xl border border-neutral-200 bg-white px-[18px] pt-[18px] pb-4 dark:border-white/[0.08] dark:bg-neutral-900">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[16px] font-bold tracking-[-0.4px] text-neutral-950 dark:text-white">
              Overall Progress
            </p>
            <p className="text-[20px] font-extrabold tracking-[-0.5px] text-green-600 dark:text-green-400">
              {overallPct}%
            </p>
          </div>

          {/* Smooth animated fill bar */}
          <div className="relative h-[10px] rounded-full bg-neutral-200 dark:bg-white/[0.08] overflow-hidden mb-3">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-green-600 via-green-500 to-emerald-400"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.max(overallPct, overallPct > 0 ? 2 : 0)}%` }}
              transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
            />
          </div>

          {/* Day activity strip — last 28 days */}
          <div className="flex gap-[3px] mb-3">
            {dayStrip.map((seg, i) => (
              <div
                key={i}
                className={
                  "flex-1 min-w-0 h-[6px] rounded-full " + (
                    seg.state === "success" ? "bg-green-500" :
                    seg.state === "warning" ? "bg-amber-400" :
                    seg.state === "fail"    ? "bg-rose-400" :
                    "bg-neutral-200 dark:bg-white/[0.07]"
                  )
                }
              />
            ))}
          </div>

          <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            {statusSummary}
          </p>
        </div>

        {/* 2×2 stats grid */}
        <div className="grid grid-cols-2 gap-[10px]">
          {([
            { label: "Current Phase",  value: currentPhaseName ?? "Starting out" },
            { label: "Consistency",    value: `${consistencyPct}%` },
            { label: "Days Left", value: roadmapStats.targetDate ? String(Math.max(0, Math.ceil((new Date(roadmapStats.targetDate).getTime() - Date.now()) / 86_400_000))) : "—" },
            { label: "Target Date",   value: targetLabel },
          ] as { label: string; value: string }[]).map(({ label, value }) => (
            <div
              key={label}
              className="rounded-[14px] border border-neutral-200 bg-neutral-50 px-[14px] py-3 dark:border-white/[0.08] dark:bg-white/[0.03]"
            >
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.7px] text-neutral-400 dark:text-neutral-500">
                {label}
              </p>
              <p className="text-[19px] font-extrabold leading-[1.1] tracking-[-0.5px] text-neutral-950 dark:text-white">
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── AI Coach tab ─────────────────────────────────────────────────────────

  function renderStrategyTab() {
    const noOllama = !ollamaUrl || !ollamaModel;
    return (
      <motion.div
        key="strategy"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="flex flex-col"
        style={{ height: "clamp(360px, calc(100vh - 300px), 640px)" }}
      >
        {noOllama ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-neutral-100 dark:bg-white/[0.06] mx-auto">
              <IconSparkles size={24} strokeWidth={1.5} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <p className="text-[15px] font-semibold text-neutral-700 dark:text-neutral-200">AI Coach</p>
            <p className="text-[13px] text-neutral-400 dark:text-neutral-500 max-w-[220px] mx-auto leading-relaxed">
              Connect an AI model in Settings to start coaching sessions for this plan.
            </p>
          </div>
        ) : (
          <>
            {/* Auto-generate button */}
            <div className="shrink-0 px-4 pt-4 pb-3">
              <button
                type="button"
                onClick={handleAutoGenerateMilestones}
                disabled={milestonesGenerating || coachStreaming}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04]"
              >
                <IconSparkles size={13} strokeWidth={2} className={milestonesGenerating ? "animate-pulse text-violet-500" : ""} />
                {milestonesGenerating ? "Generating…" : "Auto-generate milestones"}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 px-4 pb-2" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
              {coachMessages.map((msg, msgIdx) => (
                <div key={msgIdx}>
                  <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                      msg.role === "user"
                        ? "rounded-br-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                        : "rounded-bl-md bg-neutral-100 text-neutral-800 dark:bg-white/[0.06] dark:text-neutral-200"
                    }`}>
                      {msg.content.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, "").trim() || (coachStreaming && msgIdx === coachMessages.length - 1 ? "···" : "")}
                    </div>
                  </div>

                  {msg.suggestedMilestones && msg.suggestedMilestones.length > 0 && (
                    <div className="mt-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                        Suggested milestones
                      </p>
                      {msg.suggestedMilestones.map((m, mIdx) => {
                        const key = `${msgIdx}-${mIdx}`;
                        const accepted = acceptedMilestoneIds.has(key);
                        return (
                          <div key={mIdx} className="flex items-center gap-3 border-b border-neutral-100 py-2 last:border-0 dark:border-white/[0.05]">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{m.title}</p>
                              {m.targetDate && (
                                <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{m.targetDate}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAcceptMilestone(msgIdx, mIdx, m)}
                              disabled={accepted}
                              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition-colors ${
                                accepted
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/[0.07] dark:text-emerald-400"
                                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20"
                              }`}
                            >
                              {accepted ? "✓ Added" : "+ Add"}
                            </button>
                          </div>
                        );
                      })}
                      {msg.suggestedMilestones.filter((_, i) => !acceptedMilestoneIds.has(`${msgIdx}-${i}`)).length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleAcceptAllMilestones(msgIdx, msg.suggestedMilestones!)}
                          className="mt-2 w-full rounded-xl bg-neutral-900 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-neutral-900"
                        >
                          Add all remaining milestones
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {coachStreaming && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-neutral-100 px-4 py-2.5 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                    <span className="animate-pulse text-[18px] tracking-widest">···</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-neutral-100 px-4 pb-4 pt-3 dark:border-white/[0.06]">
              <div className="flex gap-2">
                <input
                  value={coachInput}
                  onChange={(e) => setCoachInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendCoachMessage(); }
                  }}
                  placeholder="Ask about your plan…"
                  disabled={coachStreaming}
                  className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
                />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSendCoachMessage}
                  disabled={coachStreaming || !coachInput.trim()}
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                >
                  <IconSend size={17} strokeWidth={2} />
                </motion.button>
              </div>
            </div>
          </>
        )}
      </motion.div>
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

        {/* B. Planned Tasks */}
        <section className="mt-8 px-4">
          <InternalSectionTitle
            title="Planned Tasks"
            className="mb-4"
            actions={
              <div className="flex items-center gap-1">
                {ollamaUrl && ollamaModel && onAddGeneratedTasks && (
                  <button
                    type="button"
                    onClick={() => setGenSheetOpen(true)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                  >
                    <IconSparkles size={13} strokeWidth={2} />
                    Plan with AI
                  </button>
                )}
                <SectionIconButton
                  icon={<IconPlus size={20} strokeWidth={2} />}
                  onClick={() => onAddTask(plan.id)}
                  label="Add task"
                />
              </div>
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

        {/* AI task generation sheet */}
        {ollamaUrl && ollamaModel && (
          <AIActionSheet
            open={genSheetOpen}
            onClose={() => setGenSheetOpen(false)}
            title="Plan Tasks"
            contextLabel={`for ${plan.title}`}
            inputPlaceholder="What's your main goal? e.g. Pass GMAT by June, build a daily habit…"
            quickPicks={[
              "Morning sessions",
              "Spread across the week",
              "Include weekends",
              "Intensive schedule",
              "Review sessions",
              "Light start",
            ]}
            ctaLabel="Build Tasks"
            resultSingular="task"
            resultPlural="tasks"
            onGenerate={genTasksStream}
            onParseResults={parseTaskResults}
            onAdd={commitTasks}
          />
        )}

        {/* B. Accuracy Calendar */}
        <section className="mt-8 px-4">
          <AccuracyCalendar
            planId={plan.id}
            activities={schedule.activities}
            planStartDate={plan.startDate}
            planEndDate={plan.endDate}
            onAddTask={() => onAddTask(plan.id)}
          />
        </section>

        {/* C. Progress Tracking */}
        <section className="mt-8 px-4">
          <InternalSectionTitle
            title="Progress Tracking"
            className="mb-4"
            actions={
              <>
                <SectionIconButton
                  icon={<IconPlus size={20} strokeWidth={2} />}
                  onClick={() => setAddingTracker(true)}
                  label="Add tracker"
                />
                {trackers.length > 0 && (
                  <SectionIconButton
                    icon={<IconEdit size={20} strokeWidth={2} />}
                    saveIcon={<IconCheck size={20} strokeWidth={2} />}
                    saving={trackersEditMode}
                    onClick={() => setTrackersEditMode((v) => !v)}
                    label={trackersEditMode ? "Done editing" : "Edit trackers"}
                  />
                )}
              </>
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

    return (
      <motion.div
        key="roadmap"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {/* Overview: Overall Progress + Stats grid */}
        <section className="mt-6 px-4">{renderRoadmapOverview()}</section>

        {/* Milestones */}
        <section className="mt-8 px-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[22px] font-extrabold tracking-[-0.7px] text-neutral-950 dark:text-white">
              Milestones
            </h2>
            <button
              type="button"
              onClick={openAddMilestone}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-transparent text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
            >
              <IconPlus size={20} strokeWidth={2} />
            </button>
          </div>

          {planMilestones.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-neutral-200 py-12 text-center dark:border-white/[0.08]">
              <p className="mx-auto max-w-[220px] text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
                Add milestones to track your progress journey.
              </p>
              <button
                type="button"
                onClick={openAddMilestone}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04]"
              >
                <IconPlus size={16} strokeWidth={1.5} />
                Add First Milestone
              </button>
            </div>
          ) : (
            <div role="list">
              {planMilestones.map((m, idx) => (
                <div key={m.id} role="listitem">
                  {renderMilestoneCard(m, idx === planMilestones.length - 1)}
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
            className="absolute rounded-xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-800"
            style={{
              top: "4px",
              bottom: "4px",
              left: "4px",
              width: "calc((100% - 8px) / 3)",
              willChange: "transform",
            }}
            animate={{ x: `${(planTab === "planning" ? 0 : planTab === "roadmap" ? 1 : 2) * 100}%` }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
          />
          {(["planning", "roadmap", "strategy"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPlanTab(tab)}
              className={`relative flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors duration-200 z-10 capitalize ${
                planTab === tab
                  ? "text-neutral-950 dark:text-white"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {tab === "planning" ? "Planning" : tab === "roadmap" ? "Roadmap" : "Coach"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {planTab === "planning"
          ? renderPlanningTab()
          : planTab === "roadmap"
          ? renderRoadmapTab()
          : renderStrategyTab()}
      </AnimatePresence>

      {/* Milestone sheet */}
      <MilestoneSheet
        mode={milestoneSheetMode}
        milestone={editingMilestone}
        milestones={planMilestones}
        planStartDate={plan.startDate}
        isOpen={milestoneSheetOpen}
        onClose={() => {
          setMilestoneSheetOpen(false);
          setEditingMilestone(null);
          setMilestoneSheetMode("create");
        }}
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

      {/* Milestone detail sheet */}
      <BottomSheet open={!!viewingMilestone} onClose={() => setViewingMilestone(null)} maxHeight="85vh">
        {viewingMilestone && (() => {
          const m = viewingMilestone;
          const status = resolveMilestoneStatus(m);
          const isCompleted = status === "completed";
          const isDelayed   = status === "delayed";
          const isActive    = status === "active";

          return (
            <div className="px-5 pb-8 pt-4">
              {/* Status badge */}
              {(isCompleted || isDelayed || isActive) && (
                <div className="mb-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${
                    isDelayed
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                      : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  }`}>
                    {isDelayed
                      ? <IconAlertTriangle size={12} strokeWidth={2.5} />
                      : <IconCheck size={12} strokeWidth={2.5} />
                    }
                    {isCompleted ? "Completed" : isDelayed ? "Overdue" : "In Progress"}
                  </span>
                </div>
              )}

              {/* Title */}
              <h2 className={`mb-5 text-[22px] font-bold leading-snug ${
                isCompleted
                  ? "text-neutral-400 line-through dark:text-neutral-500"
                  : "text-neutral-900 dark:text-white"
              }`}>
                {m.title}
              </h2>

              {/* Meta */}
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-3">
                  <IconCalendar size={16} strokeWidth={1.8} className="shrink-0 text-neutral-400" />
                  <span className="text-[15px] font-medium text-neutral-700 dark:text-neutral-300">
                    {formatDate(m.startDate)} – {formatDate(m.plannedEndDate)}
                    <span className="ml-2 text-[13px] text-neutral-400">
                      · {m.plannedDurationDays} day{m.plannedDurationDays === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                {isCompleted && m.actualCompletedDate && (
                  <div className="flex items-center gap-3">
                    <IconCheck size={16} strokeWidth={2} className="shrink-0 text-green-500" />
                    <span className="text-[15px] font-medium text-neutral-700 dark:text-neutral-300">
                      Completed {formatDate(m.actualCompletedDate)}
                    </span>
                  </div>
                )}
              </div>

              {/* Description */}
              {m.description && (
                <div className="mb-5">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    Description
                  </p>
                  <p className="text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {m.description}
                  </p>
                </div>
              )}

              {/* Notes */}
              {m.notes && (
                <div className="mb-5">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    Notes
                  </p>
                  <p className="text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {m.notes}
                  </p>
                </div>
              )}

              {/* Mark Done — any non-completed milestone */}
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => { onCompleteMilestone(m.id); setViewingMilestone(null); }}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-green-700"
                >
                  <IconCheck size={16} strokeWidth={2.5} />
                  Mark as Done
                </button>
              )}

              {/* Edit + Delete */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { onDeleteMilestone(m.id); setViewingMilestone(null); }}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 text-neutral-400 transition-colors hover:border-rose-200 hover:text-rose-500 dark:border-white/10 dark:text-neutral-500"
                >
                  <IconTrash size={18} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => { setViewingMilestone(null); openEditMilestone(m); }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[15px] font-semibold text-white dark:bg-white dark:text-neutral-900"
                >
                  <IconEdit size={16} strokeWidth={2} />
                  Edit Milestone
                </button>
              </div>
            </div>
          );
        })()}
      </BottomSheet>

      {/* Task detail sheet */}
      <BottomSheet open={!!viewingTask} onClose={() => setViewingTask(null)} maxHeight="85vh">
        {viewingTask && (() => {
          const { task, activeDays: taskDays } = viewingTask;
          const duration = formatDuration(task.startTime, task.endTime);
          const subtaskCount = task.subtasks?.length ?? 0;
          const isRoutine = task.taskType === "session";

          return (
            <div className="px-5 pb-8 pt-4">
              {/* Type badge */}
              {isRoutine && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                    <IconRepeat size={12} strokeWidth={2.5} />
                    Routine Task
                  </span>
                </div>
              )}

              {/* Title */}
              <h2 className="mb-5 text-[22px] font-bold leading-snug text-neutral-900 dark:text-white">
                {task.title}
              </h2>

              {/* Meta info */}
              <div className="space-y-3 mb-6">
                {(task.startTime || task.endTime) && (
                  <div className="flex items-center gap-3">
                    <IconClock size={16} strokeWidth={1.8} className="shrink-0 text-neutral-400" />
                    <span className="text-[15px] font-medium text-neutral-700 dark:text-neutral-300">
                      {task.startTime}{task.endTime && ` – ${task.endTime}`}
                      {duration && (
                        <span className="ml-1.5 text-[13px] text-neutral-400">· {duration}</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <IconCalendar size={16} strokeWidth={1.8} className="mt-[3px] shrink-0 text-neutral-400" />
                  <div className="flex flex-wrap gap-[5px]">
                    {WEEKDAY_ORDER.map((day) => (
                      <DayPill key={day} label={WEEKDAY_SHORT[day]} active={taskDays.includes(day)} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Subtasks */}
              {subtaskCount > 0 && (
                <div className="mb-6">
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    Subtasks · {subtaskCount}
                  </p>
                  <div className="space-y-1.5">
                    {task.subtasks?.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3.5 py-2.5 dark:bg-white/[0.04]"
                      >
                        <div className="h-4 w-4 shrink-0 rounded-[4px] border-[1.5px] border-neutral-300 dark:border-white/20" />
                        <span className="text-[14px] font-medium text-neutral-700 dark:text-neutral-300">
                          {st.task}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteLinkedTask(task, taskDays);
                    setViewingTask(null);
                  }}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 text-neutral-400 transition-colors hover:border-rose-200 hover:text-rose-500 dark:border-white/10 dark:text-neutral-500"
                >
                  <IconTrash size={18} strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onEditTask(task);
                    setViewingTask(null);
                  }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[15px] font-semibold text-white dark:bg-white dark:text-neutral-900"
                >
                  <IconEdit size={16} strokeWidth={2} />
                  Edit Task
                </button>
              </div>
            </div>
          );
        })()}
      </BottomSheet>
    </div>
  );
}
