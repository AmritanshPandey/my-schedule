"use client";

import { IconAlertTriangle, IconArrowUpRight, IconFlag, IconFlame, IconTrendingDown, IconX } from "@tabler/icons-react";
import { CARD } from "@/components/ui/surfaces";
import { haptic } from "@/lib/haptics";
import { formatDateShort } from "@/lib/dateUtils";
import {
  formatDaysAgo,
  formatDaysBehind,
  formatDaysOverdue,
  type MissedTask,
  type NeedsAttention,
} from "@/lib/needsAttention";

/** Rows shown before collapsing the rest into a "+N more" line. */
const MAX_ROWS = 4;

interface NeedsAttentionCardProps {
  data: NeedsAttention;
  /** Overdue milestones live on Plans; missed occurrences live on Today. */
  onNavigate: (tab: number) => void;
  /** Open the recovery sheet (reschedule / dismiss) for a missed task. */
  onHandleMissed?: (missed: MissedTask) => void;
}

function Row({
  icon: Icon,
  tone,
  title,
  detail,
  pill,
  onClick,
}: {
  icon: typeof IconFlag;
  tone: "warn" | "danger";
  title: string;
  detail: string;
  pill: string;
  onClick: () => void;
}) {
  // amber-700 / rose-600 rather than the 500s: at 12–13px the 500s land near
  // 3.7:1 on white and miss WCAG AA. Both pairings below clear it in each theme.
  const accent =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";
  const tint =
    tone === "warn"
      ? "bg-amber-50 dark:bg-amber-500/[0.10]"
      : "bg-rose-50 dark:bg-rose-500/[0.10]";

  return (
    <button
      type="button"
      onClick={() => { haptic("light"); onClick(); }}
      className="group flex w-full items-center gap-3 py-2.5 text-left"
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tint} ${accent}`}>
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold text-neutral-950 dark:text-white">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          {detail}
        </span>
      </span>
      <span className={`shrink-0 text-[12px] font-bold tabular-nums ${accent}`}>{pill}</span>
      <IconArrowUpRight
        size={14}
        strokeWidth={2.2}
        className="shrink-0 text-neutral-300 transition-colors group-hover:text-neutral-500 dark:text-neutral-600 dark:group-hover:text-neutral-400"
      />
    </button>
  );
}

/**
 * "Needs attention" — overdue milestones and recently missed occurrences.
 *
 * Without push notifications the app cannot tell anyone a deadline slipped at
 * the moment it slips, so this catches them up on open instead. It renders
 * nothing at all when there is nothing wrong: a card that is always present
 * stops being a signal and starts being a nag, and PlanR's voice "never nags".
 */
export default function NeedsAttentionCard({ data, onNavigate, onHandleMissed }: NeedsAttentionCardProps) {
  if (data.total === 0) return null;

  // Ordered by how recoverable each item is. A ritual streak can still be
  // saved today, so it leads; an at-risk milestone still has time before its
  // deadline; an overdue milestone compounds; a past miss is history.
  const rows = [
    ...data.atRiskRituals.map((row) => ({
      key: `r:${row.ritual.id}`,
      icon: IconFlame,
      tone: "warn" as const,
      title: row.ritual.title,
      detail: `${row.streak}-day run ends tonight`,
      pill: "Not done",
      onClick: () => onNavigate(2),
    })),
    ...data.atRiskMilestones.map((row) => ({
      key: `am:${row.milestone.id}`,
      icon: IconTrendingDown,
      tone: "warn" as const,
      title: row.milestone.title,
      detail: row.plan
        ? row.forecastDate
          ? `${row.plan.title} · projects ${formatDateShort(row.forecastDate)}`
          : row.plan.title
        : "Milestone",
      pill: formatDaysBehind(row.daysBehind),
      onClick: () => onNavigate(1),
    })),
    ...data.overdueMilestones.map((row) => ({
      key: `m:${row.milestone.id}`,
      icon: IconFlag,
      tone: "warn" as const,
      title: row.milestone.title,
      detail: row.plan ? row.plan.title : "Milestone",
      pill: formatDaysOverdue(row.daysOverdue),
      onClick: () => onNavigate(1),
    })),
    ...data.missedTasks.map((row) => ({
      key: `t:${row.task.id}:${row.dateISO}`,
      icon: IconX,
      tone: "danger" as const,
      title: row.task.title,
      detail: row.plan ? `${row.plan.title} · missed ${formatDaysAgo(row.daysAgo)}` : `Missed ${formatDaysAgo(row.daysAgo)}`,
      pill: formatDaysAgo(row.daysAgo),
      onClick: () => (onHandleMissed ? onHandleMissed(row) : onNavigate(0)),
    })),
  ];

  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <section data-testid="overview-needs-attention" className={`${CARD} p-4`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconAlertTriangle size={15} strokeWidth={2} className="shrink-0 text-amber-700 dark:text-amber-400" />
          <h2 className="truncate text-[13px] font-extrabold text-neutral-800 dark:text-neutral-200">
            Needs attention
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-black tabular-nums text-neutral-500 dark:border-white/[0.10] dark:bg-white/[0.05] dark:text-neutral-400">
          {data.total}
        </span>
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
        {visible.map(({ key, ...row }) => <Row key={key} {...row} />)}
      </div>

      {hidden > 0 && (
        <p className="mt-2 text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">
          +{hidden} more
        </p>
      )}
    </section>
  );
}
