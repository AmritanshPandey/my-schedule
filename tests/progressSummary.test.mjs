/**
 * Coverage for lib/intelligence/progressFacts.ts — the progress note.
 *
 * The guard is the point: a small on-device model rephrases facts the pattern
 * engine established, and validateSummary is what stops it from inventing a
 * statistic about someone's life. The template writer must stand on its own —
 * on iPhone it is the only writer there is.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

function resolveWithTsFallback(url, context, nextResolve) {
  try {
    return nextResolve(url, context);
  } catch {
    try {
      return nextResolve(`${url}.ts`, context);
    } catch {
      return nextResolve(`${url}.tsx`, context);
    }
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const url = new URL(`../${specifier.slice(2)}`, import.meta.url).href;
      return resolveWithTsFallback(url, context, nextResolve);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
        const url = new URL(specifier, context.parentURL).href;
        return resolveWithTsFallback(url, context, nextResolve);
      }
      throw error;
    }
  },
});

const { analyzeExecution } = await import("@/lib/intelligence/patterns.ts");
const { buildProgressFacts, templateSummary, validateSummary, buildSummaryUserMessage, buildPlanWeekContext, PROGRESS_SUMMARY_PROMPT } =
  await import("@/lib/intelligence/progressFacts.ts");
const { rewriteForBrowserModel } = await import("@/lib/ai/providers/browserPrompts.ts");

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOW = new Date("2026-09-19T18:00:00"); // a Saturday
const TODAY = "2026-09-19";

function weekdayOf(iso) {
  return ALL_DAYS[(new Date(`${iso}T12:00:00`).getDay() + 6) % 7];
}

/** The N dates immediately before today, most recent first. */
function recentDates(count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(`${TODAY}T12:00:00`);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function event(taskId, dateISO, type) {
  return { id: `${taskId}-${dateISO}-${type}`, taskId, completedAt: new Date(`${dateISO}T12:00:00`).toISOString(), completionType: type };
}

/** One task, outcome decided per date by `outcomeFor(dateISO)` → "task" | "missed" | null. */
function task(id, startTime, endTime, outcomeFor, { days = ALL_DAYS, planId = "p1", lookback = 28 } = {}) {
  const events = recentDates(lookback)
    .filter((d) => days.includes(weekdayOf(d)))
    .map((d) => [d, outcomeFor(d)])
    .filter(([, type]) => type)
    .map(([d, type]) => event(id, d, type));
  return { id, title: id, startTime, endTime, planId, completionHistory: events, _days: days };
}

function schedule(tasks, overrides = {}) {
  const activities = Object.fromEntries(ALL_DAYS.map((d) => [d, []]));
  for (const t of tasks) {
    const { _days, ...clean } = t;
    for (const d of _days) activities[d].push({ ...clean });
  }
  return {
    goals: [],
    goalConnections: [],
    plans: [
      { id: "p1", title: "Fitness", category: "fitness", emoji: "run", color: "emerald", items: [] },
      { id: "p2", title: "Spanish", category: "learning", emoji: "language", color: "blue", items: [] },
    ],
    categories: [],
    activities,
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: { dayStartTime: "5:00 AM" },
    ...overrides,
  };
}

const always = () => "task";
const never = () => "missed";
/** Done only on the oldest days, missed recently — rate ≤ 40%, still slipping. */
const mostlyMissed = (d) => (d < "2026-08-28" ? "task" : "missed");


function factsFor(s) {
  const report = analyzeExecution(s, NOW);
  return { report, facts: buildProgressFacts(report, s) };
}

const busy = () => schedule([task("run", "7:00 AM", "7:45 AM", always), task("review", "9:30 PM", "10:00 PM", mostlyMissed)]);

// ── Facts ────────────────────────────────────────────────────────────────────

test("facts carry the risk, the win and a concrete next step", () => {
  const { facts } = factsFor(busy());
  assert.ok(facts.hasSignal);
  assert.ok(facts.lines.some((l) => l.startsWith("needs attention:") && l.includes('"review"')));
  assert.ok(facts.lines.some((l) => l.startsWith("going well:")));
  assert.ok(facts.nextSteps.some((l) => /^Move to .* for "review"$/.test(l)), facts.nextSteps.join(" | "));
});

test("the model sees only fact lines and next steps", () => {
  const { facts } = factsFor(busy());
  const message = buildSummaryUserMessage(facts);
  for (const line of facts.lines) assert.ok(message.includes(line));
  assert.match(message, /Suggested next steps:/);
});

test("the small-model rewrite recognises the summary prompt and keeps the facts", () => {
  const { facts } = factsFor(busy());
  const rewritten = rewriteForBrowserModel({
    systemPrompt: PROGRESS_SUMMARY_PROMPT,
    messages: [{ role: "user", content: buildSummaryUserMessage(facts) }],
  });
  assert.equal(rewritten._actionType, "summary");
  assert.ok(rewritten._maxNewTokens <= 160, "a summary is short");
  assert.equal(rewritten.messages[0].content, buildSummaryUserMessage(facts));
});

// ── Template writer ──────────────────────────────────────────────────────────

test("with no history the template says so instead of inventing a trend", () => {
  const { report, facts } = factsFor(schedule([]));
  assert.equal(facts.hasSignal, false);
  assert.match(templateSummary(facts, report), /Not enough history yet/);
});

test("the template names the top risk with its real numbers", () => {
  const { report, facts } = factsFor(busy());
  const text = templateSummary(facts, report);
  assert.match(text, /review keeps slipping/);
  assert.match(text, /Done \d+ of the last \d+|done \d+ of the last \d+/);
  assert.ok(validateSummary(text, facts).ok, "the template itself must pass the guard");
});

// ── Grounding guard ──────────────────────────────────────────────────────────

test("a faithful rephrasing passes", () => {
  const { facts } = factsFor(busy());
  const line = facts.lines.find((l) => l.startsWith("needs attention:"));
  const [, done, total] = line.match(/done (\d+) of last (\d+)/);
  const draft = `Your evening review is slipping — you did it ${done} of the last ${total} times. Your run is rock solid. Try moving the review to the morning.`;
  const check = validateSummary(draft, facts);
  assert.ok(check.ok, check.reason);
});

test("an invented number is rejected", () => {
  const { facts } = factsFor(busy());
  const check = validateSummary("You completed 93% of your plan this week and your review is nearly there. Keep it up and move it earlier.", facts);
  assert.equal(check.ok, false);
  assert.match(check.reason, /93/);
});

test("lists, greetings and empty output are rejected", () => {
  const { facts } = factsFor(busy());
  assert.equal(validateSummary("- Your review keeps slipping\n- Your run is solid\n- Move the review", facts).ok, false);
  assert.equal(validateSummary("Hi there! Your review keeps slipping and your run is going well, so move it.", facts).ok, false);
  assert.equal(validateSummary("I think you are doing well overall with your plan this week, keep it up.", facts).ok, false);
  assert.equal(validateSummary("OK", facts).ok, false);
});

test("reasoning tags and wrapping quotes are stripped before checking", () => {
  const { facts } = factsFor(busy());
  const check = validateSummary('<think>let me count</think>"Your review keeps slipping while your run stays steady. Move the review earlier."', facts);
  assert.ok(check.ok, check.reason);
  assert.ok(!check.text.includes("think"));
  assert.ok(!check.text.startsWith('"'));
});

// ── Plan context (AI Assistant) ──────────────────────────────────────────────

test("the assistant's plan context counts dated outcomes, not today's live flag", () => {
  const s = busy();
  // The live flag says nothing was done today; the history says plenty was.
  for (const d of ALL_DAYS) s.activities[d] = s.activities[d].map((t) => ({ ...t, completed: false }));
  const context = buildPlanWeekContext(analyzeExecution(s, NOW), { id: "p1", title: "Fitness" });
  assert.match(context, /Last 7 days: \d+ of \d+ scheduled sessions done/);
  assert.match(context, /"run": 7 of 7 done/);
  assert.match(context, /Needs attention: "review"/);
});
