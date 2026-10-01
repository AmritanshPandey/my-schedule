/**
 * Native stand-in for @planr/core/lib/scheduleSchema.ts's zod-based
 * validateSchedule — deliberately NOT importing that file. Its zod v4
 * dependency ships `export * as core from "..."` (ES2020 export-namespace
 * syntax) in its ESM build, which Metro's default transform can't bundle
 * ("Export namespace should be first transformed by
 * @babel/plugin-transform-export-namespace-from") — a known zod-v4/Metro
 * incompatibility, not something fixable by editing this project's own
 * babel.config.js (node_modules code isn't run through it the same way).
 *
 * A full schema rewrite isn't worth working around that for: web's zod
 * validator exists to catch drift from years of migrations across browser
 * IndexedDB records (see scheduleStore.ts's own note: "native has no legacy
 * formats to migrate from"). This is the same proportionate shape guard
 * getSchedule() already uses to decide a stored blob is usable at all —
 * applied here to what's about to be pushed to Firestore instead of to what
 * was just read from MMKV.
 */
import type { Schedule } from '@planr/core/lib/scheduleTypes';

export function schedulePayloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export type ValidateScheduleResult =
  | { success: true; data: Schedule }
  | { success: false; error: { issues: [{ path: string[]; message: string }] } };

export function validateSchedule(value: unknown): ValidateScheduleResult {
  const v = value as Partial<Schedule> | null | undefined;
  if (!v || typeof v !== 'object' || !Array.isArray(v.plans) || !v.activities || typeof v.activities !== 'object') {
    return { success: false, error: { issues: [{ path: [], message: 'not a Schedule-shaped object' }] } };
  }
  return { success: true, data: v as Schedule };
}
