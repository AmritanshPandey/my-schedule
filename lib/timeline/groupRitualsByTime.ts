import type { Ritual } from "@/lib/useScheduleDB";
import { parseTimeToMinutes } from "@/lib/timeUtils";
import { ritualScheduledOnDate } from "@/lib/ritualRecurrence";

export interface RitualGroup {
  key: string;
  timeMinutes: number;
  top: number;
  rituals: Ritual[];
}

export function groupRitualsByTime(
  rituals: Ritual[],
  dateISO: string,
  timelineStartMinutes: number,
  timelineEndMinutes: number,
  timelineTopPadding: number,
  hourHeight: number,
  trackingStart?: string,
): RitualGroup[] {
  const visible = rituals.filter((r) => {
    if (!ritualScheduledOnDate(r, dateISO, trackingStart)) return false;
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
