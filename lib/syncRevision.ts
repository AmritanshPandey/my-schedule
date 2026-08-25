/**
 * The compare-and-swap rule for cloud pushes, kept pure and separate from the
 * sync engine so it can be tested without Firebase.
 *
 * Background: the snapshot document used to be written with an unconditional
 * setDoc, and the only freshness signal in the system was two unsynchronised
 * device wall clocks. A second device holding older data would therefore
 * replace the first device's work outright. The fix is to make every push
 * conditional on the revision this device has actually incorporated.
 */

import type { Schedule } from "@/lib/useScheduleDB";

/** Shape of users/{uid}/data/snapshot. `rev` is absent on pre-CAS documents. */
export interface SnapshotDoc {
  schedule?: Schedule;
  lastUpdated?: number;
  rev?: number;
}

/**
 * May this device replace the remote document?
 *
 * The honest question is "have I incorporated what is up there", not "is my
 * clock ahead". With a known base rev that is exactly a revision equality
 * check. Without one — a device that has never pulled — the only safe answers
 * are "no document exists yet" or "the document predates the CAS scheme and
 * isn't newer than what I hold", which covers the one-off migration window and
 * nothing beyond it.
 *
 * @param data     the remote document, or null if it does not exist
 * @param baseRev  the rev whose content this device holds; null if never pulled
 * @param localLastUpdated  this device's local clock stamp, the legacy signal
 */
export function pushIsSafe(
  data: SnapshotDoc | null,
  baseRev: number | null,
  localLastUpdated: number,
): boolean {
  if (!data) return true;
  if (baseRev !== null) return (data.rev ?? 0) === baseRev;
  if (data.rev !== undefined) return false;
  return (data.lastUpdated ?? 0) <= localLastUpdated;
}
