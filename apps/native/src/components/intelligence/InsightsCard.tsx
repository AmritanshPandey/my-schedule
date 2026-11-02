import { useDeferredValue, useMemo } from 'react';
import { View } from 'react-native';
import { IconAlertTriangle, IconArrowRight, IconCircleCheck, IconTrendingDown } from '@tabler/icons-react-native';
import type { DayKey, Schedule, Task } from '@planr/core/lib/scheduleTypes';
import { DAYS } from '@planr/core/lib/scheduleConstants';
import { localISODate } from '@planr/core/lib/dateUtils';
import { analyzeExecution } from '@planr/core/lib/intelligence/patterns';
import { applySuggestion, dismissInsight, undoSuggestion } from '@planr/core/lib/intelligence/suggestions';
import { isAppliable, type Insight } from '@planr/core/lib/intelligence/types';
import { buildProgressFacts, templateSummary } from '@planr/core/lib/intelligence/progressFacts';
import { haptic } from '../../lib/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import Button from '../ui/Button';

export interface InsightToast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
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
  if (!s) return 'Done';
  switch (s.kind) {
    case 'retime':
      return `Moved to ${s.label.replace(/^Move to /, '')}`;
    case 'shorten':
      return s.label.replace(/^Shorten/, 'Shortened');
    case 'pause_plan':
      return 'Plan paused';
    default:
      return 'Done';
  }
}

function InsightRow({ insight, onPrimary, onDismiss, first }: { insight: Insight; onPrimary?: () => void; onDismiss: () => void; first: boolean }) {
  const risk = insight.tone === 'risk';
  // amber-700 / rose-600 rather than the 500s — AA at 12–13px on white.
  const accent = risk ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400';
  const tint = risk ? 'bg-rose-50 dark:bg-rose-500/[0.10]' : 'bg-amber-50 dark:bg-amber-500/[0.10]';
  const s = insight.suggestion;
  const preview = s && isAppliable(s) ? s.changes[0] : null;

  return (
    <View className={`flex-row items-start gap-3 py-3 ${first ? 'pt-0' : 'border-t border-neutral-200/70 dark:border-white/[0.06]'}`}>
      <View className={`h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        <Icon icon={insight.kind === 'declining' ? IconTrendingDown : IconAlertTriangle} size={15} strokeWidth={2} className={accent} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[14px] font-bold leading-snug text-neutral-950 dark:text-white">{insight.title}</Text>
        <Text className="mt-0.5 text-[13px] font-medium leading-snug text-neutral-600 dark:text-neutral-400">{insight.detail}</Text>
        {preview && (
          <View className="mt-2 flex-row items-start gap-1.5 rounded-xl bg-neutral-50 px-3 py-2 dark:bg-white/[0.04]">
            <Icon icon={IconArrowRight} size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400" />
            <Text className="min-w-0 flex-1 text-[12px] font-semibold tabular-nums text-neutral-700 dark:text-neutral-300">{preview}</Text>
          </View>
        )}
        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          {s && onPrimary && (
            <Button
              size="md"
              onPress={() => {
                haptic('light');
                onPrimary();
              }}
            >
              {s.label}
            </Button>
          )}
          <Button
            variant="ghost"
            size="md"
            onPress={() => {
              haptic('light');
              onDismiss();
            }}
          >
            Not now
          </Button>
        </View>
      </View>
    </View>
  );
}

/**
 * Native port of components/intelligence/InsightsCard.tsx — the weekly read:
 * a short progress note, up to three things worth changing (each with a
 * reviewable fix), and what's genuinely going well.
 *
 * Everything here comes from the deterministic pattern engine in
 * @planr/core/lib/intelligence, so it says exactly what the web card says.
 * The note is always the template wording: no language model runs here.
 */
export default function InsightsCard({
  schedule,
  setSchedule,
  onToast,
  onReviewTask,
  onReviewDay,
}: {
  schedule: Schedule;
  setSchedule: (updater: (prev: Schedule) => Schedule) => void;
  onToast?: (toast: InsightToast) => void;
  onReviewTask?: (task: Task) => void;
  onReviewDay?: (day: DayKey) => void;
}) {
  // Analysis takes tens of milliseconds; deferring keeps a task tick instant.
  const deferred = useDeferredValue(schedule);
  const report = useMemo(() => analyzeExecution(deferred), [deferred]);
  const summary = useMemo(() => templateSummary(buildProgressFacts(report, deferred), report), [report, deferred]);

  if (report.sampleSize === 0 && report.insights.length === 0) return null;

  const todayISO = report.todayISO;

  function apply(insight: Insight) {
    const s = insight.suggestion;
    if (!s) return;
    if (s.kind === 'review_task') {
      const task = findTask(schedule, s.taskId);
      if (task) onReviewTask?.(task);
      return;
    }
    if (s.kind === 'review_day') {
      onReviewDay?.(s.day);
      return;
    }
    setSchedule((prev) => applySuggestion(prev, insight, todayISO));
    onToast?.({
      message: toastFor(insight),
      actionLabel: 'Undo',
      onAction: () => setSchedule((prev) => undoSuggestion(prev, insight, localISODate(new Date()))),
    });
  }

  const canHandle = (insight: Insight) => {
    const s = insight.suggestion;
    if (!s) return false;
    if (s.kind === 'review_task') return !!onReviewTask;
    if (s.kind === 'review_day') return !!onReviewDay;
    return true;
  };

  return (
    // An open section, not a card: it closes the Overview's column of cards,
    // and one more box made the screen read flat.
    <View testID="insights-card" className="px-1 pb-2 pt-3">
      <Text accessibilityRole="header" className="text-[17px] font-bold leading-tight text-neutral-950 dark:text-white">
        This week's read
      </Text>
      <Text className="mt-2 text-[14px] font-medium leading-relaxed text-neutral-700 dark:text-neutral-300">{summary}</Text>

      {report.insights.length > 0 && (
        <View className="mt-4 border-t border-neutral-200/70 pt-3 dark:border-white/[0.07]">
          {report.insights.map((insight, index) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              first={index === 0}
              onPrimary={canHandle(insight) ? () => apply(insight) : undefined}
              onDismiss={() => setSchedule((prev) => dismissInsight(prev, insight, todayISO))}
            />
          ))}
        </View>
      )}

      {report.wins.length > 0 && (
        <View className={`gap-1.5 ${report.insights.length > 0 ? 'mt-3 border-t border-neutral-200/70 pt-3 dark:border-white/[0.07]' : 'mt-3'}`}>
          {report.wins.map((win) => (
            <View key={win.id} className="flex-row items-start gap-2">
              <Icon icon={IconCircleCheck} size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <Text className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-neutral-800 dark:text-neutral-200">{win.title}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
