"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  IconBold,
  IconChecklist,
  IconCode,
  IconHeading,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconList,
  IconStrikethrough,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import type { Note } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import {
  groupBlocks,
  type LineKind,
  makeEmptyTable,
  parseLine,
  renderInline,
  serializeLine,
  serializeTable,
} from "@/lib/notes/markdown";
import DetailHeader from "@/components/ui/DetailHeader";
import TableBlock from "./TableBlock";

interface NoteEditorProps {
  note: Note;
  onUpdate: (id: string, patch: Partial<Pick<Note, "title" | "body">>) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

type SaveState = "idle" | "saving" | "saved";

const INDENT_PX = 22; // visual indent per nesting step
const MAX_INDENT = 6;

// ── Selection helpers (caret offset within a plain-text contentEditable) ─────
function getSelectionOffsets(el: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return { start: 0, end: 0 };
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length };
}

function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const node = el.firstChild;
  const range = document.createRange();
  if (node && node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export default function NoteEditor({ note, onUpdate, onDelete, onBack }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Which block holds the caret: it shows raw markdown; all others render styled.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(
    note.body.trim().length === 0 ? 0 : null,
  );
  const [caretNonce, setCaretNonce] = useState(0);

  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingCaret = useRef<{ index: number; offset: number } | null>(null);
  const newTableStart = useRef<number | null>(null); // table to auto-focus after insert
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lines = body.split("\n");
  const isEmpty = body.trim().length === 0;

  // Sync local state when a different note is opened.
  useEffect(() => {
    setTitle(note.title);
    setBody(note.body);
    if (note.body.trim().length === 0) {
      pendingCaret.current = { index: 0, offset: 0 };
      setFocusedIndex(0);
      setCaretNonce((n) => n + 1);
    } else {
      setFocusedIndex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Debounced autosave + save-state indicator.
  useEffect(() => {
    if (title === note.title && body === note.body) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate(note.id, { title, body });
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 1500);
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body]);

  // Flush pending timers on unmount.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // Place the caret into the focused block after a programmatic edit. Runs only
  // on focus/caret changes — never on every keystroke — so typing isn't disturbed.
  useLayoutEffect(() => {
    if (focusedIndex == null) return;
    const el = blockRefs.current.get(focusedIndex);
    if (!el) return;
    const raw = parseLine(body.split("\n")[focusedIndex] ?? "").text;
    if (el.textContent !== raw) el.textContent = raw;
    el.focus();
    setCaretOffset(el, pendingCaret.current?.offset ?? el.textContent?.length ?? 0);
    pendingCaret.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, caretNonce]);

  function flushAndBack() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (title !== note.title || body !== note.body) onUpdate(note.id, { title, body });
    onBack();
  }

  function bumpCaret(index: number, offset: number) {
    pendingCaret.current = { index, offset };
    setFocusedIndex(index);
    setCaretNonce((n) => n + 1);
  }

  // Apply a patch to a single line (kind/indent/text/etc.), reserializing it.
  function updateLine(i: number, patch: Partial<ReturnType<typeof parseLine>>) {
    setBody((prev) => {
      const ls = prev.split("\n");
      if (i < 0 || i >= ls.length) return prev;
      const p = parseLine(ls[i]);
      let kind: LineKind = (patch.kind ?? p.kind) as LineKind;
      const text = patch.text ?? p.text;
      if (kind === "blank" && text) kind = "para"; // typing into a blank line makes it a paragraph
      ls[i] = serializeLine({ ...p, ...patch, kind, text });
      return ls.join("\n");
    });
  }

  // Pull the latest text out of a block's DOM and write it back into `body`.
  function handleInput(i: number) {
    const el = blockRefs.current.get(i);
    if (!el) return;
    updateLine(i, { text: el.textContent ?? "" });
  }

  // Blur → render this block styled, unless focus moved to another block.
  function handleBlur(i: number) {
    window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.getAttribute("data-note-block") === "1") return;
      setFocusedIndex((cur) => (cur === i ? null : cur));
    }, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>, i: number) {
    const el = blockRefs.current.get(i);
    if (!el) return;
    const ls = body.split("\n");
    const p = parseLine(ls[i]);

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const { start } = getSelectionOffsets(el);
      const text = el.textContent ?? "";
      const before = text.slice(0, start);
      const after = text.slice(start);

      // Enter on an empty list item exits the list instead of adding a blank one.
      if ((p.kind === "checklist" || p.kind === "bullet") && text.trim() === "") {
        updateLine(i, { kind: "para", indent: 0, checked: undefined, level: undefined });
        bumpCaret(i, 0);
        return;
      }

      const curKind: LineKind = p.kind === "blank" ? "para" : p.kind;
      const cur = serializeLine({ ...p, kind: curKind, text: before });
      const next =
        p.kind === "checklist"
          ? serializeLine({ kind: "checklist", indent: p.indent, checked: false, text: after })
          : p.kind === "bullet"
            ? serializeLine({ kind: "bullet", indent: p.indent, text: after })
            : serializeLine({ kind: "para", indent: curKind === "para" ? p.indent : 0, text: after });

      setBody((prev) => {
        const l = prev.split("\n");
        l.splice(i, 1, cur, next);
        return l.join("\n");
      });
      bumpCaret(i + 1, 0);
      return;
    }

    if (e.key === "Backspace") {
      const { start, end } = getSelectionOffsets(el);
      if (start !== 0 || end !== 0) return; // normal in-line delete
      e.preventDefault();
      if (p.kind !== "para" && p.kind !== "blank") {
        updateLine(i, { kind: "para", indent: 0, checked: undefined, level: undefined });
        bumpCaret(i, 0);
        return;
      }
      if (i === 0) return;
      const prevP = parseLine(ls[i - 1]);
      const curText = el.textContent ?? "";
      const caret = prevP.text.length;
      setBody((prev) => {
        const l = prev.split("\n");
        l[i - 1] = serializeLine({
          ...prevP,
          kind: prevP.kind === "blank" ? "para" : prevP.kind,
          text: prevP.text + curText,
        });
        l.splice(i, 1);
        return l.join("\n");
      });
      bumpCaret(i - 1, caret);
      return;
    }

    if (e.key === "Tab") {
      if (p.kind !== "checklist" && p.kind !== "bullet") return;
      e.preventDefault();
      const { start } = getSelectionOffsets(el);
      updateLine(i, { indent: Math.max(0, Math.min(MAX_INDENT, p.indent + (e.shiftKey ? -1 : 1))) });
      bumpCaret(i, start);
    }
  }

  function activateBlock(e: React.MouseEvent, i: number) {
    e.preventDefault();
    pendingCaret.current = null; // caret lands at end of the line
    setFocusedIndex(i);
    setCaretNonce((n) => n + 1);
  }

  function toggleCheckbox(i: number) {
    haptic("light");
    setBody((prev) => {
      const ls = prev.split("\n");
      const p = parseLine(ls[i]);
      if (p.kind !== "checklist") return prev;
      ls[i] = serializeLine({ ...p, checked: !p.checked });
      return ls.join("\n");
    });
  }

  // ── Toolbar actions ────────────────────────────────────────────────────────
  function targetIndex(): number {
    return focusedIndex ?? Math.max(0, lines.length - 1);
  }

  function wrapInline(open: string, close: string) {
    const i = targetIndex();
    const el = blockRefs.current.get(i);
    if (focusedIndex == null || !el) return;
    const { start, end } = getSelectionOffsets(el);
    const text = el.textContent ?? "";
    const sel = text.slice(start, end) || "text";
    updateLine(i, { text: text.slice(0, start) + open + sel + close + text.slice(end) });
    bumpCaret(i, start + open.length + sel.length);
  }

  function setBlockKind(target: LineKind) {
    const i = targetIndex();
    const el = blockRefs.current.get(i);
    const offset = el ? getSelectionOffsets(el).start : 0;
    setBody((prev) => {
      const ls = prev.split("\n");
      const p = parseLine(ls[i]);
      const kind: LineKind = p.kind === target ? "para" : target; // tap again to clear
      ls[i] = serializeLine({
        ...p,
        kind,
        indent: kind === "heading" ? 0 : p.indent,
        level: kind === "heading" ? 1 : undefined,
        checked: kind === "checklist" ? p.checked ?? false : undefined,
      });
      return ls.join("\n");
    });
    bumpCaret(i, offset);
  }

  function indentBlock(delta: number) {
    if (focusedIndex == null) return;
    const i = focusedIndex;
    const p = parseLine(body.split("\n")[i]);
    if (p.kind !== "checklist" && p.kind !== "bullet") return;
    const el = blockRefs.current.get(i);
    const offset = el ? getSelectionOffsets(el).start : 0;
    updateLine(i, { indent: Math.max(0, Math.min(MAX_INDENT, p.indent + delta)) });
    bumpCaret(i, offset);
  }

  // ── Tables ───────────────────────────────────────────────────────────────
  function insertTable() {
    const i = targetIndex();
    const tbl = makeEmptyTable();
    setBody((prev) => {
      const ls = prev.split("\n");
      const replaceEmpty = (ls[i] ?? "").trim() === "";
      const at = replaceEmpty ? i : i + 1;
      ls.splice(at, replaceEmpty ? 1 : 0, ...tbl);
      newTableStart.current = at;
      return ls.join("\n");
    });
    setFocusedIndex(null); // hand off to the table's own cell focus
  }

  function updateTable(start: number, end: number, rows: string[][]) {
    setBody((prev) => {
      const ls = prev.split("\n");
      ls.splice(start, end - start + 1, ...serializeTable(rows));
      return ls.join("\n");
    });
  }

  function removeTable(start: number, end: number) {
    setBody((prev) => {
      const ls = prev.split("\n");
      ls.splice(start, end - start + 1);
      if (ls.length === 0) ls.push("");
      return ls.join("\n");
    });
    setFocusedIndex(null);
  }

  // Auto-focus target for a table just inserted. Cleared in an effect (not during
  // render) so StrictMode's double-render doesn't drop it before commit.
  const autoFocusTable = newTableStart.current;
  useEffect(() => { newTableStart.current = null; });

  function renderLine(i: number) {
    const line = lines[i] ?? "";
    const p = parseLine(line);
    const focused = focusedIndex === i;
    const isHeading = p.kind === "heading";
    const checkedStrike = p.kind === "checklist" && p.checked;

    const textClass = [
      "min-w-0 flex-1 whitespace-pre-wrap break-words outline-none",
      isHeading
        ? "pt-1 text-[19px] font-bold text-neutral-900 dark:text-white"
        : "text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-100",
      checkedStrike ? "text-neutral-400 line-through dark:text-neutral-600" : "",
    ].join(" ");

    return (
      <div
        key={i}
        className="flex items-start gap-2.5"
        style={{ paddingLeft: p.indent * INDENT_PX }}
      >
        {/* Gutter */}
        {p.kind === "checklist" && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleCheckbox(i)}
            aria-checked={!!p.checked}
            role="checkbox"
            className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors ${
              p.checked
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-neutral-300 dark:border-neutral-600"
            }`}
          >
            {p.checked && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </button>
        )}
        {p.kind === "bullet" && (
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-500" />
        )}

        {/* Editable text — raw when focused, styled when blurred.
            Distinct keys force the contentEditable to unmount on blur so
            no browser-typed text node lingers under the styled render. */}
        {focused ? (
          <div
            key={`edit-${i}`}
            ref={(el) => { if (el) blockRefs.current.set(i, el); else blockRefs.current.delete(i); }}
            data-note-block="1"
            data-ph={isEmpty && i === 0 ? "Start writing…" : ""}
            contentEditable
            suppressContentEditableWarning
            onInput={() => handleInput(i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            onBlur={() => handleBlur(i)}
            className={`${textClass} empty:before:pointer-events-none empty:before:text-neutral-400 empty:before:content-[attr(data-ph)] dark:empty:before:text-neutral-600`}
          />
        ) : (
          <div
            key={`read-${i}`}
            onMouseDown={(e) => activateBlock(e, i)}
            className={`${textClass} cursor-text`}
          >
            {p.text.length > 0 ? renderInline(p.text) : <span className="opacity-0">.</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Mobile: standardized glassy detail header (matches Plan detail) */}
      <DetailHeader
        className="lg:hidden"
        title="Notes"
        onBack={flushAndBack}
        rightSlot={<SaveBadge state={saveState} />}
        actions={[{
          icon: IconTrash,
          label: confirmDelete ? "Confirm delete" : "Delete note",
          destructive: true,
          active: confirmDelete,
          onClick: () => {
            if (confirmDelete) { haptic("medium"); onDelete(note.id); }
            else { haptic("light"); setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); }
          },
        }]}
      />

      {/* Desktop: pane header — the list pane stays visible, so no back button.
          Extra right padding clears the floating top-bar pill. */}
      <div className="hidden shrink-0 items-center gap-2 px-3 pt-4 pb-2 lg:flex lg:pr-44">
        <div className="flex-1" />
        <SaveBadge state={saveState} />
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
      <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-5 pb-32 lg:mx-auto lg:max-w-2xl">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="mb-1 w-full bg-transparent text-[24px] font-bold tracking-[-0.4px] text-neutral-900 placeholder-neutral-300 outline-none dark:text-white dark:placeholder-neutral-700"
        />
        <p className="mb-4 text-[12px] text-neutral-400 dark:text-neutral-600">
          {new Date(note.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>

        <div className="space-y-0.5">
          {groupBlocks(lines).map((block) =>
            block.kind === "table" ? (
              <TableBlock
                key={`table-${block.start}`}
                rows={block.rows}
                autoFocus={block.start === autoFocusTable}
                onChange={(rows) => updateTable(block.start, block.end, rows)}
                onRemove={() => removeTable(block.start, block.end)}
              />
            ) : (
              renderLine(block.index)
            ),
          )}
        </div>
      </div>

      {/* Formatting toolbar — visible while a block is focused */}
      {focusedIndex != null && (
        <div className="shrink-0 border-t border-neutral-100 bg-white/90 px-2 py-2 backdrop-blur dark:border-white/[0.06] dark:bg-neutral-950/90" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
          <div className="flex items-center gap-0.5 overflow-x-auto">
            <ToolbarButton label="Checklist" onClick={() => setBlockKind("checklist")}><IconChecklist size={18} strokeWidth={2} /></ToolbarButton>
            <ToolbarButton label="Bullet" onClick={() => setBlockKind("bullet")}><IconList size={18} strokeWidth={2} /></ToolbarButton>
            <ToolbarButton label="Heading" onClick={() => setBlockKind("heading")}><IconHeading size={18} strokeWidth={2} /></ToolbarButton>
            <Divider />
            <ToolbarButton label="Indent" onClick={() => indentBlock(1)}><IconIndentIncrease size={18} strokeWidth={2} /></ToolbarButton>
            <ToolbarButton label="Outdent" onClick={() => indentBlock(-1)}><IconIndentDecrease size={18} strokeWidth={2} /></ToolbarButton>
            <Divider />
            <ToolbarButton label="Bold" onClick={() => wrapInline("**", "**")}><IconBold size={18} strokeWidth={2} /></ToolbarButton>
            <ToolbarButton label="Italic" onClick={() => wrapInline("*", "*")}><IconItalic size={18} strokeWidth={2} /></ToolbarButton>
            <ToolbarButton label="Strikethrough" onClick={() => wrapInline("~~", "~~")}><IconStrikethrough size={18} strokeWidth={2} /></ToolbarButton>
            <ToolbarButton label="Code" onClick={() => wrapInline("`", "`")}><IconCode size={18} strokeWidth={2} /></ToolbarButton>
            <Divider />
            <ToolbarButton label="Insert table" onClick={insertTable}><IconTable size={18} strokeWidth={2} /></ToolbarButton>
            <div className="ml-auto flex-1" />
            <button
              type="button"
              onClick={() => { setFocusedIndex(null); (document.activeElement as HTMLElement | null)?.blur(); }}
              className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 text-[13px] font-bold text-white dark:bg-white dark:text-neutral-900"
            >
              Done
            </button>
          </div>
        </div>
      )}
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

function ToolbarButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the caret/selection in the focused block
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2 text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
    >
      {children}
    </button>
  );
}
