/**
 * The curriculum parser, tested against the real 12-week GMAT plan.
 *
 * The fixture is the spec. Every failure mode here is quiet — a mis-classified
 * line becomes a task instead of a checklist item, which looks exactly like the
 * bug this parser exists to fix — so the first test is line accounting: every
 * non-blank line must be claimed by exactly one classification.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      try {
        return nextResolve(url, context);
      } catch {
        return nextResolve(`${url}.ts`, context);
      }
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        return nextResolve(`${new URL(specifier, context.parentURL).href}.ts`, context);
      }
      throw error;
    }
  },
});

const {
  parseCurriculum,
  looksLikeCurriculum,
  allSessions,
  countSubtasks,
  weekdaysNeedingTime,
  sessionsNeedingTime,
  scheduleCurriculum,
} = await import("@/lib/curriculumParser.ts");

const GMAT = readFileSync(new URL("./fixtures/gmat-curriculum.txt", import.meta.url), "utf8");
const parsed = parseCurriculum(GMAT);

function sessionsOf(weekNumber) {
  return parsed.weeks.find((w) => w.number === weekNumber).sessions;
}

// ── Accounting: nothing may vanish ───────────────────────────────────────────

test("every non-blank line is claimed by exactly one classification", () => {
  const s = parsed.stats;
  const claimed =
    s.weekHeaders + s.sessionHeaders + s.durationLines + s.bullets +
    s.titleLines + s.noteLines + s.ignored;
  assert.equal(
    claimed,
    s.nonBlankLines,
    `${s.nonBlankLines - claimed} line(s) unaccounted for — something was dropped silently`,
  );
});

test("the fixture's own counts match what the parser found", () => {
  // Counted independently from the raw text, so a parser bug can't move both
  // sides of the comparison at once.
  const lines = GMAT.split("\n").map((l) => l.trim()).filter(Boolean);
  assert.equal(parsed.stats.nonBlankLines, lines.length);
  assert.equal(parsed.stats.weekHeaders, lines.filter((l) => /^week\s+\d+/i.test(l)).length);
  assert.equal(parsed.stats.bullets, lines.filter((l) => /^\*\s/.test(l)).length);
  assert.equal(parsed.stats.ignored, 0, `unclassified: ${JSON.stringify(parsed.ignoredLines)}`);
});

// ── Structure ────────────────────────────────────────────────────────────────

test("12 weeks, 4 sessions each, 48 sessions total", () => {
  assert.equal(parsed.weeks.length, 12);
  assert.equal(allSessions(parsed).length, 48, "not the ~360 tasks the day parser produced");
  for (const w of parsed.weeks) {
    assert.equal(w.sessions.length, 4, `week ${w.number} has ${w.sessions.length} sessions`);
  }
  assert.equal(countSubtasks(parsed), 313, "every bullet became a checklist item");
});

test("week 1's checklists are exactly 9 / 7 / 8 / 6", () => {
  assert.deepEqual(sessionsOf(1).map((s) => s.subtasks.length), [9, 7, 8, 6]);
});

test("two same-weekday sessions in one week get distinguishable titles", () => {
  // Weeks 2-11 name no sessions, so both Sunday sessions would fall back to
  // "Sunday — <theme>" and be indistinguishable in the task list.
  for (const w of parsed.weeks) {
    const titles = w.sessions.map((s) => s.title);
    assert.equal(
      new Set(titles).size,
      titles.length,
      `week ${w.number} has duplicate session titles: ${JSON.stringify(titles)}`,
    );
  }
  const w2 = sessionsOf(2).filter((s) => s.weekday === "sunday");
  assert.equal(w2[0].title, "Sunday 7:00 AM — Fractions, Decimals & Percentages");
  assert.equal(w2[1].title, "Sunday 9:30 AM — Fractions, Decimals & Percentages");
});

test("no session is empty, and no checklist item is empty", () => {
  for (const s of allSessions(parsed)) {
    assert.ok(s.subtasks.length > 0, `week ${s.weekNumber} ${s.weekday} has no checklist`);
    assert.ok(s.title.trim().length > 0, `week ${s.weekNumber} ${s.weekday} has no title`);
    for (const sub of s.subtasks) {
      assert.ok(sub.title.trim().length > 0, `empty item in week ${s.weekNumber} ${s.weekday}`);
    }
  }
});

test("headers longer than three words survive as headers", () => {
  // `isDayHeader` in the day parser caps a header at three words, which is why
  // `Thursday — Quantitative Review` was read as a task.
  const [thu, sat] = sessionsOf(1);
  assert.equal(thu.title, "Quantitative Review");
  assert.equal(sat.title, "Quant + Official Guide");
});

test("week themes and notes are captured, not turned into tasks", () => {
  assert.equal(parsed.weeks.find((w) => w.number === 1).theme, "Number Fundamentals");
  assert.equal(parsed.weeks.find((w) => w.number === 12).theme, "Foundation Assessment");
  assert.equal(parsed.weeks.find((w) => w.number === 12).note, "This week is different.");
  assert.equal(
    parsed.weeks.find((w) => w.number === 10).note,
    "Now stop learning lots of new concepts.",
  );
});

// ── Two sessions on one weekday ──────────────────────────────────────────────

test("Sunday 7:00 and Sunday 9:30 stay two distinct sessions", () => {
  for (const w of parsed.weeks) {
    const sundays = w.sessions.filter((s) => s.weekday === "sunday");
    assert.equal(sundays.length, 2, `week ${w.number} lost a Sunday session`);
    assert.equal(sundays[0].startTime, "7:00 AM");
    assert.equal(sundays[1].startTime, "9:30 AM");
    assert.notEqual(sundays[0].id, sundays[1].id);
  }
});

test("the two Sunday sessions do not overlap", () => {
  // 7:00 + 2h15m = 9:15, which clears the 9:30 start.
  for (const w of parsed.weeks) {
    const [first, second] = w.sessions.filter((s) => s.weekday === "sunday");
    const startMin = (t) => {
      const [, h, m, ap] = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
      return ((Number(h) % 12) + (ap === "PM" ? 12 : 0)) * 60 + Number(m);
    };
    const firstEnd = startMin(first.startTime) + first.durationMinutes;
    assert.ok(
      firstEnd <= startMin(second.startTime),
      `week ${w.number}: 7:00 session runs to ${firstEnd} min, past the 9:30 start`,
    );
  }
});

// ── Durations ────────────────────────────────────────────────────────────────

test("week 1 durations are read from the text", () => {
  assert.deepEqual(
    sessionsOf(1).map((s) => s.durationMinutes),
    [195, 180, 135, 135],
  );
  assert.ok(sessionsOf(1).every((s) => !s.durationInherited));
});

test("later weeks inherit each slot's duration, keyed per slot not per weekday", () => {
  // The text states durations only in week 1. Sunday holds two sessions, so
  // inheritance keyed on the weekday alone would give 9:30 the 7:00 value.
  for (const w of parsed.weeks.filter((x) => x.number > 1)) {
    assert.deepEqual(
      w.sessions.map((s) => s.durationMinutes),
      [195, 180, 135, 135],
      `week ${w.number} inherited the wrong durations`,
    );
    assert.ok(w.sessions.every((s) => s.durationInherited), `week ${w.number} should be inherited`);
  }
});

// ── Week 12's title-on-its-own-line shape ────────────────────────────────────

test("week 12's standalone titles are titles, not checklist items", () => {
  const w12 = sessionsOf(12);
  assert.equal(w12[1].title, "Foundation Quant Test");
  assert.equal(w12[2].title, "Foundation Verbal + DI Test");
  assert.equal(w12[3].title, "Analysis");
  // And they must not also appear as the first checklist item.
  assert.notEqual(w12[1].subtasks[0].title, "Foundation Quant Test");
  assert.equal(w12[1].subtasks[0].title, "30 Quant questions");
});

// ── What the import flow needs to ask ────────────────────────────────────────

test("only Thursday and Saturday need a start time", () => {
  assert.deepEqual(weekdaysNeedingTime(parsed), ["thursday", "saturday"]);
  // 12 weeks x 2 untimed sessions, answered with 2 questions rather than 24.
  assert.equal(sessionsNeedingTime(parsed).length, 24);
});

// ── Shape detection & determinism ────────────────────────────────────────────

test("looksLikeCurriculum distinguishes this from a plain day list", () => {
  assert.equal(looksLikeCurriculum(GMAT), true);
  assert.equal(looksLikeCurriculum("Monday\n- Run 7:00 AM\n- Read 8:00 PM"), false);
});

test("a sentence that merely starts with a weekday is not a session header", () => {
  const r = parseCurriculum("WEEK 1 — Test\nThursday — Study\n* item\nThursday's questions were hard\n");
  const sessions = allSessions(r);
  assert.equal(sessions.length, 1, "the prose line opened a second session");
  assert.equal(sessions[0].subtasks.length, 1);
});

test("parsing is deterministic", () => {
  assert.deepEqual(parseCurriculum(GMAT), parseCurriculum(GMAT));
});

// ── Placing it on the calendar ────────────────────────────────────────────────

// A Monday, so week arithmetic is easy to read in the assertions.
const START = "2026-09-07";
const PLACED = scheduleCurriculum(parsed, {
  startDateISO: START,
  startTimeByWeekday: { thursday: "6:30 PM", saturday: "9:00 AM" },
});

const weekdayOf = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][
    (d.getDay() + 6) % 7
  ];
};

test("every session lands on a real date matching its weekday", () => {
  assert.equal(PLACED.length, 48);
  for (const p of PLACED) {
    assert.match(p.dateISO, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      weekdayOf(p.dateISO),
      p.session.weekday,
      `week ${p.session.weekNumber} ${p.session.weekday} landed on ${weekdayOf(p.dateISO)}`,
    );
  }
});

test("consecutive weeks are exactly 7 days apart on the same weekday", () => {
  // This is the case the weekday-scoped rule engine could not represent at all.
  for (const day of ["thursday", "saturday"]) {
    const dates = PLACED.filter((p) => p.session.weekday === day).map((p) => p.dateISO);
    assert.equal(dates.length, 12);
    for (let i = 1; i < dates.length; i++) {
      const gap =
        (new Date(`${dates[i]}T12:00:00`) - new Date(`${dates[i - 1]}T12:00:00`)) / 86_400_000;
      assert.equal(gap, 7, `${day}: ${dates[i - 1]} → ${dates[i]} is ${gap} days`);
    }
  }
  // 12 weeks from the anchor Monday.
  assert.equal(PLACED.find((p) => p.session.weekNumber === 1 && p.session.weekday === "thursday").dateISO, "2026-09-10");
  assert.equal(PLACED.find((p) => p.session.weekNumber === 12 && p.session.weekday === "thursday").dateISO, "2026-11-26");
});

test("all 48 date+time slots are unique", () => {
  const keys = PLACED.map((p) => `${p.dateISO}|${p.startTime}`);
  assert.equal(new Set(keys).size, 48, "two sessions share a date and start time");
});

test("answered weekday times are applied to every week", () => {
  for (const p of PLACED.filter((x) => x.session.weekday === "thursday")) {
    assert.equal(p.startTime, "6:30 PM");
    assert.equal(p.endTime, "9:45 PM", "6:30 PM + 3h15m");
  }
  for (const p of PLACED.filter((x) => x.session.weekday === "saturday")) {
    assert.equal(p.startTime, "9:00 AM");
    assert.equal(p.endTime, "12:00 PM", "9:00 AM + 3h");
  }
});

test("times written in the text win over the answers", () => {
  const sundays = PLACED.filter((p) => p.session.weekday === "sunday");
  assert.equal(sundays.length, 24);
  const early = sundays.filter((p) => p.startTime === "7:00 AM");
  const late = sundays.filter((p) => p.startTime === "9:30 AM");
  assert.equal(early.length, 12);
  assert.equal(late.length, 12);
  assert.ok(early.every((p) => p.endTime === "9:15 AM"), "7:00 + 2h15m");
  assert.ok(late.every((p) => p.endTime === "11:45 AM"), "9:30 + 2h15m");
});

test("the two Sunday sessions never overlap on the same date", () => {
  const byDate = new Map();
  for (const p of PLACED.filter((x) => x.session.weekday === "sunday")) {
    (byDate.get(p.dateISO) ?? byDate.set(p.dateISO, []).get(p.dateISO)).push(p);
  }
  assert.equal(byDate.size, 12, "each week should contribute one Sunday date");
  const mins = (t) => {
    const [, h, m, ap] = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    return ((Number(h) % 12) + (ap === "PM" ? 12 : 0)) * 60 + Number(m);
  };
  for (const [date, pair] of byDate) {
    assert.equal(pair.length, 2, `${date} has ${pair.length} Sunday sessions`);
    const [a, b] = pair.sort((x, y) => mins(x.startTime) - mins(y.startTime));
    assert.ok(mins(a.endTime) <= mins(b.startTime), `${date}: ${a.endTime} runs past ${b.startTime}`);
  }
});

test("a start date mid-week still anchors week 1 to that week", () => {
  // Wednesday of the same week — week 1's Thursday should be the next day.
  const midWeek = scheduleCurriculum(parsed, { startDateISO: "2026-09-09" });
  const thu1 = midWeek.find((p) => p.session.weekNumber === 1 && p.session.weekday === "thursday");
  assert.equal(thu1.dateISO, "2026-09-10");
});

test("untimed sessions fall back rather than being dropped", () => {
  const noAnswers = scheduleCurriculum(parsed, { startDateISO: START });
  const thu = noAnswers.filter((p) => p.session.weekday === "thursday");
  assert.equal(thu.length, 12);
  assert.ok(thu.every((p) => p.startTime === "9:00 AM"));
});

// ── Bridging into the existing import flow ────────────────────────────────────

const { curriculumToParseResult, iconForCurriculum } = await import("@/lib/curriculumParser.ts");

const IMPORTED = curriculumToParseResult(parsed, {
  planTitle: "GMAT",
  startDateISO: START,
  startTimeByWeekday: { thursday: "6:30 PM", saturday: "9:00 AM" },
});

test("the curriculum converts to one plan and 48 dated tasks", () => {
  assert.equal(IMPORTED.plans.length, 1);
  assert.equal(IMPORTED.plans[0].title, "GMAT");
  const tasks = IMPORTED.days.flatMap((d) => d.tasks);
  assert.equal(tasks.length, 48);
  assert.ok(tasks.every((t) => t.dateISO), "every task must carry its own date");
  assert.ok(tasks.every((t) => t.needsTime === false), "times are already resolved");
  assert.ok(tasks.every((t) => t.planRef === IMPORTED.plans[0].ref), "all attach to the new plan");
});

test("checklists survive the conversion intact", () => {
  const tasks = IMPORTED.days.flatMap((d) => d.tasks);
  const total = tasks.reduce((n, t) => n + (t.subtasks?.length ?? 0), 0);
  assert.equal(total, 313);
  const thu1 = tasks.find((t) => t.title === "Quantitative Review");
  assert.equal(thu1.subtasks.length, 9);
  assert.equal(thu1.subtasks[0].title, "Read Quantitative Review: Integers & Number Properties");
});

test("only the weekdays actually used appear, each in date order", () => {
  assert.deepEqual(IMPORTED.days.map((d) => d.day), ["thursday", "saturday", "sunday"]);
  for (const d of IMPORTED.days) {
    const dates = d.tasks.map((t) => t.dateISO);
    assert.deepEqual(dates, [...dates].sort(), `${d.day} is not in date order`);
  }
  assert.equal(IMPORTED.days.find((d) => d.day === "sunday").tasks.length, 24);
});

test("the plan spans the curriculum's first and last dates", () => {
  const p = IMPORTED.plans[0];
  assert.equal(p.startDate, "2026-09-10", "week 1 Thursday");
  assert.equal(p.endDate, "2026-11-29", "week 12 Sunday");
});

test("the icon is inferred from the content", () => {
  assert.equal(iconForCurriculum(parsed), "school", "a GMAT plan should read as study");
});

// ── The rule engine: date-aware vs weekday-scoped ─────────────────────────────

const { validateDatedTasks, applyScheduleRules } = await import("@/lib/scheduleRules.ts");

/** Every placed session as a DatedTask, against an empty schedule. */
const datedTasks = PLACED.map((p) => ({
  title: `${p.session.title} (wk ${p.session.weekNumber})`,
  dateISO: p.dateISO,
  startTime: p.startTime,
  endTime: p.endTime,
}));

