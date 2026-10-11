/**
 * Note body format helpers — shared with apps/native via @planr/core. The two
 * functions below override the core versions with a real DOM walk in the
 * browser (exact text for any markup tiptap emits); without a DOM they defer
 * to the core's markup-only implementation.
 */

import {
  bodyToPlainText as coreBodyToPlainText,
  extractTagsFromBody as coreExtractTagsFromBody,
  isRichNoteBody,
  stripRichNoteBodyPrefix,
} from "@planr/core/lib/notes/richText";

export * from "@planr/core/lib/notes/richText";

export function extractTagsFromBody(body: string): string[] {
  const html = isRichNoteBody(body) ? stripRichNoteBodyPrefix(body) : "";
  if (!html || typeof document === "undefined") return coreExtractTagsFromBody(body);

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

  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  wrap.querySelectorAll<HTMLElement>("[data-note-tag]").forEach((el) => {
    add(el.getAttribute("data-note-tag") ?? el.textContent?.replace(/^#/, "") ?? "");
  });
  return tags;
}

export function bodyToPlainText(body: string): string {
  if (!isRichNoteBody(body) || typeof document === "undefined") return coreBodyToPlainText(body);
  const html = stripRichNoteBodyPrefix(body);
  if (!html) return "";
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  return nodeToPlainText(wrap).trim();
}

// Re-declared (not just re-exported) so they read through the DOM-aware
// bodyToPlainText above — the core versions bind to the core one.
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
