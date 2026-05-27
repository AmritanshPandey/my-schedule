"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import AddEntryModal from "@/components/AddEntryModal";
import { TaskSheet, type TaskSaveData } from "@/components/task/TaskSheet";
import type { MilestoneSaveData } from "@/components/plan/MilestoneSheet";
import { PlanCard } from "@/components/plan/PlanCard";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/desktop/DesktopSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import { WeekGrid } from "@/components/desktop/WeekGrid";
import { QuickAddPanel } from "@/components/desktop/QuickAddPanel";
import { OLLAMA_URL_KEY, OLLAMA_MODEL_KEY, DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL } from "@/lib/ai";

// ── Deferred heavy components (separate JS chunks, loaded on demand) ──────────
const PlanDetailView = dynamic(() => import("@/components/plan/PlanDetailView"), { ssr: false });
const AIPlanCreatorSheet = dynamic(() => import("@/components/plan/AIPlanCreatorSheet"), { ssr: false });
const SettingsSheet = dynamic(() => import("@/components/auth/SettingsSheet").then(m => ({ default: m.SettingsSheet })), { ssr: false });
const TemplatesSheet = dynamic(() => import("@/components/TemplatesSheet").then(m => ({ default: m.TemplatesSheet })), { ssr: false });
const SessionSheet = dynamic(() => import("@/components/activity/SessionSheet"), { ssr: false });
const RitualView = dynamic(() => import("@/components/activity/RitualView"), { ssr: false });
const ReviewView = dynamic(() => import("@/components/ReviewView"), { ssr: false });
const WeeklyPlanSheet = dynamic(() => import("@/components/WeeklyPlanSheet"), { ssr: false });
const TrackerQuickBar = dynamic(() => import("@/components/TrackerQuickBar"), { ssr: false });
import WhatNextCard from "@/components/WhatNextCard";
import StreakAlertChips from "@/components/StreakAlertChips";
import {
  useScheduleDB,
  DAYS,
  DAY_LABELS,
  DayKey,
  MetricEntry,
  Milestone,
  Plan,
  ProgressTracker,
  Ritual,
  Schedule,
  SummaryConfig,
  Task,
  categoryFromIcon,
} from "@/lib/useScheduleDB";
import RitualOverlayLayer from "@/components/timeline/RitualOverlayLayer";
import {
  colorFromIcon,
  resolveAccentColor,
  timelineCardStyles,
  type AccentColor,
} from "@/lib/colorSystem";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import {
  IconCheck,
  IconChevronLeft,
  IconCalendar,
  IconChevronRight,
  IconClipboardList,
  IconEdit,
  IconLayoutList,
  IconMinus,
  IconPlus,
  IconSparkles,
  IconTable,
  IconTrash,
  IconX,
  IconAlertTriangle,
  IconAlertCircle,
  IconClipboardData,
} from "@tabler/icons-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ListTaskCard } from "@/components/activity/ListTaskCard";
import TodayRitualsBar from "@/components/activity/TodayRitualsBar";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { CurrentTimeLayer } from "@/components/timeline/CurrentTimeLayer";
import {
  toggleTaskComplete,
  toggleSubtaskComplete,
  isTaskCompleted,
  resolveTaskState,
} from "@/lib/taskCompletion";
import { createTask, updateTaskDays, deleteTask, uid, sortTasksByTime } from "@/lib/taskMutations";
import type { AIGeneratedTask } from "@/lib/aiActions";
import { applyTemplate } from "@/lib/templates";
import type { Template } from "@/lib/templates";
import { parseTimeToMinutes, formatDuration } from "@/lib/timeUtils";
import { todayISO, daysBetween as daysBetweenUtil, formatDate, addDaysToISO } from "@/lib/dateUtils";
import { getPlanCardStats } from "@/lib/planInsights";
import { MainTitleSection, IconActionButton, CtaActionButton } from "@/components/ui/MainTitleSection";
import { cycleAccentColor } from "@/components/ui/Badge";
import { recalculateRoadmapTimeline } from "@/lib/roadmapDates";
import { haptic } from "@/lib/haptics";

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_DURATION_PRESETS: { label: string; days: number | null }[] = [
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
  { label: "Ongoing", days: null },
];

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}


const daysBetween = daysBetweenUtil;

const TIMELINE_START_HOUR = 4;
const TIMELINE_END_HOUR = 28; // extends to 4 AM next day for overnight tasks
const HOUR_HEIGHT = 64;
const TIMELINE_TOP_PADDING = 12;
const TIMELINE_BOTTOM_PADDING = 48;
const TIMELINE_START_MINUTES = TIMELINE_START_HOUR * 60;
const TIMELINE_END_MINUTES = TIMELINE_END_HOUR * 60;
const TIMELINE_HEIGHT =
  TIMELINE_TOP_PADDING +
  (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * HOUR_HEIGHT +
  TIMELINE_BOTTOM_PADDING;
const TIMELINE_HOURS: number[] = Array.from(
  { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
  (_, i) => TIMELINE_START_HOUR + i
);
const RITUAL_LANE_WIDTH = 28;

const JS_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;


// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPlanDate = formatDate;

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("calorie")) return "kcal";
  if (key.includes("protein") || key.includes("carb") || /\bfat\b/.test(key)) return "g";
  if (key.includes("duration") || key.includes("time")) return "min";
  if (key.includes("weight")) return "kg";
  return "";
}

function stableFieldHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function createSummaryFromMeta(metaFields: string[]): SummaryConfig[] {
  return metaFields.map((field) => ({
    label: field,
    metaKey: field,
    unit: inferUnit(field),
    colorClass: `accent-${cycleAccentColor(stableFieldHash(field))}`,
  }));
}

const formatTaskDuration = formatDuration;

function formatHourLabel(hour24: number): string {
  const normalizedHour = hour24 % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const hour = normalizedHour % 12 || 12;
  return `${hour} ${suffix}`;
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type CardSize = "xsmall" | "small" | "medium" | "large";

function computeCardSize(height: number, laneCount: number): CardSize {
  // HOUR_HEIGHT = 64 → 30min=32px, 45min=48px, 60min=64px, 90min=96px
  // xsmall: title chip only         — card < 32px  (< ~30 min)
  // small:  plan label + title      — card < 48px  (< ~45 min)
  // medium: plan+title+time         — card < 64px  (< ~60 min)
  // large:  full layout with gutter — card ≥ 64px  (≥ 60 min)
  let size: CardSize;
  if (height < 32) size = "xsmall";
  else if (height < 48) size = "small";
  else if (height < 64) size = "medium";
  else size = "large";

  // Degrade for multi-lane layouts to preserve readability at narrower widths
  if (laneCount >= 3) {
    if (size === "large") size = "small";
    else if (size === "medium") size = "small";
    else size = "xsmall";
  } else if (laneCount === 2) {
    if (size === "large") size = "medium";
    else if (size === "medium") size = "small";
    else size = "xsmall";
  }

  return size;
}


function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getWeekDates(offset: number): Array<{ day: DayKey; date: Date }> {
  const today = new Date();
  const dow = today.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToMon + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return DAYS.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { day, date: d };
  });
}

// ─── Stat tile ───────────────────────────────────────────────────────────────

type StatTileColorScheme = "neutral" | "emerald" | "amber" | "rose";

const STAT_TILE_STYLES: Record<
  StatTileColorScheme,
  { tile: string; iconBg: string; icon: string; value: string; label: string }
> = {
  neutral: {
    tile:    "border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900",
    iconBg:  "bg-neutral-100 dark:bg-white/[0.06]",
    icon:    "text-neutral-500 dark:text-neutral-400",
    value:   "text-neutral-900 dark:text-white",
    label:   "text-neutral-400 dark:text-neutral-500",
  },
  emerald: {
    tile:    "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]",
    iconBg:  "bg-emerald-100 dark:bg-emerald-500/[0.15]",
    icon:    "text-emerald-600 dark:text-emerald-400",
    value:   "text-emerald-700 dark:text-emerald-400",
    label:   "text-emerald-600/70 dark:text-emerald-500/70",
  },
  amber: {
    tile:    "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/[0.07]",
    iconBg:  "bg-amber-100 dark:bg-amber-500/[0.15]",
    icon:    "text-amber-600 dark:text-amber-400",
    value:   "text-amber-700 dark:text-amber-400",
    label:   "text-amber-600/70 dark:text-amber-500/70",
  },
  rose: {
    tile:    "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/[0.07]",
    iconBg:  "bg-rose-100 dark:bg-rose-500/[0.15]",
    icon:    "text-rose-600 dark:text-rose-400",
    value:   "text-rose-700 dark:text-rose-400",
    label:   "text-rose-600/70 dark:text-rose-500/70",
  },
};

