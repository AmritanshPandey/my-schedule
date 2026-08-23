/**
 * Time-of-day bucketing for the Routine screen — replaces RitualView.tsx's
 * former local `TIME_GROUPS`/`timeGroupIndex`/`grouped` memo with one shared,
 * reusable module (also used by Phase 4's per-bucket consistency %).
 *
 * Deliberately separate from lib/timeline/groupRitualsByTime.ts, which does
 * pixel positioning for the day timeline overlay — a different job entirely.
 */
import type { Ritual } from "@/lib/useScheduleDB";
import { parseTimeToMinutes } from "@/lib/timeUtils";

export type RitualTimeBucketKey = "morning" | "afternoon" | "evening" | "anytime";

export interface RitualTimeBucket {
  key: RitualTimeBucketKey;
  label: string;
  /** Exclusive upper bound in minutes-from-midnight; absent for "anytime". */
  max?: number;
}

// Chronological order so a daily practice reads morning → evening → anytime.
export const RITUAL_TIME_BUCKETS: readonly RitualTimeBucket[] = [
  { key: "morning", label: "Morning", max: 12 * 60 },
  { key: "afternoon", label: "Afternoon", max: 17 * 60 },
  { key: "evening", label: "Evening", max: 24 * 60 },
  { key: "anytime", label: "Anytime" },
];

export function bucketForRitual(ritual: Pick<Ritual, "time" | "anyTime">): RitualTimeBucketKey {
  if (ritual.anyTime) return "anytime";
  const minutes = parseTimeToMinutes(ritual.time) ?? 0;
  const bucket = RITUAL_TIME_BUCKETS.find((b) => b.max !== undefined && minutes < b.max);
  return bucket?.key ?? "anytime";
}

export interface GroupedRituals<T extends Pick<Ritual, "time" | "anyTime">> {
  key: RitualTimeBucketKey;
  label: string;
  items: T[];
}

/** Groups rituals into time buckets, sorted within each bucket by time
 *  (anytime routines keep their incoming order — there's no time to sort by).
 *  Empty buckets are omitted from the result. */
export function groupRitualsIntoBuckets<T extends Pick<Ritual, "time" | "anyTime">>(
  rituals: T[],
): GroupedRituals<T>[] {
  const buckets = RITUAL_TIME_BUCKETS.map((b) => ({ key: b.key, label: b.label, items: [] as T[] }));
  for (const ritual of rituals) {
    const key = bucketForRitual(ritual);
    buckets.find((b) => b.key === key)!.items.push(ritual);
  }
  for (const b of buckets) {
    if (b.key !== "anytime") {
      b.items.sort((a, z) => (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(z.time) ?? 0));
    }
  }
  return buckets.filter((b) => b.items.length > 0);
}
