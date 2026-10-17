/**
 * Native port of lib/diagnostics.ts — a snapshot of app/platform/sync state
 * and the on-device error log, for the Settings Debug card. The web's service
 * worker, cache and iOS-safe-mode fields have no native counterpart; the
 * platform block reports the OS instead of a user agent.
 */
import { Platform } from 'react-native';
import { APP_VERSION, BUILD_ID } from './buildInfo';
import { getLastSyncedAt, getSyncStatus, type SyncStatus } from './cloudSync';
import { getErrorLog, type LoggedError } from './errorLog';

export interface DiagnosticsSnapshot {
  app: { version: string; buildId: string };
  platform: { os: string; osVersion: string; isPad: boolean };
  sync: { status: SyncStatus; lastSyncedAt: number };
  errors: LoggedError[];
  capturedAt: string;
}

export async function collectDiagnostics(): Promise<DiagnosticsSnapshot> {
  return {
    app: { version: APP_VERSION, buildId: BUILD_ID },
    platform: {
      os: Platform.OS,
      osVersion: String(Platform.Version),
      isPad: Platform.OS === 'ios' && Platform.isPad,
    },
    sync: { status: getSyncStatus(), lastSyncedAt: getLastSyncedAt() },
    errors: getErrorLog(),
    capturedAt: new Date().toISOString(),
  };
}

export function formatDiagnostics(snapshot: DiagnosticsSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
