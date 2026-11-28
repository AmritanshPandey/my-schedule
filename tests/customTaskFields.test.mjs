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

const tf = await import("@/packages/core/lib/taskFields.ts");
const { migrate } = await import("@/packages/core/lib/scheduleMigrate.ts");
const normalizeCategories = (categories) => migrate({ plans: [], activities: {}, progressTrackers: [], metricEntries: [], categories }).categories;

const guitar = (overrides = {}) => ({
  id: "c1", title: "Guitar", icon: "music", color: "violet", fieldKind: "custom",
  customFields: [
    { key: "c_song", label: "Song", type: "text" },
    { key: "c_tempo", label: "Tempo", type: "number" },
    { key: "c_part", label: "Part", type: "select", options: ["Verse", "Chorus", "Solo"] },
  ],
  ...overrides,
});

test("a custom category's tasks get its own fields", () => {
  const t = tf.taskFieldTemplate({ categoryId: "c1" }, [guitar()]);
  assert.equal(t.kind, "custom");
  assert.equal(t.label, "Guitar");
  assert.deepEqual(t.fields.map((f) => f.key), ["c_song", "c_tempo", "c_part"]);
  assert.deepEqual(t.fields[2].options, ["Verse", "Chorus", "Solo"]);
});

test("custom with no fields means no fields, and the built-in suggestion doesn't leak in", () => {
  assert.equal(tf.taskFieldTemplate({ categoryId: "c1" }, [guitar({ customFields: [] })]), null);
  assert.equal(tf.categoryFieldKind(guitar()), null);
});

test("switching to a built-in set keeps the custom fields for later", () => {
  const t = tf.taskFieldTemplate({ categoryId: "c1" }, [guitar({ fieldKind: "creative" })]);
  assert.equal(t.kind, "creative");
});

test("values round-trip through the form under the field's key", () => {
  const t = tf.taskFieldTemplate({ categoryId: "c1" }, [guitar()]);
  const details = tf.formValuesToDetails(t, { c_song: " Wonderwall ", c_tempo: "88", c_part: "Chorus", stray: "x" });
  assert.deepEqual(details, { c_song: "Wonderwall", c_tempo: 88, c_part: "Chorus" });
  assert.deepEqual(tf.filledFields(t, details).map((f) => f.def.label), ["Song", "Tempo", "Part"]);
});

test("normalising drops blank, unknown and duplicate fields and caps the list", () => {
  const raw = [
    { key: "a", label: "  Song  ", type: "text" },
    { key: "a", label: "Dup", type: "text" },
    { key: "b", label: "   ", type: "text" },
    { key: "c", label: "Weird", type: "tracker" },
    { key: "d", label: "Mood", type: "select", options: [" Good ", "Good", "", "Bad"] },
    { key: "e", label: "Empty choice", type: "select", options: [] },
    { key: "f", label: "Practice", type: "minutes", role: "duration" },
    { key: "g", label: "Notes", type: "longtext", role: "duration" },
  ];
  const out = tf.normalizeCustomFields(raw);
  assert.deepEqual(out.map((f) => f.key), ["a", "d", "e", "f", "g"]);
  assert.equal(out[0].label, "Song");
  assert.deepEqual(out[1].options, ["Good", "Bad"]);
  assert.equal(out[2].type, "text"); // a choice with no choices keeps its values as text
  assert.equal(out[3].role, "duration");
  assert.equal(out[4].role, undefined);
  const many = Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, label: `F${i}`, type: "text" }));
  assert.equal(tf.normalizeCustomFields(many).length, tf.MAX_CUSTOM_FIELDS);
});

test("starting from a built-in set keeps its keys and durations, without the tracker link", () => {
  const fromCooking = tf.customFieldsFrom(tf.TASK_FIELD_TEMPLATES.cooking);
  assert.deepEqual(fromCooking.map((f) => f.key), tf.TASK_FIELD_TEMPLATES.cooking.fields.map((f) => f.key));
  assert.ok(fromCooking.some((f) => f.role === "duration"));
  const fromFinance = tf.customFieldsFrom(tf.TASK_FIELD_TEMPLATES.finance);
  assert.ok(!fromFinance.some((f) => f.key === "trackerId"));
});

test("custom fields and the custom kind survive migration", () => {
  const [c] = normalizeCategories([guitar()]);
  assert.equal(c.fieldKind, "custom");
  assert.equal(c.customFields.length, 3);
  const [bad] = normalizeCategories([guitar({ customFields: "nope" })]);
  assert.equal(bad.customFields, undefined);
});
