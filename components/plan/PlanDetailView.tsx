"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
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
  IconStack2,
  IconClock,
  IconChevronRight,
  IconListCheck,
  IconAlertTriangle,
  IconSparkles,
  IconSend,
  IconPlayerStop,
  IconCopy,
} from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import { haptic } from "@/lib/haptics";
import ProgressChart from "@/components/ProgressChart";
import BottomSheet from "@/components/ui/BottomSheet";
import ProgressBar from "@/components/ui/ProgressBar";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Input from "@/components/ui/Input";
import MilestoneSheet, { type MilestoneSaveData } from "@/components/plan/MilestoneSheet";
import { computeRoadmapStats } from "@/lib/roadmapEngine";
import { calculateMilestoneProgress, type MilestoneProgress } from "@/lib/planProgress";
import { resolveMilestoneStatus } from "@/lib/roadmapDates";
import { computeTrend } from "@/lib/trendUtils";
import { getTaskCheckableItems } from "@/lib/taskCompletion";
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
  PlanCoachMessage,
} from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { timelineCardStyles } from "@/lib/colorSystem";
import { formatDisplayTime, formatDuration } from "@/lib/timeUtils";
import { formatDate, formatDateShort, todayISO } from "@/lib/dateUtils";
import { DayPill } from "@/components/ui/Badge";
import { InternalSectionTitle, SectionIconButton } from "@/components/ui/InternalSectionTitle";
import { TrackerTabs } from "@/components/ui/TrackerTabs";
import AccuracyCalendar from "@/components/plan/AccuracyCalendar";
import {
  parseGeneratedTasks,
  type AIGeneratedTask,
  parseGeneratedMilestones,
  type AIGeneratedMilestone,
} from "@/lib/aiActions";
import { parseAIAction, PLAN_COACH_PROMPT, buildCoachContext } from "@/lib/ai";
import { streamAI } from "@/lib/ai/providers/router";
import { useAIActions } from "@/lib/ai/useAIActions";
import { useAuth } from "@/contexts/AuthProvider";
import { getCoachSkillPrompt, detectCoachSkill, SKILL_LABELS } from "@/lib/coachSkills";
import { AI_ENABLED } from "@/lib/featureFlags";
import AIActionSheet, { type ResultItem } from "@/components/ai/AIActionSheet";
import { detectMeasurableGoal, type MeasurableGoal } from "@/lib/milestoneIntelligence";
import { uid } from "@/lib/taskMutations";



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

      if (!seen.has(task.id)) seen.set(task.id, { task, activeDays: [day] });
      else seen.get(task.id)!.activeDays.push(day);
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
      {/* Ties the abstract choice to what it actually changes below — the
          trend badge and entry-list arrows silently flip color on this without
          otherwise explaining themselves anywhere in the UI. */}
      <p className="mt-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
        Going {value === "increase_good" ? "up" : "down"} will show{" "}
        <span className="font-semibold text-green-600 dark:text-green-400">green</span>
      </p>
    </div>
  );
}

// ── AI Coach streaming status ─────────────────────────────────────────────────

const COACH_STATUS_PHRASES = [
  "Thinking…",
  "Analyzing your plan…",
  "Processing…",
  "Crafting response…",
  "Finalizing…",
];

