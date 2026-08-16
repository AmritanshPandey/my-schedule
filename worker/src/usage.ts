/**
 * Daily usage caps on the shared Gemini key — a per-user cap (one user can't
 * drain the whole free-tier quota) and a global cap (the aggregate across
 * every user can't either, since everyone shares one key). Both are simple
 * Firestore counter docs, reset implicitly by the date in their path/fields
 * changing.
 *
 * Firestore.setDoc (firestore.ts) is a PATCH-merge, not an atomic increment —
 * this client has no transaction support. Under concurrent requests (same
 * user, or globally) there's a narrow read-then-write race where two requests
 * can both read the same count before either writes, undercounting by one.
 * Acceptable at this app's personal/small-user scale — not solved here.
 */

import type { Firestore } from "./firestore.js";

export function todayUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export interface UsageCaps {
  perUser: number;
  global: number;
}

export type UsageCheck = { ok: true } | { ok: false; reason: "per-user-cap" | "global-cap" };

async function readCount(fs: Firestore, path: string, date: string): Promise<number> {
  const doc = await fs.getDoc(path);
  if (!doc || doc.fields.date !== date) return 0; // no doc yet, or a stale prior day
  return typeof doc.fields.count === "number" ? doc.fields.count : 0;
}

/**
 * Checks both caps for `uid` on the current UTC day. Under both → increments
 * both counters, returns {ok:true}. Either cap already met → returns
 * {ok:false, reason} WITHOUT incrementing (a rejected request shouldn't cost
 * budget).
 */
export async function checkAndIncrement(
  fs: Firestore,
  uid: string,
  caps: UsageCaps,
  now: Date = new Date(),
): Promise<UsageCheck> {
  const date = todayUTC(now);
  const userPath = `users/${uid}/aiUsage/${date}`;
  // Firestore document paths must alternate collection/document (an even
  // segment count) — "system/aiUsage/{date}" is 3 segments, which addresses a
  // COLLECTION named {date} under document "system/aiUsage", not a document.
  // Firestore's REST API rejects that as an invalid document reference,
  // which crashed every /ai/chat call (uncaught, since this read wasn't
  // wrapped in a try/catch in index.ts — see the fix there too).
  const globalPath = `system/aiUsage/global/${date}`;

  const [userCount, globalCount] = await Promise.all([
    readCount(fs, userPath, date),
    readCount(fs, globalPath, date),
  ]);

  if (userCount >= caps.perUser) return { ok: false, reason: "per-user-cap" };
  if (globalCount >= caps.global) return { ok: false, reason: "global-cap" };

  await Promise.all([
    fs.setDoc(userPath, { date, count: userCount + 1 }),
    fs.setDoc(globalPath, { date, count: globalCount + 1 }),
  ]);
  return { ok: true };
}
