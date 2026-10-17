/**
 * From pattern-engine findings to a progress note a person actually reads.
 *
 * Two writers, one source of truth:
 *
 *  1. `templateSummary` — deterministic sentences built straight from the
 *     facts. Always available, instant, and the only writer on devices where
 *     no language model may run (iOS Safari and the PWA; see
 *     lib/ai/deviceCapability.ts). It is a complete feature, not a placeholder.
 *  2. The on-device model — rephrases the same facts into warmer, more natural
 *     prose. It is given nothing but the fact lines, and its output is checked
 *     by `validateSummary` before anyone sees it: any number that isn't in the
 *     facts, a list, a greeting, a runaway length, and the note falls back to
 *     the template. A small model that occasionally embellishes is fine; a
 *     progress note that invents a statistic about someone's life is not.
 *
 * The model never decides anything here. What is risky, what is a win and what
 * to do next were settled by lib/intelligence/patterns.ts; the model's only job
 * is tone.
 *
 * Pure and React-free.
 */

import type { Schedule } from "../useScheduleDB";
import { addDaysToISO } from "../dateUtils";
import { weekStartISO } from "../capacityModel";
import { calculateExecutionStreak } from "../consistency/calculateExecutionStreak";
import type { ExecutionReport } from "./patterns";
import type { Insight } from "./types";

// ── Facts ────────────────────────────────────────────────────────────────────

export interface ProgressFacts {
  todayISO: string;
  /** Last complete week's completion %, and the one before it. */
  lastWeekPct: number | null;
  previousWeekPct: number | null;
  /** This week so far — resolved occurrences Monday through yesterday. */
  thisWeekDone: number;
  thisWeekResolved: number;
  /** Consecutive days with at least one completion. */
  streakDays: number;
  /** Ordered fact lines — exactly what the model sees. */
  lines: string[];
  /** Concrete next steps the model may recommend (suggestion labels). */
  nextSteps: string[];
  /** False when there is nothing honest to say yet. */
  hasSignal: boolean;
}

function stepFor(insight: Insight): string | null {
  const s = insight.suggestion;
  if (!s) return null;
  switch (s.kind) {
    case "retime":
    case "shorten":
      return `${s.label} for "${insight.title.replace(/ keeps slipping$/, "")}"`;
    case "pause_plan":
      return `Pause "${insight.title.replace(/ has gone quiet$/, "")}"`;
    case "review_task":
      return `Review "${insight.title.replace(/ keeps slipping$/, "")}"`;
    case "review_day":
      return s.label;
  }
}

export function buildProgressFacts(report: ExecutionReport, schedule: Schedule): ProgressFacts {
  const { todayISO, trend, taskStats } = report;

  const weeks = trend.weeks.filter((w) => !w.isCurrentWeek && w.scheduled > 0);
  const lastWeekPct = weeks.length > 0 ? weeks[weeks.length - 1].pct : null;
  const previousWeekPct = weeks.length > 1 ? weeks[weeks.length - 2].pct : null;

  const monday = weekStartISO(todayISO);
  const yesterday = addDaysToISO(todayISO, -1);
  let thisWeekDone = 0;
  let thisWeekResolved = 0;
  for (const s of taskStats) {
    for (const o of s.outcomes) {
      if (o.dateISO < monday || o.dateISO > yesterday) continue;
      thisWeekResolved += 1;
      if (o.done) thisWeekDone += 1;
    }
  }

  const streakDays = calculateExecutionStreak(schedule, todayISO).streak;

  const lines: string[] = [];
  if (lastWeekPct !== null) {
    lines.push(
      previousWeekPct !== null
        ? `last week ${lastWeekPct}% of planned work done (week before: ${previousWeekPct}%)`
        : `last week ${lastWeekPct}% of planned work done`,
    );
  }
  if (thisWeekResolved > 0) lines.push(`this week so far ${thisWeekDone} of ${thisWeekResolved} sessions done`);
  if (streakDays >= 2) lines.push(`${streakDays}-day streak of showing up`);
  for (const insight of report.insights) lines.push(`needs attention: ${insight.fact}`);
  for (const win of report.wins) lines.push(`going well: ${win.fact}`);

  const nextSteps = report.insights.map(stepFor).filter((s): s is string => !!s);

  return {
    todayISO,
    lastWeekPct,
    previousWeekPct,
    thisWeekDone,
    thisWeekResolved,
    streakDays,
    lines,
    nextSteps,
    hasSignal: report.sampleSize > 0 || lastWeekPct !== null,
  };
}

// ── Template writer ──────────────────────────────────────────────────────────

/**
 * Two or three plain sentences: how the week went, the one thing to fix, the
 * one thing going well. Never invents momentum that isn't there.
 */
export function templateSummary(facts: ProgressFacts, report: ExecutionReport): string {
  if (!facts.hasSignal) {
    return "Not enough history yet. Check off a few days of tasks and PlanR will start spotting what's working and what keeps slipping.";
  }

  const sentences: string[] = [];

  if (facts.lastWeekPct !== null) {
    const { lastWeekPct: last, previousWeekPct: prev } = facts;
    const delta = prev === null ? "" : last > prev ? `, up from ${prev}%` : last < prev ? `, down from ${prev}%` : ", level with the week before";
    sentences.push(`Last week you finished ${last}% of what you planned${delta}.`);
  } else if (facts.thisWeekResolved > 0) {
    sentences.push(`So far this week: ${facts.thisWeekDone} of ${facts.thisWeekResolved} sessions done.`);
  }

  const risk = report.insights[0];
  if (risk) {
    sentences.push(risk.summary);
  } else if (facts.lastWeekPct !== null || facts.thisWeekResolved > 0) {
    sentences.push("Nothing is slipping in a way that needs changing.");
  }

  // The overall streak first: the card lists individual wins right below,
  // so repeating the top one here would just say it twice. "Best week" only
  // reads right straight after the week's own figure.
  const win = report.wins.find((w) => !w.id.startsWith("momentum:week:") || facts.lastWeekPct !== null);
  if (facts.streakDays >= 3) sentences.push(`You've shown up ${facts.streakDays} days running.`);
  else if (win) sentences.push(win.summary);

  return sentences.join(" ");
}

