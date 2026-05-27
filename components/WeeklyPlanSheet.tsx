"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import { IconBolt, IconCheck } from "@tabler/icons-react";
import type { Schedule, DayKey, Plan } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { isTaskCompleted } from "@/lib/taskCompletion";
import type { AIGeneratedTask } from "@/lib/aiActions";
import { streamWeeklyPlan, parseGeneratedTasks } from "@/lib/aiActions";

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeeklyPlanSheetProps {
  open: boolean;
  onClose: () => void;
  schedule: Schedule;
  ollamaUrl: string;
  ollamaModel: string;
  onAddTasks: (tasks: AIGeneratedTask[], planId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const dow = d.getDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - daysBack);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

const JS_DAYS: DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

interface WeeklySummary {
  missedCount: number;
  missedSample: string[];
  laggingCount: number;
  laggingSample: string[];
  habitsMissed: number;
  contextString: string;
}

function buildWeeklySummary(schedule: Schedule): WeeklySummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString().slice(0, 10);
  const monday = getMondayOf(today);

  // Incomplete tasks from past days this week (skip today and future)
  const missed: string[] = [];
  DAYS.forEach((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (d >= today) return;
    for (const t of schedule.activities[day] ?? []) {
      if (!isTaskCompleted(t, t.subtasks?.length ?? 0)) {
        const plan = schedule.plans.find((p) => p.id === t.planId);
        missed.push(`"${t.title}"${plan ? ` (${plan.title})` : ""}`);
      }
    }
  });

  // Lagging / overdue milestones
  const lagging = (schedule.milestones ?? [])
    .filter(
      (m) =>
        m.status === "delayed" ||
        (m.status === "active" && m.plannedEndDate < todayISO)
    )
    .map((m) => {
      const plan = schedule.plans.find((p) => p.id === m.planId);
      const daysOver = Math.max(
        0,
        Math.round(
          (Date.now() - new Date(m.plannedEndDate + "T00:00:00").getTime()) /
            86_400_000
        )
      );
      return `"${m.title}"${plan ? ` in ${plan.title}` : ""}${daysOver > 0 ? ` (${daysOver}d overdue)` : ""}`;
    });

  // Habits missed this week
  const completions = schedule.ritualCompletions ?? [];
  let habitsMissed = 0;
  DAYS.forEach((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (d >= today) return;
    const dateISO = d.toISOString().slice(0, 10);
    const jsDay = JS_DAYS[d.getDay()];
    for (const ritual of schedule.rituals ?? []) {
      const isDue =
        !ritual.repeatDays ||
        ritual.repeatDays.length === 0 ||
        ritual.repeatDays.includes(jsDay);
      if (!isDue) continue;
      if (!completions.some((c) => c.ritualId === ritual.id && c.date === dateISO))
        habitsMissed++;
    }
  });

  const contextParts: string[] = [];
  if (missed.length > 0)
    contextParts.push(`Missed tasks: ${missed.slice(0, 6).join(", ")}`);
  else contextParts.push("No tasks missed this week");
  if (lagging.length > 0)
    contextParts.push(`Lagging milestones: ${lagging.slice(0, 4).join(", ")}`);
  if (habitsMissed > 0)
    contextParts.push(`${habitsMissed} habit sessions missed`);

  return {
    missedCount: missed.length,
    missedSample: missed.slice(0, 3).map((s) => s.replace(/^"|".*$/g, "").split('" (')[0]),
    laggingCount: lagging.length,
    laggingSample: lagging.slice(0, 2).map((s) => s.replace(/^"|".*$/g, "").split('" in')[0]),
    habitsMissed,
    contextString: contextParts.join(". "),
  };
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function StatChip({
  value,
  label,
  warn,
}: {
  value: number;
  label: string;
  warn: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-center ${
        warn && value > 0
          ? "bg-amber-50 dark:bg-amber-500/[0.08]"
          : "bg-neutral-50 dark:bg-white/[0.03]"
      }`}
    >
      <p
        className={`text-[22px] font-extrabold tabular-nums leading-none ${
          warn && value > 0
            ? "text-amber-600 dark:text-amber-400"
            : "text-neutral-950 dark:text-white"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-medium leading-tight text-neutral-400 dark:text-neutral-500">
        {label}
      </p>
    </div>
  );
}

function TaskPreviewCard({
  task,
  selected,
  onToggle,
}: {
  task: AIGeneratedTask;
  selected: boolean;
  onToggle: () => void;
}) {
  const timeLabel =
    task.startTime && task.endTime
      ? `${task.startTime}–${task.endTime}`
      : task.startTime ?? "";
  const dayLabel = DAY_LABELS[task.day] ?? task.day;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]"
          : "border-neutral-100 bg-white dark:border-white/[0.06] dark:bg-neutral-900"
      }`}
    >
      {/* Checkbox ring */}
      <div
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          selected
            ? "border-emerald-500 bg-emerald-500"
            : "border-neutral-300 dark:border-neutral-600"
        }`}
      >
        {selected && <IconCheck size={9} strokeWidth={3} className="text-white" />}
      </div>
      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-neutral-900 dark:text-white">
          {task.title}
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
          {dayLabel}
          {timeLabel ? ` · ${timeLabel}` : ""}
          {task.subtasks.length > 0 ? ` · ${task.subtasks.length} steps` : ""}
        </p>
      </div>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Phase = "review" | "generating" | "accept";

