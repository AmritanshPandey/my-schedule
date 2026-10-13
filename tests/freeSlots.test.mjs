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
const { buildDayBreakdown, formatSlotRange, summarizeFreeSlots } = await import("../lib/dayBreakdown.ts");

const DAY = "2026-10-14";
const DAY_START = 5 * 60; // 5:00 AM
const categories = [
  { id: "work", title: "Work", icon: "briefcase", color: "violet" },
  { id: "sleep", title: "Sleep", icon: "sleep", color: "sky", kind: "sleep" },
];
const t = (id, categoryId, startTime, endTime) => ({ id, title: id, planId: "p", categoryId, startTime, endTime });

test("free slots are the gaps between booked blocks, and add up to Unscheduled", () => {
  const tasks = [
    t("morning", "work", "5:00 AM", "12:15 PM"),
    t("afternoon", "work", "1:00 PM", "10:00 PM"),
    t("night", "sleep", "10:00 PM", "4:30 AM"),
  ];
  const b = buildDayBreakdown(tasks, categories, DAY, undefined, undefined, DAY_START);
  assert.deepEqual(b.freeSlots.map((s) => [s.start, s.end, s.minutes]), [
    [12 * 60 + 15, 13 * 60, 45],
    [24 * 60 + 270, 24 * 60 + 300, 30],
  ]);
  assert.equal(b.freeSlots.reduce((sum, s) => sum + s.minutes, 0), b.unscheduledMinutes);
  assert.deepEqual(b.freeSlots.map((s) => formatSlotRange(s.start, s.end)), ["12:15 – 1 PM", "4:30 – 5 AM (next day)"]);
});

test("overlapping blocks leave no phantom gap", () => {
  const tasks = [
    t("a", "work", "9:00 AM", "11:00 AM"),
    t("b", "work", "10:00 AM", "12:00 PM"),
    t("c", "work", "12:00 PM", "1:00 PM"),
  ];
  const b = buildDayBreakdown(tasks, categories, DAY, undefined, undefined, DAY_START);
  assert.deepEqual(b.freeSlots.map((s) => formatSlotRange(s.start, s.end)), [
    "5 – 9 AM",
    "1 PM – 5 AM (next day)",
  ]);
  assert.equal(b.freeSlots.reduce((sum, s) => sum + s.minutes, 0), b.unscheduledMinutes);
});

test("an empty day is one slot covering the whole window", () => {
  const b = buildDayBreakdown([], categories, DAY, undefined, undefined, DAY_START);
  assert.equal(b.freeSlots.length, 1);
  assert.equal(b.freeSlots[0].minutes, 24 * 60);
  assert.equal(formatSlotRange(b.freeSlots[0].start, b.freeSlots[0].end), "5 AM – 5 AM (next day)");
});

test("short gaps are summarized rather than listed", () => {
  const tasks = [
    t("a", "work", "9:00 AM", "9:50 AM"),
    t("b", "work", "10:00 AM", "11:00 AM"), // 10m gap before
    t("c", "work", "11:05 AM", "12:00 PM"), // 5m gap before
    t("d", "work", "12:30 PM", "4:30 AM"),  // 30m gap before, runs to the window's end
  ];
  const b = buildDayBreakdown(tasks, categories, DAY, undefined, undefined, DAY_START);
  const summary = summarizeFreeSlots(b.freeSlots);
  assert.deepEqual(summary.usable.map((s) => formatSlotRange(s.start, s.end)), ["5 – 9 AM", "12 – 12:30 PM", "4:30 – 5 AM (next day)"]);
  assert.equal(summary.shortCount, 2);
  assert.equal(summary.shortMinutes, 15);
});

test("slot ranges: mixed periods, midnight, and crossing into the next day", () => {
  assert.equal(formatSlotRange(11 * 60 + 30, 12 * 60 + 15), "11:30 AM – 12:15 PM");
  assert.equal(formatSlotRange(22 * 60, 24 * 60), "10 PM – 12 AM");
  assert.equal(formatSlotRange(23 * 60, 25 * 60), "11 PM – 1 AM (next day)");
});
