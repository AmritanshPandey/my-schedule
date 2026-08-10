/**
 * Server-side reminder computation — the mirror of the client's
 * `lib/reminders.ts` `collectReminders`, adapted for a scheduled worker:
 *
 * - Works in the USER'S timezone (turning a ritual's local "07:00" into a fire
 *   decision), because the worker runs in UTC.
 * - Fires a reminder whose local time fell inside the just-elapsed window,
 *   rather than "any future reminder today".
 *
 * Pure and dependency-free so it can be reasoned about and unit-tested.
 */

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayKey = (typeof DAYS)[number];

export interface ReminderSettings {
  enabled: boolean;
  tasks: boolean;
  rituals: boolean;
  streakNudge: boolean;
  nudgeTime: string; // "HH:MM"
}

interface Slot { startTime?: string; endTime?: string; }
interface CompletionEvent { completedAt?: string; completionType?: string; subtaskId?: string; }
interface Task {
  id: string;
  title?: string;
  taskType?: string;
  startTime?: string;
  endTime?: string;
  slots?: Slot[];
  completed?: boolean;
  missed?: boolean;
  completionHistory?: CompletionEvent[];
  activeFrom?: string;
  activeUntil?: string;
  exceptions?: Record<string, { skipped?: boolean } | undefined>;
  recurrence?: { type?: string; anchorDate?: string; intervalWeeks?: number };
}
interface Ritual { id: string; title?: string; time?: string; repeatDays?: DayKey[]; }
export interface Schedule {
  activities?: Partial<Record<DayKey, Task[]>>;
  rituals?: Ritual[];
  ritualCompletions?: { ritualId: string; date: string }[];
}

export interface DueReminder {
  /** Stable key = the client's notification tag, so foreground + worker collapse. */
  tag: string;
  title: string;
  body: string;
  url: string;
}

/** Parse "9:00 AM" / "09:00" → minutes from midnight, or null. */
export function parseTimeToMinutes(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = Number(m12[1]);
    const m = Number(m12[2]);
    if (h < 1 || h > 12 || m > 59) return null;
    const pm = m12[3].toUpperCase() === "PM";
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return h * 60 + m;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  return null;
}

function formatDisplay(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The user's current local date + minute-of-day in their IANA timezone. */
export function localNow(tz: string, now: Date): { dateISO: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0; // some engines emit 24 at midnight
  return { dateISO: `${get("year")}-${get("month")}-${get("day")}`, minutes: hour * 60 + Number(get("minute")) };
}

function weekdayOf(dateISO: string): DayKey {
  const dow = new Date(`${dateISO}T00:00:00Z`).getUTCDay(); // Sun=0
  return DAYS[(dow + 6) % 7];
}

function getSlots(task: Task): Slot[] {
  if (Array.isArray(task.slots) && task.slots.length > 0) return task.slots;
  return [{ startTime: task.startTime, endTime: task.endTime }];
}

function isDone(task: Task, dateISO: string): boolean {
  if (task.completed || task.missed) return true;
  return (task.completionHistory ?? []).some(
    (e) => (e.completionType === "task" || (e.completionType === "missed" && !e.subtaskId)) &&
      typeof e.completedAt === "string" && e.completedAt.slice(0, 10) === dateISO,
  );
}

/** Minimal port of isTaskScheduledOn: active window, skip exceptions, weekly interval. */
function scheduledOn(task: Task, dateISO: string): boolean {
  if (task.exceptions?.[dateISO]?.skipped) return false;
  if (task.activeFrom && dateISO < task.activeFrom) return false;
  if (task.activeUntil && dateISO > task.activeUntil) return false;
  const rec = task.recurrence;
  if (rec?.type === "once") return rec.anchorDate === dateISO;
  if (rec?.type === "weekly" && rec.intervalWeeks && rec.intervalWeeks > 1 && rec.anchorDate) {
    const a = new Date(`${rec.anchorDate}T00:00:00Z`).getTime();
    const d = new Date(`${dateISO}T00:00:00Z`).getTime();
    const weeks = Math.round((d - a) / (7 * 86400000));
    if (weeks < 0 || weeks % rec.intervalWeeks !== 0) return false;
  }
  return true;
}

function isTracked(task: Task): boolean {
  return task.taskType !== "commitment";
}

/**
 * Reminders whose local fire time fell within `(localMinutes - windowMinutes,
 * localMinutes]` for the user's current local day — i.e. just came due.
 */
export function computeDueReminders(
  schedule: Schedule,
  settings: ReminderSettings,
  tz: string,
  now: Date,
  windowMinutes = 3,
): DueReminder[] {
  if (!settings.enabled) return [];
  const { dateISO, minutes: nowMin } = localNow(tz, now);
  const dayKey = weekdayOf(dateISO);
  const inWindow = (min: number) => min <= nowMin && nowMin - min < windowMinutes;
  const out: DueReminder[] = [];

  if (settings.tasks) {
    for (const task of schedule.activities?.[dayKey] ?? []) {
      if (isDone(task, dateISO) || !scheduledOn(task, dateISO)) continue;
      getSlots(task).forEach((slot, index) => {
        const min = parseTimeToMinutes(slot.startTime);
        if (min == null || !inWindow(min)) return;
        out.push({
          tag: `planr-task-${task.id}-${dateISO}-${index}`,
          title: task.title || "Task",
          body: `Starts now · ${formatDisplay(min)}`,
          url: "/",
        });
      });
    }
  }

  if (settings.rituals) {
    const doneToday = new Set(
      (schedule.ritualCompletions ?? []).filter((c) => c.date === dateISO).map((c) => c.ritualId),
    );
    for (const ritual of schedule.rituals ?? []) {
      if (doneToday.has(ritual.id)) continue;
      if (ritual.repeatDays && ritual.repeatDays.length > 0 && !ritual.repeatDays.includes(dayKey)) continue;
      const min = parseTimeToMinutes(ritual.time);
      if (min == null || !inWindow(min)) continue;
      out.push({
        tag: `planr-ritual-${ritual.id}-${dateISO}`,
        title: ritual.title || "Routine",
        body: `Routine · ${formatDisplay(min)}`,
        url: "/",
      });
    }
  }

  if (settings.streakNudge) {
    const min = parseTimeToMinutes(settings.nudgeTime);
    if (min != null && inWindow(min)) {
      const open = (schedule.activities?.[dayKey] ?? []).filter(
        (t) => !isDone(t, dateISO) && scheduledOn(t, dateISO) && isTracked(t),
      ).length;
      if (open > 0) {
        out.push({
          tag: `planr-nudge-${dateISO}`,
          title: open === 1 ? "1 task still open" : `${open} tasks still open`,
          body: "Close the loop before the day ends.",
          url: "/",
        });
      }
    }
  }

  return out;
}
