"use client";

import { useEffect } from "react";
import type { Schedule } from "@/lib/useScheduleDB";
import { reconcileFinanceEntries } from "@/lib/taskFields";

/**
 * Keeps each Finance task's logged amounts in step with its completions
 * (lib/taskFields.ts): completing the task logs its amount to the chosen
 * tracker for that day, un-completing removes it. One reconcile after every
 * change covers every way a task gets completed (checkbox, last subtask,
 * slots, focus mode).
 */
export function useFinanceLogging(
  schedule: Schedule,
  setSchedule: (updater: (prev: Schedule) => Schedule) => void,
  ready: boolean,
): void {
  useEffect(() => {
    if (!ready) return;
    if (reconcileFinanceEntries(schedule) === schedule) return;
    setSchedule((prev) => reconcileFinanceEntries(prev));
  }, [schedule, setSchedule, ready]);
}
