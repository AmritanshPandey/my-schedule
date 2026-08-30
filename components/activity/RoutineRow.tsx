"use client";

/**
 * One compact routine row — replaces RitualView.tsx's old `renderCard`/
 * `renderDesktopCard` pair (one large card each) with a single row shared by
 * mobile and desktop: icon/color chip, title + secondary line, the
 * trackingType-appropriate completion control, and an overflow menu.
 */
import { m } from "framer-motion";
import { IconChevronRight, IconFlame, IconTrash } from "@tabler/icons-react";
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { formatDisplayTime } from "@/lib/timeUtils";
import { todayISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { calculateRitualStats, ritualScheduledOnDate } from "@/lib/consistency/calculateRitualStreak";
import { entriesForRitualDate } from "@/lib/ritualCompletions";
import { ritualDayProgress } from "@/lib/consistency/ritualDayStatus";
import { describeRecurrence } from "@/lib/ritualRecurrence";
import { iconGlyph, getIconPickerStyle } from "@/components/SectionIcons";
import IconButton from "@/components/ui/IconButton";
import RoutineCompletionControl from "./RoutineCompletionControl";

interface RoutineRowProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  selectedDateISO: string;
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  onToggleComplete: (ritualId: string, dateISO: string) => void;
  onLogAmount: (ritualId: string, amount: number, dateISO: string) => void;
  onUndoLastLog: (ritualId: string, dateISO: string) => void;
  onOpenDetail: (ritual: Ritual) => void;
  onDelete: (ritual: Ritual) => void;
}

export default function RoutineRow({
  ritual,
  ritualCompletions,
  selectedDateISO,
  trackingStart,
  onToggleComplete,
  onLogAmount,
  onUndoLastLog,
  onOpenDetail,
  onDelete,
}: RoutineRowProps) {
  const entries = entriesForRitualDate(ritualCompletions, ritual.id, selectedDateISO);
  const progress = ritualDayProgress(ritual, entries);
  const scheduled = ritualScheduledOnDate(ritual, selectedDateISO, trackingStart);
  const missed = selectedDateISO < todayISO() && scheduled && !progress.complete;
  const { streak } = calculateRitualStats(ritual, ritualCompletions, selectedDateISO, trackingStart);

  const iconStyle = getIconPickerStyle(ritual.icon ?? "");
  const Glyph = iconGlyph(ritual.icon ?? "");

  const secondary: string[] = [];
  if (ritual.anyTime) secondary.push("Anytime");
  else secondary.push(formatDisplayTime(ritual.time));
  if (missed) secondary.push("Missed");
  else secondary.push(describeRecurrence(ritual));

  const trackingType = ritual.trackingType ?? "checkbox";
  const showProgressText = trackingType === "quantity" || trackingType === "duration" || trackingType === "count";
  // Checkbox routines can bundle a purely descriptive item list (e.g. "Hair"
  // ⇒ coconut oil, shampoo, conditioner) — one tap above covers all of them,
  // so this is a caption, never its own row of checkboxes.
  const items = trackingType === "checkbox" ? ritual.steps : undefined;

  return (
    <div className="group flex items-center gap-3 py-3">
      {/* Icon/color chip — identity, not the completion control. */}
      <button
        type="button"
        onClick={() => { haptic("light"); onOpenDetail(ritual); }}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ritual.icon ? iconStyle.tint : "bg-neutral-100 dark:bg-white/[0.06]"}`}
        aria-label={`Open ${ritual.title}`}
      >
        {ritual.icon ? (
          <Glyph size={18} strokeWidth={1.9} className={iconStyle.text} />
        ) : (
          <span className="text-[15px] font-bold text-neutral-400 dark:text-neutral-500">{ritual.title.charAt(0).toUpperCase()}</span>
        )}
      </button>

      {/* Title + meta — opens the detail view */}
      <button
        type="button"
        onClick={() => { haptic("light"); onOpenDetail(ritual); }}
        className="min-w-0 flex-1 text-left"
      >
        <p className={`truncate text-[15px] font-bold leading-tight ${
          progress.complete
            ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500"
            : missed
              ? "text-neutral-500 dark:text-neutral-400"
              : "text-neutral-900 dark:text-white"
        }`}>
          {ritual.title}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          <span className="tabular-nums">{secondary[0]}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{secondary[1]}</span>
          {showProgressText && (
            <span className="shrink-0 tabular-nums">
              · {progress.value}/{ritual.target ?? "–"}{ritual.unit ? ` ${ritual.unit}` : ""}
            </span>
          )}
          {streak >= 2 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-bold text-emerald-600 dark:text-emerald-400">
              <IconFlame size={12} strokeWidth={2.4} />
              {streak}
            </span>
          )}
        </p>
        {items && items.length > 0 && (
          <p className="mt-0.5 truncate text-[11px] text-neutral-400 dark:text-neutral-500">
            {items.map((step) => step.label).join(" · ")}
          </p>
        )}
      </button>

      <RoutineCompletionControl
        ritual={ritual}
        progress={progress}
        missed={missed}
        onToggleCheckbox={() => onToggleComplete(ritual.id, selectedDateISO)}
        onLogAmount={(amount) => onLogAmount(ritual.id, amount, selectedDateISO)}
        onUndoLastLog={() => onUndoLastLog(ritual.id, selectedDateISO)}
      />

      <IconButton
        label="Delete routine"
        variant="dangerGhost"
        size="xs"
        radius="lg"
        onClick={() => onDelete(ritual)}
        className="hidden shrink-0 opacity-0 transition-opacity group-hover:opacity-100 lg:flex"
      >
        <IconTrash size={14} strokeWidth={2} />
      </IconButton>

      <m.button
        type="button"
        whileTap={{ scale: 0.9 }}
        onClick={() => { haptic("light"); onOpenDetail(ritual); }}
        aria-label={`Open ${ritual.title} details`}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-neutral-300 lg:hidden dark:text-neutral-600"
      >
        <IconChevronRight size={16} strokeWidth={2} />
      </m.button>
    </div>
  );
}
