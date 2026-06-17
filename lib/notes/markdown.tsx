import type { Note } from "@/lib/useScheduleDB";
import { categoryHex, type AccentColor } from "@/lib/colorSystem";
import {
  checklistStatsFromBody,
  deriveSnippetFromBody,
  deriveTitleFromBody,
} from "@/lib/notes/richText";

// ── Inline text color ───────────────────────────────────────────────────────
// Stored as a paired token: {c=amber}text{/c}. Names map to the shared accent
// palette so colored note text matches the rest of the app.
export const NOTE_COLORS: { name: AccentColor; hex: string }[] = [
  { name: "blue", hex: categoryHex("blue") },
  { name: "emerald", hex: categoryHex("emerald") },
  { name: "violet", hex: categoryHex("violet") },
  { name: "pink", hex: categoryHex("pink") },
  { name: "amber", hex: categoryHex("amber") },
  { name: "cyan", hex: categoryHex("cyan") },
];

const COLOR_NAMES = NOTE_COLORS.map((c) => c.name).join("|");
const COLOR_TOKEN_RE = new RegExp(`^\\{c=(${COLOR_NAMES})\\}([^]*)\\{/c\\}$`);

// ── Note markdown model ─────────────────────────────────────────────────────
// A note `body` is a plain markdown string, one logical line per "\n".
// Supported per-line block kinds: heading (`#`/`##`/`###`), checklist (`- [ ]`/
// `- [x]`), bullet (`- `), blank, or paragraph. Lists may be nested via leading
// indentation (2 spaces per step). Inline emphasis: **bold**, *italic*,
// ~~strike~~, `code`.

export const INDENT = "  "; // 2 spaces == one indent step

export type LineKind = "checklist" | "bullet" | "ordered" | "heading" | "para" | "blank";

export interface ParsedLine {
  kind: LineKind;
  indent: number; // number of indent steps (lists only)
  checked?: boolean; // checklist
  level?: number; // heading 1-3
  order?: number; // ordered list item number
  text: string; // content with the block marker stripped
  raw: string; // the original line
}

function countIndent(ws: string): number {
  const spaces = ws.replace(/\t/g, INDENT).length;
  return Math.floor(spaces / 2);
}