// ── Model prompt ─────────────────────────────────────────────────────────────

/**
 * Detected by lib/ai/providers/browserPrompts.ts via its unique phrase
 * "execution progress summarizer" — keep that phrase intact.
 */
export const PROGRESS_SUMMARY_PROMPT = `You are PlanR's execution progress summarizer. Rewrite the facts you are given as a short progress note: 2-3 sentences of plain prose, speaking to the user as "you".
Rules:
- Use only the facts given. Never invent numbers, dates, tasks, reasons or feelings.
- Copy every number exactly as written in the facts.
- Lead with what needs attention if anything does, then one thing going well, then one next step taken from the suggested next steps.
- No greeting, no lists, no markdown, no headings. Do not start with "I".
- Sound like a calm, direct coach: encouraging, specific, never preachy or hyped.`;

export function buildSummaryUserMessage(facts: ProgressFacts): string {
  const parts = [`Facts:\n${facts.lines.map((l) => `- ${l}`).join("\n")}`];
  if (facts.nextSteps.length > 0) parts.push(`Suggested next steps:\n${facts.nextSteps.map((l) => `- ${l}`).join("\n")}`);
  parts.push("Write the progress note:");
  return parts.join("\n\n");
}

// ── Grounding guard ──────────────────────────────────────────────────────────

export interface SummaryCheck {
  ok: boolean;
  text: string;
  reason?: string;
}

export const SUMMARY_MIN_CHARS = 40;
export const SUMMARY_MAX_CHARS = 600;

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
}

/**
 * Accept the model's note only if it says nothing the facts don't. Cleans up
 * harmless wrapping (reasoning tags, quotes, whitespace) first.
 */
export function validateSummary(raw: string, facts: ProgressFacts): SummaryCheck {
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*(progress note|note|summary)\s*:\s*/i, "")
    .trim()
    .replace(/^["'“]+|["'”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length < SUMMARY_MIN_CHARS) return { ok: false, text, reason: "too short" };
  if (text.length > SUMMARY_MAX_CHARS) return { ok: false, text, reason: "too long" };
  if (/(^|\s)([-*•]|\d+\.)\s/.test(raw.trim().split("\n").slice(1).join("\n")) || /^\s*[-*•#]/.test(raw)) {
    return { ok: false, text, reason: "formatted as a list" };
  }
  if (/^(I|As an?|Hi|Hey|Hello)\b/.test(text)) return { ok: false, text, reason: "starts with a greeting or 'I'" };

  const allowed = new Set([...facts.lines, ...facts.nextSteps].flatMap(numbersIn));
  const invented = numbersIn(text).filter((n) => !allowed.has(n));
  if (invented.length > 0) return { ok: false, text, reason: `numbers not in the facts: ${invented.join(", ")}` };

  return { ok: true, text };
}

// ── Plan-scoped context (the AI Assistant's weekly read) ─────────────────────

/** Window the assistant's per-plan read covers. */
export const PLAN_CONTEXT_DAYS = 7;

/**
 * A compact, dated account of one plan's last week, for the assistant's
 * coaching insight. Replaces a version that counted `task.completed` — a flag
 * that only ever describes *today* — so its "this week" figure was really
 * "today", and usually 0.
 */
export function buildPlanWeekContext(
  report: ExecutionReport,
  plan: { id: string; title: string },
  activeMilestone?: { title: string; plannedEndDate: string } | null,
): string {
  const since = addDaysToISO(report.todayISO, -PLAN_CONTEXT_DAYS);
  const rows = report.taskStats
    .filter((s) => s.plan?.id === plan.id)
    .map((s) => {
      const recent = s.outcomes.filter((o) => o.dateISO >= since);
      return { title: s.task.title, done: recent.filter((o) => o.done).length, resolved: recent.length };
    })
    .filter((r) => r.resolved > 0)
    .sort((a, b) => a.done / a.resolved - b.done / b.resolved);

  const done = rows.reduce((s, r) => s + r.done, 0);
  const resolved = rows.reduce((s, r) => s + r.resolved, 0);

  const lines = [`Plan: "${plan.title}"`];
  lines.push(
    resolved > 0
      ? `Last ${PLAN_CONTEXT_DAYS} days: ${done} of ${resolved} scheduled sessions done`
      : `Last ${PLAN_CONTEXT_DAYS} days: no sessions checked off or marked missed yet`,
  );
  for (const r of rows.slice(0, 4)) lines.push(`"${r.title}": ${r.done} of ${r.resolved} done`);

  const taskIds = new Set(report.taskStats.filter((s) => s.plan?.id === plan.id).map((s) => s.taskId));
  for (const insight of report.all) {
    if (insight.subjectId === plan.id || (insight.subjectId && taskIds.has(insight.subjectId))) {
      lines.push(insight.tone === "win" ? `Going well: ${insight.fact}` : `Needs attention: ${insight.fact}`);
    }
  }
  if (activeMilestone) lines.push(`Active milestone: "${activeMilestone.title}", due ${activeMilestone.plannedEndDate}`);
  return lines.join("\n");
}
