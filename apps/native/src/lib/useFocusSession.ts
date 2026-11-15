import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  FOCUS_STORAGE_KEY,
  focusReducer,
  isFocusResumable,
  startFocus,
  type FocusAction,
  type FocusState,
} from '@planr/core/lib/focusSession';
import { todayISO } from '@planr/core/lib/dateUtils';
import { storage } from '../storage/mmkv';
import { armRestAlert, cancelRestAlert } from './reminders';
import { logError } from './errorLog';

function read(): FocusState | null {
  try {
    const raw = storage.getString(FOCUS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as FocusState) : null;
    if (isFocusResumable(parsed, todayISO())) return parsed;
    if (raw) storage.delete(FOCUS_STORAGE_KEY);
  } catch (err) {
    logError('focus:read', err);
    storage.delete(FOCUS_STORAGE_KEY);
  }
  return null;
}

function write(next: FocusState | null) {
  if (next) storage.set(FOCUS_STORAGE_KEY, JSON.stringify(next));
  else storage.delete(FOCUS_STORAGE_KEY);
}

/**
 * Native port of lib/useFocusSession.ts: the session, persisted to MMKV on
 * every transition (MMKV writes are synchronous, so a kill right after a tap
 * loses nothing), restored on launch if it was started today. A rest that
 * outlives the app being in the foreground is backed by a local notification.
 */
export function useFocusSession(restTitle: (state: FocusState) => string) {
  const [state, setState] = useState<FocusState | null>(read);
  const [open, setOpen] = useState(() => state != null);
  const titleRef = useRef(restTitle);
  titleRef.current = restTitle;

  // Keep the OS-level rest alert in step with the session's rest.
  const armedFor = useRef<number | null>(null);
  useEffect(() => {
    const endsAt = state && state.runningSince != null ? state.restEndsAt : null;
    if (endsAt === armedFor.current) return;
    armedFor.current = endsAt;
    void cancelRestAlert().then(() => {
      if (endsAt != null && state) void armRestAlert(endsAt, titleRef.current(state));
    });
  }, [state]);

  const start = useCallback(
    (input: Omit<Parameters<typeof startFocus>[0], 'now'>) => {
      setState((prev) => {
        // Re-opening the same task today continues its session.
        if (prev && prev.taskId === input.taskId && prev.dateISO === input.dateISO) return prev;
        const next = startFocus({ ...input, now: Date.now() });
        write(next);
        return next;
      });
      setOpen(true);
    },
    [],
  );

  const dispatch = useCallback((action: FocusAction) => {
    setState((prev) => {
      if (!prev) return prev;
      const next = focusReducer(prev, action);
      if (next !== prev) write(next);
      return next;
    });
  }, []);

  const hide = useCallback(() => setOpen(false), []);
  const end = useCallback(() => {
    write(null);
    setState(null);
    setOpen(false);
  }, []);

  return { state, open, start, dispatch, hide, end };
}

/** Re-render every second while `active`, and at once when the app returns to the foreground. */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const refresh = () => setNow(Date.now());
    const id = setInterval(refresh, 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [active]);
  return now;
}
