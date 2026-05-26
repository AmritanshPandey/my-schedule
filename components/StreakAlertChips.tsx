"use client";

import type { Ritual, DayKey, RitualCompletion } from "@/lib/useScheduleDB";

interface StreakAlertChipsProps {
  rituals: Ritual[];
  activeDay: DayKey;
  completedRitualIds: Set<string>;
  ritualCompletions: RitualCompletion[];
}

interface AtRiskRitual {
  ritual: Ritual;
  streak: number;
}

/** ISO date for N days before a given ISO date */
function subtractDay(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function calcRitualStreak(
  ritualId: string,
  completions: RitualCompletion[],
  yesterdayISO: string
): number {
  // Build a set of dates this ritual was completed
  const doneSet = new Set(
    completions.filter((c) => c.ritualId === ritualId).map((c) => c.date)
  );
  let streak = 0;
  let cursor = yesterdayISO;
  while (doneSet.has(cursor)) {
    streak++;
    cursor = subtractDay(cursor, 1);
  }
  return streak;
}

export default function StreakAlertChips({
  rituals,
  activeDay,
  completedRitualIds,
  ritualCompletions,
}: StreakAlertChipsProps) {
  const todayISO = new Date().toISOString().slice(0, 10);
  const yesterdayISO = subtractDay(todayISO, 1);

  // Rituals due today that are NOT yet completed
  const dueAndIncomplete = rituals.filter((r) => {
    const isDue =
      !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(activeDay);
    return isDue && !completedRitualIds.has(r.id);
  });

  // Filter to those with a streak of ≥ 2 consecutive days
  const atRisk: AtRiskRitual[] = dueAndIncomplete
    .map((r) => ({
      ritual: r,
      streak: calcRitualStreak(r.id, ritualCompletions, yesterdayISO),
    }))
    .filter(({ streak }) => streak >= 2);

  if (atRisk.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {atRisk.map(({ ritual, streak }) => (
        <div
          key={ritual.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-500/20 dark:bg-amber-500/[0.08]"
        >
          <span className="text-[13px]">🔥</span>
          <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">
            {streak}-day streak at risk:{" "}
            <span className="font-bold">{ritual.title}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
