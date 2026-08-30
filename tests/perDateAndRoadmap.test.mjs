/**
 * Three things a plan or a task occurrence is allowed to carry per date:
 * an additive note, a dated removal, and a roadmap-derived end date.
 *
 * The common thread is that each already half-existed and half-lied. The
 * per-date "note" was really an override that hid the task's own description;
 * the dated delete existed only as a skip button on one surface; and two
 * separate places had each grown their own "the roadmap ends here" expression,
 * both of which took the last milestone by sortOrder rather than the latest.
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
        try {
          return nextResolve(`${url}.ts`, context);
        } catch {
          return nextResolve(`${url}.tsx`, context);
        }
      }
      throw error;
    }
  },
});

const { resolveOccurrence, occurrenceNote, diffException, isTaskScheduledOn } =
  await import("@/lib/taskOccurrence.ts");
const { setTaskException } = await import("@/lib/taskMutations.ts");
const { planEffectiveEndDate } = await import("@/lib/roadmapDates.ts");
const { normalizeTasks } = await import("@/lib/scheduleNormalize.ts");
const { DAYS } = await import("@/lib/scheduleConstants.ts");

const DATE = "2026-09-02";
const OTHER = "2026-09-03";

function task(over = {}) {
  return {
    id: "t1", title: "Run 5k", startTime: "07:00 AM", endTime: "08:00 AM", planId: "p1", ...over,
  };
}
function sched(tasks) {
  const activities = Object.fromEntries(DAYS.map((d) => [d, []]));
  activities.wednesday = tasks;
  return { activities };
}

// ── 2a. The day note is ADDITIVE ────────────────────────────────────────────

test("a day note does not replace the task's own description", () => {
  // The whole point. TaskException.description already existed and overrides;
  // that is the wrong shape for "felt tired" under a standing "Run 5k".
  const t = task({
    description: "Easy pace, zone 2",
    exceptions: { [DATE]: { note: "Felt tired, cut it short" } },
  });
  const resolved = resolveOccurrence(t, DATE);
  assert.equal(resolved.description, "Easy pace, zone 2", "the standing description was clobbered");
  assert.equal(occurrenceNote(t, DATE), "Felt tired, cut it short");
});

test("the per-date description override still overrides, untouched", () => {
  const t = task({ description: "standing", exceptions: { [DATE]: { description: "just today" } } });
  assert.equal(resolveOccurrence(t, DATE).description, "just today");
});

test("a note belongs to its own date only", () => {
  const t = task({ exceptions: { [DATE]: { note: "wednesday's note" } } });
  assert.equal(occurrenceNote(t, DATE), "wednesday's note");
  assert.equal(occurrenceNote(t, OTHER), undefined);
});

test("a blank or whitespace-only note reads as no note", () => {
  assert.equal(occurrenceNote(task({ exceptions: { [DATE]: { note: "" } } }), DATE), undefined);
  assert.equal(occurrenceNote(task({ exceptions: { [DATE]: { note: "   " } } }), DATE), undefined);
  assert.equal(occurrenceNote(task(), DATE), undefined);
});

test("the note is not an occurrence override field", () => {
  // If `note` leaked into diffException it would start being treated as an
  // override and the edit sheet would write it as one.
  const out = diffException(task({ description: "d" }), { title: "x", note: "should be ignored" });
  assert.equal(out.note, undefined);
  assert.equal(out.title, "x");
});

test("setTaskException writes a note without disturbing a skip", () => {
  const before = sched([task({ exceptions: { [DATE]: { skipped: true } } })]);
  const after = setTaskException("t1", DATE, { note: "why I skipped" })(before);
  const ex = after.activities.wednesday[0].exceptions[DATE];
  assert.equal(ex.skipped, true);
  assert.equal(ex.note, "why I skipped");
});

test("clearing a note removes it, and the exception when nothing is left", () => {
  const withNote = sched([task({ exceptions: { [DATE]: { note: "temp" } } })]);
  const cleared = setTaskException("t1", DATE, { note: "" })(withNote);
  assert.equal(cleared.activities.wednesday[0].exceptions, undefined);
});

test("a note survives normalizeTasks — the field-loss trap", () => {
  // exceptions is carried whole by the allowlist, so a nested field is only
  // safe as long as nothing rebuilds the object field by field.
  const [out] = normalizeTasks([task({ exceptions: { [DATE]: { note: "kept", skipped: true } } })], "p1");
  assert.equal(out.exceptions[DATE].note, "kept");
  assert.equal(out.exceptions[DATE].skipped, true);
});

// ── 2b. Dated removal is a skip ─────────────────────────────────────────────

test("removing one date hides that occurrence and no other", () => {
  const after = setTaskException("t1", DATE, { skipped: true })(sched([task()]));
  const t = after.activities.wednesday[0];
  assert.equal(isTaskScheduledOn(t, DATE, true), false);
  assert.equal(isTaskScheduledOn(t, OTHER, true), true);
});

test("a dated removal keeps the task and its history", () => {
  // This is why "date" is a skip rather than a real delete: streaks and
  // analytics read completionHistory, and deleting the occurrence would
  // silently rewrite the past.
  const history = [{ id: "e1", taskId: "t1", completedAt: "2026-08-01T09:00:00.000Z", completionType: "task" }];
  const after = setTaskException("t1", DATE, { skipped: true })(sched([task({ completionHistory: history })]));
  const t = after.activities.wednesday[0];
  assert.equal(t.id, "t1", "the task itself must survive a dated removal");
  assert.deepEqual(t.completionHistory, history);
});

// ── 2c. The roadmap decides when a plan ends ────────────────────────────────

const milestone = (id, plannedEndDate, sortOrder) => ({
  id, planId: "p1", title: id, startDate: "2026-06-01", plannedDurationDays: 7,
  plannedEndDate, status: "upcoming", linkedActivities: [], linkedTrackers: [],
  createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z", sortOrder,
});

test("the plan ends when its last milestone does, not when the user typed", () => {
  const plan = { endDate: "2026-07-01" };
  assert.equal(planEffectiveEndDate(plan, [milestone("m1", "2026-09-30", 0)]), "2026-09-30");
});

test("it takes the LATEST end, not the last by sortOrder", () => {
  // The bug in both inline versions this replaces. normalizeMilestoneTimeline
  // preserves user-set starts and gaps, so order does not imply chronology.
  const plan = { endDate: "2026-07-01" };
  const milestones = [milestone("late", "2026-12-01", 0), milestone("early", "2026-08-01", 1)];
  assert.equal(planEffectiveEndDate(plan, milestones), "2026-12-01");
});

test("with no milestones the typed end date stands", () => {
  assert.equal(planEffectiveEndDate({ endDate: "2026-07-01" }, []), "2026-07-01");
});

test("a plan with neither milestones nor an end date has no end", () => {
  assert.equal(planEffectiveEndDate({}, []), undefined);
});

test("milestones missing a planned end are ignored, not treated as the end", () => {
  const plan = { endDate: "2026-07-01" };
  const broken = { ...milestone("m1", "2026-09-30", 0), plannedEndDate: undefined };
  assert.equal(planEffectiveEndDate(plan, [broken]), "2026-07-01");
  assert.equal(planEffectiveEndDate(plan, [broken, milestone("m2", "2026-10-05", 1)]), "2026-10-05");
});

test("a roadmap that ends BEFORE the typed date still wins", () => {
  // Consistent in both directions: the roadmap is the plan's real shape, so a
  // plan whose milestones all finish early is finished early.
  assert.equal(planEffectiveEndDate({ endDate: "2026-12-31" }, [milestone("m1", "2026-08-15", 0)]), "2026-08-15");
});
