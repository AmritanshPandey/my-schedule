"use client";

import { useDeferredValue, useMemo } from "react";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconSparkles,
  IconTrendingDown,
} from "@tabler/icons-react";
import { CARD } from "@/components/ui/surfaces";
import { haptic } from "@/lib/haptics";
import { localISODate } from "@/lib/dateUtils";
import { DAYS } from "@/lib/scheduleConstants";
import type { DayKey, Schedule, Task } from "@/lib/useScheduleDB";
import { analyzeExecution } from "@/lib/intelligence/patterns";
import { applySuggestion, dismissInsight, undoSuggestion } from "@/lib/intelligence/suggestions";
import { isAppliable, type Insight } from "@/lib/intelligence/types";
import { useProgressSummary } from "@/lib/intelligence/useProgressSummary";

export interface InsightToast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface InsightsCardProps {
  schedule: Schedule;
  setSchedule: (updater: (prev: Schedule) => Schedule) => void;
  /** Confirmation with Undo after a suggestion is applied. */
  onToast?: (toast: InsightToast) => void;
  /** Open a task's editor — for suggestions the user should make themselves. */
  onReviewTask?: (task: Task) => void;
  /** Show one weekday's schedule. */
  onReviewDay?: (day: DayKey) => void;
}

function findTask(schedule: Schedule, taskId: string): Task | undefined {
  for (const day of DAYS) {
    const hit = (schedule.activities[day] ?? []).find((t) => t.id === taskId);
    if (hit) return hit;
  }
  return undefined;
}

function toastFor(insight: Insight): string {
  const s = insight.suggestion;
  if (!s) return "Done";
  switch (s.kind) {
    case "retime": return `Moved to ${s.label.replace(/^Move to /, "")}`;
    case "shorten": return s.label.replace(/^Shorten/, "Shortened");
    case "pause_plan": return "Plan paused";
    default: return "Done";
  }
}

function InsightRow({
  insight,
  onPrimary,
  onDismiss,
}: {
  insight: Insight;
  onPrimary?: () => void;
  onDismiss: () => void;
}) {
  const risk = insight.tone === "risk";
  const Icon = insight.kind === "declining" ? IconTrendingDown : IconAlertTriangle;
  // amber-700 / rose-600 rather than the 500s — AA at 12–13px on white
  // (same pairing as NeedsAttentionCard).
  const accent = risk ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-400";
  const tint = risk ? "bg-rose-50 dark:bg-rose-500/[0.10]" : "bg-amber-50 dark:bg-amber-500/[0.10]";
  const s = insight.suggestion;
  const preview = s && isAppliable(s) ? s.changes[0] : null;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tint} ${accent}`} aria-hidden>
          <Icon size={15} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-snug text-neutral-950 dark:text-white">{insight.title}</p>
          <p className="mt-0.5 text-[13px] font-medium leading-snug text-neutral-600 dark:text-neutral-400">{insight.detail}</p>

          {preview && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-neutral-50 px-3 py-2 text-[12px] font-semibold tabular-nums text-neutral-700 dark:bg-white/[0.04] dark:text-neutral-300">
              <IconArrowRight size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden />
              <span>{preview}</span>
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {s && onPrimary && (
              <button
                type="button"
                onClick={() => { haptic("light"); onPrimary(); }}
                className="inline-flex min-h-[44px] items-center rounded-full bg-neutral-950 px-4 text-[13px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-neutral-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 lg:h-9 lg:min-h-0 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100"
              >
                {s.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => { haptic("light"); onDismiss(); }}
              className="inline-flex min-h-[44px] items-center rounded-full px-3 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 lg:h-9 lg:min-h-0 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * The weekly read: a short progress note, up to three things worth changing
 * (each with a reviewable fix), and what's genuinely going well.
 *
 * Everything decided here comes from the deterministic pattern engine
 * (lib/intelligence/patterns.ts), so it renders identically on iPhone, where
 * no language model runs. The on-device model, where available, only rewrites
 * the note's wording — never what it says.
 */
export default function InsightsCard({ schedule, setSchedule, onToast, onReviewTask, onReviewDay }: InsightsCardProps) {
  // Analysis takes tens of milliseconds; deferring keeps a task tick instant.
  const deferred = useDeferredValue(schedule);
  const report = useMemo(() => analyzeExecution(deferred), [deferred]);
  const summary = useProgressSummary(report, deferred);

  if (report.sampleSize === 0 && report.insights.length === 0) return null;

  const todayISO = report.todayISO;

  function apply(insight: Insight) {
    const s = insight.suggestion;
    if (!s) return;
    if (s.kind === "review_task") {
      const task = findTask(schedule, s.taskId);
      if (task) onReviewTask?.(task);
      return;
    }
    if (s.kind === "review_day") {
      onReviewDay?.(s.day);
      return;
    }
    setSchedule((prev) => applySuggestion(prev, insight, todayISO));
    onToast?.({
      message: toastFor(insight),
      actionLabel: "Undo",
      onAction: () => setSchedule((prev) => undoSuggestion(prev, insight, localISODate(new Date()))),
    });
  }

  function dismiss(insight: Insight) {
    setSchedule((prev) => dismissInsight(prev, insight, todayISO));
  }

  const canHandle = (insight: Insight) => {
    const s = insight.suggestion;
    if (!s) return false;
    if (s.kind === "review_task") return !!onReviewTask;
    if (s.kind === "review_day") return !!onReviewDay;
    return true;
  };

  return (
    <section data-testid="insights-card" aria-labelledby="insights-card-title" className={`${CARD} px-5 py-4`}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="insights-card-title" className="text-[15px] font-bold leading-tight text-neutral-950 dark:text-white">
          This week&apos;s read
        </h2>
        {summary.source === "ai" ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            <IconSparkles size={12} strokeWidth={2} aria-hidden />
            Written on-device
          </span>
        ) : summary.canRefine ? (
          <button
            type="button"
            onClick={() => { haptic("light"); summary.refine(); }}
            disabled={summary.writing}
            className="-my-1 inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 disabled:opacity-60 lg:h-8 lg:min-h-0 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
          >
            <IconSparkles size={13} strokeWidth={2} aria-hidden />
            {summary.writing ? "Writing…" : "Rewrite with AI"}
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[14px] font-medium leading-relaxed text-neutral-700 dark:text-neutral-300" aria-live="polite">
        {summary.text}
      </p>
      {summary.note && (
        <p className="mt-1.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{summary.note}</p>
      )}

      {report.insights.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-200/70 border-t border-neutral-200/70 pt-3 dark:divide-white/[0.06] dark:border-white/[0.07]">
          {report.insights.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              onPrimary={canHandle(insight) ? () => apply(insight) : undefined}
              onDismiss={() => dismiss(insight)}
            />
          ))}
        </ul>
      )}

      {report.wins.length > 0 && (
        <ul className={`space-y-1.5 ${report.insights.length > 0 ? "mt-3 border-t border-neutral-200/70 pt-3 dark:border-white/[0.07]" : "mt-3"}`}>
          {report.wins.map((win) => (
            <li key={win.id} className="flex items-start gap-2 text-[13px] font-semibold leading-snug text-neutral-800 dark:text-neutral-200">
              <IconCircleCheck size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span>{win.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
