/**
 * Deterministic parser for multi-week curricula.
 *
 * `lib/scheduleParser.ts` handles a flat "day → tasks" paste. A curriculum is a
 * different grammar — weeks, sessions, and flat bullets that are *checklist
 * items* rather than tasks — and feeding one to the day parser produces the
 * failure this module exists to prevent: `isDayHeader` caps a header at three
 * words, so `Thursday — Quantitative Review` is read as a task; subtasks require
 * deeper indentation, so flat bullets each become their own task; and every
 * resulting task lands untimed at the same default hour on the same weekday.
 * One week of a GMAT plan became ~30 stacked tasks instead of 4 sessions.
 *
 * Kept separate rather than folded into `parseSchedule` so the existing paste
 * grammar — which has unit and e2e coverage — is untouched. Pure and
 * synchronous: no model, works offline, same text always yields the same result.
 */

import type { DayKey } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/scheduleConstants";
import { addDaysToISO, localISODate } from "@/lib/dateUtils";
import { parseTimeToMinutes } from "@/lib/timeUtils";

export interface CurriculumSubtask {
  id: string;
  title: string;
  /** From `[bracketed]` text. */
  info?: string;
  /** From `(parenthesised)` text — free-form, e.g. "10 min". */
  duration?: string;
}

export interface CurriculumSession {
  id: string;
  weekNumber: number;
  weekday: DayKey;
  /** Display time ("7:00 AM") when the header carried one. */
  startTime?: string;
  /** Resolved length in minutes — explicit, or inherited from an earlier week. */
  durationMinutes?: number;
  /** True when the duration came from an earlier week rather than this line. */
  durationInherited: boolean;
  title: string;
  subtasks: CurriculumSubtask[];
  /** 1-based source line of the session header, for the preview. */
  sourceLine: number;
}

export interface CurriculumWeek {
  number: number;
  /** "Number Fundamentals" from `WEEK 1 — Number Fundamentals`. */
  theme?: string;
  /** Prose that sat under the week header, e.g. "This week is different." */
  note?: string;
  sessions: CurriculumSession[];
}

export interface IgnoredLine {
  line: number;
  text: string;
}

/**
 * Per-classification counts. `consumed + ignored` must equal the number of
 * non-blank lines, which is what makes "nothing was silently dropped" checkable
 * rather than merely asserted.
 */
export interface CurriculumStats {
  nonBlankLines: number;
  weekHeaders: number;
  sessionHeaders: number;
  durationLines: number;
  bullets: number;
  titleLines: number;
  noteLines: number;
  ignored: number;
}

export interface ParsedCurriculum {
  weeks: CurriculumWeek[];
  ignoredLines: IgnoredLine[];
  stats: CurriculumStats;
}

// ── Line grammar ──────────────────────────────────────────────────────────────

/** `WEEK 1 — Number Fundamentals` / `Week 12`. */
const WEEK_RE = /^week\s+(\d+)\b[\s—–:.-]*(.*)$/i;

/** A bare duration on its own line: `3h 15m`, `3h`, `45m`. */
const DURATION_LINE_RE = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i;

/** A bullet at any indentation. */
const BULLET_RE = /^[-•*·–]\s+(.*)$/;

const INFO_RE = /\[([^\]]+)\]/;
const PAREN_RE = /\(([^)]+)\)/;

const DAY_ALIASES: Record<string, DayKey> = {
  sun: "sunday", sunday: "sunday",
  mon: "monday", monday: "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday",
  fri: "friday", friday: "friday",
  sat: "saturday", saturday: "saturday",
};

/**
 * A session header: a weekday, then optionally a clock time, then optionally a
 * dash-delimited title. Deliberately strict about what may follow the weekday —
 * only a time and/or a `—`-separated title — so an ordinary sentence that merely
 * begins with a weekday ("Thursday's questions were hard") is not mistaken for
 * a header. This replaces `isDayHeader`'s three-word cap, which is what caused
 * `Thursday — Quantitative Review` to be swallowed as a task.
 */
const SESSION_RE = new RegExp(
  "^(" + Object.keys(DAY_ALIASES).join("|") + ")" +          // weekday
  "\\.?" +                                                    // optional "Thurs."
  "(?:\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?)?" +           // optional time
  "\\s*(?:[—–:-]+\\s*(.+))?$",                                // optional — Title
  "i",
);

let seq = 0;
/** Stable within a parse, so ids are deterministic for tests and React keys. */
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

/**
 * A bare hour with no meridiem. Matches `buildTime` in scheduleParser: 12 and
 * 1–4 read as PM, everything else AM — so a 7:00 study block is 7 in the
 * morning, which is what a curriculum means.
 */
