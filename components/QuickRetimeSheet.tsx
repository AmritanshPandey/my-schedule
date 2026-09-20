"use client";

import { useEffect, useState } from "react";
import { IconClock } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import TimeInput from "@/components/ui/TimeInput";
import { displayToInputTime } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";

export interface QuickRetimeTarget {
  taskId: string;
  title: string;
  startTime: string;
  endTime: string;
}

interface QuickRetimeSheetProps {
  /** The task/occurrence being retimed, or null when the sheet is closed. */
  target: QuickRetimeTarget | null;
  onClose: () => void;
  /** Times are 24-hour "HH:MM" (TimeInput's own format) — the caller converts. */
  onSave: (taskId: string, startTime: string, endTime: string) => void;
}

/**
 * A quick, single-purpose retime for one occurrence — the fast path for
 * "nudge this to 10am" that doesn't require opening the full task editor.
 * Deliberately narrower than that editor: no title, category or recurrence,
 * just the two times. Only ever offered for a single-slot task (see
 * IOSTimelineRow) — a multi-slot task's per-date override can't cleanly
 * express "just the 9pm slot" through the same mechanism, so those still
 * route to the full editor.
 */
export default function QuickRetimeSheet({ target, onClose, onSave }: QuickRetimeSheetProps) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Reset the controls each time the sheet opens for a different task.
  useEffect(() => {
    if (!target) return;
    setStart(displayToInputTime(target.startTime));
    setEnd(displayToInputTime(target.endTime));
  }, [target]);

  function handleSave() {
    if (!target) return;
    haptic("light");
    onSave(target.taskId, start, end);
    onClose();
  }

  return (
    <BottomSheet open={!!target} onClose={onClose}>
      {target && (
        <div className="px-5 pb-6 pt-4">
          <SheetHeader eyebrow="Today only" title={target.title} onClose={onClose} />

          <div className="mt-5 grid grid-cols-2 gap-3">
            <TimeInput label="Start" value={start} onChange={setStart} ariaLabel="Start time" />
            <TimeInput label="End" value={end} onChange={setEnd} ariaLabel="End time" />
          </div>
          <p className="mt-2 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            Changes just today's occurrence — the rest of the series keeps its usual time.
          </p>

          <Button variant="cta" fullWidth className="mt-5" onClick={handleSave}>
            <IconClock size={16} strokeWidth={2.4} />
            Save
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