function CoachStreamingStatus() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % COACH_STATUS_PHRASES.length), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <m.span
        key={COACH_STATUS_PHRASES[idx]}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.22 }}
        className="animate-status-pulse text-[13px] font-medium text-neutral-500 dark:text-neutral-400"
      >
        {COACH_STATUS_PHRASES[idx]}
      </m.span>
    </AnimatePresence>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlanDetailViewProps {
  plan: Plan;
  schedule: Schedule;
  milestones: Milestone[];
  /**
   * Set when the surrounding shell already renders the plan title and its
   * edit/delete actions. The iOS shell does, and it routes *any* iPad
   * regardless of width — so at >=1024px the `lg:` title here appeared as a
   * second copy, stacked under the header's, with a duplicate action pair.
   */
  hideHeader?: boolean;
  onDeletePlan?: (planId: string) => void;
  onEditPlan?: (planId: string) => void;
  // Task handlers
  onAddTask: (planId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteLinkedTask: (task: Task, activeDays: DayKey[]) => void;
  // Tracker handlers
  onAddTracker: (
    planId: string,
    title: string,
    unit: string,
    goalDirection: GoalDirection,
    id?: string,
    goalValue?: number
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
  onAddGeneratedTasks?: (tasks: AIGeneratedTask[], planId: string, milestoneId?: string) => void;
  onLinkTrackerToMilestone?: (milestoneId: string, trackerId: string) => void;
  onUpdateCoachMessages?: (planId: string, messages: PlanCoachMessage[]) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlanDetailView({
  plan,
  schedule,
  milestones,
  hideHeader = false,
  onDeletePlan,
  onEditPlan,
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
  onAddGeneratedTasks,
  onLinkTrackerToMilestone,
  onUpdateCoachMessages,
}: PlanDetailViewProps) {
  // ── Tab state ───────────────────────────────────────────────────────────
  const [planTab, setPlanTab] = useState<"planning" | "roadmap" | "strategy">("planning");
  // Tabs exist only below lg, where three columns will not fit. Coach is still
  // gated on AI_ENABLED (currently false), so it ships to nobody today — but it
  // keeps its entry point rather than being orphaned by the desktop rework.
  const mobileTabs = (AI_ENABLED
    ? ["planning", "roadmap", "strategy"]
    : ["planning", "roadmap"]) as Array<"planning" | "roadmap" | "strategy">;

  // ── Unified AI actions through the configured provider ──────────────────
  const { user: aiUser } = useAuth();
  const ai = useAIActions();

  // ── AI task generation state ────────────────────────────────────────────
  const [genSheetOpen, setGenSheetOpen] = useState(false);
  // Stores full AIGeneratedTask objects keyed by id so we can commit with subtasks intact
  const parsedTasksRef = useRef<Record<string, AIGeneratedTask>>({});

  async function* genTasksStream(goal: string, picks: string[]): AsyncGenerator<string> {
    const contextHints = [goal.trim(), ...picks].filter(Boolean).join(". ");
    yield* ai.streamTasks(plan.title, contextHints || plan.description);
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
                meta: `${t.day.charAt(0).toUpperCase() + t.day.slice(1)} · ${formatDisplayTime(t.startTime)}–${formatDisplayTime(t.endTime)}${t.subtasks.length > 0 ? ` · ${t.subtasks.length} subtasks` : ""}`,
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

  // Milestone-scoped task generation
  async function* genMilestoneTasksStream(_goal: string, _picks: string[]): AsyncGenerator<string> {
    if (!postMilestoneContext) return;
    yield* ai.streamMilestoneTasks(
      { title: postMilestoneContext.title, description: postMilestoneContext.description },
      { title: plan.title, description: plan.description },
    );
  }

  function parseMilestoneTaskResults(raw: string): ResultItem[] {
    const tasks = parseGeneratedTasks(raw);
    parsedMilestoneTasksRef.current = {};
    return tasks.map((t, i) => {
      const id = String(i);
      parsedMilestoneTasksRef.current[id] = t;
      return {
        id,
        label: t.title,
        meta: `${t.day.charAt(0).toUpperCase() + t.day.slice(1)} · ${formatDisplayTime(t.startTime)}–${formatDisplayTime(t.endTime)}${t.subtasks.length > 0 ? ` · ${t.subtasks.length} subtasks` : ""}`,
        badge: t.icon,
      };
    });
  }

  function commitMilestoneTasks(items: ResultItem[]) {
    if (!onAddGeneratedTasks || !postMilestoneContext) return;
    const tasks = items
      .map((r) => parsedMilestoneTasksRef.current[r.id])
      .filter(Boolean) as AIGeneratedTask[];
    if (tasks.length > 0) {
      onAddGeneratedTasks(tasks, plan.id, postMilestoneContext.milestoneId);
      setMilestoneTasksAdded(true);
    }
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
  const [newTrackerGoalValue, setNewTrackerGoalValue] = useState("");
  const [newTrackerGoalDirection, setNewTrackerGoalDirection] =
    useState<GoalDirection>("increase_good");

  // ── Selected tracker state ──────────────────────────────────────────────
  const [selectedTrackerIdRaw, setSelectedTrackerId] = useState<string | null>(null);

  // ── Milestone sheet state ───────────────────────────────────────────────
  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false);
  const [milestoneSheetMode, setMilestoneSheetMode] = useState<"create" | "edit">("create");
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  // ── AI Coach state ──────────────────────────────────────────────────────
  type ChatMessage = PlanCoachMessage;
  const initialCoachMessages = (targetPlan: Plan): ChatMessage[] => {
    if (targetPlan.coachMessages && targetPlan.coachMessages.length > 0) {
      return targetPlan.coachMessages;
    }
    return ai.available
      ? [{ role: "assistant", content: `I'm here to help you build out "${targetPlan.title}". What's your main goal for this plan?` }]
      : [];
  };
  const [coachMessages, setCoachMessages] = useState<ChatMessage[]>(() => initialCoachMessages(plan));
  const [coachInput, setCoachInput] = useState("");
  const [coachStreaming, setCoachStreaming] = useState(false);
  const [milestonesGenerating, setMilestonesGenerating] = useState(false);
  const [acceptedMilestoneIds, setAcceptedMilestoneIds] = useState<Set<string>>(new Set());
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);

  // ── Post-milestone CTA state ────────────────────────────────────────────
  const [postMilestoneContext, setPostMilestoneContext] = useState<{
    milestoneId: string;
    title: string;
    description?: string;
    msgKey: string;
  } | null>(null);
  const [postMilestoneTrackerSuggestion, setPostMilestoneTrackerSuggestion] =
    useState<MeasurableGoal | null>(null);
  const [milestoneGenSheetOpen, setMilestoneGenSheetOpen] = useState(false);
  const [milestoneTasksAdded, setMilestoneTasksAdded] = useState(false);
  const [milestoneTrackerAdded, setMilestoneTrackerAdded] = useState(false);
  // Parsed tasks ref for milestone-scoped generation (separate from plan-level ref)
  const parsedMilestoneTasksRef = useRef<Record<string, AIGeneratedTask>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const coachAbortRef = useRef<AbortController | null>(null);
  const coachPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      coachAbortRef.current?.abort();
      if (coachPersistTimerRef.current) clearTimeout(coachPersistTimerRef.current);
    };
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // Task-id → title lookup for the milestone task-breakdown list — reuses
  // uniqueTasks rather than a second activities scan.
  const taskTitleById = useMemo(
    () => new Map(uniqueTasks.map(({ task }) => [task.id, task.title])),
    [uniqueTasks]
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

  // Live linked-task/subtask completion per milestone — computed once for the
  // whole list (not per-row) and reused by both the row's progress bar and
  // the detail sheet's task breakdown. Same cost class as roadmapStats below.
  const milestoneProgressById = useMemo(() => {
    const map = new Map<string, MilestoneProgress>();
    for (const m of planMilestones) {
      map.set(m.id, calculateMilestoneProgress(m, schedule.activities as unknown as Record<string, Task[]>, plan));
    }
    return map;
  }, [planMilestones, schedule.activities, plan]);

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

  // Greet once AI becomes available mid-session (e.g. the user just signed in)
  useEffect(() => {
    if (ai.available && coachMessages.length === 0) {
      setCoachMessages([{ role: "assistant", content: `I'm here to help you build out "${plan.title}". What's your main goal for this plan?` }]);
    }
  }, [ai.available]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCoachMessages(initialCoachMessages(plan));
    setAcceptedMilestoneIds(new Set());
    setPostMilestoneContext(null);
  }, [plan.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onUpdateCoachMessages) return;
    if (coachPersistTimerRef.current) clearTimeout(coachPersistTimerRef.current);
    const messagesToPersist = coachMessages.filter((msg) => msg.content.trim().length > 0);
    coachPersistTimerRef.current = setTimeout(() => {
      onUpdateCoachMessages(plan.id, messagesToPersist);
    }, 300);
    return () => {
      if (coachPersistTimerRef.current) clearTimeout(coachPersistTimerRef.current);
    };
  }, [coachMessages, plan.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const roadmapEndDate = planMilestones[planMilestones.length - 1]?.plannedEndDate ?? plan.endDate;
  const dateRange = plan.startDate && roadmapEndDate
    ? `${formatPlanDate(plan.startDate)} – ${formatPlanDate(roadmapEndDate)}`
    : formatPlanRange(plan);

  // ── Tracker handlers ────────────────────────────────────────────────────

  function handleAddTracker() {
    const title = newTrackerTitle.trim();
    if (!title) return;
    const goalValue = newTrackerGoalValue.trim() ? Number(newTrackerGoalValue) : undefined;
    onAddTracker(plan.id, title, newTrackerUnit.trim(), newTrackerGoalDirection, undefined, Number.isFinite(goalValue) ? goalValue : undefined);
    setNewTrackerTitle("");
    setNewTrackerUnit("");
    setNewTrackerGoalValue("");
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
    if (!ai.available || !coachInput.trim() || coachStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: coachInput.trim() };
    const newMessages = [...coachMessages, userMsg];
    setCoachMessages(newMessages);
    setCoachInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setCoachStreaming(true);
    const assistantIdx = newMessages.length;
    setCoachMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    coachAbortRef.current?.abort();
    const controller = new AbortController();
    coachAbortRef.current = controller;

    let accumulated = "";
    try {
      const skillPrompt = getCoachSkillPrompt(plan);
      const systemPrompt = [
        PLAN_COACH_PROMPT,
        skillPrompt,
        buildCoachContext(plan, { tasks: uniqueTasks, milestones: planMilestones, trackers }),
      ].filter(Boolean).join("\n\n");
      // Strip JSON blocks from assistant messages so milestone JSON doesn't leak into context
      const history = newMessages.map((m) => ({
        role: m.role,
        content: m.role === "assistant"
          ? m.content.replace(/```json[\s\S]*?```/g, "").trim()
          : m.content,
      }));
      for await (const chunk of streamAI(aiUser, history, systemPrompt, false, controller.signal)) {
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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Keep partial content if any was streamed; otherwise remove the empty bubble
        if (!accumulated) setCoachMessages((prev) => prev.slice(0, -1));
      } else {
        setCoachMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: "assistant", content: "Sorry, something went wrong reaching the AI. Try again." };
          return updated;
        });
      }
    } finally {
      setCoachStreaming(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function handleAutoGenerateMilestones() {
    if (!ai.available || milestonesGenerating) return;

    coachAbortRef.current?.abort();
    const controller = new AbortController();
    coachAbortRef.current = controller;

    setMilestonesGenerating(true);
    const msgIdx = coachMessages.length;
    setCoachMessages((prev) => [...prev, { role: "assistant", content: "Generating milestones…" }]);
    let accumulated = "";
    try {
      for await (const chunk of ai.streamMilestones({
        title: plan.title, description: plan.description,
        startDate: plan.startDate, endDate: plan.endDate,
      }, controller.signal)) {
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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setCoachMessages((prev) =>
          prev.filter((m, i) => !(i === msgIdx && m.content === "Generating milestones…"))
        );
      } else {
        setCoachMessages((prev) => {
          const updated = [...prev];
          updated[msgIdx] = { role: "assistant", content: "Couldn't generate milestones. Try again." };
          return updated;
        });
      }
    } finally {
      setMilestonesGenerating(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  function handleAcceptMilestone(msgIdx: number, mIdx: number, milestone: AIGeneratedMilestone) {
    const key = `${msgIdx}-${mIdx}`;
    if (acceptedMilestoneIds.has(key)) return;
    const milestoneId = uid();
    const today = todayISO();
    const startDate = plan.startDate ?? today;
    const targetDate = milestone.targetDate;
    const targetMs = targetDate ? new Date(`${targetDate}T00:00:00`).getTime() : NaN;
    const hasValidTarget = Number.isFinite(targetMs);
    const plannedEndDate = hasValidTarget ? targetDate! : today;
    const plannedDurationDays = hasValidTarget
      ? Math.max(1, Math.round((targetMs - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000) + 1)
      : 30;
    onAddMilestone({
      id: milestoneId,
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
    // Set up post-milestone CTA
    setPostMilestoneContext({
      milestoneId,
      title: milestone.title,
      description: milestone.description,
      msgKey: key,
    });
    setPostMilestoneTrackerSuggestion(
      detectMeasurableGoal(milestone.title, milestone.description)
    );
    setMilestoneTasksAdded(false);
    setMilestoneTrackerAdded(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function handleAcceptAllMilestones(msgIdx: number, milestones: AIGeneratedMilestone[]) {
    const remaining = milestones.filter((_, i) => !acceptedMilestoneIds.has(`${msgIdx}-${i}`));
    remaining.forEach((m, i) => {
      const realIdx = milestones.indexOf(m);
      const key = `${msgIdx}-${realIdx}`;
      if (acceptedMilestoneIds.has(key)) return;
      const today = todayISO();
      const startDate = plan.startDate ?? today;
      const targetDate = m.targetDate;
      const targetMs = targetDate ? new Date(`${targetDate}T00:00:00`).getTime() : NaN;
      const hasValidTarget = Number.isFinite(targetMs);
      const plannedEndDate = hasValidTarget ? targetDate! : today;
      const plannedDurationDays = hasValidTarget
        ? Math.max(1, Math.round((targetMs - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000) + 1)
        : 30;
      onAddMilestone({
        title: m.title,
        description: m.description || "",
        startDate,
        plannedDurationDays,
        plannedEndDate,
        status: "upcoming",
        linkedActivities: [],
        linkedTrackers: [],
        sortOrder: planMilestones.length + acceptedMilestoneIds.size + i,
        targetDate,
      } as MilestoneSaveData);
    });
    setAcceptedMilestoneIds((prev) => {
      const next = new Set(prev);
      milestones.forEach((_, i) => next.add(`${msgIdx}-${i}`));
      return next;
    });
    setCoachMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        type: "confirmation",
        content: `All ${remaining.length} milestone${remaining.length !== 1 ? "s" : ""} added. Head to the **Milestones** tab to see them.`,
      },
    ]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  function renderLinkedTaskRow(task: Task, activeDays: DayKey[]) {
    const duration = formatDuration(task.startTime, task.endTime);
    const subtaskCount = getTaskCheckableItems(task, plan).length;
    const isRoutine = task.taskType === "session";
    const hasTime = task.startTime || task.endTime;

    return (
      <button
        key={`${task.id}-${activeDays.join("")}`}
        type="button"
        onClick={() => setViewingTask({ task, activeDays })}
        className="group w-full flex items-center gap-3 rounded-xl border-b border-neutral-100 px-3 py-3.5 text-left transition-colors last:border-b-0 hover:bg-neutral-50 active:bg-neutral-100 dark:border-white/[0.05] dark:hover:bg-white/[0.04] dark:active:bg-white/[0.06]"
      >
        <div className="flex-1 min-w-0">
          {/* Line 1: Title */}
          <p className="text-[16px] font-semibold leading-tight text-neutral-900 dark:text-white">
            {task.title}
          </p>
          {/* Line 2: Time + duration + subtask count */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {hasTime && (
              <p className="text-[13px] font-medium shrink-0 text-neutral-500 dark:text-neutral-400">
                {formatDisplayTime(task.startTime)}{task.endTime && ` – ${formatDisplayTime(task.endTime)}`}
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
          {/* Line 3: Session badge (only for session tasks) */}
          {isRoutine && (
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:bg-amber-900/25 dark:text-amber-400">
                <IconStack2 size={10} strokeWidth={2.5} />
                Session
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
        <IconChevronRight size={16} strokeWidth={2} className="shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-500 dark:text-neutral-600 dark:group-hover:text-neutral-300" />
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
        className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
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
                placeholder="Unit (optional)"
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
                    <span className="ml-1.5 text-[16px] font-normal text-neutral-400 dark:text-neutral-500">
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
                  <IconButton
                    label="Delete tracker"
                    variant="dangerGhost"
                    size="xs"
                    radius="lg"
                    onClick={() => onDeleteTracker(tracker.id)}
                  >
                    <IconTrash size={16} strokeWidth={2} />
                  </IconButton>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chart */}
        {!isEditingThis && (
          <div className="px-3 pb-3">
            {entries.length > 0 ? (
              <>
                <ProgressChart
                  entries={entries}
                  color={plan.color}
                  metric={{ name: tracker.title, unit: tracker.unit ?? "" }}
                  goalValue={tracker.goalValue}
                />
                {/* The chart/trend-badge color is driven by goalDirection, set
                    once in the tracker form and otherwise invisible here. */}
                <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
                  <span className="font-semibold text-green-600 dark:text-green-400">Green</span> = trending toward your goal
                </p>
              </>
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
                { label: "Last",     value: `${last.value}${unit}` },
                { label: "Avg (all)", value: `${fmtAvg}${unit}` },
                { label: "Logged",   value: `${entries.length}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex-1 px-4 py-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[16px] font-bold tabular-nums text-neutral-950 dark:text-white">
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
                        <IconButton
                          label="Delete entry"
                          variant="dangerGhost"
                          size="xxs"
                          radius="lg"
                          onClick={() => onDeleteEntry(entry.id)}
                        >
                          <IconTrash size={14} strokeWidth={1.5} />
                        </IconButton>
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
    const progress = milestoneProgressById.get(m.id);
    const isActive   = status === "active";
    const isDelayed  = status === "delayed";
    const daysLabel = `${m.plannedDurationDays} Day${m.plannedDurationDays === 1 ? "" : "s"}`;
    const rangeLabel = `${formatDate(m.startDate)} – ${formatDate(m.plannedEndDate)}`;

    return (
      <button
        type="button"
        onClick={() => { haptic("light"); setViewingMilestone(m); }}
        // No px-1: it put this row 4px inside the card above it, which reads as
        // a misalignment against that card's border.
        className="group relative w-full flex gap-[14px] rounded-xl px-3 pt-[14px] pb-[18px] text-left transition-colors hover:bg-white/60 dark:hover:bg-white/[0.03]"
      >
        {/* Connector line to next item. Runs past this row's bottom edge by the
            next row's top padding, so it actually reaches the following marker
            instead of stopping ~12px short — invisible while dashed, obvious on
            the solid completed variant. */}
        {!isLast && (
          <div
            className={`absolute w-0 ${
              isCompleted
                ? "border-l-2 border-solid border-green-500"
                : isDelayed
                  ? "border-l-2 border-dashed border-amber-400 dark:border-amber-600"
                  : "border-l-2 border-dashed border-green-200 dark:border-green-800/60"
            }`}
            style={{ top: 44, bottom: -16, left: 26 }}
          />
        )}

        {/* Marker. The ring masks the connector, so it has to match the surface
            behind it — the page background, since this list has no card of its
            own. ring-white sat as a visible halo on #F3F4F1. */}
        <div
          aria-hidden="true"
          className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-[#F3F4F1] dark:ring-[#0E0E0E] ${
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
          {/* Linked tasks + tracker badges — the task badge shows live
              linked-task/subtask completion when there's anything to show
              (calculateMilestoneProgress), falling back to the plain linked
              count for a milestone with nothing trackable linked yet. */}
          {((m.linkedActivities?.length ?? 0) > 0 || (m.linkedTrackers?.length ?? 0) > 0) && (
            <div className="mt-1.5 flex items-center gap-2">
              {(m.linkedActivities?.length ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <IconCheck size={11} strokeWidth={2.5} />
                  {progress?.hasLinkedTasks
                    ? `${progress.completedCount}/${progress.totalCount} tasks · ${progress.pct}%`
                    : `${m.linkedActivities!.length} task${m.linkedActivities!.length !== 1 ? "s" : ""}`}
                </span>
              )}
              {(m.linkedTrackers?.length ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                  📊 {m.linkedTrackers!.length} tracker{m.linkedTrackers!.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
          {progress?.hasLinkedTasks && (
            <ProgressBar
              pct={progress.pct!}
              height={4}
              fillClassName={isCompleted ? "bg-neutral-300 dark:bg-white/20" : "bg-emerald-500"}
              className="mt-1.5 max-w-[160px]"
            />
          )}
        </div>

        <IconChevronRight size={16} strokeWidth={2} className="shrink-0 self-center text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-500 dark:text-neutral-600 dark:group-hover:text-neutral-300" />
      </button>
    );
  }



  // ── Roadmap overview ─────────────────────────────────────────────────────

  function renderRoadmapOverview() {
    const { currentPhaseName, consistencyPct, overallPct, overallPctFromLinkedTasks, totalMilestones } = roadmapStats;
    const targetLabel = roadmapStats.targetDate ? formatPlanDate(roadmapStats.targetDate) : "—";
    const progressSummary =
      overallPct === 0
        ? "Complete a task in this plan to start progress."
        : overallPct >= 80
        ? "You're on track."
        : "Progress is building as you complete plan tasks.";
    // Plan Progress is a live rollup of linked-task/subtask completion across
    // this plan's milestones (lib/planProgress.ts) — a different, purposely
    // more granular number from Task Consistency below (which measures daily
    // execution rhythm, not linked-scope completion) and from Accuracy on the
    // Planning tab (month-scoped day accuracy). The note names the source so
    // the two/three percentages on this plan read as complementary, not
    // disagreeing.
    const progressBlendNote =
      totalMilestones === 0
        ? "= Task Consistency (no milestones yet)"
        : overallPctFromLinkedTasks
          ? "Based on linked task & subtask completion"
          : "= Task Consistency (no linked tasks yet)";

    return (
      <div className="space-y-[10px]">
        {/* Plan Progress card */}
        <div className="rounded-2xl border border-neutral-200 bg-white px-[18px] pt-[18px] pb-4 dark:border-white/[0.08] dark:bg-neutral-900">
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[16px] font-bold tracking-[-0.4px] text-neutral-950 dark:text-white">
              Plan Progress
            </p>
            <p className="text-[20px] font-extrabold tracking-[-0.5px] text-green-600 dark:text-green-400">
              {overallPct}%
            </p>
          </div>

          {/* Smooth animated fill bar */}
          <ProgressBar
            pct={overallPct}
            height={10}
            fillClassName="bg-green-600"
            className="mb-3"
          />

          <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            {progressSummary}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
            {progressBlendNote}
          </p>
        </div>

        {/* 2×2 stats grid */}
        <div className="grid grid-cols-2 gap-[10px]">
          {([
            { label: "Current Focus",  value: currentPhaseName ?? "Starting out", caption: null },
            { label: "Task Consistency", value: `${consistencyPct}%`, caption: "Since plan start" },
            { label: "Days Left", value: roadmapStats.targetDate ? String(Math.max(0, Math.ceil((new Date(roadmapStats.targetDate).getTime() - Date.now()) / 86_400_000))) : "—", caption: null },
            { label: "Target Date",   value: targetLabel, caption: null },
          ] as { label: string; value: string; caption: string | null }[]).map(({ label, value, caption }) => (
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
              {/* Distinguishes this from Accuracy's month-scoped % on the
                  Planning tab — same-looking numbers, different windows. */}
              {caption && (
                <p className="mt-0.5 text-[10px] font-medium text-neutral-400 dark:text-neutral-500">{caption}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── AI Coach tab ─────────────────────────────────────────────────────────

  function renderStrategyTab() {
    return (
      <m.div
        key="strategy"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="mx-4 mt-6 flex flex-col lg:mx-8"
        style={{ height: "clamp(360px, calc(100vh - 300px), 640px)" }}
      >
        <>
            {/* Auto-generate button + skill badge */}
            <div className="shrink-0 flex items-center gap-2 px-4 pt-4 pb-3">
              <button
                type="button"
                onClick={handleAutoGenerateMilestones}
                disabled={milestonesGenerating || coachStreaming}
                className="group relative inline-flex rounded-full border border-neutral-200 bg-white transition-colors hover:bg-neutral-50 active:scale-95 disabled:opacity-60 dark:border-white/[0.10] dark:bg-neutral-950 dark:hover:bg-white/[0.06]"
              >
                <span className="relative inline-flex items-center gap-2 overflow-hidden rounded-full px-3 py-2 text-[12px] font-semibold text-neutral-950 transition-colors duration-200 dark:text-white">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
                    <IconSparkles size={14} strokeWidth={2} className={milestonesGenerating ? "animate-pulse" : ""} />
                  </span>
                  {milestonesGenerating ? "Generating…" : "Auto-generate milestones"}
                </span>
              </button>
              {(() => {
                const skill = detectCoachSkill(plan);
                return skill ? (
                  <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                    {SKILL_LABELS[skill]} Coach
                  </span>
                ) : null;
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 px-4 pb-2" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
              {coachMessages.map((msg, msgIdx) => {
                const isStreamingThis = coachStreaming && msgIdx === coachMessages.length - 1 && msg.role === "assistant";
                const cleanText = msg.content.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, "").trim();
                const isUser = msg.role === "user";

                return (
                  <div key={msgIdx}>
                    {isUser ? (
                      /* ── User bubble ── */
                      <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-2.5 text-[14px] leading-relaxed text-white dark:bg-white dark:text-neutral-900">
                          {msg.content}
                        </div>
                      </div>
                    ) : msg.type === "confirmation" ? (
                      /* ── Confirmation bubble ── */
                      <m.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-start gap-2"
                      >
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
                          <IconCheck size={11} strokeWidth={3} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="rounded-2xl rounded-tl-sm border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </m.div>
                    ) : (
                      /* ── AI message ── */
                      <div className="group">
                        <div className="text-[14px] leading-[1.7] text-neutral-800 dark:text-neutral-200">
                          {cleanText ? (
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                em: ({ children }) => <em className="italic">{children}</em>,
                                ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>,
                                ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>,
                                li: ({ children }) => <li>{children}</li>,
                                h1: ({ children }) => <h1 className="mb-1.5 mt-2 text-[16px] font-bold">{children}</h1>,
                                h2: ({ children }) => <h2 className="mb-1 mt-2 text-[14px] font-semibold">{children}</h2>,
                                h3: ({ children }) => <h3 className="mb-0.5 mt-1.5 text-[13px] font-semibold">{children}</h3>,
                                code: ({ children, className }) =>
                                  className
                                    ? <code className="my-2 block overflow-x-auto rounded-lg bg-neutral-100 px-3 py-2 font-mono text-[12px] dark:bg-white/[0.06]">{children}</code>
                                    : <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[12px] dark:bg-white/[0.06]">{children}</code>,
                              }}
                            >
                              {cleanText}
                            </ReactMarkdown>
                          ) : (
                            isStreamingThis && <CoachStreamingStatus />
                          )}
                          {isStreamingThis && cleanText && (
                            <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse rounded-sm bg-neutral-500 dark:bg-neutral-400" />
                          )}
                        </div>

                        {/* Starter prompts — shown under the greeting only */}
                        {msgIdx === 0 && coachMessages.length === 1 && (() => {
                          const skill = detectCoachSkill(plan);
                          const prompts: Record<string, string[]> = {
                            running:   ["How do I build mileage safely?", "What should my long run look like?", "Help me train for a race"],
                            fitness:   ["Design a weekly training split", "How do I track progress?", "What should I prioritize first?"],
                            diet:      ["Help me calculate my calories", "Build a meal prep strategy", "How do I stay consistent?"],
                            gmat_prep: ["Where should I start?", "How do I improve my Quant score?", "Make me a 3-month plan"],
                            study:     ["Build me a study schedule", "How do I retain information?", "I have 4 weeks until my exam"],
                            work:      ["Help me set career milestones", "How do I prioritize better?", "Map out my next 6 months"],
                            health:    ["How do I improve my sleep?", "Build a daily wellness routine", "Help me reduce stress"],
                            habit:     ["I keep failing at this habit", "Make a 30-day plan", "How do I make this stick?"],
                          };
                          const chips = skill ? prompts[skill] : ["Help me plan this out", "What should I focus on first?", "Suggest milestones"];
                          return (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {chips.map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => {
                                    setCoachInput(chip);
                                    setTimeout(() => textareaRef.current?.focus(), 0);
                                  }}
                                  className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-400 dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
                                >
                                  {chip}
                                </button>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Copy button */}
                        {cleanText && !isStreamingThis && (
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard.writeText(cleanText);
                              setCopiedMsgIdx(msgIdx);
                              setTimeout(() => setCopiedMsgIdx(null), 2000);
                            }}
                            className="mt-1.5 flex items-center gap-1 text-[11px] text-neutral-300 opacity-0 transition-all group-hover:opacity-100 hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400"
                          >
                            {copiedMsgIdx === msgIdx
                              ? <><IconCheck size={11} strokeWidth={2.5} /><span>Copied</span></>
                              : <><IconCopy size={11} strokeWidth={2} /><span>Copy</span></>
                            }
                          </button>
                        )}
                      </div>
                    )}

                    {/* Milestone suggestion cards */}
                    {msg.suggestedMilestones && msg.suggestedMilestones.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
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
                );
              })}
              {/* Post-milestone CTA card */}
              {postMilestoneContext && !(milestoneTasksAdded && (milestoneTrackerAdded || !postMilestoneTrackerSuggestion)) && (
                <m.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/20 dark:bg-violet-500/[0.06]"
                >
                  <div className="mb-3 flex items-start gap-2">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/20">
                      <IconCheck size={11} strokeWidth={3} className="text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-violet-900 dark:text-violet-200 leading-tight">
                        "{postMilestoneContext.title}" added
                      </p>
                      <p className="mt-0.5 text-[11px] text-violet-600 dark:text-violet-400">
                        What would you like to do next?
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {!milestoneTasksAdded && (
                      <button
                        type="button"
                        onClick={() => setMilestoneGenSheetOpen(true)}
                        className="w-full rounded-xl bg-violet-600 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
                      >
                        ⚡ Generate tasks for this milestone
                      </button>
                    )}
                    {milestoneTasksAdded && (
                      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-500/[0.08]">
                        <IconCheck size={13} strokeWidth={2.5} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">Tasks added to your plan</p>
                      </div>
                    )}
                    {postMilestoneTrackerSuggestion && !milestoneTrackerAdded && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!postMilestoneTrackerSuggestion || !postMilestoneContext) return;
                          const trackerId = uid();
                          const { goalDirection, unit } = postMilestoneTrackerSuggestion;
                          onAddTracker(plan.id, postMilestoneContext.title, unit, goalDirection, trackerId);
                          onLinkTrackerToMilestone?.(postMilestoneContext.milestoneId, trackerId);
                          setMilestoneTrackerAdded(true);
                        }}
                        className="w-full rounded-xl border border-violet-200 py-2.5 text-[13px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 active:bg-violet-100 dark:border-violet-500/20 dark:text-violet-300 dark:hover:bg-violet-500/[0.1]"
                      >
                        📊 Add tracker: {postMilestoneContext.title} ({postMilestoneTrackerSuggestion.unit}{postMilestoneTrackerSuggestion.goalDirection === "decrease_good" ? " ↓" : " ↑"})
                      </button>
                    )}
                    {postMilestoneTrackerSuggestion && milestoneTrackerAdded && (
                      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-emerald-500/[0.08]">
                        <IconCheck size={13} strokeWidth={2.5} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">Tracker added</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setPostMilestoneContext(null)}
                      className="w-full rounded-xl py-2 text-[12px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      Skip
                    </button>
                  </div>
                </m.div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-neutral-100 px-4 pb-4 pt-3 dark:border-white/[0.06]">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={coachInput}
                  rows={1}
                  onChange={(e) => {
                    setCoachInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendCoachMessage(); }
                  }}
                  placeholder="Ask about your plan…"
                  disabled={coachStreaming}
                  className="flex-1 resize-none overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                />
                {coachStreaming ? (
                  <m.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => coachAbortRef.current?.abort()}
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-neutral-200 text-neutral-700 transition-colors hover:bg-neutral-300 dark:bg-white/[0.1] dark:text-neutral-300 dark:hover:bg-white/[0.15]"
                  >
                    <IconPlayerStop size={16} strokeWidth={1.5} />
                  </m.button>
                ) : (
                  <m.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={handleSendCoachMessage}
                    disabled={!coachInput.trim()}
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                  >
                    <IconSend size={17} strokeWidth={2} />
                  </m.button>
                )}
              </div>
            </div>
        </>
      </m.div>
    );
  }

  // ── Planning tab ────────────────────────────────────────────────────────

  /* AI sheets — overlays, so their position in the tree doesn't matter. Kept
     out of the sections below so they mount once rather than once per layout. */
  function renderAISheets() {
    return (
      <>
        {ai.available && (
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
        {ai.available && postMilestoneContext && (
          <AIActionSheet
            open={milestoneGenSheetOpen}
            onClose={() => setMilestoneGenSheetOpen(false)}
            title="Milestone Tasks"
            contextLabel={`for "${postMilestoneContext.title}"`}
            inputPlaceholder="Any focus area? e.g. mornings only, progressive load, quick wins…"
            quickPicks={[
              "Morning sessions",
              "Spread across the week",
              "Progressive build-up",
              "Include checkpoints",
            ]}
            ctaLabel="Build Tasks"
            resultSingular="task"
            resultPlural="tasks"
            onGenerate={genMilestoneTasksStream}
            onParseResults={parseMilestoneTaskResults}
            onAdd={commitMilestoneTasks}
          />
        )}
      </>
    );
  }

  /* ── Sections ──────────────────────────────────────────────────────────────
     Each returns bare content with no horizontal padding of its own, so the
     same section can sit in the mobile tab stack or a desktop column and take
     its gutters from whichever container holds it. */

  function plannedTasksSection() {
    return (
            <section>
              <InternalSectionTitle
                title="Planned Tasks"
                className="mb-4"
                actions={
                  <div className="flex items-center gap-1">
                    <SectionIconButton
                      icon={<IconPlus size={20} strokeWidth={2} />}
                      onClick={() => onAddTask(plan.id)}
                      label="Add task"
                    />
                  </div>
                }
              />

              <div className="rounded-2xl border border-neutral-200 bg-white px-4 dark:border-white/[0.08] dark:bg-neutral-900">
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
    );
  }

  function progressTrackingSection() {
    return (
            <section>
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
                <div className="rounded-2xl border border-neutral-200 bg-white py-10 text-center dark:border-white/[0.08] dark:bg-neutral-900">
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
    );
  }

  function accuracySection() {
    return (
            <section>
              <AccuracyCalendar
                planId={plan.id}
                activities={schedule.activities}
                planStartDate={plan.startDate}
                planEndDate={plan.endDate}
                onAddTask={() => onAddTask(plan.id)}
              />
            </section>
    );
  }

  /** Plan Progress + stat tiles + the milestone timeline, under one heading. */
  function milestonesSection() {
    return (
        <section>
          <InternalSectionTitle
            title="Milestones"
            className="mb-4"
            actions={
              <SectionIconButton
                icon={<IconPlus size={20} strokeWidth={2} />}
                onClick={openAddMilestone}
                label="Add milestone"
              />
            }
          />

          <div className="mb-6">{renderRoadmapOverview()}</div>

          {planMilestones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 py-12 text-center dark:border-white/[0.08]">
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
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    // No bottom padding of its own: both shells already pad for their bottom
    // nav (iOS pb-36, mobile web pb-40), and adding pb-32 on top produced
    // ~270px of dead scroll. Desktop, where the shell pads nothing, gets its
    // own breathing room.
    <div className="lg:pb-12">
      {renderAISheets()}

      {/* Plan info. When the shell owns the header (hideHeader, iOS/mobile), it
          already pads the content below its fixed header — so skip our own top
          padding to keep the plan content flush under it, with no gap strip. */}
      <div className={`space-y-2 px-4 lg:px-8 lg:pt-6 ${hideHeader ? "pt-0" : "pt-3"}`}>
        <div className={`items-start justify-between gap-4 ${hideHeader ? "hidden" : "hidden lg:flex"}`}>
          <h1 className="min-w-0 text-[32px] font-bold leading-tight text-neutral-950 dark:text-white">
            {plan.title}
          </h1>
          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            {onEditPlan && (
              <IconButton
                label="Edit plan"
                variant="ghost"
                size="md"
                radius="xl"
                onClick={() => { haptic("light"); onEditPlan(plan.id); }}
                title="Edit plan"
                className="h-10 w-10 border border-neutral-200 dark:border-white/10"
              >
                <IconEdit size={18} strokeWidth={1.9} />
              </IconButton>
            )}
            {onDeletePlan && (
              <IconButton
                label="Delete plan"
                variant="dangerGhost"
                size="md"
                radius="xl"
                onClick={() => { haptic("light"); onDeletePlan(plan.id); }}
                title="Delete plan"
                className="h-10 w-10 border border-neutral-200 dark:border-white/10"
              >
                <IconTrash size={18} strokeWidth={1.9} />
              </IconButton>
            )}
          </div>
        </div>
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

      {/* ── Tab switcher — below lg only, where three columns will not fit ── */}
      <div className="mx-4 mt-6 lg:hidden">

        <div className="relative flex rounded-2xl bg-neutral-100 dark:bg-white/[0.06] p-1">
          <m.div
            className="absolute rounded-xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-800"
            style={{ top: "4px", bottom: "4px", left: "4px", width: `calc((100% - 8px) / ${mobileTabs.length})`, willChange: "transform" }}
            animate={{ x: `${Math.max(mobileTabs.indexOf(planTab), 0) * 100}%` }}
            transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
          />
          {mobileTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setPlanTab(tab)}
              className={`relative flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors duration-200 z-10 ${
                planTab === tab ? "text-neutral-950 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {tab === "planning" ? "Tasks" : tab === "roadmap" ? "Milestones" : "Coach"}
            </button>
          ))}
        </div>

      </div>

      {/* ── Content ─────────────────────────────────────────────────────────
          Every section is rendered exactly once. At lg the container becomes a
          three-column grid and `lg:flex` overrides each column's `hidden`, so
          the whole plan is visible at once — the roadmap can finally be read
          against the tasks that feed it. Below lg the grid is inert and the tab
          decides which columns are shown.

          Rendering a desktop copy and a mobile copy instead would double this
          subtree (calendar, trackers, milestone list) and leave two nodes with
          the same text, one of them permanently hidden — which is exactly what
          broke the smoke test's `getByText(...).first()`. */}
      <div className="mt-6 gap-6 px-4 lg:grid lg:grid-cols-3 lg:items-start lg:px-8 xl:gap-8">
        <div className={`min-w-0 flex-col gap-8 lg:flex ${planTab === "planning" ? "flex" : "hidden"}`}>
          {plannedTasksSection()}
        </div>
        <div className={`mt-8 min-w-0 flex-col gap-8 lg:mt-0 lg:flex ${planTab === "planning" ? "flex" : "hidden"}`}>
          {accuracySection()}
          {progressTrackingSection()}
        </div>
        <div className={`min-w-0 flex-col gap-8 lg:flex ${planTab === "roadmap" ? "flex" : "hidden"}`}>
          {milestonesSection()}
        </div>
      </div>

      {AI_ENABLED && planTab === "strategy" && (
        <div className="mt-6 lg:hidden">{renderStrategyTab()}</div>
      )}

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
          setNewTrackerGoalValue("");
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
              setNewTrackerGoalValue("");
              setNewTrackerGoalDirection("increase_good");
            }}
          />
          <div className="space-y-2.5">
            <Input
              value={newTrackerTitle}
              onChange={(e) => setNewTrackerTitle(e.target.value)}
              placeholder="Tracker name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTrackerTitle.trim()) handleAddTracker();
              }}
            />
            <Input
              value={newTrackerUnit}
              onChange={(e) => setNewTrackerUnit(e.target.value)}
              placeholder="Unit (optional)"
            />
            <Input
              type="number"
              inputMode="decimal"
              value={newTrackerGoalValue}
              onChange={(e) => setNewTrackerGoalValue(e.target.value)}
              placeholder={`Goal value${newTrackerUnit.trim() ? ` (${newTrackerUnit.trim()})` : ""} — optional`}
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
          const progress = milestoneProgressById.get(m.id);
          const readyToComplete = !!progress?.hasLinkedTasks && progress.pct === 100 && !isCompleted;

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
                  <span className="text-[16px] font-medium text-neutral-700 dark:text-neutral-300">
                    {formatDate(m.startDate)} – {formatDate(m.plannedEndDate)}
                    <span className="ml-2 text-[13px] text-neutral-400">
                      · {m.plannedDurationDays} day{m.plannedDurationDays === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                {isCompleted && m.actualCompletedDate && (
                  <div className="flex items-center gap-3">
                    <IconCheck size={16} strokeWidth={2} className="shrink-0 text-green-500" />
                    <span className="text-[16px] font-medium text-neutral-700 dark:text-neutral-300">
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
                  <p className="text-[16px] leading-relaxed text-neutral-700 dark:text-neutral-300">
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
                  <p className="text-[16px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {m.notes}
                  </p>
                </div>
              )}

              {/* Linked tasks — read-only breakdown of what this milestone's
                  progress is actually made of. Not tappable this pass (no
                  navigation to the task) — an obvious, easy fast-follow. */}
              {progress?.hasLinkedTasks && (
                <div className="mb-5">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    Linked Tasks
                  </p>
                  <div className="space-y-2">
                    {progress.taskBreakdown.map((t) => (
                      <div key={t.taskId} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-700 dark:text-neutral-300">
                          {taskTitleById.get(t.taskId) ?? "Deleted task"}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">
                          {t.completedCount}/{t.totalCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ready-to-complete nudge — purely informational, still a
                  manual click; never auto-completes. */}
              {readyToComplete && (
                <p className="mb-2 text-center text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  All linked tasks are complete — ready to mark this milestone done.
                </p>
              )}

              {/* Mark Done — any non-completed milestone */}
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => { onCompleteMilestone(m.id); setViewingMilestone(null); }}
                  className={`mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-semibold text-white transition-colors ${
                    readyToComplete
                      ? "bg-emerald-600 ring-2 ring-emerald-300 hover:bg-emerald-700 dark:ring-emerald-500/40"
                      : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  <IconCheck size={16} strokeWidth={2.5} />
                  Mark as Done
                </button>
              )}

              {/* Edit + Delete */}
              <div className="flex gap-3">
                <IconButton
                  label="Delete milestone"
                  variant="dangerGhost"
                  size="md"
                  radius="xl"
                  onClick={() => { onDeleteMilestone(m.id); setViewingMilestone(null); }}
                  className="h-12 w-12 rounded-2xl border border-neutral-200 dark:border-white/10"
                >
                  <IconTrash size={18} strokeWidth={1.8} />
                </IconButton>
                <button
                  type="button"
                  onClick={() => { setViewingMilestone(null); openEditMilestone(m); }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[16px] font-semibold text-white dark:bg-white dark:text-neutral-900"
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
          const taskItems = getTaskCheckableItems(task, plan);
          const subtaskCount = taskItems.length;
          const isRoutine = task.taskType === "session";

          return (
            <div className="px-5 pb-8 pt-4">
              {/* Type badge */}
              {isRoutine && (
                <div className="mb-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                    <IconStack2 size={12} strokeWidth={2.5} />
                    Session
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
                    <span className="text-[16px] font-medium text-neutral-700 dark:text-neutral-300">
                      {formatDisplayTime(task.startTime)}{task.endTime && ` – ${formatDisplayTime(task.endTime)}`}
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
                    {taskItems.map((st) => (
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
                <IconButton
                  label="Delete task"
                  variant="dangerGhost"
                  size="md"
                  radius="xl"
                  onClick={() => {
                    onDeleteLinkedTask(task, taskDays);
                    setViewingTask(null);
                  }}
                  className="h-12 w-12 rounded-2xl border border-neutral-200 dark:border-white/10"
                >
                  <IconTrash size={18} strokeWidth={1.8} />
                </IconButton>
                <button
                  type="button"
                  onClick={() => {
                    onEditTask(task);
                    setViewingTask(null);
                  }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[16px] font-semibold text-white dark:bg-white dark:text-neutral-900"
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
