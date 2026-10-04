/**
 * Cloud-sync status presentation — native port of lib/syncStatus.ts, so the
 * Settings sync row reads exactly like the web's.
 */
import { type SyncStatus } from './cloudSync';

export type SyncTone = 'ok' | 'syncing' | 'warn' | 'error' | 'neutral';

/** "Just now" / "Xs ago" / "Xm ago" / "Xh ago"; "Never" for 0. */
export function relativeTime(ts: number): string {
  if (ts === 0) return 'Never';
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 10) return 'Just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function describeSyncStatus(status: SyncStatus, lastAt: number): { label: string; tone: SyncTone } {
  if (status === 'syncing') return { label: 'Syncing…', tone: 'syncing' };
  if (status === 'offline') return { label: 'Offline', tone: 'warn' };
  if (status === 'error') return { label: 'Sync failed', tone: 'error' };
  if (status === 'merged') return { label: 'Merged changes from another device', tone: 'ok' };
  if (lastAt === 0) return { label: 'Not synced yet', tone: 'neutral' };
  return { label: `Synced ${relativeTime(lastAt)}`, tone: 'ok' };
}
