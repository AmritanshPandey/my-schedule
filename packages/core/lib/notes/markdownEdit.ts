/**
 * Editing operations over the note markdown line model (./markdown.ts) — the
 * same actions the web's tiptap toolbar performs (checklist / numbered /
 * bullet, heading cycle, indent / outdent, bold / italic / strike, text color,
 * tables, ticking a checkbox), expressed as pure text transforms over a
 * plain-text editor's value and selection. Used by apps/native's note editor,
 * which edits the markdown form of a note directly.
 *
 * Every function returns the new text plus where the selection should land,
 * so the caller can keep the cursor where the user expects it.
 */
import { INDENT, makeEmptyTable, parseLine, parseTableAt, serializeLine, serializeTable, isTableRow, type LineKind, type ParsedLine } from "./markdown";

export interface TextSelection {
  start: number;
  end: number;
}

export interface TextEdit {
  text: string;
  selection: TextSelection;
}

const MAX_INDENT = 8;

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

/** Index of the line containing character offset `pos`. */
export function lineIndexAt(text: string, pos: number): number {
  const starts = lineStarts(text);
  let idx = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= pos) idx = i;
    else break;
  }
  return idx;
}

/** Character offset where line `index` begins. */
export function lineStartOffset(text: string, index: number): number {
  const starts = lineStarts(text);
  return starts[Math.max(0, Math.min(index, starts.length - 1))] ?? 0;
}

/** The selected text, or the whole line the cursor sits on when nothing is selected. */
export function selectedOrCurrentLine(text: string, sel: TextSelection): string {
  if (sel.end > sel.start) return text.slice(sel.start, sel.end);
  return text.split("\n")[lineIndexAt(text, sel.start)] ?? "";
}

function prefixLength(p: ParsedLine): number {
  return serializeLine(p).length - p.text.length;
}

function selectedLineRange(text: string, sel: TextSelection): [number, number] {
  const a = lineIndexAt(text, sel.start);
  // A selection ending exactly at a line start doesn't include that line.
  const endPos = sel.end > sel.start && text[sel.end - 1] === "\n" ? sel.end - 1 : sel.end;
  return [a, Math.max(a, lineIndexAt(text, endPos))];
}

/**
 * Re-serialize lines [a, b] and map the selection: a collapsed cursor keeps
 * its place within its line's text; a range selects the rewritten lines.
 */
function rewriteLines(text: string, sel: TextSelection, a: number, b: number, map: (p: ParsedLine, i: number) => ParsedLine): TextEdit {
  const lines = text.split("\n");
  const before = lines.slice(a, b + 1).map(parseLine);
  const after = before.map(map);
  const nextLines = [...lines.slice(0, a), ...after.map(serializeLine), ...lines.slice(b + 1)];
  const nextText = nextLines.join("\n");
  const start = lineStartOffset(nextText, a);
  if (sel.start === sel.end && a === b) {
    const oldStart = lineStartOffset(text, a);
    const offsetInText = Math.max(0, sel.start - oldStart - prefixLength(before[0]));
    const cursor = start + prefixLength(after[0]) + Math.min(offsetInText, after[0].text.length);
    return { text: nextText, selection: { start: cursor, end: cursor } };
  }
  const end = lineStartOffset(nextText, b) + (nextLines[b]?.length ?? 0);
  return { text: nextText, selection: { start, end } };
}

/** Toggle the selected lines between a list kind and plain paragraphs. */
export function toggleListKind(text: string, sel: TextSelection, kind: Extract<LineKind, "checklist" | "bullet" | "ordered">): TextEdit {
  const [a, b] = selectedLineRange(text, sel);
  const parsed = text.split("\n").slice(a, b + 1).map(parseLine);
  const content = parsed.filter((p) => p.kind !== "blank");
  const turnOff = content.length > 0 && content.every((p) => p.kind === kind);
  const single = a === b;
  let order = 1;
  return rewriteLines(text, sel, a, b, (p) => {
    if (p.kind === "blank" && !single) return p;
    if (turnOff) return { ...p, kind: "para", indent: 0, checked: undefined, order: undefined };
    const indent = p.kind === "checklist" || p.kind === "bullet" || p.kind === "ordered" ? p.indent : 0;
    return { kind, indent, text: p.text, raw: p.raw, checked: kind === "checklist" ? !!p.checked : undefined, order: kind === "ordered" ? order++ : undefined };
  });
}

/** Paragraph → H1 → H2 → H3 → paragraph, on the cursor's line. */
export function cycleHeading(text: string, sel: TextSelection): TextEdit {
  const a = lineIndexAt(text, sel.start);
  return rewriteLines(text, { start: sel.start, end: sel.start }, a, a, (p) => {
    if (p.kind === "heading") {
      const level = p.level ?? 1;
      return level >= 3 ? { kind: "para", indent: 0, text: p.text, raw: p.raw } : { ...p, level: level + 1 };
    }
    return { kind: "heading", indent: 0, level: 1, text: p.text, raw: p.raw };
  });
}

