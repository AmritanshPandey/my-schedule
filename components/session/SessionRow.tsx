"use client";

import { IconMinus, IconRun, IconX } from "@tabler/icons-react";
import CheckDraw from "@/components/ui/CheckDraw";
import Pill from "@/components/ui/Pill";
import type { Plan, Session, SessionLog } from "@/lib/useScheduleDB";
import { formatDistance, formatPace, headline, paceSecPerKm, type SessionState } from "@/lib/sessions";
import { formatDisplayTime } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";

/** "6:00 PM" → digits at full size, the period a step smaller (as IOSTimelineRow). */
function TimeLabel({ value }: { value: string }) {
  const match = /^(.*?)\s*(AM|PM)$/i.exec(value);
  if (!match) return <>{value}</>;
  return (
    <span>
      {match[1]}
      <span className="ml-[2px] text-[10px] font-bold">{match[2].toUpperCase()}</span>
    </span>
  );
}

export interface SessionRowProps {
  session: Session;
  state: SessionState;
  actual?: SessionLog;
  plan?: Plan | null;
  isFirst?: boolean;
  isLast?: boolean;
  /** Desktop and other days: no done toggle. */
  readOnly?: boolean;
  onOpen: () => void;
  onToggleDone?: () => void;
}

/**
 * A planned session on the Today timeline, set like a task row (time, spine
 * node, card) so a run reads as part of the day rather than a separate app.
 * The node is the done toggle; the card opens the session's detail.
 */
export default function SessionRow({ session, state, actual, plan, isFirst = false, isLast = false, readOnly = false, onOpen, onToggleDone }: SessionRowProps) {
  const done = state === "done";
  const missed = state === "missed";
  const skipped = state === "skipped";
  const timeLabel = session.startTime ? formatDisplayTime(session.startTime) : "Any time";
  const meta = [plan?.title, session.estimatedMinutes ? `${session.estimatedMinutes} min` : null].filter(Boolean).join(" · ");
  const ran = actual?.actual ? `You ran ${formatDistance(actual.actual.distanceM)} @ ${formatPace(paceSecPerKm(actual.actual))}` : null;

  const nodeClass = done
    ? "border-transparent bg-emerald-500 text-white"
    : missed
    ? "border-transparent bg-rose-500 text-white"
    : skipped
    ? "border-transparent bg-neutral-300 text-white dark:bg-white/25"
    : "border-2 border-neutral-300 bg-white dark:border-white/25 dark:bg-neutral-950";
  const connectorClass = missed ? "bg-rose-500/50" : done ? "bg-emerald-500/70" : "bg-neutral-200 dark:bg-white/10";
  const cardClass = done
    ? "border-emerald-500/25 bg-emerald-500/[0.06]"
    : missed
    ? "border-rose-500/25 bg-rose-500/[0.06]"
    : "border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900";

  const canToggle = !readOnly && !skipped && !!onToggleDone;

  return (
    <div className="flex items-stretch gap-3 pb-3">
      <div className="flex w-[56px] shrink-0 items-center justify-end whitespace-nowrap text-right text-[13px] font-semibold tabular-nums leading-none text-neutral-500 dark:text-neutral-400">
        <TimeLabel value={timeLabel} />
      </div>

      <div className="relative flex w-7 shrink-0 items-center justify-center">
        <span
          aria-hidden
          className={`absolute left-1/2 w-[1.5px] -translate-x-1/2 rounded-full ${connectorClass} ${isFirst ? "top-1/2" : "top-0"} ${isLast ? "bottom-1/2" : "-bottom-3"}`}
        />
        <div className="relative z-10">
          <button
            type="button"
            disabled={!canToggle}
            aria-label={done ? `Mark ${session.title} not done` : `Mark ${session.title} done`}
            aria-pressed={done}
            onClick={() => {
              if (!canToggle) return;
              haptic("medium");
              onToggleDone?.();
            }}
            className={`relative flex h-7 w-7 items-center justify-center rounded-full transition-colors before:absolute before:-inset-2 before:content-[''] disabled:cursor-default ${nodeClass}`}
          >
            <CheckDraw visible={done} size={15} strokeWidth={3} className="text-white" />
            {missed && <IconX size={14} strokeWidth={3} className="text-white" />}
            {skipped && <IconMinus size={14} strokeWidth={3} className="text-white" />}
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => {
            haptic("light");
            onOpen();
          }}
          className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.995] ${cardClass}`}
        >
          <div className="min-w-0 flex-1">
            <p className={`flex items-center gap-1.5 truncate text-[16px] font-bold leading-tight ${missed || skipped ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-white"}`}>
              <IconRun size={16} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden />
              <span className="truncate">{session.title}</span>
            </p>
            <p className="mt-0.5 truncate text-[12.5px] font-medium text-neutral-600 dark:text-neutral-300">{ran ?? headline(session)}</p>
            {meta && <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{meta}</p>}
          </div>
          <div className="flex shrink-0 items-center">
            {done ? (
              <Pill variant="success" size="sm">Completed</Pill>
            ) : missed ? (
              <Pill variant="danger" size="sm">Missed</Pill>
            ) : skipped ? (
              <Pill variant="subtle" size="sm">Skipped</Pill>
            ) : null}
          </div>
        </button>
      </div>
    </div>
  );
}
