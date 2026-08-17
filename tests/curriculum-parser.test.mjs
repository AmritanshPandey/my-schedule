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
