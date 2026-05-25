"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconCheck, IconChevronDown, IconChevronUp, IconPlus, IconX } from "@tabler/icons-react";
import { PlanSelector } from "@/components/task/PlanSelector";
import type { Plan, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { inputToDisplayTime, uid } from "@/lib/taskMutations";
import type { TaskSaveData } from "@/components/task/TaskSheet";
import type { ScheduleEntry } from "@/components/ScheduleItem";

function isValidInputTime(v: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubtaskDraft {
  id: string;
  title: string;
  duration: string;
}

interface TableRow {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  taskType: "task" | "session";
  subtasks: SubtaskDraft[];
  expanded: boolean;
}

interface QuickAddPanelProps {
  plans: Plan[];
  activeDay: DayKey;
  onSave: (data: TaskSaveData) => void;
}

// ── TableRowItem ──────────────────────────────────────────────────────────────

interface RowItemProps {
  row: TableRow;
  inputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
  onChange: (id: string, field: keyof Omit<TableRow, "id" | "taskType" | "subtasks" | "expanded">, value: string) => void;
  onTypeToggle: () => void;
  onExpandToggle: () => void;
  onSubtaskAdd: () => void;
  onSubtaskChange: (subId: string, updated: SubtaskDraft) => void;
  onSubtaskDelete: (subId: string) => void;
  onEnter: () => void;
  onDelete: () => void;
  onCmdEnter: () => void;
  showDelete: boolean;
}

function TableRowItem({ row, inputRefs, onChange, onTypeToggle, onExpandToggle, onSubtaskAdd, onSubtaskChange, onSubtaskDelete, onEnter, onDelete, onCmdEnter, showDelete }: RowItemProps) {
  const cellInput = "h-8 w-full rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-900 outline-none transition-colors focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white dark:focus:border-white/[0.20] dark:focus:bg-white/[0.06]";
  const iconBtn   = "flex h-6 w-5 items-center justify-center rounded-lg transition-colors text-neutral-300 dark:text-neutral-600";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Main row grid */}
      <div className="grid items-center gap-1" style={{ gridTemplateColumns: "28px 1fr 76px 76px 20px 20px" }}>

        {/* Type toggle */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onTypeToggle}
          title={row.taskType === "task" ? "Switch to Session" : "Switch to Task"}
          className={`flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold transition-colors ${
            row.taskType === "task"
              ? "bg-sky-100 text-sky-600 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50"
              : "bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
          }`}
        >
          {row.taskType === "task" ? "T" : "S"}
        </button>

        {/* Title */}
        <input
          ref={(el) => { inputRefs.current[`${row.id}-title`] = el; }}
          value={row.title}
          onChange={(e) => onChange(row.id, "title", e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onCmdEnter(); }
            else if (e.key === "Enter") { e.preventDefault(); onEnter(); }
            else if (e.key === "Backspace" && row.title === "") { e.preventDefault(); onDelete(); }
          }}
          placeholder={row.taskType === "task" ? "Task name" : "Session name"}
          className={`${cellInput} px-2.5 text-[13px] font-medium placeholder:text-neutral-300 dark:placeholder:text-neutral-600`}
        />

        {/* Start time */}
        <input
          ref={(el) => { inputRefs.current[`${row.id}-start`] = el; }}
          value={row.startTime}
          type="time"
          onChange={(e) => onChange(row.id, "startTime", e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onCmdEnter(); }
            else if (e.key === "Enter") { e.preventDefault(); onEnter(); }
          }}
          className={`${cellInput} px-2 text-[12px] tabular-nums`}
        />

        {/* End time */}
        <input
          ref={(el) => { inputRefs.current[`${row.id}-end`] = el; }}
          value={row.endTime}
          type="time"
          onChange={(e) => onChange(row.id, "endTime", e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onCmdEnter(); }
            else if (e.key === "Enter") { e.preventDefault(); onEnter(); }
          }}
          className={`${cellInput} px-2 text-[12px] tabular-nums`}
        />

        {/* Expand toggle */}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onExpandToggle}
          title={row.expanded ? "Collapse subtasks" : "Add subtasks"}
          className={`${iconBtn} hover:bg-neutral-100 dark:hover:bg-white/[0.05] ${
            row.expanded ? "text-neutral-500 dark:text-neutral-400" : "hover:text-neutral-500 dark:hover:text-neutral-400"
          }`}
        >
          {!row.expanded && row.subtasks.filter(s => s.title.trim()).length > 0 ? (
            <span className="text-[9px] font-bold text-neutral-400 dark:text-neutral-500">
              {row.subtasks.filter(s => s.title.trim()).length}
            </span>
          ) : row.expanded ? (
            <IconChevronUp size={11} strokeWidth={2} />
          ) : (
            <IconChevronDown size={11} strokeWidth={2} />
          )}
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          tabIndex={-1}
          className={`${iconBtn} ${
            showDelete
              ? "hover:bg-neutral-100 hover:text-rose-400 dark:hover:bg-white/[0.05] dark:hover:text-rose-400"
              : "pointer-events-none opacity-0"
          }`}
        >
          <IconX size={11} strokeWidth={2} />
        </button>
      </div>

      {/* Subtask section */}
      <AnimatePresence>
        {row.expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mt-1 ml-7 flex flex-col gap-1 overflow-hidden"
          >
            {row.subtasks.map((sub) => (
              <div key={sub.id} className="flex items-center gap-1">
                <span className="w-3 shrink-0 text-center text-[10px] text-neutral-300 dark:text-neutral-600">↳</span>
                <input
                  ref={(el) => { inputRefs.current[`sub-${sub.id}`] = el; }}
                  value={sub.title}
                  onChange={(e) => onSubtaskChange(sub.id, { ...sub, title: e.target.value })}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onCmdEnter(); }
                    else if (e.key === "Enter") { e.preventDefault(); onSubtaskAdd(); }
                    else if (e.key === "Backspace" && sub.title === "") { e.preventDefault(); onSubtaskDelete(sub.id); }
                    else if (e.key === "Escape") { e.currentTarget.blur(); }
                  }}
                  placeholder="Subtask..."
                  className="h-7 flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 text-[12px] text-neutral-800 outline-none placeholder:text-neutral-300 transition-colors focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.06]"
                />
                <input
                  value={sub.duration}
                  onChange={(e) => onSubtaskChange(sub.id, { ...sub, duration: e.target.value })}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); onCmdEnter(); }
                    else if (e.key === "Enter") { e.preventDefault(); onSubtaskAdd(); }
                    else if (e.key === "Escape") { e.currentTarget.blur(); }
                  }}
                  placeholder="5min"
                  className="h-7 w-[52px] shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 px-1.5 text-center text-[11px] font-semibold text-neutral-700 outline-none placeholder:text-neutral-300 transition-colors focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-neutral-300 dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.06]"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSubtaskDelete(sub.id)}
                  className="flex h-6 w-5 items-center justify-center rounded text-neutral-300 transition-colors hover:text-rose-400 dark:text-neutral-600 dark:hover:text-rose-400"
                >
                  <IconX size={10} strokeWidth={2} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={onSubtaskAdd}
              className="ml-4 mt-0.5 flex items-center gap-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              <IconPlus size={10} strokeWidth={2.5} /> Add subtask
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

