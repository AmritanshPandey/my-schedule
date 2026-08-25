/**
 * Coverage for Note.linkedPlanIds (lib/useScheduleDB.ts, lib/scheduleSchema.ts)
 * — the field that records which plans a note was used to generate via the
 * "Turn into plan" AI action. Mirrors the existing linkedTaskIds field
 * exactly; NoteSchema (not normalizeNotes, which isn't exported) is the
 * actual persisted-data validation boundary, so it's what's tested here.
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

const { NoteSchema } = await import("../lib/scheduleSchema.ts");

function baseNote(extra = {}) {
  return {
    id: "note-1",
    title: "Learn Spanish",
    body: "30 min/day, focus on speaking.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

test("a note with no linkedPlanIds is valid (field is optional)", () => {
  const result = NoteSchema.safeParse(baseNote());
  assert.equal(result.success, true);
  assert.equal(result.data.linkedPlanIds, undefined);
});

test("a note with valid linkedPlanIds is accepted", () => {
  const result = NoteSchema.safeParse(baseNote({ linkedPlanIds: ["plan-1", "plan-2"] }));
  assert.equal(result.success, true);
  assert.deepEqual(result.data.linkedPlanIds, ["plan-1", "plan-2"]);
});

test("an empty-string plan id is rejected (nonEmptyId)", () => {
  const result = NoteSchema.safeParse(baseNote({ linkedPlanIds: [""] }));
  assert.equal(result.success, false);
});

test("linkedTaskIds and linkedPlanIds are independent — a note can carry both", () => {
  const result = NoteSchema.safeParse(baseNote({ linkedTaskIds: ["task-1"], linkedPlanIds: ["plan-1"] }));
  assert.equal(result.success, true);
  assert.deepEqual(result.data.linkedTaskIds, ["task-1"]);
  assert.deepEqual(result.data.linkedPlanIds, ["plan-1"]);
});
