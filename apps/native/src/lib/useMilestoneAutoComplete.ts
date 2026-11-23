import { useEffect, useRef } from 'react';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { completeMilestones, milestonesReadyToComplete, undoAutoComplete } from '@planr/core/lib/milestoneCriteria';
import { todayISO } from '@planr/core/lib/dateUtils';

export interface MilestoneToast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Native twin of lib/useMilestoneAutoComplete.ts: completes milestones the
 * moment every target they set is met (lib/milestoneCriteria.ts) and offers
 * Undo, which hands that milestone back (`autoComplete: false`).
 */
export function useMilestoneAutoComplete(
  schedule: Schedule,
  setSchedule: (updater: (prev: Schedule) => Schedule) => void,
  ready: boolean,
  onToast: (toast: MilestoneToast) => void,
): void {
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  useEffect(() => {
    if (!ready) return;
    const due = milestonesReadyToComplete(schedule);
    if (due.length === 0) return;
    setSchedule((prev) => completeMilestones(prev, due.map((m) => m.id), todayISO()));
    toastRef.current({
      message: due.length === 1 ? `Milestone reached: ${due[0].title}` : `${due.length} milestones reached`,
      actionLabel: 'Undo',
      onAction: () => setSchedule((prev) => undoAutoComplete(prev, due)),
    });
  }, [schedule, setSchedule, ready]);
}