function StatTile({
  icon: Icon,
  value,
  label,
  colorScheme = "neutral",
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  value: number;
  label: string;
  colorScheme?: StatTileColorScheme;
}) {
  const s = STAT_TILE_STYLES[colorScheme];
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${s.tile}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.iconBg}`}>
        <Icon size={17} strokeWidth={colorScheme === "neutral" ? 1.8 : 2} className={s.icon} />
      </div>
      <div>
        <p className={`text-[24px] font-black tabular-nums leading-none ${s.value}`}>{value}</p>
        <p className={`mt-0.5 text-[11px] font-semibold ${s.label}`}>{label}</p>
      </div>
    </div>
  );
}

// ─── Sortable wrappers ────────────────────────────────────────────────────────

function SortableTaskCard({
  task,
  children,
}: {
  task: Task;
  children: (dragHandleProps: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef}>
      {children({
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: (listeners ?? {}) as Record<string, unknown>,
      })}
    </div>
  );
}

// ─── Week Summary (Review tab) ────────────────────────────────────────────────

type RitualWeekDay = { date: string; label: string; isToday: boolean; completedCount: number; dueCount: number };

function WeekSummary({
  schedule,
  todayKey,
  ritualWeekHistory,
}: {
  schedule: Schedule;
  todayKey: DayKey;
  ritualWeekHistory: RitualWeekDay[];
}) {
  const thisWeekDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const daysToMon = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMon);
    monday.setHours(0, 0, 0, 0);
    return DAYS.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { day, date: d };
    });
  }, []);

  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dayStats = useMemo(
    () =>
      thisWeekDates.map(({ day, date }) => {
        const tasks = schedule.activities[day] ?? [];
        const total = tasks.length;
        const done = tasks.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length;
        return {
          day,
          label: DAY_LABELS[day],
          total,
          done,
          isPastOrToday: date <= todayMidnight,
          isToday: day === todayKey,
        };
      }),
    [schedule.activities, thisWeekDates, todayMidnight, todayKey]
  );

  const trackedDays = dayStats.filter((d) => d.isPastOrToday);
  const totalDone = trackedDays.reduce((s, d) => s + d.done, 0);
  const totalScheduled = trackedDays.reduce((s, d) => s + d.total, 0);
  const weekPct = totalScheduled > 0 ? Math.round((totalDone / totalScheduled) * 100) : 0;

  const ritualDone = ritualWeekHistory.reduce((s, d) => s + d.completedCount, 0);
  const ritualDue = ritualWeekHistory.reduce((s, d) => s + d.dueCount, 0);
  const ritualPct = ritualDue > 0 ? Math.round((ritualDone / ritualDue) * 100) : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4 mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 mb-3">
        This Week
      </p>

      {/* Day completion strip */}
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {dayStats.map(({ day, label, total, done, isPastOrToday, isToday }) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={day} className="flex flex-col items-center gap-1.5">
              <span className={`text-[9px] font-semibold leading-none ${
                isToday
                  ? "text-emerald-500 dark:text-emerald-400"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {label}
              </span>
              <div className="w-full h-[5px] rounded-full bg-neutral-100 dark:bg-white/[0.06] overflow-hidden">
                {total > 0 && isPastOrToday && (
                  <div
                    className={`h-full rounded-full ${
                      pct === 100
                        ? "bg-emerald-500"
                        : pct >= 50
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                    style={{ width: `${Math.max(pct, pct > 0 ? 10 : 0)}%` }}
                  />
                )}
              </div>
              <span className={`text-[9px] tabular-nums leading-none ${
                isToday
                  ? "font-bold text-neutral-700 dark:text-neutral-300"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {total > 0 && isPastOrToday ? `${done}/${total}` : "·"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 dark:text-neutral-500">
            Tasks done
          </p>
          <p className="text-[20px] font-extrabold tabular-nums leading-none text-neutral-950 dark:text-white">
            {weekPct}
            <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">%</span>
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 dark:text-neutral-500">
            Habits done
          </p>
          <p className="text-[20px] font-extrabold tabular-nums leading-none text-neutral-950 dark:text-white">
            {ritualPct}
            <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">%</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScheduleApp() {
  const { schedule, setSchedule, ready, clearData, isFirstLaunch } = useScheduleDB();
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [whatNextDismissed, setWhatNextDismissed] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [taskSheetMode, setTaskSheetMode] = useState<"create" | "edit">("create");
  const [taskSheetTask, setTaskSheetTask] = useState<Task | null>(null);
  const [taskSheetPlanId, setTaskSheetPlanId] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [entryTracker, setEntryTracker] = useState<ProgressTracker | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("timeline");
  const [calendarView, setCalendarView] = useState<"1day" | "3day" | "7day" | "custom3">("7day");
  const [customDays, setCustomDays] = useState<DayKey[]>(["monday", "wednesday", "friday"]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [taskSheetInitialType, setTaskSheetInitialType] = useState<"task" | "session">("task");

  const [addingPlan, setAddingPlan] = useState(false);
  const [aiPlanCreating, setAiPlanCreating] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanDescription, setNewPlanDescription] = useState("");
  const [newPlanStartDate, setNewPlanStartDate] = useState("");
  const [newPlanEndDate, setNewPlanEndDate] = useState("");
  const [newPlanIconName, setNewPlanIconName] = useState("brain");
  const [newPlanMetaFields, setNewPlanMetaFields] = useState<string[]>([]);
  const [newPlanMetaInput, setNewPlanMetaInput] = useState("");

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlanDraft, setEditPlanDraft] = useState({ title: "", description: "", startDate: "", endDate: "" });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [weeklyPlanOpen, setWeeklyPlanOpen] = useState(false);
  const [sessionTask, setSessionTask] = useState<Task | null>(null);
  const completedRitualIds = useMemo(() => {
    const today = todayISO();
    return new Set(
      (schedule.ritualCompletions ?? [])
        .filter((c) => c.date === today)
        .map((c) => c.ritualId)
    );
  }, [schedule.ritualCompletions, todayKey]);
  const [ritualAddOpen, setRitualAddOpen] = useState(false);
  const canAddRitual = (schedule.rituals ?? []).length < 8;
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  const [ollamaUrl, setOllamaUrl] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL) : DEFAULT_OLLAMA_URL
  );
  const [ollamaModel, setOllamaModel] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL) : DEFAULT_OLLAMA_MODEL
  );

  function openConfirm(title: string, description: string, fn: () => void) {
    setConfirmState({ title, description, onConfirm: fn });
  }

  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const hasUserScrolledTimelineRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 12 } }));

  useEffect(() => {
    hasUserScrolledTimelineRef.current = false;
  }, [activeDay]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    if (
      !ready ||
      activeTab !== 0 ||
      viewMode !== "timeline" ||
      activeDay !== todayKey ||
      editMode ||
      hasUserScrolledTimelineRef.current
    ) {
      return;
    }

    const id = requestAnimationFrame(() => {
      const timeline = timelineScrollRef.current;

      if (!timeline) return;

      const clampedNow = clamp(
        getCurrentMinutes(),
        TIMELINE_START_MINUTES,
        TIMELINE_END_MINUTES
      );

      const currentTop =
        TIMELINE_TOP_PADDING +
        ((clampedNow - TIMELINE_START_MINUTES) / 60) * HOUR_HEIGHT;

      const visibleCenterOffset = 140;

      const targetTop = clamp(
        currentTop - timeline.clientHeight / 2 + visibleCenterOffset,
        0,
        timeline.scrollHeight - timeline.clientHeight
      );

      isAutoScrollingRef.current = true;

      timeline.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });

      window.setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 450);
    });

    return () => cancelAnimationFrame(id);
  }, [
    ready,
    activeTab,
    viewMode,
    activeDay,
    todayKey,
    editMode,
  ]);



  // Auto-open templates on true first launch (no stored data)
  useEffect(() => {
    if (ready && isFirstLaunch) {
      setActiveTab(1); // Plans tab
      setTemplatesOpen(true);
    }
  }, [ready, isFirstLaunch]);

  // Reset "What's Next" dismissal whenever the user navigates to a new day
  useEffect(() => {
    setWhatNextDismissed(false);
  }, [activeDay]);

  useEffect(() => {
    // On tab wake after sleep, todayKey may be stale — correct it immediately.
    const currentKey = JS_DAYS[new Date().getDay()];
    if (todayKey !== currentKey) {
      setTodayKey(currentKey);
      return; // effect re-fires with the corrected key
    }
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const id = window.setTimeout(() => setTodayKey(JS_DAYS[new Date().getDay()]), msUntilMidnight);
    return () => window.clearTimeout(id);
  }, [todayKey]);



  // ─── Handlers ──────────────────────────────────────────────────────────────

  // ── TaskSheet open/close helpers ──────────────────────────────────────────

  function openCreateSheet(initialPid?: string | null) {
    setTaskSheetPlanId(initialPid ?? null);
    setTaskSheetTask(null);
    setTaskSheetMode("create");
    setTaskSheetInitialType("task");
    setTaskSheetOpen(true);
  }

  function openEditSheet(task: Task) {
    setTaskSheetTask(task);
    setTaskSheetPlanId(task.planId);
    setTaskSheetMode("edit");
    setTaskSheetOpen(true);
  }

  function closeTaskSheet() {
    setTaskSheetOpen(false);
    setTaskSheetTask(null);
    setTaskSheetPlanId(null);
  }

  // ── Unified create + edit save handler ────────────────────────────────────

  function handleTaskSheetSave(data: TaskSaveData) {
    if (data.taskId) {
      // Edit mode
      setSchedule(updateTaskDays(data.taskId, data.taskDraft, data.repeatDays, data.planItems));
    } else {
      // Create mode
      setSchedule(createTask(data.taskDraft, data.repeatDays, data.planItems));
    }
    closeTaskSheet();
  }

  function handleDeleteTask(taskId: string) {
    const task = Object.values(schedule.activities).flat().find((t) => t.id === taskId);
    openConfirm(
      `Delete "${task?.title ?? "task"}"?`,
      "This action cannot be undone.",
      () => setSchedule((prev) => ({
        ...prev,
        activities: Object.fromEntries(
          Object.entries(prev.activities).map(([day, tasks]) => [
            day,
            (tasks as typeof prev.activities[typeof activeDay]).filter((t) => t.id !== taskId),
          ])
        ) as typeof prev.activities,
      }))
    );
  }

  const handleToggleTaskComplete = useCallback(
    (taskId: string, allSubtaskIds: string[]) => {
      haptic("medium");
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: prev.activities[activeDay].map((t) =>
            t.id === taskId ? { ...t, ...toggleTaskComplete(t, allSubtaskIds) } : t
          ),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  const handleToggleSubtask = useCallback(
    (taskId: string, subtaskId: string) => {
      haptic("light");
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: prev.activities[activeDay].map((t) => {
            if (t.id !== taskId) return t;
            const totalSubtasks = t.subtasks?.length ?? 0;
            return { ...t, ...toggleSubtaskComplete(t, subtaskId, totalSubtasks) };
          }),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  function handleAddPlan() {
    const title = newPlanTitle.trim();
    if (!title) return;
    const plan: Plan = {
      id: uid(),
      title,
      description: newPlanDescription.trim() || undefined,
      startDate: newPlanStartDate || undefined,
      endDate: newPlanEndDate || undefined,
      category: categoryFromIcon(newPlanIconName),
      emoji: newPlanIconName,
      color: colorFromIcon(newPlanIconName),
      items: [],
      metaFields: newPlanMetaFields,
      summary: createSummaryFromMeta(newPlanMetaFields),
    };
    const trackers: ProgressTracker[] = newPlanMetaFields.map((field) => ({
      id: uid(),
      planId: plan.id,
      title: field,
      type: "number",
      unit: inferUnit(field),
    }));
    setSchedule((prev) => ({
      ...prev,
      plans: [...prev.plans, plan],
      progressTrackers: [...prev.progressTrackers, ...trackers],
    }));
    setNewPlanTitle("");
    setNewPlanDescription("");
    setNewPlanStartDate("");
    setNewPlanEndDate("");
    setNewPlanIconName("brain");
    setNewPlanMetaFields([]);
    setNewPlanMetaInput("");
    setAddingPlan(false);
  }

  function handleAddRitual(data: Omit<Ritual, "id">) {
    setSchedule((prev) => ({
      ...prev,
      rituals: [...(prev.rituals ?? []), { ...data, id: uid() }],
    }));
  }

  function handleDeleteRitual(id: string) {
    const ritual = (schedule.rituals ?? []).find((r) => r.id === id);
    openConfirm(
      `Delete "${ritual?.title ?? "routine"}"?`,
      "This routine will be removed from your daily practice.",
      () => setSchedule((prev) => ({
        ...prev,
        rituals: (prev.rituals ?? []).filter((r) => r.id !== id),
        ritualCompletions: (prev.ritualCompletions ?? []).filter((c) => c.ritualId !== id),
      }))
    );
  }

  function handleUpdateRitual(id: string, data: Omit<Ritual, "id">) {
    setSchedule((prev) => ({
      ...prev,
      rituals: (prev.rituals ?? []).map((r) => r.id === id ? { ...r, ...data, id } : r),
    }));
  }

  function handleReorderRituals(reordered: Ritual[]) {
    setSchedule((prev) => ({ ...prev, rituals: reordered }));
  }

  function handleToggleRitualComplete(id: string) {
    const today = todayISO();
    setSchedule((prev) => {
      const completions = prev.ritualCompletions ?? [];
      const exists = completions.some((c) => c.ritualId === id && c.date === today);
      return {
        ...prev,
        ritualCompletions: exists
          ? completions.filter((c) => !(c.ritualId === id && c.date === today))
          : [...completions, { ritualId: id, date: today }],
      };
    });
  }

  function handleAddGeneratedTasks(tasks: AIGeneratedTask[], planId: string, milestoneId?: string) {
    const plan = schedule.plans.find((p) => p.id === planId);
    if (!plan) return;
    setSchedule((prev) => {
      const updatedActivities = { ...prev.activities };
      const newTaskIds: string[] = [];
      for (const t of tasks) {
        const taskId = uid();
        newTaskIds.push(taskId);
        const task: Task = {
          id: taskId,
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          icon: t.icon || plan.emoji,
          color: colorFromIcon(t.icon) ?? plan.color ?? "cyan",
          planId,
          subtasks: t.subtasks.map((s) => ({ id: uid(), task: s })),
        };
        updatedActivities[t.day] = [...(updatedActivities[t.day] ?? []), task];
      }
      const updatedMilestones = milestoneId
        ? (prev.milestones ?? []).map((m) =>
            m.id === milestoneId
              ? { ...m, linkedActivities: [...(m.linkedActivities ?? []), ...newTaskIds] }
              : m
          )
        : (prev.milestones ?? []);
      return { ...prev, activities: updatedActivities, milestones: updatedMilestones };
    });
  }

  function handleLinkTrackerToMilestone(milestoneId: string, trackerId: string) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).map((m) =>
        m.id === milestoneId
          ? { ...m, linkedTrackers: [...new Set([...(m.linkedTrackers ?? []), trackerId])] }
          : m
      ),
    }));
  }

  function handleDeletePlan(planId: string) {
    const plan = schedule.plans.find((p) => p.id === planId);
    openConfirm(
      `Delete "${plan?.title ?? "plan"}"?`,
      "All tasks, trackers, and entries linked to this plan will also be deleted.",
      () => {
        setSchedule((prev) => ({
          ...prev,
          plans: prev.plans.filter((p) => p.id !== planId),
          activities: Object.fromEntries(
            DAYS.map((day) => [day, prev.activities[day].filter((t) => t.planId !== planId)])
          ) as typeof prev.activities,
          metricEntries: prev.metricEntries.filter((e) => e.planId !== planId),
          progressTrackers: prev.progressTrackers.filter((t) => t.planId !== planId),
          milestones: prev.milestones.filter((m) => m.planId !== planId),
        }));
        setSelectedPlanId((cur) => (cur === planId ? null : cur));
      }
    );
  }

  function handleAddEntry(entry: Omit<MetricEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      metricEntries: [...prev.metricEntries, { ...entry, id: uid() }],
    }));
  }

  function handleApplyTemplate(template: Template) {
    setSchedule(applyTemplate(template));
    setActiveTab(1); // Plans tab
  }

  function handleDeleteEntry(entryId: string) {
    openConfirm(
      "Delete this entry?",
      "The logged value will be permanently removed.",
      () => setSchedule((prev) => ({
        ...prev,
        metricEntries: prev.metricEntries.filter((e) => e.id !== entryId),
      }))
    );
  }

  function handleReorderTasks(activeId: string, overId: string) {
    setSchedule((prev) => {
      const sorted = sortTasksByTime(prev.activities[activeDay]);
      const activeIdx = sorted.findIndex((t) => t.id === activeId);
      const overIdx = sorted.findIndex((t) => t.id === overId);
      if (activeIdx === -1 || overIdx === -1) return prev;
      const reordered = arrayMove(sorted, activeIdx, overIdx);
      const updatedMap = new Map(reordered.map((t, i) => [t.id, { ...t, sortOrder: i * 1000 }]));
      return {
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: prev.activities[activeDay].map((t) => updatedMap.get(t.id) ?? t),
        },
      };
    });
  }

  function handleTasksDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    handleReorderTasks(String(active.id), String(over.id));
  }

  function openAddPlan() {
    setActiveTab(1);
    setSelectedPlanId(null);
    setAddingPlan(true);
  }

  function handleCreateAIPlan(data: import("@/components/plan/AIPlanCreatorSheet").AIPlanCreatorData) {
    const planId = uid();
    const plan: Plan = {
      id: planId,
      title: data.title,
      description: data.description || undefined,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      category: categoryFromIcon(data.emoji),
      emoji: data.emoji,
      color: resolveAccentColor(data.color, data.emoji),
      items: [],
      metaFields: [],
      summary: [],
    };
    setSchedule((prev) => {
      const updatedActivities = { ...prev.activities };
      for (const t of data.tasks) {
        const task: Task = {
          id: uid(),
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          icon: t.icon || plan.emoji,
          color: colorFromIcon(t.icon) ?? plan.color ?? "cyan",
          planId,
          subtasks: (t.subtasks ?? []).map((s) => ({ id: uid(), task: s })),
        };
        const day = t.day as DayKey;
        updatedActivities[day] = [...(updatedActivities[day] ?? []), task];
      }
      return { ...prev, plans: [...prev.plans, plan], activities: updatedActivities };
    });
    setAiPlanCreating(false);
    setSelectedPlanId(planId);
  }

  function handleDeleteTracker(trackerId: string) {
    const tracker = schedule.progressTrackers.find((t) => t.id === trackerId);
    openConfirm(
      `Delete "${tracker?.title ?? "tracker"}"?`,
      "All logged entries for this tracker will also be deleted.",
      () => setSchedule((prev) => ({
        ...prev,
        progressTrackers: prev.progressTrackers.filter((t) => t.id !== trackerId),
        metricEntries: prev.metricEntries.filter((e) => e.trackerId !== trackerId),
      }))
    );
  }

  function handleSaveEditPlan(planId: string) {
    const title = editPlanDraft.title.trim();
    if (!title) return;
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((p) =>
        p.id === planId
          ? {
            ...p,
            title,
            description: editPlanDraft.description.trim() || undefined,
            startDate: editPlanDraft.startDate || undefined,
            endDate: editPlanDraft.endDate || undefined,
          }
          : p
      ),
      milestones: [
        ...(prev.milestones ?? []).filter((m) => m.planId !== planId),
        ...recalculateRoadmapTimeline(
          (prev.milestones ?? []).filter((m) => m.planId === planId),
          editPlanDraft.startDate || undefined
        ),
      ],
    }));
    setEditingPlanId(null);
  }

  function handleDeleteLinkedTask(task: Task, activeDays: DayKey[]) {
    openConfirm(
      `Delete "${task.title}"?`,
      activeDays.length > 1
        ? `This task appears on ${activeDays.length} days and will be removed from all of them.`
        : "This task will be removed from the plan.",
      () => setSchedule((prev) => ({
        ...prev,
        activities: Object.fromEntries(
          DAYS.map((day) => [
            day,
            prev.activities[day].filter((t) => t.id !== task.id),
          ])
        ) as typeof prev.activities,
      }))
    );
  }

  // ─── Milestone handlers ──────────────────────────────────────────────────

  function handleAddMilestone(planId: string, data: MilestoneSaveData) {
    const now = new Date().toISOString();
    const ms: Milestone = {
      ...data,
      id: data.id ?? uid(),
      planId,
      linkedActivities: data.linkedActivities ?? [],
      linkedTrackers: data.linkedTrackers ?? [],
      createdAt: now,
      updatedAt: now,
    };
    setSchedule((prev) => {
      const plan = prev.plans.find((p) => p.id === planId);
      const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== planId);
      const planMilestones = [...(prev.milestones ?? []).filter((m) => m.planId === planId), ms];
      const roadmapStartDate = planMilestones.length === 1 ? ms.startDate : plan?.startDate;
      return {
        ...prev,
        milestones: [
          ...otherMilestones,
          ...recalculateRoadmapTimeline(planMilestones, roadmapStartDate),
        ],
      };
    });
  }

  function handleUpdateMilestone(id: string, data: Partial<Milestone>) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (() => {
        const existing = (prev.milestones ?? []).find((m) => m.id === id);
        if (!existing) return prev.milestones ?? [];
        const plan = prev.plans.find((p) => p.id === existing.planId);
        const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== existing.planId);
        const planMilestones = (prev.milestones ?? [])
          .filter((m) => m.planId === existing.planId)
          .map((m) => (m.id === id ? { ...m, ...data, updatedAt: new Date().toISOString() } : m));
        const updatedMilestone = planMilestones.find((m) => m.id === id);
        const roadmapStartDate = existing.sortOrder === 0 ? updatedMilestone?.startDate : plan?.startDate;
        return [
          ...otherMilestones,
          ...recalculateRoadmapTimeline(planMilestones, roadmapStartDate),
        ];
      })(),
    }));
  }

  function handleDeleteMilestone(id: string) {
    const milestone = (schedule.milestones ?? []).find((m) => m.id === id);
    openConfirm(
      `Delete "${milestone?.title ?? "milestone"}"?`,
      "This milestone will be permanently removed from the roadmap.",
      () => setSchedule((prev) => {
        const existing = (prev.milestones ?? []).find((m) => m.id === id);
        if (!existing) return prev;
        const plan = prev.plans.find((p) => p.id === existing.planId);
        const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== existing.planId);
        const planMilestones = (prev.milestones ?? []).filter(
          (m) => m.planId === existing.planId && m.id !== id
        );
        return {
          ...prev,
          milestones: [
            ...otherMilestones,
            ...recalculateRoadmapTimeline(planMilestones, plan?.startDate),
          ],
        };
      })
    );
  }

  function handleCompleteMilestone(id: string) {
    setSchedule((prev) => {
      const existing = (prev.milestones ?? []).find((m) => m.id === id);
      if (!existing) return prev;
      const plan = prev.plans.find((p) => p.id === existing.planId);
      const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== existing.planId);
      const completedAt = todayISO();
      const planMilestones = (prev.milestones ?? [])
        .filter((m) => m.planId === existing.planId)
        .map((m) =>
          m.id === id
            ? {
                ...m,
                status: "completed" as const,
                actualCompletedDate: completedAt,
                completionStatus: "completed" as const,
                completedDate: completedAt,
                updatedAt: new Date().toISOString(),
              }
            : m
        );
      return {
        ...prev,
        milestones: [
          ...otherMilestones,
          ...recalculateRoadmapTimeline(planMilestones, plan?.startDate),
        ],
      };
    });
  }

  // ─── Ritual week history ──────────────────────────────────────────────────

  const ritualWeekHistory = useMemo(() => {
    const today = todayISO();
    const rituals = schedule.rituals ?? [];
    const completions = schedule.ritualCompletions ?? [];
    const SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysToISO(today, i - 6);
      const jsDay = new Date(date + "T00:00:00").getDay();
      const dayKey = JS_DAYS[jsDay];
      const due = rituals.filter(
        (r) => !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(dayKey)
      ).length;
      const done = completions.filter((c) => c.date === date).length;
      return { date, label: SHORT[jsDay], isToday: date === today, completedCount: done, dueCount: due };
    });
  }, [schedule.rituals, schedule.ritualCompletions, todayKey]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const dayTasks = useMemo(
    () => sortTasksByTime(schedule.activities[activeDay]),
    [schedule.activities, activeDay]
  );

  const taskSheetActiveDays = useMemo(() => {
    if (taskSheetMode !== "edit" || !taskSheetTask) return [activeDay];

    const days = DAYS.filter((day) =>
      schedule.activities[day].some((task) => task.id === taskSheetTask.id)
    );

    return days.length > 0 ? days : [activeDay];
  }, [activeDay, schedule.activities, taskSheetMode, taskSheetTask]);

  // O(1) plan lookup — avoids .find() in every render loop iteration.
  const plansById = useMemo(() => {
    const m = new Map<string, Plan>();
    for (const p of schedule.plans) m.set(p.id, p);
    return m;
  }, [schedule.plans]);

  // Trackers to surface on Today tab — only plans with an active milestone, or plans with no milestones at all
  const activePlanTrackers = useMemo(() => {
    const activePlanIds = new Set(
      schedule.plans
        .filter((p) => {
          const planMilestones = schedule.milestones.filter((m) => m.planId === p.id);
          if (planMilestones.length === 0) return true; // no milestones → still show
          return planMilestones.some((m) => m.status === "active");
        })
        .map((p) => p.id)
    );
    return schedule.progressTrackers.filter((t) => activePlanIds.has(t.planId));
  }, [schedule.plans, schedule.milestones, schedule.progressTrackers]);

  const dayProgress = useMemo(() => {
    const total = dayTasks.length;
    const done = dayTasks.filter((t) =>
      isTaskCompleted(t, t.subtasks?.length ?? 0)
    ).length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [dayTasks, plansById]);

  // ── Today Command Center derived data ──────────────────────────────────────

  /** Reverse map: task ID → the Milestone it's linked to (if any) */
  const taskToMilestoneMap = useMemo(() => {
    const map = new Map<string, Milestone>();
    for (const m of schedule.milestones ?? []) {
      for (const taskId of m.linkedActivities ?? []) {
        map.set(taskId, m);
      }
    }
    return map;
  }, [schedule.milestones]);

  /** First uncompleted task for today, sorted by time — drives What's Next card */
  const nextTask = useMemo(() => {
    if (activeDay !== todayKey) return null;
    return dayTasks.find((t) => !isTaskCompleted(t, t.subtasks?.length ?? 0)) ?? null;
  }, [dayTasks, activeDay, todayKey]);

  /** Rituals due on the active day (for summary line) */
  const todayDueRituals = useMemo(
    () =>
      (schedule.rituals ?? []).filter(
        (r) =>
          !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(activeDay as DayKey)
      ),
    [schedule.rituals, activeDay]
  );
  const todayRitualsTotal = todayDueRituals.length;
  const todayRitualsDone = useMemo(
    () => todayDueRituals.filter((r) => completedRitualIds.has(r.id)).length,
    [todayDueRituals, completedRitualIds]
  );

  const { weekDates, weekLabel, todayMidnightTime } = useMemo(() => {
    const dates = getWeekDates(weekOffset);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return {
      weekDates: dates,
      weekLabel: dates[2].date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      todayMidnightTime: midnight.getTime(),
    };
    // todayKey ensures todayMidnightTime is refreshed when the date rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, todayKey]);

  function navigateByDays(n: number) {
    const idx = DAYS.indexOf(activeDay);
    const total = idx + n;
    if (total < 0) {
      setWeekOffset((w) => w - 1);
      setActiveDay(DAYS[7 + total] as DayKey);
    } else if (total >= 7) {
      setWeekOffset((w) => w + 1);
      setActiveDay(DAYS[total - 7] as DayKey);
    } else {
      setActiveDay(DAYS[total] as DayKey);
    }
  }

  const visibleDates = useMemo(() => {
    if (calendarView === "7day") return weekDates;
    if (calendarView === "1day") {
      const found = weekDates.find((d) => d.day === activeDay);
      return found ? [found] : weekDates.slice(0, 1);
    }
    if (calendarView === "3day") {
      const idx = weekDates.findIndex((d) => d.day === activeDay);
      const start = Math.max(0, Math.min(4, idx - 1));
      return weekDates.slice(start, start + 3);
    }
    // custom3
    return weekDates.filter((d) => customDays.includes(d.day));
  }, [calendarView, weekDates, activeDay, customDays]);

  const selectedPlan = useMemo(
    () => (selectedPlanId ? plansById.get(selectedPlanId) ?? null : null),
    [selectedPlanId, plansById]
  );

  const sessionLinkedPlan = useMemo(
    () => (sessionTask?.planId ? plansById.get(sessionTask.planId) ?? null : null),
    [sessionTask, plansById]
  );

  const getUniquePlanTasks = useCallback(
    (planId: string): Array<{ task: Task; activeDays: DayKey[] }> => {
      const seen = new Map<string, { task: Task; activeDays: DayKey[] }>();
      for (const day of DAYS) {
        for (const task of schedule.activities[day]) {
          if (task.planId !== planId) continue;
          const key = `${task.title.trim().toLowerCase()}|${task.startTime}|${task.endTime}`;
          if (!seen.has(key)) seen.set(key, { task, activeDays: [day] });
          else seen.get(key)!.activeDays.push(day);
        }
      }
      return Array.from(seen.values());
    },
    [schedule.activities]
  );

  function formatPlanRange(plan: Plan): string {
    if (!plan.startDate && !plan.endDate) return "No date range";
    if (plan.startDate && plan.endDate)
      return `${formatPlanDate(plan.startDate)} – ${formatPlanDate(plan.endDate)}`;
    if (plan.startDate) return `Starts ${formatPlanDate(plan.startDate)}`;
    return `Ends ${formatPlanDate(plan.endDate ?? "")}`;
  }


  function getTaskPresentation(task: Task) {
    const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
    return {
      linkedPlan,
      iconName: linkedPlan?.emoji ?? task.icon,
      color: linkedPlan?.color ?? task.color,
    };
  }

  const timelineTaskLayouts = useMemo(() => {
    const intervals = dayTasks
      .map((task) => {
        const start = parseTimeToMinutes(task.startTime) ?? TIMELINE_START_MINUTES;
        let end = parseTimeToMinutes(task.endTime) ?? start + 30;
        const isOvernight = end <= start;
        if (isOvernight) end += 1440;
        const cs = clamp(start, TIMELINE_START_MINUTES, TIMELINE_END_MINUTES);
        const ce = clamp(Math.max(end, cs + 15), TIMELINE_START_MINUTES, TIMELINE_END_MINUTES);
        return {
          task,
          start: cs,
          end: ce,
          isOvernight,
          isTruncated: isOvernight && end > TIMELINE_END_MINUTES,
          top: TIMELINE_TOP_PADDING + ((cs - TIMELINE_START_MINUTES) / 60) * HOUR_HEIGHT,
          height: ((ce - cs) / 60) * HOUR_HEIGHT,
          lane: 0,
          laneCount: 1,
        };
      })
      .sort((a, b) => a.start - b.start || a.end - b.end || a.task.title.localeCompare(b.task.title));

    const layouts: typeof intervals = [];
    let cluster: typeof intervals = [];
    let laneEnds: number[] = [];
    let clusterEnd = -1;

    function finishCluster() {
      const laneCount = Math.max(1, laneEnds.length);
      cluster.forEach((l) => { l.laneCount = laneCount; layouts.push(l); });
      cluster = []; laneEnds = []; clusterEnd = -1;
    }

    intervals.forEach((layout) => {
      if (cluster.length > 0 && layout.start >= clusterEnd) finishCluster();
      const lane = laneEnds.findIndex((le) => le <= layout.start);
      layout.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[layout.lane] = layout.end;
      clusterEnd = Math.max(clusterEnd, layout.end);
      cluster.push(layout);
    });
    if (cluster.length > 0) finishCluster();
    return layouts;
  }, [dayTasks]);

  function getTaskLaneStyle(layout: typeof timelineTaskLayouts[number]) {
    const gap = layout.laneCount > 1 ? 3 : 0;
    const width = 100 / layout.laneCount;
    return {
      top: layout.top,
      height: layout.height,
      left: `calc(${layout.lane * width}% + ${layout.lane > 0 ? gap / 2 : 0}px)`,
      width: `calc(${width}% - ${layout.laneCount > 1 ? gap : 0}px)`,
    };
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <main className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 dark:bg-neutral-950">
        <img src="/logo.svg" alt="PlanR" className="h-7 w-auto opacity-80 dark:hidden" />
        <img src="/logo-dark.svg" alt="PlanR" className="hidden h-7 w-auto opacity-80 dark:block" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-neutral-700 dark:bg-white/60 animate-loading-bar" />
        </div>
      </main>
    );
  }

  const editPlanDuration = daysBetween(editPlanDraft.startDate, editPlanDraft.endDate);

  // ─── Render helpers ────────────────────────────────────────────────────────

  function renderTimelineTaskCard(
    task: Task,
    cardClassName: string,
    cardSize: CardSize = "large",
    isOvernight = false,
    isTruncated = false
  ) {
    const { linkedPlan, color } = getTaskPresentation(task);
    const tone = timelineCardStyles(color);
    const duration = formatTaskDuration(task.startTime, task.endTime);
    const totalSubtasks = task.subtasks?.length ?? 0;
    const allSubtaskIds = task.subtasks?.map((i) => i.id) ?? [];
    const taskState = resolveTaskState(task, totalSubtasks);
    const done = taskState === "completed";
    const partial = taskState === "partial";

    // Completed blocks recede — preserve color identity, lower opacity
    const base = `${cardClassName} ${tone.cardBg} ${tone.blockBorder} ${tone.accentBar} transition-all duration-300${done ? " opacity-[0.52]" : ""}`;
    const titleClass = `${tone.title}${done ? " line-through decoration-neutral-400/50 dark:decoration-white/30" : ""}`;

    // ── Checkbox (small / medium / large) ─────────────────────────────────
    const checkbox = (cardSize !== "xsmall") ? (
      <motion.button
        type="button"
        whileTap={{ scale: 0.80 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        onClick={(e) => { e.stopPropagation(); handleToggleTaskComplete(task.id, allSubtaskIds); }}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
        className={`absolute top-1.5 right-1.5 z-10 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors duration-200 ${
          done || partial
            ? "border-transparent bg-green-500"
            : "border-neutral-400/45 bg-transparent dark:border-white/35"
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {done && (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.4, rotate: -15 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              <IconCheck size={9} strokeWidth={3} className="text-white" />
            </motion.span>
          )}
          {partial && (
            <motion.span
              key="partial"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.15 }}
            >
              <IconMinus size={9} strokeWidth={3} className="text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    ) : null;

    // ── xsmall (< 32px): title chip + tap to toggle ────────────────────────
    if (cardSize === "xsmall") {
      return (
        <div
          className={`${base} cursor-pointer`}
          onClick={() => handleToggleTaskComplete(task.id, allSubtaskIds)}
        >
          <div className="flex h-full items-center min-w-0">
            <span className={`text-[10px] font-semibold leading-none truncate ${titleClass}`}>
              {task.title}
            </span>
          </div>
        </div>
      );
    }

    // ── small (32–48px): plan label + title + checkbox ─────────────────────
    if (cardSize === "small") {
      return (
        <div className={`${base} relative cursor-pointer`} onClick={() => { haptic("light"); handleToggleTaskComplete(task.id, allSubtaskIds); }}>
          {checkbox}
          <div className="flex h-full flex-col justify-center gap-[2px] min-w-0 pr-5">
            {linkedPlan && (
              <p className={`text-[8px] font-bold uppercase tracking-[0.07em] truncate shrink-0 leading-none ${tone.planLabel}`}>
                {linkedPlan.title}
              </p>
            )}
            <span className={`text-[11px] font-semibold leading-snug truncate ${titleClass}`}>
              {task.title}
            </span>
          </div>
        </div>
      );
    }

    // ── medium (48–64px): plan + title + time row ──────────────────────────
    if (cardSize === "medium") {
      return (
        <div className={`${base} relative cursor-pointer`} onClick={() => { haptic("light"); handleToggleTaskComplete(task.id, allSubtaskIds); }}>
          {checkbox}
          <div className="flex h-full flex-col min-w-0 pr-5">
            {linkedPlan && (
              <p className={`text-[8px] font-bold uppercase tracking-[0.07em] truncate shrink-0 leading-none mb-[2px] ${tone.planLabel}`}>
                {linkedPlan.title}
              </p>
            )}
            <h3 className={`text-[11px] font-semibold leading-snug flex-1 min-w-0 line-clamp-2 ${titleClass}`}>
              {task.title}
            </h3>
            <div className="flex items-center gap-1 shrink-0">
              <span className={`text-[9px] font-medium leading-none shrink-0 ${tone.time}`}>
                {task.startTime}{isOvernight ? " →" : ` – ${task.endTime}`}
                {isTruncated && " ↓"}
              </span>
              {duration && (
                <span className={`shrink-0 rounded-full px-1.5 py-[1px] text-[8px] font-bold ${tone.durationBadge}`}>
                  {duration}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── large (≥ 64px): full time block layout ─────────────────────────────
    return (
      <div className={`${base} relative cursor-pointer`} onClick={() => { haptic("light"); handleToggleTaskComplete(task.id, allSubtaskIds); }}>
        {checkbox}
        <div className="flex flex-col h-full min-w-0 pr-6">
          {linkedPlan && (
            <p className={`text-[9px] font-bold uppercase tracking-[0.07em] truncate shrink-0 leading-none mb-1 ${tone.planLabel}`}>
              {linkedPlan.title}
            </p>
          )}
          <h3 className={`text-[13px] font-semibold leading-snug flex-1 min-w-0 line-clamp-2 ${titleClass}`}>
            {task.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-auto shrink-0 flex-wrap">
            <span className={`text-[10px] font-medium shrink-0 ${tone.time}`}>
              {task.startTime}{isOvernight ? " → next" : ` – ${task.endTime}`}
              {isTruncated && " ↓"}
            </span>
            {duration && (
              <span className={`shrink-0 rounded-full px-2 py-[2px] text-[9px] font-bold ${tone.durationBadge}`}>
                {duration}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Add Plan Sheet ────────────────────────────────────────────────────────

  function renderAddPlanSheet() {
    const newPlanDuration = daysBetween(newPlanStartDate, newPlanEndDate);
    return (
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow="New" title="Create Plan" onClose={() => setAddingPlan(false)} />

        <div className="space-y-2.5">
          <Input
            value={newPlanTitle}
            onChange={(e) => setNewPlanTitle(e.target.value)}
            placeholder="Plan title"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && newPlanTitle.trim()) handleAddPlan(); }}
          />
          <Input
            value={newPlanDescription}
            onChange={(e) => setNewPlanDescription(e.target.value)}
            placeholder="Short description (optional)"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Start date</p>
              <input
                type="date"
                value={newPlanStartDate}
                onChange={(e) => setNewPlanStartDate(e.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                End date{newPlanDuration ? <span className="normal-case font-normal ml-1">({newPlanDuration} days)</span> : null}
              </p>
              <input
                type="date"
                value={newPlanEndDate}
                onChange={(e) => setNewPlanEndDate(e.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          {/* Duration presets */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Quick duration</p>
            <div className="flex gap-2 flex-wrap">
              {PLAN_DURATION_PRESETS.map(({ label, days }) => {
                const today = todayISO();
                const isActive = days !== null
                  ? newPlanStartDate === today && newPlanEndDate === addDaysISO(days)
                  : newPlanStartDate === today && !newPlanEndDate;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setNewPlanStartDate(today);
                      setNewPlanEndDate(days !== null ? addDaysISO(days) : "");
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-all ${isActive
                      ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-white/20"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Icon</p>
          <div className="grid grid-cols-5 gap-1.5">
            {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
              const ic = getIconPickerStyle(name);
              const sel = newPlanIconName === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={label}
                  onClick={() => setNewPlanIconName(name)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-3 transition-all duration-150 ${sel ? `${ic.solid} scale-[1.04]` : `${ic.tint} ${ic.text} hover:scale-[1.04]`
                    }`}
                >
                  <Icon size={18} strokeWidth={1.5} />
                  <span className={`text-[9px] font-semibold leading-none ${sel ? "text-white/80" : ""}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            Progress trackers <span className="normal-case font-normal text-neutral-400">(optional)</span>
          </p>
          <div className="flex gap-2">
            <Input
              value={newPlanMetaInput}
              onChange={(e) => setNewPlanMetaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = newPlanMetaInput.trim();
                  if (val && !newPlanMetaFields.includes(val)) {
                    setNewPlanMetaFields((prev) => [...prev, val]);
                    setNewPlanMetaInput("");
                  }
                }
              }}
              placeholder="e.g. Weight, Running Distance…"
            />
            <button
              type="button"
              onClick={() => {
                const val = newPlanMetaInput.trim();
                if (val && !newPlanMetaFields.includes(val)) {
                  setNewPlanMetaFields((prev) => [...prev, val]);
                  setNewPlanMetaInput("");
                }
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              <IconPlus size={16} />
            </button>
          </div>
          {newPlanMetaFields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {newPlanMetaFields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[12px] font-medium text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300"
                >
                  {field}
                  <button
                    type="button"
                    onClick={() => setNewPlanMetaFields((prev) => prev.filter((f) => f !== field))}
                    className="opacity-50 hover:opacity-100 hover:text-red-500 transition-opacity"
                  >
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <Button fullWidth onClick={handleAddPlan} disabled={!newPlanTitle.trim()}>
          Create New Plan
        </Button>
      </div>
    );
  }

  // ─── Plan list ─────────────────────────────────────────────────────────────

  function renderPlanList() {
    const planStatsList = schedule.plans.map((p) =>
      getPlanCardStats(p, schedule.activities, todayKey)
    );
    const onTrackCount = planStatsList.filter(
      (s) => s.consistency >= 70 || s.dayState === "complete"
    ).length;
    const atRiskCount = planStatsList.filter(
      (s) => s.consistency >= 35 && s.consistency < 70
    ).length;
    const needsWorkCount = planStatsList.filter((s) => s.consistency < 35).length;

    return (
      <div className="px-4 pt-5 pb-8 lg:px-10 lg:pt-8 lg:pb-10">
        {/* Header */}
        <MainTitleSection
          label="Stay on track"
          title="My Plans"
          actions={
            <div className="flex items-center gap-2">
              {ollamaUrl && ollamaModel && (
                <button
                  type="button"
                  onClick={() => setAiPlanCreating(true)}
                  className="group relative overflow-hidden rounded-full px-4 min-h-[44px] py-[10px] text-[13px] font-bold tracking-[-0.15px] text-white shadow-[0_2px_12px_rgba(109,40,217,0.5)] transition-all active:scale-[0.97] hover:shadow-[0_2px_20px_rgba(109,40,217,0.65)] hover:brightness-110"
                  style={{ background: "linear-gradient(135deg, #6d28d9 0%, #7c3aed 50%, #a855f7 100%)" }}
                >
                  <div className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-15deg] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[250%]" />
                  <span className="relative flex items-center gap-2">
                    <IconSparkles size={14} strokeWidth={2} />
                    Plan with AI
                  </span>
                </button>
              )}
              <CtaActionButton
                label="Add New Plan"
                icon={<IconPlus size={14} strokeWidth={2.5} />}
                onClick={() => setAddingPlan(true)}
              />
            </div>
          }
          className="mb-6"
        />

        {/* Desktop stat strip */}
        {schedule.plans.length > 0 && (
          <div className="hidden lg:flex gap-3 mb-7">
            <StatTile icon={IconClipboardData} value={schedule.plans.length} label="Total Plans" colorScheme="neutral" />
            <StatTile icon={IconCheck}         value={onTrackCount}           label="On Track"    colorScheme="emerald" />
            {atRiskCount   > 0 && <StatTile icon={IconAlertTriangle} value={atRiskCount}   label="At Risk"     colorScheme="amber" />}
            {needsWorkCount > 0 && <StatTile icon={IconAlertCircle}  value={needsWorkCount} label="Needs Focus" colorScheme="rose"  />}
          </div>
        )}

        {/* Empty state */}
        {schedule.plans.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-neutral-200 p-8 text-center dark:border-white/10">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.07] mx-auto">
              <IconClipboardList size={22} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <p className="text-[15px] font-bold text-neutral-700 dark:text-neutral-300">No plans yet</p>
            <p className="mt-1 text-[13px] text-neutral-400 dark:text-neutral-500 max-w-[220px] mx-auto">
              Start from scratch or pick a template with tasks and milestones ready to go.
            </p>
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-[13px] font-bold text-white transition-opacity active:opacity-75 dark:bg-white dark:text-neutral-900"
            >
              Browse Templates
            </button>
          </div>
        )}

        {/* Plan cards — 2-col grid on desktop */}
        <div className="space-y-3 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4 lg:space-y-0">
          {schedule.plans.length > 0 && (
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="w-full rounded-2xl border border-dashed border-neutral-200 py-3 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300 lg:hidden"
            >
              + Browse example templates
            </button>
          )}
          {schedule.plans.map((plan) => {
            const uniqueTasks = getUniquePlanTasks(plan.id);
            const trackerCount = schedule.progressTrackers.filter(
              (t) => t.planId === plan.id
            ).length;
            const planIconEntry =
              SECTION_ICONS.find((e) => e.name === plan.emoji) ?? SECTION_ICONS[0];
            const { dayState, consistency } = getPlanCardStats(
              plan,
              schedule.activities,
              todayKey
            );
            const dateRange =
              plan.startDate || plan.endDate ? formatPlanRange(plan) : null;

            const firstTracker = schedule.progressTrackers.find(
              (t) => t.planId === plan.id
            );
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                PlanIcon={planIconEntry.icon}
                taskCount={uniqueTasks.length}
                trackerCount={trackerCount}
                dayState={dayState}
                consistency={consistency}
                dateRange={dateRange}
                onSelect={() => { haptic("light"); setSelectedPlanId(plan.id); }}
                onQuickLog={firstTracker ? () => setEntryTracker(firstTracker) : undefined}
              />
            );
          })}
        </div>

        {/* Desktop-only template link */}
        {schedule.plans.length > 0 && (
          <button
            type="button"
            onClick={() => setTemplatesOpen(true)}
            className="hidden lg:flex mt-5 w-full items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-3 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300"
          >
            + Browse example templates
          </button>
        )}
      </div>
    );
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#F2F2F7] text-neutral-900 dark:bg-[#111115] dark:text-white lg:flex lg:h-screen lg:overflow-hidden">

      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────────── */}
      <DesktopSidebar
        activeTab={activeTab}
        collapsed={sidebarCollapsed}
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onCreateTask={() => openCreateSheet()}
        onCreatePlan={openAddPlan}
        onCreateRitual={() => { setActiveTab(2); if (canAddRitual) setRitualAddOpen(true); }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* ── Main scrollable column ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">

      {/* ── Header (mobile only) ────────────────────────────────────────────── */}
      <div className="lg:hidden">
        {selectedPlan ? (
          <AppHeader
            back={{ label: "Plans", onBack: () => setSelectedPlanId(null) }}
            actions={[
              {
                icon: IconEdit,
                label: "Edit plan",
                onClick: () => {
                  setEditingPlanId(selectedPlan.id);
                  setEditPlanDraft({
                    title: selectedPlan.title,
                    description: selectedPlan.description ?? "",
                    startDate: selectedPlan.startDate ?? "",
                    endDate: selectedPlan.endDate ?? "",
                  });
                },
              },
              {
                icon: IconTrash,
                label: "Delete plan",
                destructive: true,
                onClick: () => handleDeletePlan(selectedPlan.id),
              },
            ]}
          />
        ) : (
          <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
        )}
      </div>


      <SettingsSheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          setOllamaUrl(localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL);
          setOllamaModel(localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL);
        }}
        onClearData={clearData}
        schedule={schedule}
      />
      <TemplatesSheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} onApply={handleApplyTemplate} />

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="max-w-full pb-40 lg:flex-1 lg:max-w-none lg:overflow-y-auto lg:pb-0">
        <AnimatePresence mode="wait" initial={false}>

        {/* ── Tasks Tab ────────────────────────────────────────────────────── */}
        {activeTab === 0 && (
          <motion.div
            key="tab-tasks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="lg:flex lg:h-full lg:overflow-hidden"
          >
            {/* ── Desktop: WeekGrid + QuickAddPanel ─────────────────────────── */}
            <div className="hidden lg:flex lg:flex-1 lg:overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <WeekGrid
                  schedule={schedule}
                  plansById={plansById}
                  weekDates={visibleDates}
                  todayKey={todayKey}
                  weekLabel={weekLabel}
                  activeDay={activeDay}
                  calendarView={calendarView}
                  customDays={customDays}
                  onDaySelect={setActiveDay}
                  onWeekPrev={() => {
                    if (calendarView === "1day") navigateByDays(-1);
                    else if (calendarView === "3day") navigateByDays(-3);
                    else setWeekOffset((w) => w - 1);
                  }}
                  onWeekNext={() => {
                    if (calendarView === "1day") navigateByDays(1);
                    else if (calendarView === "3day") navigateByDays(3);
                    else setWeekOffset((w) => w + 1);
                  }}
                  onWeekToday={() => { setWeekOffset(0); setActiveDay(todayKey); }}
                  onCalendarViewChange={setCalendarView}
                  onCustomDaysChange={setCustomDays}
                  onEditTask={openEditSheet}
                  onToggleTaskComplete={handleToggleTaskComplete}
                  plans={schedule.plans}
                  onInlineAdd={(data) => setSchedule(createTask(data.taskDraft, data.repeatDays, data.planItems))}
                />
              </div>
              <div
                className="shrink-0 border-l border-neutral-200/80 bg-white transition-[width] duration-200 dark:border-white/[0.08] dark:bg-neutral-950"
                style={{
                  width:
                    calendarView === "1day"   ? "clamp(580px, 46%, 840px)" :
                    calendarView === "3day"   ? "clamp(500px, 41%, 720px)" :
                    calendarView === "custom3"
                      ? customDays.length <= 2 ? "clamp(580px, 46%, 840px)"
                        : customDays.length <= 4 ? "clamp(500px, 41%, 720px)"
                        : "clamp(420px, 35%, 580px)"
                    : /* 7day */                 "clamp(420px, 35%, 580px)",
                }}
              >
                <QuickAddPanel
                  plans={schedule.plans}
                  activeDay={activeDay}
                  onSave={handleTaskSheetSave}
                />
              </div>
            </div>

            {/* ── Mobile: calendar strip + day task list ────────────────────── */}
            <div className="lg:hidden">
            {/* Calendar */}
            <div className="px-4 pt-4">
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[16px] font-semibold text-neutral-900 dark:text-white">
                    {weekLabel}
                  </span>
                  <div className="flex items-center gap-1">
                    {weekOffset !== 0 && (
                      <button
                        type="button"
                        onClick={() => { setWeekOffset(0); setActiveDay(todayKey); }}
                        className="inline-flex h-7 items-center rounded-lg px-2 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07] transition-colors"
                      >
                        Today
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { haptic("light"); setWeekOffset((w) => w - 1); }}
                      aria-label="Previous week"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      <IconChevronLeft size={20} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { haptic("light"); setWeekOffset((w) => w + 1); }}
                      aria-label="Next week"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      <IconChevronRight size={20} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map(({ day, date }) => {
                    const isDateToday = date.getTime() === todayMidnightTime;
                    const isActive = day === activeDay;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => { haptic("light"); setActiveDay(day); }}
                        className={`relative flex flex-col items-center justify-center gap-2.5 w-full h-[64px] rounded-lg focus-visible:outline-none ${
                          isActive
                            ? "bg-neutral-950 dark:bg-white"
                            : "hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="weekDayActive"
                            className="absolute inset-0 rounded-lg bg-neutral-950 dark:bg-white"
                            style={{ willChange: "transform" }}
                            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.5 }}
                          />
                        )}
                        <motion.div
                          whileTap={{ scale: 0.88 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="relative z-10 flex flex-col items-center gap-2.5"
                        >
                          <span className={`text-[11px] font-semibold leading-none tracking-wide ${
                            isActive ? "text-white/60 dark:text-neutral-950/60" : isDateToday ? "text-rose-500" : "text-neutral-400 dark:text-neutral-500"
                          }`}>
                            {DAY_LABELS[day]}
                          </span>
                          <span className={`text-[14px] font-semibold leading-none tabular-nums ${
                            isActive
                              ? "text-white dark:text-neutral-950"
                              : isDateToday
                              ? "text-rose-500"
                              : "text-neutral-700 dark:text-neutral-200"
                          }`}>
                            {date.getDate()}
                          </span>
                        </motion.div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeDay}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
            >
            {/* Title section */}
            <div className="px-4 pt-5 pb-5">
              <MainTitleSection
                label={
                  activeDay === todayKey && (dayProgress.total > 0 || todayRitualsTotal > 0)
                    ? `${dayProgress.done}/${dayProgress.total} tasks · ${todayRitualsDone}/${todayRitualsTotal} rituals`
                    : "My Schedule"
                }
                title="Today's Tasks"
                progressMeta={
                  dayProgress.total > 0
                    ? dayProgress.done === dayProgress.total
                      ? "done"
                      : { done: dayProgress.done, total: dayProgress.total }
                    : undefined
                }
                progressBar={dayProgress.total > 0 ? { pct: dayProgress.pct } : undefined}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => { setViewMode((v) => (v === "list" ? "timeline" : "list")); setEditMode(false); }}
                      className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-neutral-200 bg-white px-3.5 min-h-[44px] py-[9px] text-[13px] font-semibold tracking-[-0.15px] text-neutral-700 transition-colors hover:bg-neutral-100 active:scale-[0.97] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
                    >
                      {viewMode === "timeline" ? (
                        <>List <IconLayoutList size={15} strokeWidth={2} /></>
                      ) : (
                        <>Timeline <IconTable size={15} strokeWidth={2} /></>
                      )}
                    </button>
                    <IconActionButton
                      icon={<IconEdit size={16} strokeWidth={2} />}
                      saveIcon={<IconCheck size={16} strokeWidth={2.5} />}
                      saving={editMode}
                      onClick={() => setEditMode((prev) => !prev)}
                      show={dayTasks.length > 0 && viewMode === "list"}
                    />
                  </>
                }
              />
            </div>

            {/* Task content */}
            <div className="px-4">
              {/* What's Next card — only on today, only when there's an uncompleted task */}
              <AnimatePresence>
                {activeDay === todayKey && nextTask && !whatNextDismissed &&
                  plansById.get(nextTask.planId) && (
                  <WhatNextCard
                    task={nextTask}
                    plan={plansById.get(nextTask.planId)!}
                    milestone={taskToMilestoneMap.get(nextTask.id)}
                    onMarkDone={() =>
                      handleToggleTaskComplete(
                        nextTask.id,
                        nextTask.subtasks?.map((s) => s.id) ?? []
                      )
                    }
                    onDismissDay={() => setWhatNextDismissed(true)}
                  />
                )}
              </AnimatePresence>

              {/* Streak-at-risk chips — only on today */}
              {activeDay === todayKey && (
                <StreakAlertChips
                  rituals={schedule.rituals ?? []}
                  activeDay={activeDay as DayKey}
                  completedRitualIds={completedRitualIds}
                  ritualCompletions={schedule.ritualCompletions ?? []}
                />
              )}

              <TodayRitualsBar
                rituals={schedule.rituals ?? []}
                activeDay={activeDay}
                completedIds={completedRitualIds}
                onToggle={handleToggleRitualComplete}
              />
              <TrackerQuickBar
                trackers={activePlanTrackers}
                plans={schedule.plans}
                metricEntries={schedule.metricEntries}
                onLog={(tracker) => setEntryTracker(tracker)}
                onNavigate={(planId) => { setActiveTab(1); setSelectedPlanId(planId); }}
              />
              <AnimatePresence mode="wait" initial={false}>
                {viewMode === "list" ? (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {dayTasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 py-10 text-center dark:border-white/10">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.06] mx-auto mb-3">
                          <IconCalendar size={20} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
                        </div>
                        <p className="text-[14px] font-semibold text-neutral-600 dark:text-neutral-300">
                          {schedule.plans.length === 0 ? "No plans yet" : "Nothing scheduled"}
                        </p>
                        <p className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
                          {schedule.plans.length === 0
                            ? "Create a plan first, then add tasks."
                            : "Tap + to schedule your first task for this day."}
                        </p>
                      </div>
                    ) : editMode ? (
                      <DndContext sensors={sensors} onDragEnd={handleTasksDragEnd}>
                        <SortableContext items={dayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                          <div className="flex flex-col gap-3 pb-4">
                            {dayTasks.map((task) => (
                              <SortableTaskCard key={task.id} task={task}>
                                {(dragHandleProps) => (
                                  <div
                                    className="w-full min-w-0 animate-panel-in cursor-grab active:cursor-grabbing"
                                    {...dragHandleProps.attributes}
                                    {...dragHandleProps.listeners}
                                  >
                                    <ListTaskCard
                                      task={task}
                                      linkedPlan={task.planId ? plansById.get(task.planId) ?? null : null}
                                      editMode
                                      onToggleComplete={handleToggleTaskComplete}
                                      onToggleSubtask={handleToggleSubtask}
                                      onEdit={() => openEditSheet(task)}
                                      onDelete={() => handleDeleteTask(task.id)}
                                    />
                                  </div>
                                )}
                              </SortableTaskCard>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="flex flex-col gap-3 pb-4">
                        {dayTasks.map((task) => {
                          const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
                          const linkedMilestone = taskToMilestoneMap.get(task.id);
                          return (
                            <div key={task.id} className="animate-panel-in">
                              <ListTaskCard
                                task={task}
                                linkedPlan={linkedPlan}
                                onToggleComplete={handleToggleTaskComplete}
                                onToggleSubtask={handleToggleSubtask}
                                onEdit={() => openEditSheet(task)}
                                onDelete={() => handleDeleteTask(task.id)}
                                onOpenRoutine={
                                  task.taskType === "session" && (task.subtasks?.length ?? 0) > 0
                                    ? () => setSessionTask(task)
                                    : undefined
                                }
                              />
                              {linkedMilestone && (
                                <div className="mt-[-6px] px-1 pb-0.5">
                                  <span className="inline-flex items-center gap-1 rounded-b-xl bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-600 dark:bg-violet-500/[0.1] dark:text-violet-400">
                                    → {linkedMilestone.title}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="timeline"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {dayTasks.length === 0 && (
                      <div className="mb-3 rounded-2xl border border-dashed border-neutral-200 py-8 text-center dark:border-white/10">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] mx-auto mb-2">
                          <IconCalendar size={17} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
                        </div>
                        <p className="text-[13px] font-medium text-neutral-400 dark:text-neutral-500">
                          Nothing scheduled — tap + to add a task.
                        </p>
                      </div>
                    )}
                    {/* Premium execution timeline */}
                    <div
                      ref={timelineScrollRef}
                      onScroll={() => {
                        if (isAutoScrollingRef.current) return;
                        hasUserScrolledTimelineRef.current = true;
                      }}
                      className="calendar-scrollbar-none relative flex h-[calc(100vh-280px)] overflow-y-auto overflow-x-hidden"
                    >
                      {/* Time column */}
                      <div
                        className="sticky left-0 z-20 w-[44px] shrink-0 bg-[#F2F2F7] dark:bg-[#111115]"
                        style={{ height: TIMELINE_HEIGHT }}
                      >
                        {TIMELINE_HOURS.map((hour, index) => {
                          const isMidnight = hour === 24;
                          if (index === 0) return null;
                          return (
                            <div
                              key={hour}
                              className="absolute right-0 pr-2 flex flex-col items-end"
                              style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT - 6 }}
                            >
                              {isMidnight ? (
                                <span className="text-[8px] font-bold text-neutral-300 dark:text-white/20 leading-none uppercase tracking-wide">
                                  tmrw
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-neutral-400 dark:text-neutral-500 tabular-nums leading-none">
                                  {formatHourLabel(hour)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Ritual lane — dedicated column, pills start here and never cover task titles */}
                      <div
                        className="relative shrink-0 overflow-visible"
                        style={{ width: RITUAL_LANE_WIDTH, height: TIMELINE_HEIGHT }}
                      >
                        <RitualOverlayLayer
                          rituals={schedule.rituals ?? []}
                          activeDay={activeDay}
                          timelineStartMinutes={TIMELINE_START_MINUTES}
                          timelineEndMinutes={TIMELINE_END_MINUTES}
                          timelineTopPadding={TIMELINE_TOP_PADDING}
                          hourHeight={HOUR_HEIGHT}
                          completedIds={completedRitualIds}
                          onToggleComplete={handleToggleRitualComplete}
                        />
                      </div>

                      {/* Grid + tasks */}
                      <div
                        className="relative min-w-0 flex-1 border-l border-neutral-200/80 dark:border-white/[0.07]"
                        style={{ height: TIMELINE_HEIGHT }}
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 pointer-events-none">
                          {TIMELINE_HOURS.map((hour, index) => {
                            const isMidnight = hour === 24;
                            return (
                              <div key={`grid-${hour}`}>
                                <div
                                  className={`absolute left-0 right-0 ${
                                    isMidnight
                                      ? "border-t border-neutral-200 dark:border-white/[0.10]"
                                      : "border-t border-neutral-100/90 dark:border-white/[0.05]"
                                  }`}
                                  style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT }}
                                />
                                {index < TIMELINE_HOURS.length - 1 && (
                                  <div
                                    className="absolute left-0 right-0 border-t border-dashed border-neutral-100/60 dark:border-white/[0.025]"
                                    style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Task blocks */}
                        <div className="absolute inset-0">
                          {timelineTaskLayouts.map((layout) => (
                            <div
                              key={layout.task.id}
                              className="absolute min-w-0 px-0.5 py-[2px] animate-panel-in"
                              style={getTaskLaneStyle(layout)}
                            >
                              <div className="relative h-full min-h-[20px]">
                                {renderTimelineTaskCard(
                                  layout.task,
                                  "h-full rounded-[8px] px-2 py-1.5 w-full min-w-0 overflow-hidden",
                                  computeCardSize(layout.height, layout.laneCount),
                                  layout.isOvernight,
                                  layout.isTruncated
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Current time — isolated layer, owns its own 30s interval */}
                        <CurrentTimeLayer
                          activeDay={activeDay}
                          todayKey={todayKey}
                          timelineStartMinutes={TIMELINE_START_MINUTES}
                          timelineEndMinutes={TIMELINE_END_MINUTES}
                          timelineTopPadding={TIMELINE_TOP_PADDING}
                          hourHeight={HOUR_HEIGHT}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </motion.div>
            </AnimatePresence>
            </div>{/* end lg:hidden mobile section */}
          </motion.div>
        )}

        {/* ── Plan Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 1 && (
          <motion.div
            key="tab-plans"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
          <div className={selectedPlan ? "lg:mx-auto lg:max-w-3xl lg:px-8" : ""}>
          {selectedPlan ? (
            <PlanDetailView
              plan={selectedPlan}
              schedule={schedule}
              milestones={schedule.milestones ?? []}
              onAddTask={(planId) => openCreateSheet(planId)}
              onEditTask={(task) => openEditSheet(task)}
              onDeleteLinkedTask={handleDeleteLinkedTask}
              onAddTracker={(planId, title, unit, goalDirection, id) => {
                setSchedule((prev) => ({
                  ...prev,
                  progressTrackers: [
                    ...prev.progressTrackers,
                    {
                      id: id ?? uid(),
                      planId,
                      title,
                      type: "number",
                      unit: unit || undefined,
                      goalDirection,
                    },
                  ],
                }));
              }}
              onUpdateTracker={(trackerId, data) => {
                setSchedule((prev) => ({
                  ...prev,
                  progressTrackers: prev.progressTrackers.map((t) =>
                    t.id === trackerId
                      ? { ...t, ...data, unit: data.unit || undefined }
                      : t
                  ),
                }));
              }}
              onDeleteTracker={handleDeleteTracker}
              onOpenAddEntry={(tracker) => setEntryTracker(tracker)}
              onDeleteEntry={handleDeleteEntry}
              onAddMilestone={(data) => handleAddMilestone(selectedPlan.id, data)}
              onUpdateMilestone={handleUpdateMilestone}
              onDeleteMilestone={handleDeleteMilestone}
              onCompleteMilestone={handleCompleteMilestone}
              ollamaUrl={ollamaUrl}
              ollamaModel={ollamaModel}
              onAddGeneratedTasks={handleAddGeneratedTasks}
              onLinkTrackerToMilestone={handleLinkTrackerToMilestone}
            />
          ) : renderPlanList()}
          </div>
          </motion.div>
        )}
        {/* ── Routine Tab ────────────────────────────────────────────────── */}
        {activeTab === 2 && (
          <motion.div
            key="tab-routine"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <div className="lg:px-8">
              <RitualView
                rituals={schedule.rituals ?? []}
                completedIds={completedRitualIds}
                ritualCompletions={schedule.ritualCompletions ?? []}
                onToggleComplete={handleToggleRitualComplete}
                onAdd={handleAddRitual}
                onUpdate={handleUpdateRitual}
                onDelete={handleDeleteRitual}
                onReorder={handleReorderRituals}
                addOpen={ritualAddOpen}
                onAddOpenChange={setRitualAddOpen}
                weekHistory={ritualWeekHistory}
              />
            </div>
          </motion.div>
        )}

        {/* ── Review Tab ─────────────────────────────────────────────────── */}
        {activeTab === 3 && (
          <motion.div
            key="tab-review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ReviewView
              schedule={schedule}
              todayKey={todayKey}
              ritualWeekHistory={ritualWeekHistory}
              onOpenWeeklyPlan={() => setWeeklyPlanOpen(true)}
            />
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* ── Edit Plan Bottom Sheet ─────────────────────────────────────────── */}
      <BottomSheet open={!!editingPlanId} onClose={() => setEditingPlanId(null)} maxHeight="80vh">
        <div className="space-y-4 p-5 pb-8">
          <SheetHeader eyebrow="Edit" title="Plan Details" onClose={() => setEditingPlanId(null)} />
          <div className="space-y-2.5">
            <Input
              value={editPlanDraft.title}
              onChange={(e) => setEditPlanDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Plan title"
              autoFocus
            />
            <Input
              value={editPlanDraft.description}
              onChange={(e) => setEditPlanDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Short description (optional)"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Start date</p>
                <input
                  type="date"
                  value={editPlanDraft.startDate}
                  onChange={(e) => setEditPlanDraft((d) => ({ ...d, startDate: e.target.value }))}
                  className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  End date{editPlanDuration ? <span className="normal-case font-normal ml-1">({editPlanDuration} days)</span> : null}
                </p>
                <input
                  type="date"
                  value={editPlanDraft.endDate}
                  onChange={(e) => setEditPlanDraft((d) => ({ ...d, endDate: e.target.value }))}
                  className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
                />
              </div>
            </div>

            {/* Duration presets */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Quick duration</p>
              <div className="flex gap-2 flex-wrap">
                {PLAN_DURATION_PRESETS.map(({ label, days }) => {
                  const today = todayISO();
                  const isActive = days !== null
                    ? editPlanDraft.startDate === today && editPlanDraft.endDate === addDaysISO(days)
                    : editPlanDraft.startDate === today && !editPlanDraft.endDate;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setEditPlanDraft((d) => ({
                        ...d,
                        startDate: today,
                        endDate: days !== null ? addDaysISO(days) : "",
                      }))}
                      className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-all ${isActive
                        ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-white/20"
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <Button
            fullWidth
            onClick={() => editingPlanId && handleSaveEditPlan(editingPlanId)}
            disabled={!editPlanDraft.title.trim()}
          >
            Save Changes
          </Button>
        </div>
      </BottomSheet>

      {/* ── Add Plan Bottom Sheet ───────────────────────────────────────────── */}
      <BottomSheet open={addingPlan} onClose={() => setAddingPlan(false)}>
        {renderAddPlanSheet()}
      </BottomSheet>

      {/* ── AI Plan Creator Sheet ──────────────────────────────────────────── */}
      <AIPlanCreatorSheet
        open={aiPlanCreating}
        onClose={() => setAiPlanCreating(false)}
        onCreatePlan={handleCreateAIPlan}
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        existingPlans={schedule.plans.map((p) => ({ title: p.title, category: p.category, description: p.description }))}
      />

      {/* ── Bottom Nav (mobile only) ───────────────────────────────────────── */}
      <div className="lg:hidden">
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
          onCreateTask={() => openCreateSheet()}
          onCreatePlan={openAddPlan}
          onCreateRitual={() => { setActiveTab(2); if (canAddRitual) setRitualAddOpen(true); }}
        />
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <TaskSheet
        mode={taskSheetMode}
        task={taskSheetTask}
        plans={schedule.plans}
        activeDay={activeDay}
        activeDays={taskSheetActiveDays}
        isOpen={taskSheetOpen}
        initialPlanId={taskSheetPlanId}
        initialTaskType={taskSheetInitialType}
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        onClose={closeTaskSheet}
        onSave={handleTaskSheetSave}
        onDuplicate={(data) => {
          const newId = uid();
          const newTask: Task = { ...data.taskDraft, id: newId };
          const days = data.repeatDays.length > 0 ? data.repeatDays : [activeDay];
          setSchedule((prev) => ({
            ...prev,
            activities: days.reduce(
              (acc, day) => ({ ...acc, [day]: [...acc[day], newTask] }),
              { ...prev.activities }
            ),
          }));
          closeTaskSheet();
          setToastMessage("Task duplicated");
          setTimeout(() => openEditSheet(newTask), 350);
        }}
      />

      <AddEntryModal
        isOpen={!!entryTracker}
        onClose={() => setEntryTracker(null)}
        onSave={(value, date) => {
          if (!entryTracker) return;
          handleAddEntry({
            planId: entryTracker.planId,
            trackerId: entryTracker.id,
            value,
            date,
          });
        }}
        metric={
          entryTracker
            ? { name: entryTracker.title, unit: entryTracker.unit ?? "" }
            : undefined
        }
      />

      <SessionSheet
        isOpen={!!sessionTask}
        task={sessionTask}
        linkedPlan={sessionLinkedPlan}
        onClose={() => setSessionTask(null)}
        onComplete={(taskId, allIds) => {
          handleToggleTaskComplete(taskId, allIds);
          setSessionTask(null);
        }}
        onEdit={() => {
          if (sessionTask) openEditSheet(sessionTask);
          setSessionTask(null);
        }}
      />

      <ConfirmSheet
        open={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
      />

      {/* ── Weekly Plan Sheet ────────────────────────────────────────────────── */}
      <WeeklyPlanSheet
        open={weeklyPlanOpen}
        onClose={() => setWeeklyPlanOpen(false)}
        schedule={schedule}
        ollamaUrl={ollamaUrl}
        ollamaModel={ollamaModel}
        onAddTasks={(tasks, planId) => handleAddGeneratedTasks(tasks, planId)}
      />

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-28 lg:bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg dark:bg-white dark:text-neutral-900"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
      </div>{/* end main scrollable column */}

      {/* ── Theme toggle FAB — desktop only ────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 hidden lg:block">
        <ThemeToggle />
      </div>

    </main>
  );
}
