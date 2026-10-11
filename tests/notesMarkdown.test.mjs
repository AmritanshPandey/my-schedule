import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Extensionless relative imports inside packages/core resolve to .ts files.
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const { richHtmlToMarkdown, bodyToMarkdown } = await import("../packages/core/lib/notes/htmlToMarkdown.ts");
const { serializeRichNoteBody, checklistStatsFromBody } = await import("../packages/core/lib/notes/richText.ts");
const { NOTE_COLORS } = await import("../packages/core/lib/notes/markdown.ts");

test("headings, paragraphs and inline marks", () => {
  const html = "<h1>Plan</h1><p>Some <strong>bold</strong>, <em>italic</em>, <s>gone</s> and <code>x()</code>.</p><p></p><h3>Small</h3>";
  assert.equal(richHtmlToMarkdown(html), "# Plan\nSome **bold**, *italic*, ~~gone~~ and `x()`.\n\n### Small");
});

test("tiptap task list keeps checked state and nesting", () => {
  const html =
    '<ul data-type="taskList">' +
    '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Done thing</p></div></li>' +
    '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Open thing</p>' +
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Sub</p></div></li></ul>' +
    "</div></li></ul>";
  const md = richHtmlToMarkdown(html);
  assert.equal(md, "- [x] Done thing\n- [ ] Open thing\n  - [ ] Sub");
  assert.deepEqual(checklistStatsFromBody(md), { done: 1, total: 3 });
});

test("bullet and ordered lists with paragraphs inside items", () => {
  const html = "<ul><li><p>One</p></li><li><p>Two</p><ol><li><p>A</p></li><li><p>B</p></li></ol></li></ul>";
  assert.equal(richHtmlToMarkdown(html), "- One\n- Two\n  1. A\n  2. B");
});

test("tables become pipe tables", () => {
  const html = "<table><tbody><tr><th><p>H1</p></th><th><p>H2</p></th></tr><tr><td><p>a</p></td><td><p>b|c</p></td></tr></tbody></table>";
  assert.equal(richHtmlToMarkdown(html), "| H1 | H2 |\n| --- | --- |\n| a | b/c |");
});

test("note colors and tags map to tokens; entities decode; br splits lines", () => {
  const amber = NOTE_COLORS.find((c) => c.name === "amber").hex;
  const html = `<p><span style="color: ${amber}">warm</span> &amp; <span data-note-tag="focus" class="note-tag-chip">focus</span><br>next</p>`;
  assert.equal(richHtmlToMarkdown(html), "{c=amber}warm{/c} & #focus\nnext");
});

test("bodyToMarkdown passes legacy markdown through and unwraps rich bodies", () => {
  assert.equal(bodyToMarkdown("- [ ] keep"), "- [ ] keep");
  assert.equal(bodyToMarkdown(serializeRichNoteBody("<p>hi</p>")), "hi");
});

const edit = await import("../packages/core/lib/notes/markdownEdit.ts");

test("toggleListKind converts a line and keeps the cursor in its text", () => {
  const r = edit.toggleListKind("hello", { start: 3, end: 3 }, "checklist");
  assert.equal(r.text, "- [ ] hello");
  assert.deepEqual(r.selection, { start: 9, end: 9 });
  const back = edit.toggleListKind(r.text, r.selection, "checklist");
  assert.equal(back.text, "hello");
});

test("toggleListKind numbers an ordered selection", () => {
  const r = edit.toggleListKind("a\nb\nc", { start: 0, end: 5 }, "ordered");
  assert.equal(r.text, "1. a\n2. b\n3. c");
});

test("cycleHeading walks H1 → H2 → H3 → paragraph", () => {
  let t = "Title";
  const levels = [];
  for (let i = 0; i < 4; i++) {
    t = edit.cycleHeading(t, { start: 0, end: 0 }).text;
    levels.push(t);
  }
  assert.deepEqual(levels, ["# Title", "## Title", "### Title", "Title"]);
});

test("shiftIndent only moves list items", () => {
  assert.equal(edit.shiftIndent("- a\npara", { start: 0, end: 8 }, 1).text, "  - a\npara");
  assert.equal(edit.shiftIndent("  - a", { start: 4, end: 4 }, -1).text, "- a");
});

test("toggleInlineMark wraps, unwraps and inserts an empty pair", () => {
  const w = edit.toggleInlineMark("say hi now", { start: 4, end: 6 }, "**");
  assert.equal(w.text, "say **hi** now");
  assert.equal(edit.toggleInlineMark(w.text, w.selection, "**").text, "say hi now");
  const e = edit.toggleInlineMark("ab", { start: 1, end: 1 }, "~~");
  assert.equal(e.text, "a~~~~b");
  assert.deepEqual(e.selection, { start: 3, end: 3 });
});

test("applyTextColor wraps, recolors in place, and removes", () => {
  const c = edit.applyTextColor("warm day", { start: 0, end: 4 }, "amber");
  assert.equal(c.text, "{c=amber}warm{/c} day");
  assert.equal(edit.colorAt(c.text, 10), "amber");
  const re = edit.applyTextColor(c.text, { start: 10, end: 12 }, "blue");
  assert.equal(re.text, "{c=blue}warm{/c} day");
  assert.equal(edit.applyTextColor(re.text, { start: 9, end: 9 }, null).text, "warm day");
});

test("table operations keep a valid pipe table", () => {
  const ins = edit.insertTable("Intro", { start: 5, end: 5 });
  assert.equal(ins.text, "Intro\n\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |");
  const pos = ins.text.indexOf("|  |  |") + 1;
  const ctx = edit.tableContextAt(ins.text, pos);
  assert.equal(ctx.rowIndex, 1);
  const withRow = edit.tableAddRowAfter(ins.text, ctx);
  assert.equal(withRow.text.split("\n").filter((l) => l.startsWith("|")).length, 4);
  const ctx2 = edit.tableContextAt(withRow.text, withRow.text.indexOf("| Column 1") + 3);
  const withCol = edit.tableAddColumnAfter(withRow.text, ctx2);
  assert.match(withCol.text, /\| Column 1 \| Column 3 \| Column 2 \|/);
  const ctx3 = edit.tableContextAt(withCol.text, withCol.text.indexOf("| Column 1") + 3);
  assert.equal(edit.tableDelete(withCol.text, ctx3).text, "Intro\n");
});

test("checklist toggle and tag text helpers", () => {
  assert.equal(edit.toggleChecklistLine("- [ ] a\n- [x] b", 1), "- [ ] a\n- [ ] b");
  assert.equal(edit.insertTagText("note", { start: 4, end: 4 }, "focus").text, "note #focus ");
  assert.equal(edit.removeTagText("a #Focus b #focus", "focus"), "a  b ");
});
