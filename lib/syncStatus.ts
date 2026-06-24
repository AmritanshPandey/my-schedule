/**
 * Pure cloud-sync status presentation helpers. Single source of truth so the
 * mobile header dot, the desktop sidebar row, and the Settings sync row can't
 * drift apart. No runtime dependency on the sync engine (the `SyncStatus` import
 * is type-only, erased at build), so these stay trivially unit-testable.
 */

import { type SyncStatus } from "@/lib/cloudSync";

export type SyncTone = "ok" | "syncing" | "warn" | "error" | "neutral";

/** "Just now" / "Xs ago" / "Xm ago" / "Xh ago"; "Never" for 0. */
export function relativeTime(ts: number): string {
  if (ts === 0) return "Never";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 10) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/**
 * Map raw sync state to a human label + tone. Note: the engine's "idle" means
 * "caught up / synced" (there is no separate "synced" status value).
 */
export function describeSyncStatus(status: SyncStatus, lastAt: number): { label: string; tone: SyncTone } {
  if (status === "syncing") return { label: "Syncing…", tone: "syncing" };
  if (status === "offline") return { label: "Offline", tone: "warn" };
  if (status === "error") return { label: "Sync failed", tone: "error" };
  if (lastAt === 0) return { label: "Not synced yet", tone: "neutral" };
  return { label: `Synced ${relativeTime(lastAt)}`, tone: "ok" };
}
