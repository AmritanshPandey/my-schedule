"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconNotebook, IconPlus, IconSearch, IconX, IconPinnedFilled, IconLayoutGrid } from "@tabler/icons-react";
import type { Note } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import { checklistStats, deriveSnippet, deriveTitle } from "@/lib/notes/markdown";
import { AccentBadge, cycleAccentColor } from "@/components/ui/Badge";
import { stableFieldHash } from "@/lib/hash";
import { NOTE_TEMPLATES } from "@/lib/notes/templates";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import DetailHeader from "@/components/ui/DetailHeader";
import EmptyState from "@/components/ui/EmptyState";
import NoteEditor from "./NoteEditor";

type NotePatch = Partial<Pick<Note, "title" | "body" | "pinned" | "tags">>;

interface NotesViewProps {
  notes: Note[];
  onCreate: (body?: string) => string;   // creates a note, returns its id
  onUpdate: (id: string, patch: NotePatch) => void;
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

function tagColor(tag: string) {
  return cycleAccentColor(stableFieldHash(tag.toLowerCase()));
}

function SectionLabel({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
      {icon}
      {label}
    </div>
  );
}

function NoteCard({
  note,
  active,
  onSelect,
  onTogglePin,
}: {
  note: Note;
  active: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const stats = checklistStats(note.body);
  const snippet = deriveSnippet(note);
  const tags = note.tags ?? [];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={`group relative flex w-full cursor-pointer flex-col rounded-2xl border px-4 py-3 text-left transition-colors ${
        active
          ? "border-neutral-300 bg-neutral-50 dark:border-white/[0.12] dark:bg-white/[0.06]"
          : "border-neutral-100 bg-white hover:border-neutral-200 hover:bg-neutral-50 dark:border-white/[0.06] dark:bg-neutral-900/40 dark:hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[15px] font-semibold text-neutral-900 dark:text-white">
          {deriveTitle(note)}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
            {relativeDate(note.updatedAt)}
          </span>
          <button
            type="button"
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
            aria-pressed={!!note.pinned}
            onClick={(e) => { e.stopPropagation(); haptic("light"); onTogglePin(); }}
            className={`-mr-1 flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
              note.pinned
                ? "text-amber-500"
                : "text-neutral-300 hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400"
            }`}
          >
            <IconPinnedFilled size={15} strokeWidth={2} />
          </button>
        </div>
      </div>
      {snippet && (
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
          {snippet}
        </span>
      )}
      {(stats || tags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {stats && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
          {tags.map((tag) => (
            <AccentBadge key={tag} color={tagColor(tag)}>{tag}</AccentBadge>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function EmptyDetail({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      center
      icon={IconNotebook}
      title="Select a note"
      description="Pick a note from the list, or start a new one."
      action={{ label: "New note", onClick: onCreate }}
    />
  );
}

export default function NotesView({ notes, onCreate, onUpdate, onDelete, onClose }: NotesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
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

  // Pinned notes float to the top; within each group, most-recently-updated first.
  const sorted = useMemo(
    () =>
      [...notes].sort(
        (a, b) =>
          (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt),
      ),
    [notes],
  );

  // Every distinct tag across all notes, for the filter chip row.
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const n of notes) {
      for (const t of n.tags ?? []) {
        const key = t.toLowerCase();
        if (!seen.has(key)) { seen.add(key); tags.push(t); }
      }
    }
    return tags.sort((a, b) => a.localeCompare(b));
  }, [notes]);

  // Drop selected tags that no longer exist on any note.
  useEffect(() => {
    setSelectedTags((prev) => prev.filter((t) => allTags.some((a) => a.toLowerCase() === t.toLowerCase())));
  }, [allTags]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((n) => {
      if (q && !(n.title + " " + n.body).toLowerCase().includes(q)) return false;
      if (selectedTags.length > 0) {
        const noteTags = (n.tags ?? []).map((t) => t.toLowerCase());
        if (!selectedTags.every((t) => noteTags.includes(t.toLowerCase()))) return false;
      }
      return true;
    });
  }, [sorted, query, selectedTags]);

  const editingNote = editingId ? notes.find((n) => n.id === editingId) ?? null : null;

  function handleCreate(body?: string) {
    haptic("light");
    const id = onCreate(body);
    setEditingId(id);
  }

  function toggleTagFilter(tag: string) {
    haptic("light");
    setSelectedTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag],
    );
  }

  function togglePin(note: Note) {
    onUpdate(note.id, { pinned: !note.pinned });
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
              onClick={() => setTemplatePickerOpen(true)}
              aria-label="New from template"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-white/[0.1] dark:text-neutral-300 dark:hover:bg-white/[0.06]"
            >
              <IconLayoutGrid size={16} strokeWidth={2} />
              Templates
            </button>
            <button
              type="button"
              onClick={() => handleCreate()}
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
            actions={[
              { icon: IconLayoutGrid, label: "New from template", onClick: () => setTemplatePickerOpen(true) },
              { icon: IconPlus, label: "New note", onClick: () => handleCreate() },
            ]}
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

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {allTags.map((tag) => {
              const on = selectedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTagFilter(tag)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                    on
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/[0.1] dark:text-neutral-400 dark:hover:border-white/20"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-32 lg:pb-6">
          {filtered.length === 0 ? (
            notes.length === 0 ? (
              <EmptyState
                icon={IconNotebook}
                title="No notes yet"
                description="Tap New to start a note — jot a paragraph or a checklist."
                action={{ label: "New note", onClick: () => handleCreate() }}
                secondaryAction={{ label: "Browse templates", onClick: () => setTemplatePickerOpen(true) }}
              />
            ) : (
              <EmptyState
                icon={IconSearch}
                title="No matching notes"
                description={selectedTags.length > 0 ? "Try different tags or search." : "Try a different search."}
              />
            )
          ) : (() => {
            const pinnedNotes = filtered.filter((n) => n.pinned);
            const otherNotes = filtered.filter((n) => !n.pinned);
            const renderCard = (note: Note) => (
              <NoteCard
                key={note.id}
                note={note}
                active={activeId === note.id}
                onSelect={() => { haptic("light"); setEditingId(note.id); }}
                onTogglePin={() => togglePin(note)}
              />
            );
            return (
              <AnimatePresence initial={false}>
                {pinnedNotes.length > 0 && (
                  <div className="space-y-1.5">
                    <SectionLabel icon={<IconPinnedFilled size={12} strokeWidth={2.5} />} label="Pinned" />
                    {pinnedNotes.map(renderCard)}
                  </div>
                )}
                <div className={`space-y-1.5 ${pinnedNotes.length > 0 ? "mt-4" : ""}`}>
                  {pinnedNotes.length > 0 && otherNotes.length > 0 && <SectionLabel label="Notes" />}
                  {otherNotes.map(renderCard)}
                </div>
              </AnimatePresence>
            );
          })()}
        </div>
      </>
    );
  }

  const templateSheet = (
    <BottomSheet open={templatePickerOpen} onClose={() => setTemplatePickerOpen(false)}>
      <div className="space-y-2 p-5 pb-8">
        <SheetHeader eyebrow="New note" title="Start from a template" onClose={() => setTemplatePickerOpen(false)} />
        <div className="space-y-1.5 pt-1">
          {NOTE_TEMPLATES.map(({ id, label, description, icon: Icon, body }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setTemplatePickerOpen(false); handleCreate(body || undefined); }}
              className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left transition-colors hover:border-neutral-300 active:bg-neutral-50 dark:border-white/[0.08] dark:bg-neutral-900 dark:hover:border-white/20 dark:active:bg-white/[0.03]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-neutral-900 dark:text-white">{label}</p>
                <p className="mt-0.5 text-[13px] text-neutral-400 dark:text-neutral-500">{description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  );

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
            <EmptyDetail onCreate={() => handleCreate()} />
          )}
        </section>
        {templateSheet}
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
      {templateSheet}
    </div>
  );
}