test("the whole 48-session curriculum validates with zero conflicts", () => {
  const result = validateDatedTasks(datedTasks, () => []);
  assert.equal(result.errors.length, 0, JSON.stringify(result.errors.slice(0, 3)));
  assert.equal(result.conflicts.length, 0, JSON.stringify(result.conflicts.slice(0, 3)));
  assert.equal(result.valid.length, 48);
});

test("REGRESSION: the weekday-scoped engine mangles what the date-aware one accepts", () => {
  // This is the reported bug. Twelve Thursday sessions on twelve different dates
  // are twelve separate days, but `applyScheduleRules` keys occupancy on the
  // weekday, so it sees twelve collisions on "thursday".
  const thursdays = PLACED.filter((p) => p.session.weekday === "thursday");
  assert.equal(thursdays.length, 12);

  const asWeekday = thursdays.map((p) => ({
    title: `${p.session.title} (wk ${p.session.weekNumber})`,
    day: "thursday",
    startTime: p.startTime,
    endTime: p.endTime,
  }));
  const old = applyScheduleRules(asWeekday, {});
  const mangled = old.conflicts.length + old.errors.length;
  assert.ok(
    mangled > 0,
    "expected the weekday-scoped engine to move or reject these — if not, the premise changed",
  );

  // The date-aware engine leaves all twelve exactly where the plan put them.
  const dated = validateDatedTasks(
    thursdays.map((p) => ({
      title: `${p.session.title} (wk ${p.session.weekNumber})`,
      dateISO: p.dateISO,
      startTime: p.startTime,
      endTime: p.endTime,
    })),
    () => [],
  );
  assert.equal(dated.conflicts.length, 0);
  assert.equal(dated.errors.length, 0);
  assert.deepEqual(
    dated.valid.map((t) => t.startTime),
    thursdays.map((p) => p.startTime),
    "no session was silently moved",
  );
});

