"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  IconArrowLeft,
  IconBold,
  IconCheck,
  IconChecklist,
  IconColumnInsertRight,
  IconColumnRemove,
  IconCopy,
  IconHeading,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconList,
  IconListNumbers,
  IconPalette,
  IconPin,
  IconPinnedFilled,
  IconRowInsertBottom,
  IconRowRemove,
  IconStrikethrough,
  IconTag,
  IconTable,
  IconTrash,
  IconX,
  IconLink,
  IconPlus,
} from "@tabler/icons-react";
import type { Note, Task, Plan } from "@/lib/useScheduleDB";
import { resolveLinkedTasks } from "@/lib/notes/linkedTasks";
import TaskLinkPicker from "@/components/notes/TaskLinkPicker";
import type { Editor } from "@tiptap/core";
import { haptic } from "@/lib/haptics";
import { AccentBadge, cycleAccentColor } from "@/components/ui/Badge";
import IconButton from "@/components/ui/IconButton";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";
import { stableFieldHash } from "@/lib/hash";
import { NOTE_COLORS } from "@/lib/notes/markdown";
import {
  bodyToEditorHtml,
  bodyToPlainText,
  checklistStatsFromBody,
  extractTagsFromBody,
  mergeNoteTags,
  serializeRichNoteBody,
} from "@/lib/notes/richText";
import { buildNoteEditorExtensions } from "./richTextExtensions";

type NotePatch = Partial<Pick<Note, "title" | "body" | "pinned" | "tags" | "linkedTaskIds">>;

interface NoteEditorProps {
  note: Note;
  onUpdate: (id: string, patch: NotePatch) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  /** De-duplicated tasks (for the link picker + chip titles). */
  tasks: Task[];
  plans: Plan[];
  /** Open a task referenced by the note. */
  onOpenTask: (taskId: string) => void;
}

type SaveState = "idle" | "saving" | "saved";

