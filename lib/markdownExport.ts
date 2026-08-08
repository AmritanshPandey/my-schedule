/**
 * Markdown export — human- and AI-readable summaries of the schedule.
 *
 * Complements the full JSON backup (lib/backup.ts). Where the JSON dump is for
 * round-tripping data, these Markdown builders are for *analysis*: paste a plan,
 * the weekly consistency history, or the full task list into an AI chat and ask
 * it to review execution. Pure string builders + a browser-download helper.
 */

import type { Schedule, Task, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import { formatSlotsRange, formatSlotsDuration } from "@/lib/timeUtils";
import { getSlots } from "@/lib/taskMutations";
import { isTrackedTask } from "@/lib/taskCompletion";
import { calculateWeeklyHistory } from "@/lib/consistency/calculateWeeklyStats";

// ── Shared helpers ──────────────────────────────────────────────────────────

interface TaskWithDays {
  task: Task;
  days: DayKey[];
}

/**
 * Collect each unique task once (a recurring task lives in several weekday
 * buckets under the same id) along with the weekdays it runs on.
 */
function collectTasks(schedule: Schedule): TaskWithDays[] {
  const map = new Map<string, TaskWithDays>();
  for (const day of DAYS) {
    for (const t of schedule.activities[day] ?? []) {
      const existing = map.get(t.id);
      if (existing) existing.days.push(day);
      else map.set(t.id, { task: t, days: [day] });
    }
  }
  return [...map.values()];
}

function daysLabel(days: DayKey[]): string {
  if (days.length === 7) return "Every day";
  return days.map((d) => DAY_LABELS[d]).join(", ");
}

/** Count of full-task completions and the most recent completion date. */
function completionSummary(task: Task): { count: number; last: string | null } {
  const events = (task.completionHistory ?? []).filter((e) => e.completionType === "task");
  let last: string | null = null;
  for (const e of events) {
    const d = e.completedAt.slice(0, 10);
    if (!last || d > last) last = d;
  }
  return { count: events.length, last };
}

function taskLine(task: Task): string {
  const range = formatSlotsRange(getSlots(task));
  const dur = formatSlotsDuration(getSlots(task));
  const bits = [range, dur].filter(Boolean).join(" · ");
  const type = task.taskType && task.taskType !== "task" ? ` _(${task.taskType})_` : "";
  return `${task.title}${type}${bits ? ` — ${bits}` : ""}`;
}

function docHeader(title: string): string {
  return `# ${title}\n\n_Exported from PlanR on ${localISODate(new Date())}_\n\n`;
}

// ── Builders ────────────────────────────────────────────────────────────────

/** All plans with their linked tasks and subtasks. */
export function plansToMarkdown(schedule: Schedule): string {
  const tasks = collectTasks(schedule);
  let md = docHeader("PlanR — Plans");

  if (schedule.plans.length === 0) {
    md += "_No plans yet._\n";
    return md;
  }

  for (const plan of schedule.plans) {
    md += `## ${plan.emoji ? `${plan.emoji} ` : ""}${plan.title}\n\n`;
    if (plan.description) md += `${plan.description}\n\n`;
    if (plan.startDate || plan.endDate) {
      md += `**Dates:** ${plan.startDate ?? "—"} → ${plan.endDate ?? "ongoing"}\n\n`;
    }
    if (plan.goals && plan.goals.length > 0) {
      md += `**Goals:**\n`;
      for (const g of plan.goals) {
        md += `- ${g.metric} ${g.direction} ${g.target}${g.unit ? ` ${g.unit}` : ""}${g.deadline ? ` _(by ${g.deadline})_` : ""}\n`;
      }
      md += `\n`;
    }

    const planTasks = tasks.filter((t) => t.task.planId === plan.id);
    if (planTasks.length === 0) {
      md += `_No tasks._\n\n`;
      continue;
    }
    md += `**Tasks:**\n`;
    for (const { task, days } of planTasks) {
      md += `- **${taskLine(task)}** — ${daysLabel(days)}\n`;
      const subtasks = task.subtasks ?? [];
      for (const s of subtasks) {
        md += `  - ${s.task}${s.duration ? ` _(${s.duration})_` : ""}\n`;
      }
    }
    md += `\n`;
  }
  return md;
}

/** Weekly consistency history per plan (scheduled / completed / %). */
export function weekliesToMarkdown(schedule: Schedule): string {
  const today = localISODate(new Date());
  let md = docHeader("PlanR — Weekly Consistency");

  const activities = schedule.activities as Record<DayKey, Task[]>;
  let any = false;
  for (const plan of schedule.plans) {
    const weeks = calculateWeeklyHistory(plan.id, activities, today);
    if (weeks.length === 0) continue;
    any = true;
    md += `## ${plan.emoji ? `${plan.emoji} ` : ""}${plan.title}\n\n`;
    md += `| Week | Dates | Scheduled | Completed | % | Trend |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;
    for (const w of weeks) {
      const trend = w.trendVsPrev == null ? "—" : `${w.trendVsPrev >= 0 ? "+" : ""}${w.trendVsPrev}%`;
      md += `| ${w.label} | ${w.weekStart} → ${w.weekEnd} | ${w.scheduled} | ${w.completed} | ${w.pct}% | ${trend} |\n`;
    }
    md += `\n`;
  }
  if (!any) md += "_No weekly data yet._\n";
  return md;
}

/** Every task with its schedule, type, subtasks and completion summary. */
export function tasksToMarkdown(schedule: Schedule): string {
  const tasks = collectTasks(schedule);
  let md = docHeader("PlanR — Tasks");

  if (tasks.length === 0) {
    md += "_No tasks yet._\n";
    return md;
  }

  const planTitle = (id: string) => schedule.plans.find((p) => p.id === id)?.title ?? "—";

  for (const { task, days } of tasks) {
    md += `## ${task.title}\n\n`;
    md += `- **When:** ${daysLabel(days)}`;
    const range = formatSlotsRange(getSlots(task));
    if (range) md += ` · ${range}`;
    const dur = formatSlotsDuration(getSlots(task));
    if (dur) md += ` · ${dur}`;
    md += `\n`;
    md += `- **Type:** ${task.taskType ?? "task"}\n`;
    if (task.planId) md += `- **Plan:** ${planTitle(task.planId)}\n`;
    if (task.activeFrom || task.activeUntil) {
      md += `- **Active:** ${task.activeFrom ?? "—"} → ${task.activeUntil ?? "ongoing"}\n`;
    }
    if (isTrackedTask(task)) {
      const c = completionSummary(task);
      md += `- **Completions:** ${c.count}${c.last ? ` (last ${c.last})` : ""}\n`;
    }
    const subtasks = task.subtasks ?? [];
    if (subtasks.length > 0) {
      md += `- **Subtasks:**\n`;
      for (const s of subtasks) {
        md += `  - ${s.task}${s.duration ? ` _(${s.duration})_` : ""}\n`;
      }
    }
    md += `\n`;
  }
  return md;
}

// ── Download ─────────────────────────────────────────────────────────────────

export type MarkdownScope = "plans" | "weeklies" | "tasks";

export function markdownFilename(scope: MarkdownScope, now = new Date()): string {
  return `planr-${scope}-${localISODate(now)}.md`;
}

function buildMarkdown(scope: MarkdownScope, schedule: Schedule): string {
  if (scope === "plans") return plansToMarkdown(schedule);
  if (scope === "weeklies") return weekliesToMarkdown(schedule);
  return tasksToMarkdown(schedule);
}

/** Trigger a browser download of a scoped Markdown summary. */
export function downloadMarkdown(scope: MarkdownScope, schedule: Schedule): void {
  const text = buildMarkdown(scope, schedule);
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = markdownFilename(scope);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Delay revocation so the download has started in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
