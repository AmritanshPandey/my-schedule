import { useEffect } from 'react';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { reconcileFinanceEntries } from '@planr/core/lib/taskFields';

/**
 * Native twin of lib/useFinanceLogging.ts: completing a Finance task logs its
 * amount to the chosen tracker for that day, un-completing removes it. One
 * reconcile after every change covers every way a task gets completed
 * (checkbox, last subtask, slots, focus mode).
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