function tagKey(tags: string[]): string {
  return mergeNoteTags(tags).map((tag) => tag.toLowerCase()).join("|");
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function removeTagEverywhere(editor: Editor | null, tag: string) {
  if (!editor) return;
  const needle = tag.toLowerCase();
  editor.chain().focus().command(({ state, tr, dispatch }) => {
    const ranges: Array<{ from: number; to: number }> = [];
    state.doc.descendants((node, pos) => {
      if (node.type.name === "noteTag" && String(node.attrs.tag ?? "").toLowerCase() === needle) {
        ranges.push({ from: pos, to: pos + node.nodeSize });
      }
    });

    if (ranges.length === 0) return false;
    for (const range of ranges.sort((a, b) => b.from - a.from)) {
      tr.delete(range.from, range.to);
    }
    dispatch?.(tr);
    return true;
  }).run();
}

function toolbarButtonClass(active: boolean): string {
  return `flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2 transition-colors ${
    active
      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
  }`;
}

function normalizeEditorColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return trimmed;
  if (typeof document === "undefined") return trimmed;

  const probe = document.createElement("span");
  probe.style.color = trimmed;
  probe.style.position = "absolute";
  probe.style.opacity = "0";
  probe.style.pointerEvents = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const match = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return trimmed;
  const toHex = (channel: string) => Number(channel).toString(16).padStart(2, "0");
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function readSelectionColor(editor: Editor): string | null {
  return normalizeEditorColor(editor.getAttributes("textStyle").color as string | undefined);
}

export default function NoteEditor({ note, onUpdate, onDelete, onBack, tasks, plans, onOpenTask }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const planEmoji = useMemo(() => new Map(plans.map((p) => [p.id, p.emoji])), [plans]);
  const linkedTasks = useMemo(
    () => resolveLinkedTasks(note.linkedTaskIds, tasksById),
    [note.linkedTaskIds, tasksById]
  );

  function addLinkedTask(taskId: string) {
    const next = Array.from(new Set([...(note.linkedTaskIds ?? []), taskId]));
    onUpdate(note.id, { linkedTaskIds: next });
  }
  function removeLinkedTask(taskId: string) {
    onUpdate(note.id, { linkedTaskIds: (note.linkedTaskIds ?? []).filter((id) => id !== taskId) });
  }
  const [headerTags, setHeaderTags] = useState<string[]>(note.tags ?? []);
  const [bodyTags, setBodyTags] = useState<string[]>(extractTagsFromBody(note.body));
  const [tagInput, setTagInput] = useState("");
  const [draftBody, setDraftBody] = useState(note.body);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [pillInputOpen, setPillInputOpen] = useState(false);
  const [pillDraft, setPillDraft] = useState("");

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const pillInputRef = useRef<HTMLInputElement | null>(null);
  const latestDraft = useRef({ title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) });
  const lastSavedDraft = useRef({ title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) });
  const bodyTagsRef = useRef<string[]>(bodyTags);
  const displayTagsRef = useRef<string[]>(mergeNoteTags(note.tags ?? [], extractTagsFromBody(note.body)));
  const noteEditorExtensions = useMemo(() => buildNoteEditorExtensions(), []);

  const editor = useEditor({
    extensions: noteEditorExtensions,
    content: bodyToEditorHtml(note.body),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "note-prose",
        spellcheck: "true",
      },
    },
    onCreate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      lastTextSelectionRef.current = empty ? null : { from, to };
      setActiveColor(readSelectionColor(editor));
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      lastTextSelectionRef.current = empty ? null : { from, to };
      setActiveColor(readSelectionColor(editor));
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const richBody = serializeRichNoteBody(html);
      const nextTags = extractTagsFromBody(richBody);
      setDraftBody(richBody);
      setBodyTags(nextTags);
      bodyTagsRef.current = nextTags;
      setActiveColor(readSelectionColor(editor));
    },
  });

  const displayTags = useMemo(() => mergeNoteTags(headerTags, bodyTags), [headerTags, bodyTags]);
  const displayTagsKey = useMemo(() => tagKey(displayTags), [displayTags]);
  const plainBody = useMemo(() => bodyToPlainText(draftBody), [draftBody]);
  const wordCount = useMemo(() => plainBody.trim().split(/\s+/).filter(Boolean).length, [plainBody]);
  const checklistStats = useMemo(() => checklistStatsFromBody(draftBody), [draftBody]);
  const deleteCopy = useMemo(
    () =>
      buildDeleteConfirmationCopy("note", {
        name: title.trim() || note.title || undefined,
        description: "This note will be permanently removed.",
      }),
    [note.title, title],
  );

  useEffect(() => {
    setTitle(note.title);
    setHeaderTags(note.tags ?? []);
    setBodyTags(extractTagsFromBody(note.body));
    bodyTagsRef.current = extractTagsFromBody(note.body);
    setTagInput("");
    setConfirmDelete(false);
    setColorMenuOpen(false);
    setPillInputOpen(false);
    setPillDraft("");
    lastTextSelectionRef.current = null;
    setDraftBody(note.body);
    latestDraft.current = { title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) };
    lastSavedDraft.current = { title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) };
    setSaveState("idle");
  }, [note.id]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(bodyToEditorHtml(note.body), { emitUpdate: false });
  }, [editor, note.id]);

  useEffect(() => {
    latestDraft.current = { title, body: draftBody, tagsKey: displayTagsKey };
  }, [title, draftBody, displayTagsKey]);

  useEffect(() => {
    displayTagsRef.current = displayTags;
  }, [displayTags]);

  useEffect(() => {
    if (title === lastSavedDraft.current.title && draftBody === lastSavedDraft.current.body && displayTagsKey === lastSavedDraft.current.tagsKey) {
      return;
    }
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate(note.id, {
        title,
        body: draftBody,
        tags: displayTags,
      });
      lastSavedDraft.current = { title, body: draftBody, tagsKey: displayTagsKey };
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 1500);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [displayTags, displayTagsKey, draftBody, note.id, onUpdate, title]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      const draft = latestDraft.current;
      const saved = lastSavedDraft.current;
      if (draft.title !== saved.title || draft.body !== saved.body || draft.tagsKey !== saved.tagsKey) {
        onUpdate(note.id, {
          title: draft.title,
          body: draft.body,
          tags: displayTagsRef.current,
        });
      }
    };
  }, [note.id, onUpdate]);

  function flushAndBack() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const nextTags = mergeNoteTags(headerTags, bodyTagsRef.current);
    const draft = { title, body: draftBody, tagsKey: tagKey(nextTags) };
    if (draft.title !== lastSavedDraft.current.title || draft.body !== lastSavedDraft.current.body || draft.tagsKey !== lastSavedDraft.current.tagsKey) {
      onUpdate(note.id, {
        title: draft.title,
        body: draft.body,
        tags: nextTags,
      });
      lastSavedDraft.current = draft;
    }
    onBack();
  }

  function copyNote() {
    const text = title.trim() ? `# ${title.trim()}\n\n${plainBody}` : plainBody;
    navigator.clipboard.writeText(text).then(() => {
      haptic("light");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function togglePin() {
    haptic("light");
    onUpdate(note.id, { pinned: !note.pinned });
  }

  function addTag() {
    const raw = tagInput.trim().replace(/^#/, "").slice(0, 24);
    if (!raw) return;
    haptic("light");
    setHeaderTags((prev) => mergeNoteTags(prev, [raw]));
    setTagInput("");
  }

  function removeTag(tag: string) {
    haptic("light");
    setHeaderTags((prev) => prev.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
    removeTagEverywhere(editor, tag);
  }

  function applyColor(colorName: string) {
    if (!editor) return;
    const hex = NOTE_COLORS.find((c) => c.name === colorName)?.hex ?? "";
    const selection = lastTextSelectionRef.current;
    const chain = editor.chain().focus();
    if (selection) chain.setTextSelection(selection);
    chain.setColor(hex).run();
    setActiveColor(normalizeEditorColor(hex));
    setColorMenuOpen(false);
  }

  function removeColor() {
    if (!editor) return;
    const selection = lastTextSelectionRef.current;
    const chain = editor.chain().focus();
    if (selection) chain.setTextSelection(selection);
    chain.unsetColor().run();
    setActiveColor(null);
    setColorMenuOpen(false);
  }

  function insertPill() {
    if (!editor) return;

    const rememberedSelection = lastTextSelectionRef.current;
    const currentSelection = editor.state.selection;
    const selection =
      rememberedSelection && rememberedSelection.from !== rememberedSelection.to
        ? rememberedSelection
        : !currentSelection.empty
          ? { from: currentSelection.from, to: currentSelection.to }
          : null;

    let label = selection
      ? editor.state.doc.textBetween(selection.from, selection.to, " ").trim()
      : "";

    if (!label) {
      setPillDraft("");
      setPillInputOpen(true);
      requestAnimationFrame(() => pillInputRef.current?.focus());
      return;
    }

    commitPill(label, selection);
  }

  function commitPill(rawLabel: string, explicitSelection?: { from: number; to: number } | null) {
    if (!editor) return;
    const normalizedLabel = rawLabel
      .replace(/^#+/, "")
      .replace(/\s+/g, " ")
      .slice(0, 24)
      .trim();

    if (!normalizedLabel) return;

    const currentSelection = editor.state.selection;
    const selection =
      explicitSelection ?? (
        lastTextSelectionRef.current && lastTextSelectionRef.current.from !== lastTextSelectionRef.current.to
          ? lastTextSelectionRef.current
          : !currentSelection.empty
            ? { from: currentSelection.from, to: currentSelection.to }
            : null
      );

    const chain = editor.chain().focus();
    if (selection) chain.setTextSelection(selection);
    chain.insertContent([
      { type: "noteTag", attrs: { tag: normalizedLabel } },
      { type: "text", text: " " },
    ]).run();
    setPillDraft("");
    setPillInputOpen(false);
    haptic("light");
  }

  function cycleHeading() {
    if (!editor) return;
    if (!editor.isActive("heading")) {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
      return;
    }
    const level = editor.isActive("heading", { level: 1 })
      ? 2
      : editor.isActive("heading", { level: 2 })
        ? 3
        : 0;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
  }

  const checklistState = checklistStats ?? null;
  const isTableActive = editor?.isActive("table") ?? false;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-neutral-950">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="glass-surface sticky top-0 z-30 border-b border-black/[0.07] bg-white/88 backdrop-blur-xl dark:border-white/[0.08] dark:bg-neutral-950/88">
          <div className="mx-auto flex w-full max-w-4xl items-start gap-3 px-5 py-4 lg:max-w-5xl xl:max-w-6xl">
            <IconButton
              label="Back"
              variant="ghost"
              size="md"
              radius="xl"
              onClick={flushAndBack}
              className="lg:hidden"
            >
              <IconArrowLeft size={18} strokeWidth={2} />
            </IconButton>

            <div className="min-w-0 flex-1">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="mb-1 w-full bg-transparent text-[24px] font-bold tracking-[-0.4px] text-neutral-900 placeholder-neutral-300 outline-none dark:text-white dark:placeholder-neutral-700"
              />
              <p className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-neutral-400 dark:text-neutral-600">
                <span>{formatUpdatedAt(note.updatedAt)}</span>
                <span>·</span>
                <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
                {checklistState && (
                  <>
                    <span>·</span>
                    <span>{checklistState.done}/{checklistState.total} checked</span>
                  </>
                )}
              </p>
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                {displayTags.map((tag) => (
                  <AccentBadge key={tag} color={cycleAccentColor(stableFieldHash(tag.toLowerCase()))} className="pr-1.5">
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove ${tag}`}
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 opacity-60 transition-opacity hover:opacity-100"
                    >
                      <IconX size={11} strokeWidth={2.5} />
                    </button>
                  </AccentBadge>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    } else if (e.key === "Backspace" && !tagInput && displayTags.length > 0) {
                      removeTag(displayTags[displayTags.length - 1]);
                    }
                  }}
                  onBlur={addTag}
                  placeholder={displayTags.length === 0 ? "Add tag…" : "+ tag"}
                  maxLength={24}
                  className="h-6 w-24 min-w-0 rounded-full bg-transparent px-1 text-[12px] font-medium text-neutral-600 placeholder-neutral-300 outline-none dark:text-neutral-300 dark:placeholder-neutral-700"
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <span className="hidden lg:inline-flex">
                <SaveBadge state={saveState} />
              </span>
              <IconButton
                label={copied ? "Copied!" : "Copy note"}
                variant="ghost"
                size="md"
                radius="xl"
                onClick={copyNote}
              >
                {copied ? <IconCheck size={16} strokeWidth={2.5} /> : <IconCopy size={16} strokeWidth={2} />}
              </IconButton>
              <IconButton
                label={note.pinned ? "Unpin note" : "Pin note"}
                variant="ghost"
                size="md"
                radius="xl"
                onClick={togglePin}
                className={note.pinned ? "text-amber-500" : ""}
              >
                {note.pinned ? <IconPinnedFilled size={16} strokeWidth={2} /> : <IconPin size={16} strokeWidth={2} />}
              </IconButton>
              <IconButton
                label="Delete note"
                variant="dangerGhost"
                size="md"
                radius="xl"
                onClick={() => {
                  haptic("light");
                  setConfirmDelete(true);
                }}
              >
                <IconTrash size={16} strokeWidth={2} />
              </IconButton>
            </div>
          </div>
        </div>

        {/* Linked tasks */}
        <div className="mx-auto w-full max-w-4xl px-5 pt-4 lg:max-w-5xl xl:max-w-6xl">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              <IconLink size={12} strokeWidth={2.2} />
              Linked tasks
            </span>
            {linkedTasks.map((task) => (
              <span
                key={task.id}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white py-1 pl-2 pr-1 text-[12px] font-semibold text-neutral-700 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-neutral-200"
              >
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="inline-flex max-w-[160px] items-center gap-1 truncate"
                >
                  <span className="leading-none">{planEmoji.get(task.planId) ?? "📋"}</span>
                  <span className="truncate">{task.title}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Unlink ${task.title}`}
                  onClick={() => removeLinkedTask(task.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.08]"
                >
                  <IconX size={12} strokeWidth={2.4} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setLinkPickerOpen(true)}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2.5 text-[12px] font-semibold text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700 dark:border-white/[0.14] dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <IconPlus size={13} strokeWidth={2.4} />
              Link task
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-4xl px-5 pt-5 pb-8 lg:max-w-5xl xl:max-w-6xl">
          <div className="note-editor-shell">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      <TaskLinkPicker
        open={linkPickerOpen}
        tasks={tasks}
        plans={plans}
        linkedIds={note.linkedTaskIds ?? []}
        onAdd={addLinkedTask}
        onClose={() => setLinkPickerOpen(false)}
      />

      <div className="glass-surface shrink-0 border-t border-neutral-100 bg-white/90 px-2 py-2 backdrop-blur dark:border-white/[0.06] dark:bg-neutral-950/90" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 px-3 lg:max-w-5xl xl:max-w-6xl">
          {isTableActive && (
            <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-neutral-200 bg-neutral-50 px-2 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <ToolbarButton
                label="Add row below"
                onClick={() => editor?.chain().focus().addRowAfter().run()}
                disabled={!(editor?.can().addRowAfter() ?? false)}
              >
                <IconRowInsertBottom size={17} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton
                label="Add column right"
                onClick={() => editor?.chain().focus().addColumnAfter().run()}
                disabled={!(editor?.can().addColumnAfter() ?? false)}
              >
                <IconColumnInsertRight size={17} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton
                label="Delete row"
                onClick={() => editor?.chain().focus().deleteRow().run()}
                disabled={!(editor?.can().deleteRow() ?? false)}
              >
                <IconRowRemove size={17} strokeWidth={2} />
              </ToolbarButton>
              <ToolbarButton
                label="Delete column"
                onClick={() => editor?.chain().focus().deleteColumn().run()}
                disabled={!(editor?.can().deleteColumn() ?? false)}
              >
                <IconColumnRemove size={17} strokeWidth={2} />
              </ToolbarButton>
              <Divider />
              <ToolbarButton
                label="Delete table"
                onClick={() => editor?.chain().focus().deleteTable().run()}
                disabled={!(editor?.can().deleteTable() ?? false)}
              >
                <IconTrash size={16} strokeWidth={2} />
              </ToolbarButton>
            </div>
          )}

        <div className="flex w-full items-center gap-2">
          <div className="min-w-0 flex flex-1 items-center gap-0.5 overflow-x-auto">
          <ToolbarButton label="Checklist" active={editor?.isActive("taskList") ?? false} onClick={() => editor?.chain().focus().toggleTaskList().run()}>
            <IconChecklist size={18} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton label="Numbered list" active={editor?.isActive("orderedList") ?? false} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            <IconListNumbers size={18} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton label="Bullet list" active={editor?.isActive("bulletList") ?? false} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            <IconList size={18} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton label={editor?.isActive("heading", { level: 1 }) ? "Heading 1" : editor?.isActive("heading", { level: 2 }) ? "Heading 2" : editor?.isActive("heading", { level: 3 }) ? "Heading 3" : "Heading"} active={editor?.isActive("heading") ?? false} onClick={cycleHeading}>
            <span className="relative flex items-center">
              <IconHeading size={18} strokeWidth={2} />
              {editor?.isActive("heading") && (
                <span className="absolute -right-1.5 -bottom-1 text-[9px] font-bold leading-none">
                  {editor.isActive("heading", { level: 1 }) ? "1" : editor.isActive("heading", { level: 2 }) ? "2" : "3"}
                </span>
              )}
            </span>
          </ToolbarButton>

          <Divider />

          <ToolbarButton
            label="Indent"
            onClick={() => editor?.chain().focus().sinkListItem("listItem").run()}
          >
            <IconIndentIncrease size={18} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton
            label="Outdent"
            onClick={() => editor?.chain().focus().liftListItem("listItem").run()}
          >
            <IconIndentDecrease size={18} strokeWidth={2} />
          </ToolbarButton>

          <Divider />

          <ToolbarButton label="Bold" active={editor?.isActive("bold") ?? false} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <IconBold size={18} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton label="Italic" active={editor?.isActive("italic") ?? false} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <IconItalic size={18} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton label="Strikethrough" active={editor?.isActive("strike") ?? false} onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <IconStrikethrough size={18} strokeWidth={2} />
          </ToolbarButton>
          <ToolbarButton label="Insert pill" onClick={insertPill} active={pillInputOpen}>
            <IconTag size={18} strokeWidth={2} />
          </ToolbarButton>

          <Divider />

          <ToolbarButton label="Insert table" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <IconTable size={18} strokeWidth={2} />
          </ToolbarButton>
          </div>
          {pillInputOpen && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-2 py-1.5 dark:border-white/[0.08] dark:bg-neutral-900">
              <input
                ref={pillInputRef}
                value={pillDraft}
                onChange={(e) => setPillDraft(e.target.value.slice(0, 24))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitPill(pillDraft);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setPillInputOpen(false);
                    setPillDraft("");
                  }
                }}
                placeholder="Pill label"
                className="w-28 bg-transparent text-[13px] font-medium text-neutral-800 outline-none placeholder:text-neutral-300 dark:text-white dark:placeholder:text-neutral-600"
              />
              <button
                type="button"
                onClick={() => commitPill(pillDraft)}
                className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white dark:bg-white dark:text-neutral-900"
              >
                Add
              </button>
            </div>
          )}
          <div className="relative shrink-0">
            {colorMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-2.5 shadow-xl dark:border-white/[0.1] dark:bg-neutral-900" onMouseDown={(e) => e.preventDefault()}>
                <button
                  type="button"
                  aria-label="Remove color"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={removeColor}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-neutral-200 bg-white text-neutral-400 transition-transform hover:scale-110 active:scale-95 dark:border-white/[0.12] dark:bg-neutral-800 dark:text-neutral-500"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
                {NOTE_COLORS.map((color) => (
                  <button
                    key={color.name}
                    type="button"
                    aria-label={`Color ${color.name}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyColor(color.name)}
                    className="relative h-9 w-9 rounded-full transition-transform hover:scale-110 active:scale-95"
                    style={{ backgroundColor: color.hex }}
                  >
                    {activeColor && activeColor === normalizeEditorColor(color.hex) && (
                      <svg className="absolute inset-0 m-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              aria-label="Text color"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setColorMenuOpen((v) => !v)}
              className={`relative flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold transition-colors ${
                colorMenuOpen
                  ? "bg-neutral-200 text-neutral-900 dark:bg-white/[0.15] dark:text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
              }`}
            >
              <IconPalette size={16} strokeWidth={2} />
              <span>Color</span>
              {activeColor && !colorMenuOpen && (
                <span
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-neutral-950"
                  style={{ backgroundColor: activeColor }}
                />
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={flushAndBack}
            className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white dark:bg-white dark:text-neutral-900"
          >
            Done
          </button>
        </div>
        </div>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          haptic("medium");
          onDelete(note.id);
        }}
        title={deleteCopy.title}
        description={deleteCopy.description}
        confirmLabel={deleteCopy.confirmLabel}
      />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
      {state === "saving" ? (
        "Saving…"
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Saved
        </>
      )}
    </span>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200 dark:bg-white/[0.08]" />;
}

function ToolbarButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`${toolbarButtonClass(active)} disabled:opacity-35`}
    >
      {children}
    </button>
  );
}
