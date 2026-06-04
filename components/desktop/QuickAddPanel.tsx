"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconFileImport,
  IconPlus,
  IconStack2,
  IconTable,
  IconX,
} from "@tabler/icons-react";
import { PlanSelector } from "@/components/task/PlanSelector";
import type { Plan, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { inputToDisplayTime, uid } from "@/lib/taskMutations";
import {
  currentMinutes,
  minutesToInputTime,
  parseTimeToMinutes,
} from "@/lib/timeUtils";
import type { TaskSaveData } from "@/components/task/TaskSheet";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { BulkImportFlow } from "@/components/BulkImportSheet";
import type { ParsedDay } from "@/lib/scheduleParser";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

const QUICK_START: { label: string; minutes: () => number }[] = [
  { label: "Now", minutes: () => currentMinutes() },
  { label: "Morning", minutes: () => 9 * 60 },
  { label: "Afternoon", minutes: () => 14 * 60 },
  { label: "Evening", minutes: () => 19 * 60 },
];

const DURATIONS: { label: string; mins: number }[] = [
  { label: "15m", mins: 15 },
  { label: "30m", mins: 30 },
  { label: "45m", mins: 45 },
  { label: "1h", mins: 60 },
  { label: "90m", mins: 90 },
  { label: "2h", mins: 120 },
];

interface SubtaskDraft {
  id: string;
  title: string;
  duration: string;
}

interface QuickAddPanelProps {
  plans: Plan[];
  activeDay: DayKey;
  onSave: (data: TaskSaveData) => void;
  onBulkImport: (days: ParsedDay[]) => void;
}

function isValidInputTime(v: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export function QuickAddPanel({ plans, activeDay, onSave, onBulkImport }: QuickAddPanelProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single");

  const [planId, setPlanId] = useState<string>(() => plans[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<"task" | "session">("task");
  const [startTime, setStartTime] = useState(""); // HH:MM
  const [endTime, setEndTime] = useState("");      // HH:MM
  const [repeatDays, setRepeatDays] = useState<DayKey[]>([activeDay]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);

  const subRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Keep planId valid when plans change
  useEffect(() => {
    if (!plans.find((p) => p.id === planId)) setPlanId(plans[0]?.id ?? "");
  }, [plans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active day when parent changes it
  useEffect(() => {
    setRepeatDays([activeDay]);
  }, [activeDay]);

  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const allDays = repeatDays.length === DAYS.length;
  const canSubmit = !!selectedPlan && title.trim().length > 0 && repeatDays.length > 0;

  function reset() {
    setTitle("");
    setTaskType("task");
    setStartTime("");
    setEndTime("");
    setSubtasks([]);
    setRepeatDays([activeDay]);
  }

  function applyDuration(mins: number) {
    const start = startTime && isValidInputTime(startTime) ? parseTimeToMinutes(startTime) : null;
    const base = start ?? currentMinutes();
    if (!startTime) setStartTime(minutesToInputTime(base));
    setEndTime(minutesToInputTime(base + mins));
  }

  function toggleDay(d: DayKey) {
    setRepeatDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function addSubtask() {
    const s: SubtaskDraft = { id: uid(), title: "", duration: "" };
    setSubtasks((prev) => [...prev, s]);
    setTimeout(() => subRefs.current[s.id]?.focus(), 30);
  }

  function updateSubtask(id: string, patch: Partial<SubtaskDraft>) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function deleteSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  function handleSubmit() {
    if (!canSubmit || !selectedPlan) return;
    const startDisplay = isValidInputTime(startTime) ? inputToDisplayTime(startTime) : "";
    const endDisplay = isValidInputTime(endTime) ? inputToDisplayTime(endTime) : "";
    const validSubtasks = subtasks
      .filter((s) => s.title.trim().length > 0)
      .map((s) => ({ id: s.id, task: s.title.trim(), duration: s.duration.trim() || undefined } as ScheduleEntry));
    onSave({
      taskDraft: {
        title: title.trim(),
        startTime: startDisplay,
        endTime: endDisplay,
        icon: selectedPlan.emoji,
        color: selectedPlan.color,
        planId: selectedPlan.id,
        taskType,
        subtasks: validSubtasks.length > 0 ? validSubtasks : undefined,
      },
      taskId: undefined,
      repeatDays,
      planItems: null,
    });
    reset();
  }

  const pill = (active: boolean) =>
    `rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
      active
        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20"
    }`;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex h-[60px] shrink-0 items-center px-5 dark:border-white/[0.06]">
        <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white">Quick Task Add</h2>
      </div>

      {/* Mode tabs — pt clears the floating top-right theme/avatar pill (~78px tall) */}
      <div className="px-5 pt-7">
        <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-white/[0.05]">
          {([
            { key: "single", label: "Single Task", Icon: IconTable },
            { key: "bulk", label: "Bulk Upload", Icon: IconFileImport },
          ] as const).map(({ key, label, Icon }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neutral-900/15 dark:focus-visible:ring-white/20 ${
                  active
                    ? "bg-white text-neutral-900 shadow-[0_1px_2px_rgba(10,10,10,0.06)] ring-1 ring-black/[0.04] dark:bg-neutral-800 dark:text-white dark:ring-white/10"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                <Icon size={15} strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk upload */}
      {mode === "bulk" && (
        <div className="px-5 py-4">
          <BulkImportFlow plans={plans} fallbackDay={activeDay} onCommit={onBulkImport} onDone={() => {}} />
        </div>
      )}

      {/* Single task */}
      {mode === "single" && (
        <div className="flex flex-col gap-5 px-5 py-4">
          {/* Plan */}
          <PlanSelector plans={plans} selectedId={planId} onSelect={(p) => setPlanId(p.id)} />

          {/* Title */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className={SECTION_LABEL}>Title</p>
              <span className="text-[11px] font-medium text-neutral-300 dark:text-neutral-600">{title.length}/80</span>
            </div>
            <input
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSubmit(); } }}
              placeholder="What are you working on?"
              className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-neutral-900 outline-none transition-colors placeholder:text-neutral-300 focus:border-neutral-400 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20"
            />
          </div>

          {/* Task / Session toggle */}
          <button
            type="button"
            onClick={() => setTaskType((t) => (t === "task" ? "session" : "task"))}
            className="flex items-center gap-2.5"
          >
            {taskType === "session"
              ? <IconStack2 size={20} strokeWidth={2} className="text-neutral-700 dark:text-neutral-200" />
              : <IconCalendarEvent size={20} strokeWidth={2} className="text-neutral-700 dark:text-neutral-200" />}
            <span className="flex-1 text-left text-[15px] font-bold text-neutral-900 dark:text-white">
              {taskType === "session" ? "Session" : "Task"}
            </span>
            <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              taskType === "session" ? "bg-emerald-500" : "bg-neutral-200 dark:bg-white/15"
            }`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                taskType === "session" ? "left-0.5 translate-x-5" : "left-0.5"
              }`} />
            </span>
          </button>

          {/* Time slot */}
          <div>
            <p className={`mb-1.5 ${SECTION_LABEL}`}>Time slot</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { label: "Start", value: startTime, set: setStartTime },
                { label: "End", value: endTime, set: setEndTime },
              ] as const).map(({ label, value, set }) => (
                <div key={label}>
                  <p className="mb-1 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{label}</p>
                  <div className="relative">
                    <IconClock size={14} strokeWidth={2} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="time"
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-8 pr-2 text-[13px] font-semibold tabular-nums text-neutral-900 outline-none transition-colors focus:border-neutral-400 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick start */}
            <p className={`mb-1.5 mt-3 ${SECTION_LABEL}`}>Quick start</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_START.map((q) => {
                const active = startTime === minutesToInputTime(q.minutes());
                return (
                  <button key={q.label} type="button" onClick={() => setStartTime(minutesToInputTime(q.minutes()))} className={pill(active)}>
                    {q.label}
                  </button>
                );
              })}
            </div>

            {/* Duration */}
            <p className={`mb-1.5 mt-3 ${SECTION_LABEL}`}>Duration</p>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button key={d.label} type="button" onClick={() => applyDuration(d.mins)} className={pill(false)}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-400 dark:text-neutral-500">
              Pick a start time, then tap a duration for end-time.
            </p>
          </div>

          {/* Visible on */}
          <div>
            <p className={`mb-1.5 ${SECTION_LABEL}`}>Visible on</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setRepeatDays(allDays ? [activeDay] : [...DAYS])}
                className={pill(allDays)}
              >
                All days
              </button>
              {DAYS.map((d) => (
                <button key={d} type="button" onClick={() => toggleDay(d)} className={pill(repeatDays.includes(d) && !allDays)}>
                  {DAY_LABELS[d].slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <AnimatePresence initial={false}>
              {subtasks.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-2 flex flex-col gap-1 overflow-hidden"
                >
                  {subtasks.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-1.5">
                      <span className="w-3 shrink-0 text-center text-[11px] text-neutral-300 dark:text-neutral-600">↳</span>
                      <input
                        ref={(el) => { subRefs.current[sub.id] = el; }}
                        value={sub.title}
                        onChange={(e) => updateSubtask(sub.id, { title: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addSubtask(); }
                          else if (e.key === "Backspace" && sub.title === "") { e.preventDefault(); deleteSubtask(sub.id); }
                        }}
                        placeholder="Subtask…"
                        className="h-9 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 text-[13px] text-neutral-800 outline-none placeholder:text-neutral-300 transition-colors focus:border-neutral-400 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20"
                      />
                      <input
                        value={sub.duration}
                        onChange={(e) => updateSubtask(sub.id, { duration: e.target.value })}
                        placeholder="5m"
                        className="h-9 w-[52px] shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 px-1.5 text-center text-[12px] font-semibold text-neutral-700 outline-none placeholder:text-neutral-300 transition-colors focus:border-neutral-400 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:placeholder:text-neutral-600 dark:focus:border-white/20"
                      />
                      <button type="button" onClick={() => deleteSubtask(sub.id)} className="flex h-7 w-6 items-center justify-center rounded text-neutral-300 transition-colors hover:text-rose-400 dark:text-neutral-600">
                        <IconX size={12} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={addSubtask}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 py-2.5 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300"
            >
              <IconPlus size={14} strokeWidth={2.5} /> Add Subtask
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-[14px] font-bold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-950"
            >
              <IconCheck size={15} strokeWidth={2.5} /> Add Task
            </button>
            <button
              type="button"
              onClick={reset}
              aria-label="Clear"
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/[0.05]"
            >
              <IconX size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
