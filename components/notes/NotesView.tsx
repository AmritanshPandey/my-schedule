"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconArrowLeft, IconNotebook, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import type { Note } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import NoteEditor from "./NoteEditor";

interface NotesViewProps {
  notes: Note[];
  onCreate: () => string;            // creates a note, returns its id
  onUpdate: (id: string, patch: Partial<Pick<Note, "title" | "body">>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// Derive a display title + preview snippet from a note's content (Apple Notes style).
function deriveTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const first = note.body.split("\n").find((l) => l.trim().length > 0) ?? "";
  const cleaned = first.replace(/^#{1,3}\s+/, "").replace(/^- (\[[ xX]\] )?/, "").replace(/\*\*/g, "").trim();
  return cleaned || "New Note";
}

function deriveSnippet(note: Note): string {
  const lines = note.body.split("\n").map((l) => l.trim()).filter(Boolean);
  const titleLine = note.title.trim() ? -1 : 0; // if no title, first content line is the title
  const body = lines.slice(titleLine + 1).join("  ");
  return body.replace(/^#{1,3}\s+/, "").replace(/- \[ \]/g, "○").replace(/- \[[xX]\]/g, "✓").replace(/^- /gm, "• ").replace(/\*\*/g, "");
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export default function NotesView({ notes, onCreate, onUpdate, onDelete, onClose }: NotesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) => (n.title + " " + n.body).toLowerCase().includes(q));
  }, [sorted, query]);

  const editingNote = editingId ? notes.find((n) => n.id === editingId) ?? null : null;

  function handleCreate() {
    haptic("light");
    const id = onCreate();
    setEditingId(id);
  }

  function handleDelete(id: string) {
    onDelete(id);
    setEditingId(null);
  }

  // ── Editor screen ──────────────────────────────────────────────────────────
  if (editingNote) {
    return (
      <NoteEditor
        note={editingNote}
        onUpdate={onUpdate}
        onDelete={handleDelete}
        onBack={() => setEditingId(null)}
      />
    );
  }

  // ── List screen ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Single header — Back · title · New */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-4 pb-1">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
        >
          <IconArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <div className="flex items-center gap-2">
          <IconNotebook size={20} strokeWidth={1.9} className="text-neutral-400 dark:text-neutral-500" />
          <h1 className="text-[22px] font-bold tracking-[-0.5px] text-neutral-900 dark:text-white">Notes</h1>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCreate}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-neutral-900 px-3 text-[13px] font-bold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
        >
          <IconPlus size={16} strokeWidth={2.5} />
          New
        </button>
      </div>

      {/* Search */}
      <div className="px-5 pt-2 pb-3">
        <div className="relative">
          <IconSearch size={15} strokeWidth={2} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-9 text-[14px] text-neutral-900 outline-none focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
              <IconX size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-32">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 pt-24 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.05]">
              <IconNotebook size={26} strokeWidth={1.6} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <p className="text-[15px] font-semibold text-neutral-700 dark:text-neutral-200">
              {query ? "No matching notes" : "No notes yet"}
            </p>
            <p className="mt-1 max-w-[240px] text-[13px] text-neutral-400 dark:text-neutral-500">
              {query ? "Try a different search." : "Tap New to start a note — jot a paragraph or a checklist."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {filtered.map((note) => (
                <motion.button
                  key={note.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  type="button"
                  onClick={() => { haptic("light"); setEditingId(note.id); }}
                  className="flex w-full flex-col rounded-2xl border border-neutral-100 bg-white px-4 py-3 text-left transition-colors hover:border-neutral-200 hover:bg-neutral-50 dark:border-white/[0.06] dark:bg-neutral-900/40 dark:hover:bg-white/[0.04]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[15px] font-semibold text-neutral-900 dark:text-white">
                      {deriveTitle(note)}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                      {relativeDate(note.updatedAt)}
                    </span>
                  </div>
                  <span className="mt-0.5 line-clamp-1 text-[13px] text-neutral-500 dark:text-neutral-400">
                    {deriveSnippet(note) || "No additional text"}
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