export default function WeeklyPlanSheet({
  open,
  onClose,
  schedule,
  ollamaUrl,
  ollamaModel,
  onAddTasks,
}: WeeklyPlanSheetProps) {
  const [phase, setPhase] = useState<Phase>("review");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [suggestedTasks, setSuggestedTasks] = useState<AIGeneratedTask[]>([]);
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set());
  const [genError, setGenError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset state whenever the sheet opens
  useEffect(() => {
    if (open) {
      setPhase("review");
      setSelectedPlanId(null);
      setSuggestedTasks([]);
      setSelectedIdxs(new Set());
      setGenError(null);
    } else {
      abortRef.current?.abort();
    }
  }, [open]);

  const summary = useMemo(() => buildWeeklySummary(schedule), [schedule]);

  // Plans that are actively used (have tasks or milestones)
  const activePlans = useMemo(
    () =>
      schedule.plans.filter(
        (p) =>
          DAYS.some((d) => (schedule.activities[d] ?? []).some((t) => t.planId === p.id)) ||
          (schedule.milestones ?? []).some((m) => m.planId === p.id)
      ),
    [schedule.plans, schedule.activities, schedule.milestones]
  );

  const focusPlan: Plan | null =
    activePlans.find((p) => p.id === selectedPlanId) ?? activePlans[0] ?? null;

  const generate = useCallback(async () => {
    if (!focusPlan) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPhase("generating");
    setGenError(null);

    let fullText = "";
    try {
      const stream = streamWeeklyPlan(
        ollamaUrl,
        ollamaModel,
        focusPlan,
        summary.contextString,
        ctrl.signal
      );
      for await (const chunk of stream) {
        if (ctrl.signal.aborted) break;
        fullText += chunk;
      }
      const parsed = parseGeneratedTasks(fullText);
      if (parsed.length === 0) throw new Error("No tasks generated — try again");
      setSuggestedTasks(parsed);
      setSelectedIdxs(new Set(parsed.map((_, i) => i)));
      setPhase("accept");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setGenError(
        err instanceof Error ? err.message : "Generation failed. Is Ollama running?"
      );
      setPhase("review");
    }
  }, [focusPlan, ollamaUrl, ollamaModel, summary.contextString]);

  const handleAdd = useCallback(() => {
    if (!focusPlan || suggestedTasks.length === 0) return;
    const toAdd = suggestedTasks.filter((_, i) => selectedIdxs.has(i));
    if (toAdd.length === 0) return;
    onAddTasks(toAdd, focusPlan.id);
    onClose();
  }, [focusPlan, suggestedTasks, selectedIdxs, onAddTasks, onClose]);

  const toggleTask = (i: number) =>
    setSelectedIdxs((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const selectedCount = selectedIdxs.size;

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="90dvh">
      <div className="px-4 pb-2 pt-4">
        <SheetHeader eyebrow="AI Planning" title="Plan Next Week" onClose={onClose} />
      </div>

      <div className="space-y-5 overflow-y-auto px-4 pb-8 pt-4">

        {/* ── Review + generate ─────────────────────────────────────────────── */}
        {(phase === "review" || phase === "generating") && (
          <>
            {/* Stats chips */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                This Week So Far
              </p>
              <div className="grid grid-cols-3 gap-2">
                <StatChip
                  value={summary.missedCount}
                  label="tasks missed"
                  warn={summary.missedCount > 0}
                />
                <StatChip
                  value={summary.laggingCount}
                  label="milestones lagging"
                  warn={summary.laggingCount > 0}
                />
                <StatChip
                  value={summary.habitsMissed}
                  label="habits missed"
                  warn={summary.habitsMissed > 0}
                />
              </div>

              {/* Sample labels */}
              {(summary.missedSample.length > 0 || summary.laggingSample.length > 0) && (
                <div className="mt-2 space-y-0.5">
                  {summary.missedSample.map((t, i) => (
                    <p key={`m${i}`} className="text-[12px] text-neutral-500 dark:text-neutral-400">
                      · {t}
                    </p>
                  ))}
                  {summary.missedCount > summary.missedSample.length && (
                    <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
                      · +{summary.missedCount - summary.missedSample.length} more tasks
                    </p>
                  )}
                  {summary.laggingSample.map((m, i) => (
                    <p key={`l${i}`} className="text-[12px] text-amber-600 dark:text-amber-400">
                      ⚠ {m}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Plan selector */}
            {activePlans.length > 1 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  Focus Plan for Next Week
                </p>
                <div className="flex flex-wrap gap-2">
                  {activePlans.map((plan) => {
                    const isActive =
                      plan.id === (selectedPlanId ?? activePlans[0]?.id);
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                          isActive
                            ? "bg-violet-600 text-white"
                            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.07] dark:text-neutral-300 dark:hover:bg-white/[0.12]"
                        }`}
                      >
                        <span>{plan.emoji}</span>
                        <span>{plan.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Error */}
            {genError && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-600 dark:bg-rose-500/[0.08] dark:text-rose-400">
                {genError}
              </p>
            )}

            {/* Generate CTA / spinner */}
            {phase === "review" ? (
              <button
                type="button"
                onClick={generate}
                disabled={!focusPlan}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40"
              >
                <IconBolt size={15} strokeWidth={2.5} />
                Generate plan for{" "}
                {focusPlan ? `${focusPlan.emoji} ${focusPlan.title}` : "…"}
              </button>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-violet-400" />
                </div>
                <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
                  Generating your next-week plan…
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Accept / edit phase ───────────────────────────────────────────── */}
        {phase === "accept" && suggestedTasks.length > 0 && (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  Suggested Tasks ({suggestedTasks.length})
                </p>
                <button
                  type="button"
                  onClick={() => setPhase("review")}
                  className="text-[11px] text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                  ← Regenerate
                </button>
              </div>

              <div className="space-y-2">
                {suggestedTasks.map((t, i) => (
                  <TaskPreviewCard
                    key={i}
                    task={t}
                    selected={selectedIdxs.has(i)}
                    onToggle={() => toggleTask(i)}
                  />
                ))}
              </div>
            </div>

            {/* Target plan reminder */}
            {focusPlan && (
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
                Tasks will be added to{" "}
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  {focusPlan.emoji} {focusPlan.title}
                </span>
              </p>
            )}

            {/* Action row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAdd}
                disabled={selectedCount === 0}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-40"
              >
                <IconCheck size={15} strokeWidth={2.5} />
                Add {selectedCount} task{selectedCount !== 1 ? "s" : ""}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl px-4 py-3.5 text-[13px] font-medium text-neutral-400 transition-colors hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
