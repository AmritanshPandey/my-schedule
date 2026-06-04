/**
 * Deterministic (non-AI) schedule parser.
 *
 * Turns pasted plain text into a structured `{ day → tasks }` shape that the
 * Bulk Import flow renders. Pure & synchronous — no model, works offline.
 * The same output shape could later be produced by an AI parser as a drop-in.
 */

import type { DayKey, Plan } from "./useScheduleDB";
import { uid } from "./taskMutations";

export interface ParsedTask {
  id: string;                 // temp id for UI keying
  title: string;
  startTime?: string;         // "7:00 AM"
  endTime?: string;           // "8:00 AM"
  planId?: string;
  icon: string;
  suggestedTime?: string;     // smart suggestion for the missing-info Q&A
  needsTime: boolean;         // true when no explicit time was found
}

export interface ParsedDay {
  day: DayKey;
  label: string;              // "Monday"
  tasks: ParsedTask[];
}

const DAY_ALIASES: Record<string, DayKey> = {
  sun: "sunday", sunday: "sunday",
  mon: "monday", monday: "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday",
  fri: "friday", friday: "friday",
  sat: "saturday", saturday: "saturday",
};
const DAY_LABEL: Record<DayKey, string> = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday",
};

// Fuzzy time-of-day phrases → a smart suggested time (longest match wins).
const FUZZY_TIMES: [RegExp, string][] = [
  [/\bafter breakfast\b/i, "9:00 AM"],
  [/\bafter lunch\b/i, "2:00 PM"],
  [/\bafter dinner\b/i, "8:00 PM"],
  [/\bbefore bed\b/i, "10:00 PM"],
  [/\bearly morning\b/i, "6:00 AM"],
  [/\bmorning\b/i, "9:00 AM"],
  [/\bafternoon\b/i, "2:00 PM"],
  [/\bevening\b/i, "7:00 PM"],
  [/\bnight\b/i, "9:00 PM"],
  [/\bnoon\b/i, "12:00 PM"],
  [/\bmidnight\b/i, "12:00 AM"],
];

// Hour 1–12 + optional minutes. A meridiem is REQUIRED for a single time so a
// bare number or a duration ("30 mins") is never misread as a clock time.
const HOUR = String.raw`(1[0-2]|0?[1-9])`;
const MIN = String.raw`(?::([0-5]\d))?`;
const RANGE_RE = new RegExp(`${HOUR}${MIN}\\s*(am|pm)?\\s*(?:-|–|—|to)\\s*${HOUR}${MIN}\\s*(am|pm)`, "i");
const SINGLE_RE = new RegExp(`\\b${HOUR}${MIN}\\s*(am|pm)\\b`, "i");
const DURATION_RE = /\b(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i;

function fmt(h: number, m: number, ampm: string): string {
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Build a "H:MM AM" string from captured groups; infers AM/PM when omitted. */
function buildTime(hRaw: string, mRaw: string | undefined, apRaw: string | undefined): string {
  let h = parseInt(hRaw, 10);
  const m = mRaw ? parseInt(mRaw, 10) : 0;
  let ampm = apRaw ? apRaw.toUpperCase() : "";
  if (!ampm) {
    // No meridiem given — infer: 12 & 1–4 read as PM, everything else AM.
    ampm = h === 12 || (h >= 1 && h <= 4) ? "PM" : "AM";
  }
  if (h === 0) { h = 12; ampm = "AM"; }
  if (h > 12) { h -= 12; ampm = "PM"; }
  return fmt(h, m, ampm);
}

function toMinutes(time: string): number | null {
  const mt = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!mt) return null;
  let h = parseInt(mt[1], 10) % 12;
  if (mt[3].toUpperCase() === "PM") h += 12;
  return h * 60 + parseInt(mt[2], 10);
}

function addMinutes(time: string, mins: number): string {
  const base = toMinutes(time);
  if (base == null) return time;
  let total = (base + mins) % (24 * 60);
  if (total < 0) total += 24 * 60;
  const h24 = Math.floor(total / 60);
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return fmt(h, total % 60, ampm);
}

function durationMinutes(text: string): number | null {
  const d = text.match(DURATION_RE);
  if (!d) return null;
  const n = parseInt(d[1], 10);
  return /^h/i.test(d[2]) ? n * 60 : n;
}

/** Match a line against the plan list by a significant word overlap. */
function matchPlan(text: string, plans: Plan[]): Plan | null {
  const lower = text.toLowerCase();
  for (const plan of plans) {
    const words = plan.title.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    if (words.some((w) => lower.includes(w))) return plan;
  }
  return null;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(RANGE_RE, " ")
    .replace(SINGLE_RE, " ")
    .replace(DURATION_RE, " ")
    .replace(/\bat\b|\bfrom\b|\bin the\b|\baround\b|\bby\b/gi, " ")
    .replace(/[-–—•*·]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,:]+$/g, "")
    .trim();
}

