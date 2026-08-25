/**
 * Turns a note's own content into the single "goal" string
 * components/plan/AIPlanCreatorSheet.tsx expects — the same free-text input
 * a user would otherwise type by hand into that sheet's goal box. Kept as
 * its own tiny pure function (rather than inlined at the call site) so it
 * has a focused, independent test file, matching this codebase's
 * one-concern-per-lib-file convention.
 *
 * `note.body` is NOT plain text — the rich note editor stores it as
 * `<!--rich-note-body-->` + serialized HTML (lib/notes/richText.ts). Feeding
 * that raw markup to the AI would put HTML tags and the sentinel comment in
 * front of the small model, so this always goes through `bodyToPlainText`
 * first — the same conversion NoteEditor.tsx's own "Copy note" already uses.
 */
import type { Note } from "@/lib/useScheduleDB";
import { bodyToPlainText } from "@/lib/notes/richText";

export function buildPlanGoalFromNote(note: Pick<Note, "title" | "body">): string {
  const title = note.title.trim();
  const body = bodyToPlainText(note.body).trim();
  if (title && body) return `${title}\n\n${body}`;
  return title || body;
}
