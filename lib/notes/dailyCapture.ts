import type { Note } from "@/lib/useScheduleDB";
import { isRichNoteBody } from "@/lib/notes/richText";

export const DAILY_NOTE_TAG = "daily";
export const INBOX_NOTE_TAG = "inbox";

export type CreateNoteInput = Partial<Pick<Note, "title" | "body" | "tags">>;

export function dailyNoteTitle(dateISO: string): string {
  return `Daily Note - ${dateISO}`;
}

export function dailyNoteBody(dateISO: string): string {
  return [
    `### Priorities`,
    "- [ ] ",
    "",
    "### Captures",
    "- ",
    "",
    "### Decisions",
    "- ",
    "",
    "### Follow-ups",
    "- [ ] ",
    "",
    `_${dateISO}_`,
  ].join("\n");
}

export function createDailyNoteInput(dateISO: string): CreateNoteInput {
  return {
    title: dailyNoteTitle(dateISO),
    body: dailyNoteBody(dateISO),
    tags: [DAILY_NOTE_TAG],
  };
}

export function createInboxNoteInput(text = ""): CreateNoteInput {
  const body = text.trim();
  return {
    title: body ? deriveTaskTitleFromNoteText(body) : "",
    body,
    tags: [INBOX_NOTE_TAG],
  };
}

export function isDailyNoteForDate(note: Note, dateISO: string): boolean {
  const hasDailyTag = (note.tags ?? []).some((tag) => tag.toLowerCase() === DAILY_NOTE_TAG);
  return hasDailyTag && note.title.includes(dateISO);
}

export function findDailyNote(notes: Note[], dateISO: string): Note | null {
  return notes.find((note) => isDailyNoteForDate(note, dateISO)) ?? null;
}

export function appendQuickCaptureToBody(body: string, text: string, date = new Date()): string {
  const clean = normalizeLine(text);
  if (!clean) return body;
  const entry = `- ${formatCaptureTime(date)} ${clean}`;

  if (isRichNoteBody(body)) {
    return `${body}<p>${escapeHtml(`${formatCaptureTime(date)} ${clean}`)}</p>`;
  }

  if (!body.trim()) return `### Captures\n${entry}`;

  const lines = body.split("\n");
  const capturesIndex = lines.findIndex((line) => /^###\s+captures\s*$/i.test(line.trim()));
  if (capturesIndex >= 0) {
    let insertAt = capturesIndex + 1;
    while (insertAt < lines.length && !/^###\s+/.test(lines[insertAt]?.trim() ?? "")) insertAt++;
    while (insertAt > capturesIndex + 1 && lines[insertAt - 1]?.trim() === "") insertAt--;
    lines.splice(insertAt, 0, entry);
    return lines.join("\n");
  }

  return `${body.trimEnd()}\n\n### Captures\n${entry}`;
}

export function deriveTaskTitleFromNoteText(raw: string): string {
  return normalizeLine(raw)
    .replace(/^#{1,6}\s+/, "")
    .replace(/^- \[[ xX]\]\s*/, "")
    .replace(/^-+\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function normalizeLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function formatCaptureTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
