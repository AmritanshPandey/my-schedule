"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconNotebook, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import type { Note } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import { checklistStats, deriveSnippet, deriveTitle } from "@/lib/notes/markdown";
import DetailHeader from "@/components/ui/DetailHeader";
import NoteEditor from "./NoteEditor";

interface NotesViewProps {
  notes: Note[];
  onCreate: () => string;            // creates a note, returns its id
  onUpdate: (id: string, patch: Partial<Pick<Note, "title" | "body">>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
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

function NoteCard({ note, active, onSelect }: { note: Note; active: boolean; onSelect: () => void }) {
  const stats = checklistStats(note.body);
  const snippet = deriveSnippet(note);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col rounded-2xl border px-4 py-3 text-left transition-colors ${
        active
          ? "border-neutral-300 bg-neutral-50 dark:border-white/[0.12] dark:bg-white/[0.06]"
          : "border-neutral-100 bg-white hover:border-neutral-200 hover:bg-neutral-50 dark:border-white/[0.06] dark:bg-neutral-900/40 dark:hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[15px] font-semibold text-neutral-900 dark:text-white">
          {deriveTitle(note)}
        </span>
        <span className="shrink-0 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
          {relativeDate(note.updatedAt)}
        </span>
      </div>
      {snippet && (
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
          {snippet}
        </span>
      )}
      {stats && (
        <span
          className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            stats.done === stats.total
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400"
          }`}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {stats.done}/{stats.total}
        </span>
      )}
    </motion.button>
  );
}

function EmptyDetail({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.05]">
        <IconNotebook size={30} strokeWidth={1.6} className="text-neutral-400 dark:text-neutral-500" />
      </div>
      <p className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">Select a note</p>
      <p className="mt-1 max-w-[260px] text-[13px] text-neutral-400 dark:text-neutral-500">
        Pick a note from the list, or start a new one.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 flex h-9 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 text-[13px] font-bold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
      >
        <IconPlus size={16} strokeWidth={2.5} />
        New note
      </button>
    </div>
  );
}

export default function NotesView({ notes, onCreate, onUpdate, onDelete, onClose }: NotesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  // Track the desktop breakpoint (SSR-safe).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  // ── Shared list column (header · search · list) ──────────────────────────────
  function listColumn(activeId: string | null) {
    return (
      <>
        {/* Header — standardized glassy detail bar on mobile; bold panel header on desktop */}
        {isDesktop ? (
          <div className="flex shrink-0 items-center gap-2 px-3 pt-4 pb-1">
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
        ) : (
          <DetailHeader
            title="Notes"
            onBack={onClose}
            actions={[{ icon: IconPlus, label: "New note", onClick: handleCreate }]}
          />
        )}

        {/* Search */}
        <div className="px-4 pt-2 pb-3">
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-32 lg:pb-6">
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
                  <NoteCard
                    key={note.id}
                    note={note}
                    active={activeId === note.id}
                    onSelect={() => { haptic("light"); setEditingId(note.id); }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </>
    );
  }

  // ── Desktop: two-pane master / detail ────────────────────────────────────────
  if (isDesktop) {
    return (
      <div className="flex h-full w-full overflow-hidden bg-white dark:bg-neutral-950 lg:rounded-2xl">
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-neutral-150 dark:border-white/[0.06]">
          {listColumn(editingId)}
        </aside>
        <section className="min-w-0 flex-1">
          {editingNote ? (
            <NoteEditor
              key={editingNote.id}
              note={editingNote}
              onUpdate={onUpdate}
              onDelete={handleDelete}
              onBack={() => setEditingId(null)}
            />
          ) : (
            <EmptyDetail onCreate={handleCreate} />
          )}
        </section>
      </div>
    );
  }

  // ── Mobile: single column, slide between list and editor ─────────────────────
  return (
    <div className="relative h-full overflow-hidden bg-white dark:bg-neutral-950">
      <AnimatePresence initial={false}>
        {editingNote ? (
          <motion.div
            key="editor"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 bg-white dark:bg-neutral-950"
          >
            <NoteEditor
              note={editingNote}
              onUpdate={onUpdate}
              onDelete={handleDelete}
              onBack={() => setEditingId(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ x: "-12%", opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-12%", opacity: 0.4 }}
            transition={{ type: "tween", duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0 flex flex-col bg-white dark:bg-neutral-950"
          >
            {listColumn(null)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