function isDayHeader(line: string): DayKey | null {
  const cleaned = line.trim().replace(/[:\-–—#*]+$/g, "").trim().toLowerCase();
  // A header is a bare weekday (optionally "Monday's plan" etc. but not a bulleted task line)
  if (/^[-•*·]/.test(line.trim())) return null;
  const first = cleaned.split(/\s+/)[0];
  const day = DAY_ALIASES[first];
  // Only treat as a header when the line is short (the day word ± a couple of words).
  if (day && cleaned.split(/\s+/).length <= 3) return day;
  return null;
}

export function parseSchedule(text: string, plans: Plan[], fallbackDay: DayKey = "monday"): ParsedDay[] {
  const lines = text.split("\n");
  const days: ParsedDay[] = [];
  let current: ParsedDay | null = null;

  const ensureDay = (day: DayKey) => {
    let d = days.find((x) => x.day === day);
    if (!d) { d = { day, label: DAY_LABEL[day], tasks: [] }; days.push(d); }
    return d;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = isDayHeader(line);
    if (header) { current = ensureDay(header); continue; }

    // Task line — strip a leading bullet/number.
    const body = line.replace(/^\s*(?:[-•*·–]|\d+[.)])\s*/, "").trim();
    if (!body) continue;

    const target = current ?? (current = ensureDay(fallbackDay));

    // Time: range first, then a single time.
    let startTime: string | undefined;
    let endTime: string | undefined;
    const range = body.match(RANGE_RE);
    if (range) {
      startTime = buildTime(range[1], range[2], range[3] || range[6]);
      endTime = buildTime(range[4], range[5], range[6] || range[3]);
    } else {
      const single = body.match(SINGLE_RE);
      if (single) startTime = buildTime(single[1], single[2], single[3]);
    }

    const dur = durationMinutes(body);
    if (startTime && !endTime) endTime = addMinutes(startTime, dur ?? 60);

    // Fuzzy suggestion when no explicit time.
    let suggestedTime: string | undefined;
    if (!startTime) {
      for (const [re, sug] of FUZZY_TIMES) { if (re.test(body)) { suggestedTime = sug; break; } }
    }

    const plan = matchPlan(body, plans);
    const title = cleanTitle(body) || body;

    target.tasks.push({
      id: uid(),
      title,
      startTime,
      endTime,
      planId: plan?.id,
      icon: plan?.emoji ?? "briefcase",
      suggestedTime: suggestedTime ?? (startTime ? undefined : "9:00 AM"),
      needsTime: !startTime,
    });
  }

  return days.filter((d) => d.tasks.length > 0);
}

/** Total task count across all parsed days. */
export function countTasks(days: ParsedDay[]): number {
  return days.reduce((s, d) => s + d.tasks.length, 0);
}

/** Resolve a parsed task's end time, defaulting to +1h when only a start exists. */
export function resolveTimes(t: ParsedTask): { startTime: string; endTime: string } {
  const start = t.startTime ?? t.suggestedTime ?? "9:00 AM";
  const end = t.endTime ?? addMinutes(start, 60);
  return { startTime: start, endTime: end };
}
