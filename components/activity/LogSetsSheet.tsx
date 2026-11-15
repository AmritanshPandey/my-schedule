"use client";

import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import SetTable from "@/components/activity/SetTable";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import type { LoggedSet, SetLog } from "@/lib/useScheduleDB";
import type { TargetValues } from "@planr/core/lib/scheduleEntry";
import { previousSetLog, setLogFor, setLogId, startingSets } from "@/lib/setLogs";
import { formatStrengthTargets } from "@/lib/subtaskTargets";

interface LogSetsSheetProps {
  open: boolean;
  onClose: () => void;
  taskId: string;
  entry: ScheduleEntry;
  /** The figures that apply today (base targets plus accepted steps). */
  values: TargetValues;
  dateISO: string;
  setLogs: readonly SetLog[] | undefined;
  /** Save the session; `allDone` is true when every working set is ticked. */
  onSave: (log: SetLog, allDone: boolean) => void;
}

/**
 * Log one subtask's sets for one day, outside focus mode — the same table,
 * opened from a checklist row. Reopening a day continues that day's session.
 * The caller mounts it per opening (keyed by subtask), so state starts fresh.
 */
export default function LogSetsSheet({ open, onClose, taskId, entry, values, dateISO, setLogs, onSave }: LogSetsSheetProps) {
  const weightUnit = values.weightUnit ?? entry.targets?.weightUnit ?? "kg";
  const previous = previousSetLog(setLogs, taskId, entry.id, dateISO);
  const existing = setLogFor(setLogs, taskId, entry.id, dateISO);
  const [sets, setSets] = useState<LoggedSet[]>(() => existing?.sets ?? startingSets(values, previous));
  const showWeight = values.weight != null || sets.some((s) => s.weight != null) || (previous?.sets.some((s) => s.weight != null) ?? false);
  const target = formatStrengthTargets(values);

  function save() {
    const working = sets.filter((s) => !s.warmup);
    onSave(
      {
        id: setLogId(taskId, entry.id, dateISO),
        taskId,
        subtaskId: entry.id,
        dateISO,
        weightUnit,
        sets,
        completedAt: new Date().toISOString(),
      },
      working.length > 0 && working.every((s) => s.done),
    );
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="space-y-4 px-5 pb-8 pt-4">
        <SheetHeader eyebrow="Log sets" title={entry.task} onClose={onClose} />
        {target && (
          <p className="-mt-2 text-[14px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">Target {target}</p>
        )}
        <SetTable sets={sets} onChange={setSets} previous={previous} weightUnit={weightUnit} showWeight={showWeight} />
        <Button variant="primary" fullWidth onClick={save} icon={<IconCheck size={18} strokeWidth={2.6} />}>
          Save sets
        </Button>
      </div>
    </BottomSheet>
  );
}