export function parseLine(line: string): ParsedLine {
  const ws = line.match(/^[ \t]*/)?.[0] ?? "";
  const indent = countIndent(ws);
  const rest = line.slice(ws.length);

  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^- \[( |x|X)\]\s?(.*)$/))) {
    return { kind: "checklist", indent, checked: m[1].toLowerCase() === "x", text: m[2], raw: line };
  }
  if ((m = rest.match(/^(\d+)\. (.*)$/))) {
    return { kind: "ordered", indent, order: parseInt(m[1], 10), text: m[2], raw: line };
  }
  if ((m = rest.match(/^- (.*)$/))) {
    return { kind: "bullet", indent, text: m[1], raw: line };
  }
  if ((m = rest.match(/^(#{1,3})\s+(.*)$/))) {
    return { kind: "heading", indent: 0, level: m[1].length, text: m[2], raw: line };
  }
  if (line.trim().length === 0) {
    return { kind: "blank", indent: 0, text: "", raw: line };
  }
  return { kind: "para", indent, text: rest, raw: line };
}

export function serializeLine(p: {
  kind: LineKind;
  indent: number;
  checked?: boolean;
  level?: number;
  order?: number;
  text: string;
}): string {
  const pad = INDENT.repeat(Math.max(0, p.indent));
  switch (p.kind) {
    case "checklist":
      return `${pad}- [${p.checked ? "x" : " "}] ${p.text}`;
    case "ordered":
      return `${pad}${p.order ?? 1}. ${p.text}`;
    case "bullet":
      return `${pad}- ${p.text}`;
    case "heading":
      return `${"#".repeat(p.level ?? 1)} ${p.text}`;
    case "blank":
      return "";
    default:
      return `${pad}${p.text}`;
  }
}

// ── Inline emphasis renderer ────────────────────────────────────────────────
// Order matters: match **bold** before *italic* so the two don't collide.
// Order matters: match the color token and **bold** before *italic*.
const INLINE_RE = /(\{c=(?:blue|emerald|violet|pink|amber|cyan)\}[^{}\n]+\{\/c\}|\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*)/g;

export function renderInline(text: string): React.ReactNode {
  const parts = text.split(INLINE_RE);
  return parts.map((p, i) => {
    const color = p.match(COLOR_TOKEN_RE);
    if (color) {
      const hex = NOTE_COLORS.find((c) => c.name === color[1])?.hex;
      return <span key={i} style={{ color: hex }}>{renderInline(color[2])}</span>;
    }
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
    if (p.startsWith("~~") && p.endsWith("~~") && p.length > 4)
      return <span key={i} className="line-through opacity-70">{p.slice(2, -2)}</span>;
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return (
        <code key={i} className="rounded-[5px] bg-neutral-100 px-1 py-0.5 font-mono text-[0.88em] text-neutral-700 dark:bg-white/[0.08] dark:text-neutral-200">
          {p.slice(1, -1)}
        </code>
      );
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
      return <em key={i} className="italic">{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

// Strip every inline + block marker — for plain-text previews.
export function stripMarkers(text: string): string {
  return text
    .replace(/^#{1,3}\s+/, "")
    .replace(/^- \[[ xX]\]\s?/, "")
    .replace(/^\d+\. /, "")
    .replace(/^- /, "")
    .replace(/\{c=[a-z]+\}([^{}]+)\{\/c\}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}

// ── Tables ──────────────────────────────────────────────────────────────────
// Stored as GitHub-flavoured pipe tables:
//   | H1 | H2 |
//   | --- | --- |
//   | a | b |
export function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

export function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return /^\|(\s*:?-+:?\s*\|)+$/.test(t);
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** Parse a pipe table starting at `start`, or null if there isn't one there. */
export function parseTableAt(lines: string[], start: number): { rows: string[][]; end: number } | null {
  if (!isTableRow(lines[start]) || !isTableSeparator(lines[start + 1] ?? "")) return null;
  const header = splitCells(lines[start]);
  const cols = header.length;
  const rows: string[][] = [header];
  let end = start + 1; // separator line
  let i = start + 2;
  while (i < lines.length && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
    const cells = splitCells(lines[i]);
    while (cells.length < cols) cells.push("");
    rows.push(cells.slice(0, cols));
    end = i;
    i++;
  }
  return { rows, end };
}

export function serializeTable(rows: string[][]): string[] {
  const cols = rows[0]?.length ?? 1;
  const sep = `| ${Array(cols).fill("---").join(" | ")} |`;
  const toLine = (r: string[]) => `| ${r.join(" | ")} |`;
  return [toLine(rows[0] ?? Array(cols).fill("")), sep, ...rows.slice(1).map(toLine)];
}

export function makeEmptyTable(): string[] {
  return ["| Column 1 | Column 2 |", "| --- | --- |", "|  |  |"];
}

// Group raw lines into render blocks: most are single lines; runs of table
// lines collapse into one table block.
export type RenderBlock =
  | { kind: "line"; index: number }
  | { kind: "table"; start: number; end: number; rows: string[][] };

export function groupBlocks(lines: string[]): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const t = parseTableAt(lines, i);
    if (t) {
      blocks.push({ kind: "table", start: i, end: t.end, rows: t.rows });
      i = t.end + 1;
    } else {
      blocks.push({ kind: "line", index: i });
      i++;
    }
  }
  return blocks;
}

// ── Checklist progress (list-card pill) ─────────────────────────────────────
export function checklistStats(body: string): { done: number; total: number } | null {
  return checklistStatsFromBody(body);
}

// ── Derived title / snippet (Apple Notes style) ─────────────────────────────
export function deriveTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const title = deriveTitleFromBody(note.body);
  return title || "New Note";
}

export function deriveSnippet(note: Note): string {
  return deriveSnippetFromBody(note.body);
}
