import type { Ritual, DayKey } from "@/lib/useScheduleDB";
import { parseTimeToMinutes } from "@/lib/timeUtils";

export interface RitualGroup {
  key: string;
  timeMinutes: number;
  top: number;
  rituals: Ritual[];
}

export function groupRitualsByTime(
  rituals: Ritual[],
  activeDay: DayKey,
  timelineStartMinutes: number,
  timelineEndMinutes: number,
  timelineTopPadding: number,
  hourHeight: number,
): RitualGroup[] {
  const visible = rituals.filter((r) => {
    if (r.repeatDays && r.repeatDays.length > 0 && !r.repeatDays.includes(activeDay)) return false;
    const mins = parseTimeToMinutes(r.time);
    if (mins === null) return false;
    return mins >= timelineStartMinutes && mins <= timelineEndMinutes;
  });

  const map = new Map<number, Ritual[]>();
  for (const ritual of visible) {
    const mins = parseTimeToMinutes(ritual.time)!;
    if (!map.has(mins)) map.set(mins, []);
    map.get(mins)!.push(ritual);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([mins, group]) => ({
      key: String(mins),
      timeMinutes: mins,
      top: timelineTopPadding + ((mins - timelineStartMinutes) / 60) * hourHeight,
      rituals: group,
    }));
}
