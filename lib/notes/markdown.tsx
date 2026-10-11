/**
 * Note markdown model — the parser/serializer lives in @planr/core (shared
 * with apps/native). This file adds the web's inline renderer and re-declares
 * the title/snippet helpers so they read through the DOM-aware richText.
 */

import type { Note } from "@/lib/useScheduleDB";
import { COLOR_TOKEN_RE, INLINE_RE, NOTE_COLORS } from "@planr/core/lib/notes/markdown";
import { deriveSnippetFromBody, deriveTitleFromBody } from "@/lib/notes/richText";

export * from "@planr/core/lib/notes/markdown";

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

// ── Derived title / snippet (Apple Notes style) ─────────────────────────────
export function deriveTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const title = deriveTitleFromBody(note.body);
  return title || "New Note";
}

export function deriveSnippet(note: Note): string {
  return deriveSnippetFromBody(note.body);
}
