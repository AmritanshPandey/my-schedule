"use client";

/**
 * One routine on one day: identity chip, title, when it happens, its detail
 * (the meal plan, the goal, the times), and a single done ring.
 *
 * Marking done is one tap for every kind of routine. Right after it, the row
 * offers an optional "how closely did you follow it?" — skip it and the day
 * stays at 100%. A routine is there to keep you on track, not to grade you,
 * so the rating never decides whether the day counts.
 */
import { useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { IconChevronRight, IconFlame, IconTrash } from "@tabler/icons-react";
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { todayISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { calculateRitualStats, ritualScheduledOnDate } from "@/lib/consistency/calculateRitualStreak";
import { entriesForRitualDate } from "@/lib/ritualCompletions";
import { ritualDayProgress } from "@/lib/consistency/ritualDayStatus";
import { describeRecurrence } from "@/lib/ritualRecurrence";
import { formatAmount, routineDetailLine, routineWhenLabel } from "@/lib/routineDetails";
import { iconGlyph, getIconPickerStyle } from "@/components/SectionIcons";
import IconButton from "@/components/ui/IconButton";
import RoutineCompletionControl from "./RoutineCompletionControl";
import FollowedPicker from "./FollowedPicker";

interface RoutineRowProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  selectedDateISO: string;
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  /** Mark the day done, rated 1–100 (100 when the user doesn't say). */
  onMarkDone: (ritualId: string, dateISO: string, followed: number) => void;
  onUnmarkDone: (ritualId: string, dateISO: string) => void;
  onOpenDetail: (ritual: Ritual) => void;
  onDelete: (ritual: Ritual) => void;
}

export default function RoutineRow({
  ritual,
  ritualCompletions,
  selectedDateISO,
  trackingStart,
  onMarkDone,
  onUnmarkDone,
  onOpenDetail,
  onDelete,
}: RoutineRowProps) {
  const [rating, setRating] = useState(false);
  const entries = entriesForRitualDate(ritualCompletions, ritual.id, selectedDateISO);
  const progress = ritualDayProgress(ritual, entries);
  const done = progress.complete;
  const scheduled = ritualScheduledOnDate(ritual, selectedDateISO, trackingStart);
  const missed = selectedDateISO < todayISO() && scheduled && !done;
  const { streak, timesDone } = calculateRitualStats(ritual, ritualCompletions, selectedDateISO, trackingStart);

  const iconStyle = getIconPickerStyle(ritual.icon ?? "");
  const Glyph = iconGlyph(ritual.icon ?? "");

  const trackingType = ritual.trackingType ?? "checkbox";
  const measured = trackingType === "quantity" || trackingType === "duration" || trackingType === "count";
  const logged = measured && progress.value > 0
    ? `${formatAmount(progress.value)}${ritual.target ? ` of ${formatAmount(ritual.target)}` : ""}${ritual.unit ? ` ${ritual.unit}` : ""} logged`
    : null;
  // Once something is logged, "60 of 120 g logged" already states the goal.
  const detail = routineDetailLine(logged ? { ...ritual, target: undefined } : ritual);

  function press() {
    if (!done) {
      onMarkDone(ritual.id, selectedDateISO, 100);
      setRating(true);
    } else if (progress.markedDone) {
      onUnmarkDone(ritual.id, selectedDateISO);
      setRating(false);
    } else {
      // Done through logging alone — nothing to take back here, but it can
      // still be rated.
      setRating((open) => !open);
    }
  }


  return (
    <div className="py-3">
      <div className="group flex items-center gap-3">
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
            <span className="text-[15px] font-bold text-neutral-600 dark:text-neutral-400">{ritual.title.charAt(0).toUpperCase()}</span>
          )}
        </button>

        {/* Title, when, detail — opens the routine */}
        <button
          type="button"
          onClick={() => { haptic("light"); onOpenDetail(ritual); }}
          className="min-w-0 flex-1 text-left"
        >
          <p className={`truncate text-[15px] font-bold leading-tight ${
            done
              ? "text-neutral-500 dark:text-neutral-400"
              : missed
                ? "text-neutral-500 dark:text-neutral-400"
                : "text-neutral-900 dark:text-white"
          }`}>
            {ritual.title}
          </p>
          {/* One inline run, truncated at the end: when it happens and how
              often stay visible, the record trails off first on a narrow row. */}
          <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
            <span className="tabular-nums">{routineWhenLabel(ritual)}</span>
            {" · "}
            {missed ? "Missed" : describeRecurrence(ritual)}
            {streak >= 2 && (
              <>
                {" · "}
                <span className="font-bold text-emerald-700 dark:text-emerald-400" aria-label={`${streak}-day streak`}>
                  <IconFlame size={12} strokeWidth={2.4} aria-hidden="true" className="-mt-0.5 mr-0.5 inline align-middle" />
                  {streak}
                </span>
              </>
            )}
            {timesDone > 0 && <span className="tabular-nums">{` · ${timesDone}× in 30 days`}</span>}
          </p>
          {(logged || detail) && (
            <p className="mt-0.5 truncate text-[12px] text-neutral-500 dark:text-neutral-400">
              {[logged, detail].filter(Boolean).join(" · ")}
            </p>
          )}
        </button>

        {/* How closely it was followed — tap to change. The ::before widens
            the hit area to 44px without making the pill look heavy. */}
        {done && progress.followed !== null && (
          <button
            type="button"
            onClick={() => { haptic("light"); setRating((open) => !open); }}
            aria-expanded={rating}
            aria-label={`Followed ${progress.followed}%. Change how closely you followed ${ritual.title}`}
            className={`relative flex h-8 shrink-0 items-center rounded-full border px-2 text-[12px] font-extrabold tabular-nums transition-colors before:absolute before:-inset-1.5 before:content-[''] ${
              rating
                ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                : "border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-200 dark:hover:bg-white/[0.05]"
            }`}
          >
            {progress.followed}%
          </button>
        )}

        <RoutineCompletionControl title={ritual.title} done={done} missed={missed} onPress={press} />

        <IconButton
          label="Delete routine"
          variant="dangerGhost"
          size="xs"
          radius="lg"
          onClick={() => onDelete(ritual)}
          className="hidden shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 lg:flex"
        >
          <IconTrash size={14} strokeWidth={2} />
        </IconButton>

        {/* Affordance only — the title already opens the routine, so this is
            kept narrow and out of the tab order. */}
        <m.button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          whileTap={{ scale: 0.9 }}
          onClick={() => { haptic("light"); onOpenDetail(ritual); }}
          className="-ml-1.5 flex h-8 w-5 shrink-0 items-center justify-center text-neutral-500 lg:hidden dark:text-neutral-400"
        >
          <IconChevronRight size={16} strokeWidth={2} />
        </m.button>
      </div>

      <AnimatePresence initial={false}>
        {rating && done && (
          <m.div
            key="rating"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <FollowedPicker
              className="pl-[52px] pt-2.5"
              prompt="How closely did you follow it?"
              value={progress.followed}
              routineTitle={ritual.title}
              // The slider stays open after a release: unlike the four chips it
              // replaced, a rating you can drag invites a second look, and the
              // pill beside the title already shows the committed value.
              onChange={(pct) => onMarkDone(ritual.id, selectedDateISO, pct)}
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
