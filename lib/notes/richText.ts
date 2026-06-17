import { categoryHex, type AccentColor } from "@/lib/colorSystem";

export const RICH_NOTE_BODY_PREFIX = "<!--rich-note-body-->";

const INLINE_RE = /(\{c=(?:blue|emerald|violet|pink|amber|cyan)\}[^{}\n]+\{\/c\}|\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\*[^*\n]+\*)/g;

export function isRichNoteBody(body: string): boolean {
  return body.startsWith(RICH_NOTE_BODY_PREFIX);
}

export function stripRichNoteBodyPrefix(body: string): string {
  return isRichNoteBody(body) ? body.slice(RICH_NOTE_BODY_PREFIX.length) : body;
}

export function serializeRichNoteBody(html: string): string {
  return `${RICH_NOTE_BODY_PREFIX}${html}`;
}

export function mergeNoteTags(...lists: Array<string[] | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const tag of list ?? []) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

export function extractTagsFromBody(body: string): string[] {
  const html = isRichNoteBody(body) ? stripRichNoteBodyPrefix(body) : "";
  if (!html) return [];

  const tags: string[] = [];
  const seen = new Set<string>();

  const add = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(trimmed);
  };

  if (typeof document !== "undefined") {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    wrap.querySelectorAll<HTMLElement>("[data-note-tag]").forEach((el) => {
      add(el.getAttribute("data-note-tag") ?? el.textContent?.replace(/^#/, "") ?? "");
    });
    return tags;
  }

  const re = /data-note-tag="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) add(match[1]);
  return tags;
}

export function bodyToEditorHtml(body: string): string {
  return isRichNoteBody(body) ? stripRichNoteBodyPrefix(body) : legacyMarkdownToHtml(body);
}

export function bodyToPlainText(body: string): string {
  if (!isRichNoteBody(body)) {
    return legacyMarkdownToPlainText(body);
  }

  const html = stripRichNoteBodyPrefix(body);
  if (!html) return "";

  if (typeof document === "undefined") {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return nodeToPlainText(wrap).trim();
}

export function checklistStatsFromBody(body: string): { done: number; total: number } | null {
  if (isRichNoteBody(body)) {
    const html = stripRichNoteBodyPrefix(body);
    if (!html) return null;
    const total = countMatches(html, /data-type="taskItem"/g);
    if (total === 0) return null;
    const done = countMatches(html, /data-checked="true"/g);
    return { done, total };
  }

  let done = 0;
  let total = 0;
  for (const line of body.split("\n")) {
    const parsed = parseLegacyLine(line);
    if (parsed.kind === "checklist") {
      total++;
      if (parsed.checked) done++;
    }
  }
  return total > 0 ? { done, total } : null;
}

export function deriveTitleFromBody(body: string): string {
  const text = bodyToPlainText(body);
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  return first || "New Note";
}

export function deriveSnippetFromBody(body: string): string {
  const lines = bodyToPlainText(body)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 2).join("  ");
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdownToHtml(text: string): string {
  const parts = text.split(INLINE_RE);
  return parts.map((part) => {
    const colorMatch = part.match(/^\{c=(blue|emerald|violet|pink|amber|cyan)\}([^{}]*)\{\/c\}$/);
    if (colorMatch) {
      const hex = categoryHex(colorMatch[1] as AccentColor);
      return `<span data-note-color="${colorMatch[1]}" style="color:${hex}">${inlineMarkdownToHtml(colorMatch[2])}</span>`;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return `<strong>${inlineMarkdownToHtml(part.slice(2, -2))}</strong>`;
    }
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4) {
      return `<s>${inlineMarkdownToHtml(part.slice(2, -2))}</s>`;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return `<em>${inlineMarkdownToHtml(part.slice(1, -1))}</em>`;
    }
    return escapeHtml(part);
  }).join("");
}

type LegacyLine =
  | { kind: "checklist"; checked: boolean; indent: number; text: string }
  | { kind: "bullet"; indent: number; text: string }
  | { kind: "ordered"; indent: number; order: number; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "blank" }
  | { kind: "para"; indent: number; text: string };

function parseLegacyLine(line: string): LegacyLine {
  const ws = line.match(/^[ \t]*/)?.[0] ?? "";
  const indent = Math.floor(ws.replace(/\t/g, "  ").length / 2);
  const rest = line.slice(ws.length);

  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^- \[( |x|X)\]\s?(.*)$/))) {
    return { kind: "checklist", checked: m[1].toLowerCase() === "x", indent, text: m[2] };
  }
  if ((m = rest.match(/^(\d+)\.\s+(.*)$/))) {
    return { kind: "ordered", order: parseInt(m[1], 10), indent, text: m[2] };
  }
  if ((m = rest.match(/^- (.*)$/))) {
    return { kind: "bullet", indent, text: m[1] };
  }
  if ((m = rest.match(/^(#{1,3})\s+(.*)$/))) {
    return { kind: "heading", level: m[1].length, text: m[2] };
  }
  if (line.trim().length === 0) return { kind: "blank" };
  return { kind: "para", indent, text: rest };
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

function isTableSeparator(line: string): boolean {
  return /^\|(\s*:?-+:?\s*\|)+$/.test(line.trim());
}

function parseTableAt(lines: string[], start: number): { rows: string[][]; end: number } | null {
  if (!isTableRow(lines[start] ?? "") || !isTableSeparator(lines[start + 1] ?? "")) return null;
  const rows: string[][] = [splitCells(lines[start] ?? "")];
  let i = start + 2;
  while (i < lines.length && isTableRow(lines[i] ?? "") && !isTableSeparator(lines[i] ?? "")) {
    rows.push(splitCells(lines[i] ?? ""));
    i++;
  }
  return { rows, end: i - 1 };
}

function legacyMarkdownToHtml(body: string): string {
  const lines = body.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const table = parseTableAt(lines, i);
    if (table) {
      blocks.push(tableRowsToHtml(table.rows));
      i = table.end + 1;
      continue;
    }

    const line = parseLegacyLine(lines[i] ?? "");
    if (line.kind === "blank") {
      blocks.push("<p></p>");
      i++;
      continue;
    }
    if (line.kind === "heading") {
      blocks.push(`<h${line.level}>${inlineMarkdownToHtml(line.text)}</h${line.level}>`);
      i++;
      continue;
    }
    if (line.kind === "checklist") {
      blocks.push(
        `<ul data-type="taskList"><li data-type="taskItem" data-checked="${line.checked ? "true" : "false"}">${inlineMarkdownToHtml(line.text)}</li></ul>`
      );
      i++;
      continue;
    }
    if (line.kind === "bullet") {
      blocks.push(`<ul><li>${inlineMarkdownToHtml(line.text)}</li></ul>`);
      i++;
      continue;
    }
    if (line.kind === "ordered") {
      blocks.push(`<ol><li>${inlineMarkdownToHtml(line.text)}</li></ol>`);
      i++;
      continue;
    }

    blocks.push(`<p>${inlineMarkdownToHtml(line.text)}</p>`);
    i++;
  }

  return blocks.join("") || "<p></p>";
}

function tableRowsToHtml(rows: string[][]): string {
  const header = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const headHtml = header.map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`).join("");
  const bodyHtml = bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdownToHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function nodeToPlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const isBlock = ["p", "div", "section", "article", "li", "tr", "table", "ul", "ol", "h1", "h2", "h3", "blockquote"].includes(tag);

  if (el.hasAttribute("data-note-tag")) {
    return el.getAttribute("data-note-tag") ?? "";
  }

  const text = Array.from(el.childNodes).map((child) => nodeToPlainText(child)).join("");
  if (tag === "br") return "\n";
  if (isBlock) return `${text}\n`;
  return text;
}

function legacyMarkdownToPlainText(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    if (isTableSeparator(line)) continue;
    if (isTableRow(line)) {
      out.push(
        line
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => stripLegacyInlineTokens(cell.trim()))
          .join(" ")
          .trim(),
      );
      continue;
    }

    const parsed = parseLegacyLine(line);
    if (parsed.kind === "blank") continue;
    out.push(stripLegacyInlineTokens(parsed.text).trim());
  }

  return out.filter(Boolean).join("\n");
}

function stripLegacyInlineTokens(text: string): string {
  return text
    .replace(/\{c=(?:blue|emerald|violet|pink|amber|cyan)\}([^{}]+)\{\/c\}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
}
