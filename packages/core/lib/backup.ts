/**
 * Backup & restore — plain-JSON export/import of the full schedule.
 *
 * The export wraps the raw `Schedule` in a small envelope (app tag, format
 * version, timestamps) so future formats stay recognizable. Restore accepts
 * both the envelope and a bare schedule object; the caller is expected to run
 * the result through the normal migrate pipeline, so old exports keep loading
 * as the data model evolves.
 */

import type { Schedule } from "./scheduleTypes";
import { localISODate } from "./dateUtils";

export const BACKUP_FORMAT = 1;

export interface BackupFile {
  app: "PlanR";
  format: number;
  exportedAt: string; // ISO 8601
  appVersion: string;
  schedule: Schedule;
}

/** `appVersion` is the exporting app's own version label (web and native each
 *  have their own build identity). */
export function buildBackupFile(schedule: Schedule, appVersion: string): BackupFile {
  return {
    app: "PlanR",
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    appVersion,
    schedule,
  };
}

export function backupFilename(now = new Date()): string {
  return `planr-backup-${localISODate(now)}.json`;
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

  function hasPlausibleScheduleShape(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const schedule = value as Record<string, unknown>;
    if ("plans" in schedule && !Array.isArray(schedule.plans)) return false;
    if ("activities" in schedule && (!schedule.activities || typeof schedule.activities !== "object" || Array.isArray(schedule.activities))) return false;
    return "activities" in schedule || "work" in schedule || "personal" in schedule || "diet" in schedule || "workout" in schedule;
  }

  if (obj.app === "PlanR") {
    if (typeof obj.format === "number" && obj.format > BACKUP_FORMAT) {
      throw new Error("This backup came from a newer version of PlanR. Update the app, then try again.");
    }
    if (!hasPlausibleScheduleShape(obj.schedule)) {
      throw new Error("This backup file has no schedule data in it.");
    }
    return obj.schedule;
  }

  // Bare schedule (e.g., copied straight out of IndexedDB or Firestore).
  if (hasPlausibleScheduleShape(parsed)) return parsed;

  throw new Error("That file isn't a PlanR backup.");
}