function toDisplayTime(hRaw: string, mRaw: string | undefined, apRaw: string | undefined): string {
  let h = parseInt(hRaw, 10);
  const m = mRaw ? parseInt(mRaw, 10) : 0;
  let ampm = apRaw ? apRaw.toUpperCase() : "";
  if (!ampm) ampm = h === 12 || (h >= 1 && h <= 4) ? "PM" : "AM";
  if (h === 0) { h = 12; ampm = "AM"; }
  if (h > 12) { h -= 12; ampm = "PM"; }
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

function parseSubtask(body: string): CurriculumSubtask {
  const info = body.match(INFO_RE)?.[1]?.trim();
  const duration = body.match(PAREN_RE)?.[1]?.trim();
  const title = body
    .replace(INFO_RE, " ")
    .replace(PAREN_RE, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    id: nextId("sub"),
    title: title || body.trim(),
    ...(info ? { info } : {}),
    ...(duration ? { duration } : {}),
  };
}

/** Minutes from a bare duration line, or null when the line isn't one. */
function durationLineMinutes(line: string): number | null {
  if (!/\d/.test(line)) return null;
  const m = line.match(DURATION_LINE_RE);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? parseInt(m[1], 10) * 60 : 0) + (m[2] ? parseInt(m[2], 10) : 0);
}

/**
 * Cheap shape test so the import flow can route a paste to this parser rather
 * than the day parser. Requires a `WEEK n` header — the one unambiguous marker.
 */
export function looksLikeCurriculum(text: string): boolean {
  return text.split("\n").some((l) => WEEK_RE.test(l.trim()));
}

// ── Parse ─────────────────────────────────────────────────────────────────────

export function parseCurriculum(text: string): ParsedCurriculum {
  seq = 0;
  const weeks: CurriculumWeek[] = [];
  const ignoredLines: IgnoredLine[] = [];
  const stats: CurriculumStats = {
    nonBlankLines: 0, weekHeaders: 0, sessionHeaders: 0, durationLines: 0,
    bullets: 0, titleLines: 0, noteLines: 0, ignored: 0,
  };

  let week: CurriculumWeek | null = null;
  let session: CurriculumSession | null = null;

  /**
   * Last explicit duration per *slot*, not per weekday. Sunday holds two
   * sessions (7:00 and 9:30); keying on the weekday alone would make the second
   * inherit the first's length. Keyed `weekday|startTime`.
   */
  const durationBySlot = new Map<string, number>();
  const slotKey = (s: Pick<CurriculumSession, "weekday" | "startTime">) =>
    `${s.weekday}|${s.startTime ?? ""}`;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;                       // blank lines are structure, not content
    stats.nonBlankLines += 1;
    const lineNo = i + 1;

    // 1. Week header.
    const weekMatch = line.match(WEEK_RE);
    if (weekMatch) {
      const theme = weekMatch[2].trim();
      week = { number: parseInt(weekMatch[1], 10), ...(theme ? { theme } : {}), sessions: [] };
      weeks.push(week);
      session = null;
      stats.weekHeaders += 1;
      continue;
    }

    // 2. Session header.
    const sessionMatch = line.match(SESSION_RE);
    if (sessionMatch) {
      const weekday = DAY_ALIASES[sessionMatch[1].toLowerCase()];
      const startTime = sessionMatch[2]
        ? toDisplayTime(sessionMatch[2], sessionMatch[3], sessionMatch[4])
        : undefined;
      const headerTitle = sessionMatch[5]?.trim();

      // A session outside any week still needs a home, so the parser never
      // silently discards content just because the text lacks a WEEK line.
      if (!week) {
        week = { number: weeks.length + 1, sessions: [] };
        weeks.push(week);
      }

      session = {
        id: nextId("session"),
        weekNumber: week.number,
        weekday,
        ...(startTime ? { startTime } : {}),
        durationInherited: false,
        title: headerTitle || "",
        subtasks: [],
        sourceLine: lineNo,
      };
      week.sessions.push(session);
      stats.sessionHeaders += 1;
      continue;
    }

    // 3. Bare duration line — belongs to the session just opened.
    const durMinutes = durationLineMinutes(line);
    if (durMinutes !== null && session) {
      session.durationMinutes = durMinutes;
      session.durationInherited = false;
      durationBySlot.set(slotKey(session), durMinutes);
      stats.durationLines += 1;
      continue;
    }

    // 4. Bullet → a checklist item on the current session.
    const bullet = line.match(BULLET_RE);
    if (bullet && session) {
      session.subtasks.push(parseSubtask(bullet[1].trim()));
      stats.bullets += 1;
      continue;
    }

    // 5. Free text, classified by position.
    //    Between a session header and its first bullet it is that session's
    //    title (week 12's `Saturday` / `Foundation Quant Test`). Under a week
    //    header before any session it is a note on the week ("This week is
    //    different."). Position is what separates the two, so neither has to be
    //    guessed from its wording.
    if (session && session.subtasks.length === 0) {
      session.title = session.title ? `${session.title} — ${line}` : line;
      stats.titleLines += 1;
      continue;
    }
    if (week && !session) {
      week.note = week.note ? `${week.note} ${line}` : line;
      stats.noteLines += 1;
      continue;
    }

    ignoredLines.push({ line: lineNo, text: line });
    stats.ignored += 1;
  }

  // Fill in durations the text only stated once, and give every session a title.
  for (const w of weeks) {
    for (const s of w.sessions) {
      if (s.durationMinutes === undefined) {
        const inherited = durationBySlot.get(slotKey(s));
        if (inherited !== undefined) {
          s.durationMinutes = inherited;
          s.durationInherited = true;
        }
      }
      if (!s.title) {
        // Weeks 2–11 name no sessions, so the fallback has to carry the
        // distinction itself: two Sunday sessions in one week would otherwise
        // both read "Sunday — <theme>" and be impossible to tell apart in the
        // task list. The time is what separates them, so it goes in the title.
        const sameDay = w.sessions.filter((x) => x.weekday === s.weekday);
        const label = capitalize(s.weekday) + (sameDay.length > 1 && s.startTime ? ` ${s.startTime}` : "");
        s.title = w.theme ? `${label} — ${w.theme}` : label;
      }
    }
  }

  return { weeks, ignoredLines, stats };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every session across every week, in source order. */
