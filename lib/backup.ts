/**
 * Backup & restore — plain-JSON export/import of the full schedule.
 *
 * The export wraps the raw `Schedule` in a small envelope (app tag, format
 * version, timestamps) so future formats stay recognizable. Restore accepts
 * both the envelope and a bare schedule object; the caller is expected to run
 * the result through the normal migrate pipeline, so old exports keep loading
 * as the data model evolves.
 */

import type { Schedule } from "@/lib/useScheduleDB";
import { versionLabel } from "@/lib/buildInfo";
import { localISODate } from "@/lib/dateUtils";

export const BACKUP_FORMAT = 1;

export interface BackupFile {
  app: "PlanR";
  format: number;
  exportedAt: string; // ISO 8601
  appVersion: string;
  schedule: Schedule;
}

export function buildBackupFile(schedule: Schedule): BackupFile {
  return {
    app: "PlanR",
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    appVersion: versionLabel(),
    schedule,
  };
}

export function backupFilename(now = new Date()): string {
  return `planr-backup-${localISODate(now)}.json`;
}

/** Trigger a browser download of the current schedule as a JSON backup. */
export function downloadBackup(schedule: Schedule): void {
  const json = JSON.stringify(buildBackupFile(schedule), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = backupFilename();
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Delay revocation so the download has started in all browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * Parse an uploaded backup file. Returns the raw (un-migrated) schedule
 * object; throws an Error with a user-readable message when the file isn't a
 * PlanR backup. Validation here is deliberately shallow — deep normalization
 * belongs to the migrate pipeline that every stored snapshot already passes
 * through.
 */
export function parseBackup(text: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("That file isn't a PlanR backup.");
  }
  const obj = parsed as Record<string, unknown>;

  if (obj.app === "PlanR") {
    if (typeof obj.format === "number" && obj.format > BACKUP_FORMAT) {
      throw new Error("This backup came from a newer version of PlanR. Update the app, then try again.");
    }
    if (!obj.schedule || typeof obj.schedule !== "object") {
      throw new Error("This backup file has no schedule data in it.");
    }
    return obj.schedule;
  }

  // Bare schedule (e.g., copied straight out of IndexedDB or Firestore).
  if ("plans" in obj || "activities" in obj) return parsed;

  throw new Error("That file isn't a PlanR backup.");
}
