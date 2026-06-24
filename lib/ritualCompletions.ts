import type { RitualCompletion } from "@/lib/useScheduleDB";

export function toggleRitualCompletion(
  completions: RitualCompletion[],
  ritualId: string,
  dateISO: string
): RitualCompletion[] {
  const exists = completions.some((item) => item.ritualId === ritualId && item.date === dateISO);
  if (exists) {
    return completions.filter((item) => !(item.ritualId === ritualId && item.date === dateISO));
  }
  return [...completions, { ritualId, date: dateISO }];
}
