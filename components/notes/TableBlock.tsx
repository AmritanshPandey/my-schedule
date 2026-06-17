"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconColumnInsertRight,
  IconColumnRemove,
  IconRowInsertBottom,
  IconRowRemove,
  IconTrash,
} from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";

interface TableBlockProps {
  rows: string[][];
  autoFocus?: boolean;
  onChange: (rows: string[][]) => void;
  onRemove: () => void;
}

/**
 * Editable grid backed by a markdown pipe-table. Cells are plain <input>s
 * (so the caret behaves natively); the parent owns the data via onChange.
 */
export default function TableBlock({ rows, autoFocus, onChange, onRemove }: TableBlockProps) {
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | { kind: "row" | "column" | "table"; index?: number }>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputs = useRef<Map<string, HTMLInputElement>>(new Map());
  const deleteCopy = deleteTarget
    ? deleteTarget.kind === "table"
      ? buildDeleteConfirmationCopy("table", {
          title: "Delete this table?",
          description: "This table will be removed from the note.",
          confirmLabel: "Delete table",
        })
      : deleteTarget.kind === "row"
        ? buildDeleteConfirmationCopy("row", {
            title: "Delete this row?",
            description: "This row will be removed from the table.",
            confirmLabel: "Delete row",
          })
        : buildDeleteConfirmationCopy("column", {
            title: "Delete this column?",
            description: "This column will be removed from the table.",
            confirmLabel: "Delete column",
          })
    : null;

  const cols = rows[0]?.length ?? 0;
  const key = (r: number, c: number) => `${r}:${c}`;

  function focusCell(r: number, c: number) {
    requestAnimationFrame(() => {
      const el = inputs.current.get(key(r, c));
      if (el) { el.focus(); el.select(); setActive({ r, c }); }
    });
  }

  // Focus the first cell of a freshly inserted table.
  useEffect(() => {
    if (autoFocus) focusCell(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setCell(r: number, c: number, val: string) {
    const next = rows.map((row) => row.slice());
    next[r][c] = val;
    onChange(next);
  }

  function addRow(at: number) {
    const next = rows.map((row) => row.slice());
    next.splice(at, 0, Array(cols).fill(""));
    onChange(next);
  }

  function addCol(at: number) {
    onChange(rows.map((row) => { const x = row.slice(); x.splice(at, 0, ""); return x; }));
  }

  function delRow(r: number) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== r));
  }

  function delCol(c: number) {
    if (cols <= 1) return;
    onChange(rows.map((row) => row.filter((_, i) => i !== c)));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        let nr = r, nc = c - 1;
        if (nc < 0) { nr = r - 1; nc = cols - 1; }
        if (nr >= 0) focusCell(nr, nc);
      } else {
        let nr = r, nc = c + 1;
        if (nc >= cols) { nr = r + 1; nc = 0; }
        if (nr >= rows.length) { addRow(rows.length); focusCell(rows.length, 0); }
        else focusCell(nr, nc);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const nr = r + 1;
      if (nr >= rows.length) { addRow(rows.length); focusCell(rows.length, c); }
      else focusCell(nr, c);
    }
  }

  function handleBlur() {
    window.setTimeout(() => {
      const el = document.activeElement;
      if (wrapRef.current && el && wrapRef.current.contains(el)) return;
      setActive(null);
    }, 0);
  }

  return (
    <div ref={wrapRef} onBlur={handleBlur} className="my-2">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-white/[0.1]">
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className={r === 0 ? "bg-neutral-50 dark:bg-white/[0.04]" : ""}>
                {row.map((cell, c) => {
                  const isActive = active?.r === r && active?.c === c;
                  return (
                    <td
                      key={c}
                      className={`border border-neutral-200 p-0 dark:border-white/[0.08] ${
                        isActive ? "ring-1 ring-inset ring-neutral-400 dark:ring-white/30" : ""
                      }`}
                    >
                      <input
                        ref={(el) => { if (el) inputs.current.set(key(r, c), el); else inputs.current.delete(key(r, c)); }}
                        value={cell}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onFocus={() => setActive({ r, c })}
                        onKeyDown={(e) => handleKeyDown(e, r, c)}
                        placeholder={r === 0 ? "Header" : ""}
                        className={`w-full min-w-[88px] bg-transparent px-2.5 py-1.5 outline-none placeholder-neutral-300 dark:placeholder-neutral-600 ${
                          r === 0 ? "font-semibold text-neutral-900 dark:text-white" : "text-neutral-800 dark:text-neutral-100"
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Controls — visible while a cell in this table is focused */}
      {active && (
        <div className="mt-1.5 flex items-center gap-0.5">
          <CtrlButton label="Add row below" onClick={() => { haptic("light"); addRow(active.r + 1); }}>
            <IconRowInsertBottom size={17} strokeWidth={2} />
          </CtrlButton>
          <CtrlButton label="Add column right" onClick={() => { haptic("light"); addCol(active.c + 1); }}>
            <IconColumnInsertRight size={17} strokeWidth={2} />
          </CtrlButton>
          <CtrlButton label="Delete row" onClick={() => { haptic("light"); setDeleteTarget({ kind: "row", index: active.r }); }} disabled={rows.length <= 1} danger>
            <IconRowRemove size={17} strokeWidth={2} />
          </CtrlButton>
          <CtrlButton label="Delete column" onClick={() => { haptic("light"); setDeleteTarget({ kind: "column", index: active.c }); }} disabled={cols <= 1} danger>
            <IconColumnRemove size={17} strokeWidth={2} />
          </CtrlButton>
          <span className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-white/[0.08]" />
          <CtrlButton label="Delete table" onClick={() => { haptic("light"); setDeleteTarget({ kind: "table" }); }} danger>
            <IconTrash size={16} strokeWidth={2} />
          </CtrlButton>
        </div>
      )}

      <ConfirmSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          haptic("medium");
          if (deleteTarget.kind === "row" && deleteTarget.index != null) delRow(deleteTarget.index);
          else if (deleteTarget.kind === "column" && deleteTarget.index != null) delCol(deleteTarget.index);
          else onRemove();
          setDeleteTarget(null);
        }}
        title={deleteCopy?.title ?? ""}
        description={deleteCopy?.description}
        confirmLabel={deleteCopy?.confirmLabel}
      />
    </div>
  );
}

function CtrlButton({
  children, label, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // don't steal focus from the cell
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-2 transition-colors disabled:opacity-30 ${
        danger
          ? "text-neutral-400 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:bg-rose-500/10 focus-visible:text-rose-500 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}
