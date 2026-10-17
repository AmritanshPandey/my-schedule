/**
 * Backup & restore — the format and parser live in @planr/core (shared with
 * apps/native); this file adds the browser download.
 */

import type { Schedule } from "@/lib/useScheduleDB";
import { backupFilename, buildBackupFile } from "@planr/core/lib/backup";
import { versionLabel } from "@/lib/buildInfo";

export * from "@planr/core/lib/backup";

/** Trigger a browser download of the current schedule as a JSON backup. */
export function downloadBackup(schedule: Schedule): void {
  const json = JSON.stringify(buildBackupFile(schedule, versionLabel()), null, 2);
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
