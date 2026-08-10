"use client";

import { useEffect, useState } from "react";
import { IconCalendar, IconClock, IconArrowUp, IconTrash } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import { getSlots } from "@/lib/taskMutations";
import { parseTimeToMinutes, minutesToInputTime, formatDisplayTime } from "@/lib/timeUtils";
import { localISODate } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { formatDaysAgo, type MissedTask } from "@/lib/needsAttention";

interface MissedTaskSheetProps {
  /** The missed occurrence being handled, or null when the sheet is closed. */
  missed: MissedTask | null;
  onClose: () => void;
  /** Add a fresh one-off of the task on `dateISO` starting at `startMinutes`. */
  onReschedule: (missed: MissedTask, dateISO: string, startMinutes: number) => void;
  /** Clear it from Needs Attention without rescheduling. */
  onDismiss: (missed: MissedTask) => void;
}

const CONTROL =
  "h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[15px] font-semibold text-neutral-900 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-white";
const LABEL = "text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400";

function friendlyDate(iso: string, todayISO: string): string {
  if (iso === todayISO) return "Today";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Recovery sheet for one missed task: reschedule it (today or a custom date, at
 * its original time or a custom one) or dismiss it. The underlying "missed"
 * history event is never touched — dismiss only hides the row.
 */
export default function MissedTaskSheet({ missed, onClose, onReschedule, onDismiss }: MissedTaskSheetProps) {
  const todayISO = localISODate(new Date());
  const originalStart = missed ? parseTimeToMinutes(getSlots(missed.task)[0]?.startTime ?? "") : null;

  const [dateISO, setDateISO] = useState(todayISO);
  const [timeStr, setTimeStr] = useState<string>("");

  // Reset the controls each time the sheet opens for a different miss.
  useEffect(() => {
    if (!missed) return;
    setDateISO(localISODate(new Date()));
    setTimeStr(minutesToInputTime(parseTimeToMinutes(getSlots(missed.task)[0]?.startTime ?? "") ?? 9 * 60));
  }, [missed]);

  const startMinutes = parseTimeToMinutes(timeStr) ?? originalStart ?? 9 * 60;
  const keepsOriginalTime = originalStart != null && startMinutes === originalStart;

  function handleReschedule() {
    if (!missed) return;
    haptic("light");
    onReschedule(missed, dateISO, startMinutes);
    onClose();
  }

  function handleDismiss() {
    if (!missed) return;
    haptic("light");
    onDismiss(missed);
    onClose();
  }

  return (
    <BottomSheet open={!!missed} onClose={onClose}>
      {missed && (
        <div className="px-5 pb-6 pt-4">
          <SheetHeader eyebrow={`Missed ${formatDaysAgo(missed.daysAgo)}`} title={missed.task.title} onClose={onClose} />

          <div className="mt-5 space-y-4">
            <div>
              <p className={`mb-2 ${LABEL}`}>Do it on</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDateISO(todayISO)}
                  className={`h-11 shrink-0 rounded-xl px-4 text-[14px] font-bold transition-colors ${
                    dateISO === todayISO
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                      : "border border-neutral-200 bg-white text-neutral-600 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-neutral-300"
                  }`}
                >
                  Today
                </button>
                <div className="relative min-w-0 flex-1">
                  <IconCalendar size={15} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="date"
                    aria-label="Custom date"
                    value={dateISO}
                    min={todayISO}
                    onChange={(e) => setDateISO(e.target.value || todayISO)}
                    className={`${CONTROL} pl-9`}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className={`mb-2 ${LABEL}`}>At</p>
              <div className="relative">
                <IconClock size={15} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="time"
                  aria-label="Start time"
                  value={timeStr}
                  onChange={(e) => setTimeStr(e.target.value)}
                  className={`${CONTROL} pl-9`}
                />
              </div>
              {originalStart != null && (
                <p className="mt-1.5 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                  {keepsOriginalTime ? "Keeping the original time" : `Original: ${formatDisplayTime(minutesToInputTime(originalStart))}`}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-2.5">
            <Button variant="cta" fullWidth onClick={handleReschedule}>
              <IconArrowUp size={16} strokeWidth={2.4} />
              Add to {friendlyDate(dateISO, todayISO)}
            </Button>
            <Button variant="dangerSecondary" fullWidth onClick={handleDismiss}>
              <IconTrash size={15} strokeWidth={2} />
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
