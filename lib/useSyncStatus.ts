"use client";

/**
 * Live cloud-sync status hook. Subscribes to the sync engine and exposes a
 * presentation-ready { label, tone } plus a guarded syncNow(). Keep this hook in
 * small leaf components (header dot, sidebar row, Settings row) so its 30s tick
 * and status updates re-render only the indicator — never the whole app.
 */

import { useEffect, useState } from "react";
import {
  getSyncStatus,
  getLastSyncedAt,
  getLastSchedule,
  onSyncStatusChange,
  flushNow,
  type SyncStatus,
} from "@/lib/cloudSync";
import { describeSyncStatus } from "@/lib/syncStatus";

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [lastAt, setLastAt] = useState(getLastSyncedAt());
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");
  const [, tick] = useState(0);

  useEffect(
    () => onSyncStatusChange((s) => {
      setStatus(s);
      if (s === "idle") setLastAt(getLastSyncedAt());
    }),
    [],
  );

  // While idle, re-render every 30s so the "Synced Xm ago" label stays fresh.
  useEffect(() => {
    if (status !== "idle") return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [status]);

  const isBusy = busy || status === "syncing";

  async function syncNow() {
    if (busy || status === "syncing") return;
    const snap = getLastSchedule(); // engine keeps this fresh on every edit
    if (!snap) {
      setLastResult("Nothing to sync yet");
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setLastResult("Offline; will retry when connected");
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
        nextStatus === "error"
          ? "Sync failed; retry is queued"
          : nextStatus === "offline"
          ? "Offline; sync is queued"
          : nextLastAt > 0
          ? "Synced just now"
          : "Sync checked"
      );
    } catch {
      setLastResult("Sync failed; retry is queued");
    } finally {
      setBusy(false);
    }
  }

  const { label, tone } = describeSyncStatus(status, lastAt);
  return { status, lastAt, label, tone, isBusy, lastResult, syncNow };
}