function makeRow(): TableRow {
  return { id: uid(), title: "", startTime: "", endTime: "", taskType: "task", subtasks: [], expanded: false };
}

export function QuickAddPanel({ plans, activeDay, onSave }: QuickAddPanelProps) {
  const [planId, setPlanId]         = useState<string>(() => plans[0]?.id ?? "");
  const [repeatDays, setRepeatDays] = useState<DayKey[]>([activeDay]);
  const [rows, setRows]             = useState<TableRow[]>(() => [makeRow()]);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Keep planId valid when plans change
  useEffect(() => {
    if (!plans.find((p) => p.id === planId)) {
      setPlanId(plans[0]?.id ?? "");
    }
  }, [plans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync active day when parent changes it
  useEffect(() => {
    setRepeatDays([activeDay]);
  }, [activeDay]);

  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const validRows    = rows.filter((r) => r.title.trim().length > 0);
  const canSubmit    = !!selectedPlan && validRows.length > 0 && repeatDays.length > 0;

  // ── Mutations ──────────────────────────────────────────────────────────────

  function addRow(afterId?: string) {
    const newRow = makeRow();
    setRows((prev) => {
      if (!afterId) return [...prev, newRow];
      const idx = prev.findIndex((r) => r.id === afterId);
      if (idx === -1) return [...prev, newRow];
      const next = [...prev];
      next.splice(idx + 1, 0, newRow);
      return next;
    });
    setTimeout(() => inputRefs.current[`${newRow.id}-title`]?.focus(), 30);
  }

  function updateRow(id: string, field: keyof Omit<TableRow, "id" | "taskType" | "subtasks" | "expanded">, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function toggleRowType(id: string) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, taskType: r.taskType === "task" ? "session" : "task" } : r));
  }

  function toggleExpand(rowId: string) {
    let firstSubId: string | undefined;
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      const opening = !r.expanded;
      let subtasks = r.subtasks;
      if (opening && subtasks.length === 0) {
        firstSubId = uid();
        subtasks = [{ id: firstSubId, title: "", duration: "" }];
      } else if (opening) {
        firstSubId = subtasks[0]?.id;
      }
      return { ...r, expanded: opening, subtasks };
    }));
    setTimeout(() => {
      if (firstSubId) inputRefs.current[`sub-${firstSubId}`]?.focus();
    }, 50);
  }

  function addSubtask(rowId: string) {
    const newSub: SubtaskDraft = { id: uid(), title: "", duration: "" };
    setRows((prev) => prev.map((r) => r.id === rowId ? { ...r, subtasks: [...r.subtasks, newSub] } : r));
    setTimeout(() => inputRefs.current[`sub-${newSub.id}`]?.focus(), 30);
  }

  function updateSubtask(rowId: string, subId: string, updated: SubtaskDraft) {
    setRows((prev) => prev.map((r) =>
      r.id === rowId
        ? { ...r, subtasks: r.subtasks.map((s) => s.id === subId ? updated : s) }
        : r
    ));
  }

  function deleteSubtask(rowId: string, subId: string) {
    setRows((prev) => prev.map((r) => {
      if (r.id !== rowId) return r;
      const next = r.subtasks.filter((s) => s.id !== subId);
      // Focus the previous subtask, or the row title if none remain
      const idx = r.subtasks.findIndex((s) => s.id === subId);
      setTimeout(() => {
        const prevId = next[Math.max(0, idx - 1)]?.id;
        if (prevId) inputRefs.current[`sub-${prevId}`]?.focus();
        else inputRefs.current[`${rowId}-title`]?.focus();
      }, 30);
      return { ...r, subtasks: next, expanded: next.length > 0 };
    }));
  }

  function deleteRow(id: string) {
    setRows((prev) => {
      if (prev.length === 1) {
        // Keep one row, just clear it
        return [makeRow()];
      }
      const idx = prev.findIndex((r) => r.id === id);
      const next = prev.filter((r) => r.id !== id);
      // Focus the row above, or the new first if deleting the first row
      const focusIdx = Math.max(0, idx - 1);
      setTimeout(() => {
        const targetId = next[focusIdx]?.id;
        if (targetId) inputRefs.current[`${targetId}-title`]?.focus();
      }, 30);
      return next;
    });
  }

  function handleSubmit() {
    if (!canSubmit || !selectedPlan) return;
    for (const row of validRows) {
      const startDisplay = isValidInputTime(row.startTime) ? inputToDisplayTime(row.startTime) : "";
      const endDisplay   = isValidInputTime(row.endTime)   ? inputToDisplayTime(row.endTime)   : "";
      const validSubtasks = row.subtasks
        .filter((s) => s.title.trim().length > 0)
        .map((s) => ({ id: s.id, task: s.title.trim(), duration: s.duration.trim() || undefined } as ScheduleEntry));
      onSave({
        taskDraft: {
          title: row.title.trim(),
          startTime: startDisplay,
          endTime: endDisplay,
          icon: selectedPlan.emoji,
          color: selectedPlan.color,
          planId: selectedPlan.id,
          taskType: row.taskType,
          subtasks: validSubtasks.length > 0 ? validSubtasks : undefined,
        },
        taskId: undefined,
        repeatDays,
        planItems: null,
      });
    }
    const fresh = makeRow();
    setRows([fresh]);
    setTimeout(() => inputRefs.current[`${fresh.id}-title`]?.focus(), 30);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-y-auto">

      {/* Header */}
      <div className="flex h-[60px] shrink-0 items-center gap-2.5 border-b border-neutral-100 px-5 dark:border-white/[0.06]">
        <h2 className="text-[15px] font-bold text-neutral-900 dark:text-white">Quick Add</h2>
        <AnimatePresence>
          {validRows.length > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-neutral-900 px-1.5 text-[10px] font-bold text-white dark:bg-white dark:text-neutral-900"
            >
              {validRows.length}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">

        {/* Plan selector */}
        <PlanSelector
          plans={plans}
          selectedId={planId}
          onSelect={(plan) => setPlanId(plan.id)}
        />

        {/* Table */}
        <div>
          {/* Column headers */}
          <div
            className="mb-1.5 grid items-center gap-1 px-0.5"
            style={{ gridTemplateColumns: "28px 1fr 76px 76px 20px 20px" }}
          >
            <span />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Task</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Start</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">End</span>
            <span />
            <span />
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <TableRowItem
                  key={row.id}
                  row={row}
                  inputRefs={inputRefs}
                  onChange={updateRow}
                  onTypeToggle={() => toggleRowType(row.id)}
                  onExpandToggle={() => toggleExpand(row.id)}
                  onSubtaskAdd={() => addSubtask(row.id)}
                  onSubtaskChange={(subId, updated) => updateSubtask(row.id, subId, updated)}
                  onSubtaskDelete={(subId) => deleteSubtask(row.id, subId)}
                  onEnter={() => addRow(row.id)}
                  onDelete={() => deleteRow(row.id)}
                  onCmdEnter={handleSubmit}
                  showDelete={rows.length > 1}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Add row */}
          <button
            type="button"
            onClick={() => addRow()}
            className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-white/[0.05] dark:hover:text-neutral-300"
          >
            <IconPlus size={12} strokeWidth={2.5} />
            Add row
          </button>
        </div>

        {/* Day selector */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            Days
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const sel = repeatDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setRepeatDays((prev) =>
                      sel ? prev.filter((x) => x !== d) : [...prev, d]
                    )
                  }
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors ${
                    sel
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-400"
                  }`}
                >
                  {DAY_LABELS[d].slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-[14px] font-bold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-950"
        >
          <IconCheck size={15} strokeWidth={2.5} />
          {validRows.length > 0
            ? `Add ${validRows.length} Task${validRows.length !== 1 ? "s" : ""}`
            : "Add Tasks"}
        </button>

        <p className="text-center text-[10px] text-neutral-400 dark:text-neutral-500">
          <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-px font-mono text-[9px] dark:border-white/10 dark:bg-white/[0.06]">↵</kbd>
          {" "}new row · {" "}
          <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-px font-mono text-[9px] dark:border-white/10 dark:bg-white/[0.06]">⌘↵</kbd>
          {" "}save all
        </p>

      </div>
    </div>
  );
}
