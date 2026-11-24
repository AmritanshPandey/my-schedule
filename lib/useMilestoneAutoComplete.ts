"use client";

import { useEffect, useRef } from "react";
import type { Schedule } from "@/lib/useScheduleDB";
import { completeMilestones, milestonesReadyToComplete, undoAutoComplete } from "@/lib/milestoneCriteria";
import { todayISO } from "@/lib/dateUtils";

export interface MilestoneToast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Completes milestones the moment every target they set is met
 * (lib/milestoneCriteria.ts), and offers Undo. Runs after each change to the
 * schedule, once it has loaded; undoing hands that milestone back to the
 * person (`autoComplete: false`) so it doesn't complete straight back.
 */
export function useMilestoneAutoComplete(
  schedule: Schedule,
  setSchedule: (updater: (prev: Schedule) => Schedule) => void,
  ready: boolean,
  onToast: (toast: MilestoneToast) => void,
): void {
  // The latest toast callback without re-running the effect for it.
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  useEffect(() => {
    if (!ready) return;
    const due = milestonesReadyToComplete(schedule);
    if (due.length === 0) return;
    setSchedule((prev) => completeMilestones(prev, due.map((m) => m.id), todayISO()));
    toastRef.current({
      message: due.length === 1 ? `Milestone reached: ${due[0].title}` : `${due.length} milestones reached`,
      actionLabel: "Undo",
      onAction: () => setSchedule((prev) => undoAutoComplete(prev, due)),
    });
  }, [schedule, setSchedule, ready]);
}