export function allSessions(curriculum: ParsedCurriculum): CurriculumSession[] {
  return curriculum.weeks.flatMap((w) => w.sessions);
}

/** Total checklist items across the curriculum. */
export function countSubtasks(curriculum: ParsedCurriculum): number {
  return allSessions(curriculum).reduce((n, s) => n + s.subtasks.length, 0);
}

/** Sessions still missing a start time — what the import flow must ask about. */
export function sessionsNeedingTime(curriculum: ParsedCurriculum): CurriculumSession[] {
  return allSessions(curriculum).filter((s) => !s.startTime);
}

/**
 * The distinct weekdays that need a start time, in week order. The import step
 * asks once per weekday rather than once per session, which for a 12-week plan
 * is two questions instead of twenty-four.
 */
export function weekdaysNeedingTime(curriculum: ParsedCurriculum): DayKey[] {
  const seen = new Set<DayKey>();
  for (const s of sessionsNeedingTime(curriculum)) seen.add(s.weekday);
  return DAYS.filter((d) => seen.has(d));
}

// ── Placing a curriculum on the calendar ──────────────────────────────────────

/** Fallbacks for anything the text never stated and the user never answered. */
export const DEFAULT_SESSION_START = "9:00 AM";
export const DEFAULT_SESSION_MINUTES = 60;

export interface CurriculumScheduleOptions {
  /** Any date inside the first week; its Mon–Sun week anchors week 1. */
  startDateISO: string;
  /** One answer per weekday, covering every week's session on that day. */
  startTimeByWeekday?: Partial<Record<DayKey, string>>;
  defaultStartTime?: string;
  defaultDurationMinutes?: number;
}

export interface ScheduledSession {
  session: CurriculumSession;
  /** ISO date this occurrence lands on. */
  dateISO: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

/** Monday of the ISO week containing `dateISO`, as ISO. */
function mondayOfISO(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00`);
  // getDay() is Sunday-first; DAYS is Monday-first.
  return localISODate(new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86_400_000));
}

function formatMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Resolve every session to a concrete date and time range.
 *
 * Weeks are placed **relative to the first week in the text**, not by absolute
 * number, so a plan that starts at `WEEK 3` still begins on the chosen date and
 * a gap in the numbering pushes later weeks out rather than silently collapsing.
 *
 * Each result is destined to become one task with
 * `recurrence: { type: "once", dateISO }`. That is forced rather than chosen:
 * `TaskException` carries no subtasks field, so a single weekly-recurring task
 * cannot hold week 1's checklist and week 2's different one. Dated occurrences
 * are the only shape that keeps each week's items intact.
 */
export function scheduleCurriculum(
  curriculum: ParsedCurriculum,
  options: CurriculumScheduleOptions,
): ScheduledSession[] {
  const {
    startDateISO,
    startTimeByWeekday = {},
    defaultStartTime = DEFAULT_SESSION_START,
    defaultDurationMinutes = DEFAULT_SESSION_MINUTES,
  } = options;

  const firstWeekNumber = curriculum.weeks[0]?.number ?? 1;
  const anchorMonday = mondayOfISO(startDateISO);
  const out: ScheduledSession[] = [];

  for (const week of curriculum.weeks) {
    const weekMonday = addDaysToISO(anchorMonday, (week.number - firstWeekNumber) * 7);
    for (const session of week.sessions) {
      const dateISO = addDaysToISO(weekMonday, DAYS.indexOf(session.weekday));
      const startTime =
        session.startTime ?? startTimeByWeekday[session.weekday] ?? defaultStartTime;
      const durationMinutes = session.durationMinutes ?? defaultDurationMinutes;
      const startMinutes = parseTimeToMinutes(startTime) ?? 9 * 60;
      out.push({
        session,
        dateISO,
        startTime,
        endTime: formatMinutes(startMinutes + durationMinutes),
        durationMinutes,
      });
    }
  }

  return out;
}
