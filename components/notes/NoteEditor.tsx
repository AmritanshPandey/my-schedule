"use client";

import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconChecklist, IconList, IconTrash } from "@tabler/icons-react";
import type { Note } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";

interface NoteEditorProps {
  note: Note;
  onUpdate: (id: string, patch: Partial<Pick<Note, "title" | "body">>) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

// ── Inline markdown (bold) ──────────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4
      ? <strong key={i} className="font-bold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

/**
 * Read-mode renderer — diary view with tappable checklists.
 * Supports: "# heading", "- [ ]"/"- [x]" checklist, "- " bullet, blank line, paragraph.
 */
function ReadView({ body, onToggleLine, onActivate }: {
  body: string;
  onToggleLine: (lineIndex: number) => void;
  onActivate: () => void;
}) {
  const lines = body.split("\n");
  return (
    <div
      onClick={onActivate}
      className="min-h-[40vh] cursor-text space-y-1 text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-100"
    >
      {body.trim().length === 0 && (
        <p className="text-neutral-400 dark:text-neutral-600">Start writing…</p>
      )}
      {lines.map((line, i) => {
        const checkbox = line.match(/^(\s*)- \[( |x|X)\]\s?(.*)$/);
        if (checkbox) {
          const checked = checkbox[2].toLowerCase() === "x";
          return (
            <div key={i} className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); haptic("light"); onToggleLine(i); }}
                aria-checked={checked}
                role="checkbox"
                className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors ${
                  checked
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-neutral-300 dark:border-neutral-600"
                }`}
              >
                {checked && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
              <span className={checked ? "text-neutral-400 line-through dark:text-neutral-600" : ""}>
                {renderInline(checkbox[3]) || " "}
              </span>
            </div>
          );
        }
        const bullet = line.match(/^(\s*)- (.*)$/);
        if (bullet) {
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500" />
              <span>{renderInline(bullet[2])}</span>
            </div>
          );
        }
        const heading = line.match(/^#{1,3}\s+(.*)$/);
        if (heading) {
          return <p key={i} className="pt-1 text-[19px] font-bold text-neutral-900 dark:text-white">{renderInline(heading[1])}</p>;
        }
        if (line.trim().length === 0) return <div key={i} className="h-3" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

export default function NoteEditor({ note, onUpdate, onDelete, onBack }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [editing, setEditing] = useState(note.body.trim().length === 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when a different note is opened.
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    setEditing(note.body.trim().length === 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Debounced autosave on edits.
  useEffect(() => {
    if (title === note.title && body === note.body) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onUpdate(note.id, { title, body }), 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // Flush pending save on unmount.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  function flushAndBack() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (title !== note.title || body !== note.body) onUpdate(note.id, { title, body });
    onBack();
  }

  function toggleLine(lineIndex: number) {
    const lines = body.split("\n");
    const m = lines[lineIndex]?.match(/^(\s*)- \[( |x|X)\](.*)$/);
    if (!m) return;
    const checked = m[2].toLowerCase() === "x";
    lines[lineIndex] = `${m[1]}- [${checked ? " " : "x"}]${m[3]}`;
    setBody(lines.join("\n"));
  }

  // Toolbar: insert markdown at the cursor (in edit mode).
  function insertAtCursor(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) { setBody((b) => (b ? `${b}\n${prefix}` : prefix)); return; }
    const start = ta.selectionStart;
    const lineStart = body.lastIndexOf("\n", start - 1) + 1;
    const next = body.slice(0, lineStart) + prefix + body.slice(lineStart);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = lineStart + prefix.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-4 pb-2">
        <button
          type="button"
          onClick={flushAndBack}
          className="flex h-9 items-center gap-1 rounded-xl pl-1 pr-2.5 text-[14px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
        >
          <IconArrowLeft size={18} strokeWidth={2.2} />
          Notes
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (confirmDelete) { haptic("medium"); onDelete(note.id); }
            else { haptic("light"); setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }
          }}
          className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition-colors ${
            confirmDelete
              ? "bg-rose-500 text-white"
              : "text-neutral-400 hover:bg-neutral-100 hover:text-rose-500 dark:hover:bg-white/[0.06]"
          }`}
        >
          <IconTrash size={16} strokeWidth={2} />
          {confirmDelete ? "Delete?" : ""}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-32">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="mb-1 w-full bg-transparent text-[24px] font-bold tracking-[-0.4px] text-neutral-900 placeholder-neutral-300 outline-none dark:text-white dark:placeholder-neutral-700"
        />
        <p className="mb-4 text-[12px] text-neutral-400 dark:text-neutral-600">
          {new Date(note.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>

        {editing ? (
          <textarea
            ref={textareaRef}
            value={body}
            autoFocus
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => { if (body.trim().length > 0) setEditing(false); }}
            placeholder="Start writing…"
            className="min-h-[40vh] w-full resize-none bg-transparent text-[15px] leading-relaxed text-neutral-800 placeholder-neutral-400 outline-none dark:text-neutral-100 dark:placeholder-neutral-600"
          />
        ) : (
          <ReadView body={body} onToggleLine={toggleLine} onActivate={() => setEditing(true)} />
        )}
      </div>

      {/* Formatting toolbar — only while editing */}
      {editing && (
        <div className="shrink-0 border-t border-neutral-100 bg-white/90 px-3 py-2 backdrop-blur dark:border-white/[0.06] dark:bg-neutral-950/90" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-1.5">
            <ToolbarButton label="Checklist" onClick={() => insertAtCursor("- [ ] ")}>
              <IconChecklist size={18} strokeWidth={2} />
            </ToolbarButton>
            <ToolbarButton label="Bullet" onClick={() => insertAtCursor("- ")}>
              <IconList size={18} strokeWidth={2} />
            </ToolbarButton>
            <ToolbarButton label="Heading" onClick={() => insertAtCursor("# ")}>
              <span className="text-[15px] font-bold">H</span>
            </ToolbarButton>
            <ToolbarButton label="Bold" onClick={() => insertAtCursor("**bold**")}>
              <span className="text-[15px] font-black">B</span>
            </ToolbarButton>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => { if (body.trim().length > 0) setEditing(false); textareaRef.current?.blur(); }}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white dark:bg-white dark:text-neutral-900"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 min-w-9 items-center justify-center rounded-xl px-2.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
    >
      {children}
    </button>
  );
}
