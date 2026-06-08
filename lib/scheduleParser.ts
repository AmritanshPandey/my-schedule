/**
 * Deterministic (non-AI) schedule parser.
 *
 * Turns pasted plain text into a structured `{ day → tasks }` shape that the
 * Bulk Import flow renders. Pure & synchronous — no model, works offline.
 * The same output shape could later be produced by an AI parser as a drop-in.
 */

import type { DayKey, Plan, PlanCategory } from "./useScheduleDB";
import { categoryFromIcon } from "./useScheduleDB";
import { uid } from "./taskMutations";
import { colorFromIcon, type AccentColor } from "./colorSystem";

export interface ParsedSubtask {
  id: string;                 // temp id for UI keying
  title: string;
  info?: string;              // "[easy pace]"
  duration?: string;          // "(10 min)"
}

export interface ParsedTask {
  id: string;                 // temp id for UI keying
  title: string;
  startTime?: string;         // "7:00 AM"
  endTime?: string;           // "8:00 AM"
  planId?: string;            // matched existing plan
  planRef?: string;           // temp ref to a parsed (new) plan
  icon: string;
  suggestedTime?: string;     // smart suggestion for the missing-info Q&A
  needsTime: boolean;         // true when no explicit time was found
  subtasks?: ParsedSubtask[];
}

export interface ParsedDay {
  day: DayKey;
  label: string;              // "Monday"
  tasks: ParsedTask[];
}

/** A brand-new plan defined inline via a `# Title` header. */
export interface ParsedPlan {
  ref: string;                // temp id linking tasks → this plan
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  emoji: string;              // inferred icon name
  color: AccentColor;
  category: PlanCategory;
}

export interface ParseResult {
  days: ParsedDay[];
  plans: ParsedPlan[];        // new plans to create on commit
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

// Keyword → icon name for inferring a brand-new plan's icon (and, via
// colorFromIcon / categoryFromIcon, its color and category).
const ICON_KEYWORDS: [RegExp, string][] = [
  [/\b(run|running|marathon|jog|cardio|sprint|5k|10k)\b/i, "run"],
  [/\b(gym|lift|lifting|strength|weights?|workout|fitness|barbell)\b/i, "barbell"],
  [/\b(read|reading|book|study|studying|learn|learning|course|gmat)\b/i, "book"],
  [/\b(think|meditat|mindful|journal|reflect|brain)\b/i, "brain"],
  [/\b(code|coding|program|dev|build|engineering|leetcode)\b/i, "code"],
  [/\b(work|client|meeting|report|office|project|deep work)\b/i, "briefcase"],
  [/\b(sleep|rest|nap|recovery|wind down)\b/i, "sleep"],
];

function iconForTitle(title: string): string {
  for (const [re, icon] of ICON_KEYWORDS) {
    if (re.test(title)) return icon;
  }
  return "star";
}

const INFO_RE = /\[([^\]]+)\]/;
const PAREN_RE = /\(([^)]+)\)/;

/** Parse a subtask body: strip `[info]` and `(duration)`, leaving the title. */
function parseSubtask(body: string): ParsedSubtask {
  const info = body.match(INFO_RE)?.[1]?.trim();
  const duration = body.match(PAREN_RE)?.[1]?.trim();
  const title = body
    .replace(INFO_RE, " ")
    .replace(PAREN_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { id: uid(), title: title || body.trim(), info: info || undefined, duration: duration || undefined };
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

/** Leading-whitespace width of a raw line (tabs count as 2). */
function indentOf(rawLine: string): number {
  const m = rawLine.match(/^[ \t]*/);
  return m ? m[0].replace(/\t/g, "  ").length : 0;
}

const PLAN_HEADER_RE = /^#+\s+(.+)$/;
const META_RE = /^(description|desc|start date|start|end date|end)\s*:\s*(.*)$/i;

export function parseSchedule(text: string, plans: Plan[], fallbackDay: DayKey = "monday"): ParseResult {
  const lines = text.split("\n");
  const days: ParsedDay[] = [];
  const parsedPlans: ParsedPlan[] = [];
  let current: ParsedDay | null = null;
  let currentPlan: ParsedPlan | null = null;
  // The task most recently parsed, so deeper-indented bullets attach as subtasks.
  let lastTask: ParsedTask | null = null;
  let lastTaskIndent = 0;

  const ensureDay = (day: DayKey) => {
    let d = days.find((x) => x.day === day);
    if (!d) { d = { day, label: DAY_LABEL[day], tasks: [] }; days.push(d); }
    return d;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("//")) continue;   // comment / instructions line
    const indent = indentOf(rawLine);

    // Plan header — `# Title` opens a new plan section.
    const planHeader = line.match(PLAN_HEADER_RE);
    if (planHeader) {
      const title = planHeader[1].trim();
      const icon = iconForTitle(title);
      currentPlan = {
        ref: uid(),
        title,
        emoji: icon,
        color: colorFromIcon(icon),
        category: categoryFromIcon(icon),
      };
      parsedPlans.push(currentPlan);
      current = null;
      lastTask = null;
      continue;
    }

    // Plan metadata — `Description:` / `Start:` / `End:` (only inside a plan).
    if (currentPlan) {
      const meta = line.match(META_RE);
      if (meta) {
        const value = meta[2].trim();
        const key = meta[1].toLowerCase();
        if (value) {
          if (key.startsWith("desc")) currentPlan.description = value;
          else if (key.startsWith("start")) currentPlan.startDate = value;
          else if (key.startsWith("end")) currentPlan.endDate = value;
        }
        continue;
      }
    }

    const header = isDayHeader(line);
    if (header) { current = ensureDay(header); lastTask = null; continue; }

    // Strip a leading bullet/number.
    const body = line.replace(/^\s*(?:[-•*·–]|\d+[.)])\s*/, "").trim();
    if (!body) continue;

    // Deeper-indented bullet under a task → subtask of that task.
    if (lastTask && indent > lastTaskIndent) {
      (lastTask.subtasks ??= []).push(parseSubtask(body));
      continue;
    }

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

    // Inside a plan section tasks attach to it; otherwise keyword-match existing plans.
    const plan = currentPlan ? null : matchPlan(body, plans);
    const title = cleanTitle(body) || body;

    const task: ParsedTask = {
      id: uid(),
      title,
      startTime,
      endTime,
      planId: plan?.id,
      planRef: currentPlan?.ref,
      icon: currentPlan?.emoji ?? plan?.emoji ?? "briefcase",
      suggestedTime: suggestedTime ?? (startTime ? undefined : "9:00 AM"),
      needsTime: !startTime,
    };
    target.tasks.push(task);
    lastTask = task;
    lastTaskIndent = indent;
  }

  return {
    days: days.filter((d) => d.tasks.length > 0),
    plans: parsedPlans,
  };
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
