import { useEffect, useState } from 'react';
import { flushNow, getLastSchedule, getLastSyncedAt, getSyncStatus, onSyncStatusChange, type SyncStatus } from './cloudSync';
import { describeSyncStatus } from './syncStatus';

/**
 * Native port of lib/useSyncStatus.ts — live cloud-sync status for the
 * Settings sync row: a presentation-ready { label, tone } plus a guarded
 * syncNow(). Kept in the leaf row so its 30s tick re-renders only the row.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [lastAt, setLastAt] = useState(getLastSyncedAt());
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');
  const [, tick] = useState(0);

  useEffect(
    () =>
      onSyncStatusChange((s) => {
        setStatus(s);
        if (s === 'idle') setLastAt(getLastSyncedAt());
      }),
    [],
  );

  // While idle, re-render every 30s so the "Synced Xm ago" label stays fresh.
  useEffect(() => {
    if (status !== 'idle') return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [status]);

  const isBusy = busy || status === 'syncing';

  async function syncNow() {
    if (busy || status === 'syncing') return;
    const snap = getLastSchedule(); // engine keeps this fresh on every edit
    if (!snap) {
      setLastResult('Nothing to sync yet');
      return;
    }
    setBusy(true);
    try {
      await flushNow(snap);
      const nextStatus = getSyncStatus();
      const nextLastAt = getLastSyncedAt();
      setStatus(nextStatus);
      setLastAt(nextLastAt);
      setLastResult(
        nextStatus === 'error'
          ? 'Sync failed; retry is queued'
          : nextStatus === 'offline'
            ? 'Offline; sync is queued'
            : nextStatus === 'merged'
              ? 'Merged changes from another device'
              : nextLastAt > 0
                ? 'Synced just now'
                : 'Sync checked',
      );
    } catch {
      setLastResult('Sync failed; retry is queued');
    } finally {
      setBusy(false);
    }
  }

  const { label, tone } = describeSyncStatus(status, lastAt);
  return { status, lastAt, label, tone, isBusy, lastResult, syncNow };
}
