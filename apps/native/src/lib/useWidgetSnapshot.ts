import { useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { localISODate } from '@planr/core/lib/dateUtils';
import { selectWidgetSnapshot } from '@planr/core/lib/widgetSnapshot';

interface WidgetBridge {
  setSnapshot(json: string): void;
  clear(): void;
}

const bridge: WidgetBridge | undefined = Platform.OS === 'ios' ? NativeModules.PlanRWidgetBridge : undefined;

/**
 * Keeps the home-screen and Lock Screen widget in step with the schedule
 * (docs/superpowers/specs/2026-11-08-ios-widget-design.md). Works out the
 * snapshot on every schedule change and on every return to the foreground
 * (which also rolls "today" forward after midnight), and hands it to the
 * native bridge only when what the widget would draw has changed, so a burst
 * of edits doesn't ask WidgetKit to redraw for nothing. Modelled on
 * useReminders.
 */
export function useWidgetSnapshot(schedule: Schedule, ready: boolean): void {
  const [version, setVersion] = useState(0);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setVersion((v) => v + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!bridge || !ready) return;
    const id = setTimeout(() => {
      const snapshot = selectWidgetSnapshot(schedule, localISODate(new Date()));
      // generatedAt changes every time; compare what's drawn, not when.
      const { generatedAt: _generatedAt, ...drawn } = snapshot;
      const key = JSON.stringify(drawn);
      if (key === lastSent.current) return;
      lastSent.current = key;
      bridge.setSnapshot(JSON.stringify(snapshot));
    }, 800);
    return () => clearTimeout(id);
  }, [schedule, ready, version]);
}
