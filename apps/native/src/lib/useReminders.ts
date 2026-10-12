import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { armReminders, onReminderForegroundEvents, onReminderSettingsChange } from './reminders';

/**
 * Native port of lib/useReminders.ts — keeps the OS's scheduled reminders in
 * step with the schedule. Re-arms on every schedule change (so a completed
 * task drops its pending reminder), on settings changes from the Reminders
 * rows, and on every return to the foreground (the web's visibilitychange),
 * which also rolls the scheduled window forward a day after midnight. Also
 * handles Snooze / Dismiss pressed on a reminder while PlanR is open.
 */
export function useReminders(schedule: Schedule, ready: boolean): void {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const offSettings = onReminderSettingsChange(bump);
    const offActions = onReminderForegroundEvents();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') bump();
    });
    return () => {
      offSettings();
      offActions();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Debounced: a burst of edits (checking off three subtasks) re-arms once.
    const id = setTimeout(() => void armReminders(schedule), 800);
    return () => clearTimeout(id);
  }, [schedule, ready, version]);
}
