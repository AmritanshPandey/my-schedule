"use client";

import { useEffect, useState } from "react";
import type { Schedule } from "@/lib/useScheduleDB";
import { armReminders, REMINDERS_CHANGED_EVENT } from "@/lib/reminders";

/**
 * Keeps the reminder timer chain in step with the schedule. Re-arms on every
 * schedule change (so completed tasks drop their pending reminders), on
 * settings changes from the Reminders UI, and when the tab becomes visible
 * (timers may have been throttled while hidden).
 */
export function useReminders(schedule: Schedule, ready: boolean): void {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener(REMINDERS_CHANGED_EVENT, bump);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(REMINDERS_CHANGED_EVENT, bump);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    return armReminders(schedule);
  }, [schedule, ready, version]);
}