/** The heading level of the cursor's line (0 when it isn't a heading). */
export function headingLevelAt(text: string, pos: number): number {
  const p = parseLine(text.split("\n")[lineIndexAt(text, pos)] ?? "");
  return p.kind === "heading" ? p.level ?? 1 : 0;
}

/** The block kind of the cursor's line. */
export function lineKindAt(text: string, pos: number): LineKind {
  return parseLine(text.split("\n")[lineIndexAt(text, pos)] ?? "").kind;
}

/** Indent (+1) or outdent (-1) the list items in the selection. */
export function shiftIndent(text: string, sel: TextSelection, delta: 1 | -1): TextEdit {
  const [a, b] = selectedLineRange(text, sel);
  return rewriteLines(text, sel, a, b, (p) =>
    p.kind === "checklist" || p.kind === "bullet" || p.kind === "ordered" ? { ...p, indent: Math.max(0, Math.min(MAX_INDENT, p.indent + delta)) } : p,
  );
}

/**
 * Wrap the selection in a paired inline marker (or unwrap it when it already
 * is). A collapsed cursor gets an empty pair with the cursor between.
 */
export function toggleInlineMark(text: string, sel: TextSelection, marker: string): TextEdit {
  const { start, end } = sel;
  if (start === end) {
    return { text: text.slice(0, start) + marker + marker + text.slice(end), selection: { start: start + marker.length, end: start + marker.length } };
  }
  const selected = text.slice(start, end);
  if (selected.length > marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(marker.length, -marker.length);
    return { text: text.slice(0, start) + inner + text.slice(end), selection: { start, end: start + inner.length } };
  }
  if (text.slice(start - marker.length, start) === marker && text.slice(end, end + marker.length) === marker) {
    const nextText = text.slice(0, start - marker.length) + selected + text.slice(end + marker.length);
    return { text: nextText, selection: { start: start - marker.length, end: end - marker.length } };
  }
  const m = selected.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  const wrapped = `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
  return { text: text.slice(0, start) + wrapped + text.slice(end), selection: { start: start + m[1].length, end: start + m[1].length + m[2].length + marker.length * 2 } };
}

const COLOR_TOKEN_GLOBAL = /\{c=([a-z]+)\}([^{}\n]*)\{\/c\}/g;

/** The color token the cursor sits in, if any. */
export function colorAt(text: string, pos: number): string | null {
  COLOR_TOKEN_GLOBAL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLOR_TOKEN_GLOBAL.exec(text)) !== null) {
    if (pos >= m.index && pos <= m.index + m[0].length) return m[1];
  }
  return null;
}

/**
 * Color the selection (`{c=name}…{/c}`), or with `null` remove color from the
 * selection / the token under the cursor. Existing color inside the selection
 * is replaced, never nested.
 */
export function applyTextColor(text: string, sel: TextSelection, color: string | null): TextEdit {
  const { start, end } = sel;
  // Expand to a token the selection sits inside, so recoloring replaces it.
  COLOR_TOKEN_GLOBAL.lastIndex = 0;
  let from = start;
  let to = end;
  let m: RegExpExecArray | null;
  while ((m = COLOR_TOKEN_GLOBAL.exec(text)) !== null) {
    const tokenStart = m.index;
    const tokenEnd = m.index + m[0].length;
    if (start >= tokenStart && end <= tokenEnd) {
      from = tokenStart;
      to = tokenEnd;
      break;
    }
  }
  const region = text.slice(from, to).replace(COLOR_TOKEN_GLOBAL, "$2");
  if (color === null) {
    return { text: text.slice(0, from) + region + text.slice(to), selection: { start: from, end: from + region.length } };
  }
  if (from === to) {
    const open = `{c=${color}}`;
    return { text: text.slice(0, from) + open + "{/c}" + text.slice(to), selection: { start: from + open.length, end: from + open.length } };
  }
  const wrapped = `{c=${color}}${region}{/c}`;
  return { text: text.slice(0, from) + wrapped + text.slice(to), selection: { start: from, end: from + wrapped.length } };
}

/** Insert a 2×2 table (header + one row) after the cursor's line. */
export function insertTable(text: string, sel: TextSelection): TextEdit {
  const lines = text.split("\n");
  const idx = lineIndexAt(text, sel.end);
  const currentBlank = (lines[idx] ?? "").trim() === "";
  const table = makeEmptyTable();
  const insert = currentBlank ? table : ["", ...table];
  const nextLines = currentBlank ? [...lines.slice(0, idx), ...insert, ...lines.slice(idx + 1)] : [...lines.slice(0, idx + 1), ...insert, ...lines.slice(idx + 1)];
  const nextText = nextLines.join("\n");
  const headerIndex = currentBlank ? idx : idx + 2;
  const cursor = lineStartOffset(nextText, headerIndex) + 2;
  return { text: nextText, selection: { start: cursor, end: cursor + "Column 1".length } };
}

export interface TableContext {
  start: number;
  end: number;
  rows: string[][];
  /** 0 = header, -1 = the separator line, n = nth body row. */
  rowIndex: number;
  colIndex: number;
}

/** The pipe table around the cursor, or null. */
export function tableContextAt(text: string, pos: number): TableContext | null {
  const lines = text.split("\n");
  const idx = lineIndexAt(text, pos);
  if (!isTableRow(lines[idx] ?? "")) return null;
  let s = idx;
  while (s > 0 && isTableRow(lines[s - 1] ?? "")) s--;
  const table = parseTableAt(lines, s);
  if (!table || idx > table.end) return null;
  const lineStart = lineStartOffset(text, idx);
  const before = (lines[idx] ?? "").slice(0, Math.max(0, pos - lineStart));
  const colIndex = Math.max(0, Math.min(table.rows[0].length - 1, (before.match(/\|/g)?.length ?? 1) - 1));
  return { start: s, end: table.end, rows: table.rows, rowIndex: idx === s ? 0 : idx === s + 1 ? -1 : idx - s - 1, colIndex };
}

function replaceTable(text: string, ctx: TableContext, rows: string[][] | null, cursorLine: number): TextEdit {
  const lines = text.split("\n");
  const tableLines = rows ? serializeTable(rows) : [];
  const nextLines = [...lines.slice(0, ctx.start), ...tableLines, ...lines.slice(ctx.end + 1)];
  const nextText = nextLines.join("\n");
  const line = Math.max(0, Math.min(nextLines.length - 1, cursorLine));
  const cursor = lineStartOffset(nextText, line) + (rows ? 2 : 0);
  return { text: nextText, selection: { start: cursor, end: cursor } };
}

export function tableAddRowAfter(text: string, ctx: TableContext): TextEdit {
  const cols = ctx.rows[0].length;
  const at = ctx.rowIndex <= 0 ? 1 : ctx.rowIndex + 1;
  const rows = [...ctx.rows.slice(0, at), Array(cols).fill(""), ...ctx.rows.slice(at)];
  return replaceTable(text, ctx, rows, ctx.start + at + 1);
}

export function tableAddColumnAfter(text: string, ctx: TableContext): TextEdit {
  const rows = ctx.rows.map((r, i) => [...r.slice(0, ctx.colIndex + 1), i === 0 ? `Column ${r.length + 1}` : "", ...r.slice(ctx.colIndex + 1)]);
  return replaceTable(text, ctx, rows, ctx.start);
}

export function canDeleteTableRow(ctx: TableContext): boolean {
  return ctx.rowIndex > 0;
}

export function tableDeleteRow(text: string, ctx: TableContext): TextEdit {
  if (!canDeleteTableRow(ctx)) return { text, selection: { start: lineStartOffset(text, ctx.start), end: lineStartOffset(text, ctx.start) } };
  const rows = ctx.rows.filter((_, i) => i !== ctx.rowIndex);
  return replaceTable(text, ctx, rows, ctx.start + Math.min(ctx.rowIndex, rows.length - 1) + 1);
}

export function canDeleteTableColumn(ctx: TableContext): boolean {
  return ctx.rows[0].length > 1;
}

export function tableDeleteColumn(text: string, ctx: TableContext): TextEdit {
  if (!canDeleteTableColumn(ctx)) return { text, selection: { start: lineStartOffset(text, ctx.start), end: lineStartOffset(text, ctx.start) } };
  const rows = ctx.rows.map((r) => r.filter((_, i) => i !== ctx.colIndex));
  return replaceTable(text, ctx, rows, ctx.start);
}

export function tableDelete(text: string, ctx: TableContext): TextEdit {
  return replaceTable(text, ctx, null, ctx.start);
}

/** Tick or untick the checklist item on line `index` (no-op for other lines). */
export function toggleChecklistLine(text: string, index: number): string {
  const lines = text.split("\n");
  const p = parseLine(lines[index] ?? "");
  if (p.kind !== "checklist") return text;
  lines[index] = serializeLine({ ...p, checked: !p.checked });
  return lines.join("\n");
}

/** Insert `#tag ` at the selection (replacing it), the markdown form of a pill. */
export function insertTagText(text: string, sel: TextSelection, tag: string): TextEdit {
  const before = text.slice(0, sel.start);
  const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const insert = `${lead}#${tag} `;
  const cursor = sel.start + insert.length;
  return { text: before + insert + text.slice(sel.end), selection: { start: cursor, end: cursor } };
}

/** Remove every `#tag` occurrence (case-insensitive) — the web's removeTagEverywhere. */
export function removeTagText(text: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(^|\\s)#${escaped}(?=\\s|$)`, "gim"), "$1");
}

export { INDENT };
