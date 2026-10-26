import { useEffect, useState } from 'react';
import { storage } from '../../storage/mmkv';

/**
 * Native port of lib/onboarding/useCoachTour.ts — per-tour "have they seen
 * it" state, one key per tour id (same `planr-tour-<id>` keys, in MMKV), so
 * tours are independent and each can be replayed on its own.
 */
function storageKey(id: string): string {
  return `planr-tour-${id}`;
}

export function hasSeenTour(id: string): boolean {
  try {
    return storage.getString(storageKey(id)) === '1';
  } catch {
    return true; // storage unavailable — behave as "already seen", never block the UI
  }
}

function markTourSeen(id: string): void {
  try {
    storage.set(storageKey(id), '1');
  } catch {
    // non-fatal — the tour just won't remember it was shown
  }
}

export function resetTour(id: string): void {
  try {
    storage.delete(storageKey(id));
  } catch {
    // non-fatal
  }
}

/**
 * Auto-starts a tour once per device, after a short delay so the targets a
 * CoachMarks step points at have mounted and measured.
 */
export function useCoachTour(id: string, opts: { enabled?: boolean; delayMs?: number } = {}) {
  const { enabled = true, delayMs = 900 } = opts;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled || hasSeenTour(id)) return;
    const t = setTimeout(() => setOpen(true), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);

  function finish() {
    markTourSeen(id);
    setOpen(false);
  }

  function start() {
    setOpen(true);
  }

  return { open, finish, start };
}