test("a real clash on one date is reported, not nudged", () => {
  const busy = { title: "Standing meeting", startTime: "6:30 PM", endTime: "7:30 PM" };
  const target = PLACED.find((p) => p.session.weekday === "thursday");
  const result = validateDatedTasks(datedTasks, (dateISO) =>
    dateISO === target.dateISO ? [busy] : [],
  );

  assert.equal(result.conflicts.length, 1, "only the one clashing date should fail");
  assert.equal(result.valid.length, 47);
  const c = result.conflicts[0].conflict;
  assert.equal(c.dateISO, target.dateISO);
  assert.equal(c.conflictsWith, "Standing meeting");
  assert.equal(c.conflictStart, "18:30");
  // And nothing was relocated: every accepted task is byte-identical to its
  // input, which is the whole point of reporting instead of nudging.
  for (const t of result.valid) {
    assert.ok(datedTasks.includes(t), `${t.title} on ${t.dateISO} was rewritten`);
  }
});

test("the two Sunday sessions coexist on one date without conflicting", () => {
  const oneSunday = PLACED.filter(
    (p) => p.session.weekday === "sunday" && p.session.weekNumber === 1,
  );
  assert.equal(oneSunday.length, 2);
  const result = validateDatedTasks(
    oneSunday.map((p) => ({
      title: p.session.title,
      dateISO: p.dateISO,
      startTime: p.startTime,
      endTime: p.endTime,
    })),
    () => [],
  );
  assert.equal(result.conflicts.length, 0, "7:00–9:15 and 9:30–11:45 must not clash");
  assert.equal(result.valid.length, 2);
});
