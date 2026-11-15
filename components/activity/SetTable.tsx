"use client";

import { useState } from "react";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import AddRowButton from "@/components/ui/AddRowButton";
import type { LoggedSet, SetLog } from "@/lib/useScheduleDB";

/**
 * The set-by-set log: Set · Previous · weight · Reps · ✓, one row per set.
 *
 * Shared by the "Log sets" sheet and focus mode. It only edits a list of sets;
 * saving is the caller's job. Inputs are 44px with 16px text (no iOS zoom),
 * with the numeric keypad. A ticked row reads as done in green — the one
 * colour that means progress — and nothing else on the table is coloured.
 */
interface SetTableProps {
  sets: LoggedSet[];
  onChange: (sets: LoggedSet[]) => void;
  previous: SetLog | null;
  weightUnit: "kg" | "lb";
  /** Show the weight column (a timed or bodyweight subtask hides it). */
  showWeight?: boolean;
  /** Called after a set is ticked — focus mode starts the rest timer. */
  onSetDone?: (index: number) => void;
  readOnly?: boolean;
}

const fmt = (n: number | undefined) => (n == null ? "" : String(n));

function previousLabel(set: LoggedSet | undefined, unit: string, showWeight: boolean): string {
  if (!set) return "–";
  if (showWeight && set.weight != null && set.reps != null) return `${fmt(set.weight)}${unit} × ${fmt(set.reps)}`;
  if (set.reps != null) return `× ${fmt(set.reps)}`;
  if (set.minutes != null) return `${fmt(set.minutes)}m`;
  return "–";
}

export default function SetTable({
  sets,
  onChange,
  previous,
  weightUnit,
  showWeight = true,
  onSetDone,
  readOnly = false,
}: SetTableProps) {
  const prevWorking = previous?.sets.filter((s) => !s.warmup) ?? [];

  function update(i: number, patch: Partial<LoggedSet>) {
    onChange(sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function toggleDone(i: number) {
    const next = !sets[i].done;
    // Ticking an untouched row takes what the Previous column showed — the
    // whole point of the column is "same as last time, done".
    const prev = prevWorking[i];
    const fill: Partial<LoggedSet> = {};
    if (next && sets[i].weight == null && prev?.weight != null && showWeight) fill.weight = prev.weight;
    if (next && sets[i].reps == null && prev?.reps != null) fill.reps = prev.reps;
    update(i, { ...fill, done: next });
    if (next) onSetDone?.(i);
  }

  function addSet() {
    const last = sets[sets.length - 1];
    onChange([...sets, { weight: last?.weight, reps: last?.reps, done: false }]);
  }

  const cols = showWeight ? "grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_4rem_2.75rem]" : "grid-cols-[2.25rem_minmax(0,1fr)_4.5rem_2.75rem]";

  return (
    <div>
      <div className={`grid ${cols} items-center gap-2 px-1 pb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400`}>
        <span className="text-center">Set</span>
        <span>Previous</span>
        {showWeight && <span className="text-center">{weightUnit}</span>}
        <span className="text-center">Reps</span>
        <span className="sr-only">Done</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {sets.map((set, i) => (
          <div
            key={i}
            className={`grid ${cols} items-center gap-2 rounded-xl px-1 py-1 transition-colors ${
              set.done ? "bg-green-600/10 dark:bg-green-500/15" : "bg-neutral-100/70 dark:bg-white/[0.03]"
            }`}
          >
            <span className="text-center text-[15px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">{i + 1}</span>
            <span className="truncate text-[14px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {previousLabel(prevWorking[i], weightUnit, showWeight)}
            </span>
            {showWeight && (
              <NumberCell
                value={set.weight}
                decimal
                label={`Set ${i + 1} weight in ${weightUnit}`}
                placeholder={fmt(prevWorking[i]?.weight)}
                readOnly={readOnly}
                onChange={(weight) => update(i, { weight })}
              />
            )}
            <NumberCell
              value={set.reps}
              label={`Set ${i + 1} reps`}
              placeholder={fmt(prevWorking[i]?.reps)}
              readOnly={readOnly}
              onChange={(reps) => update(i, { reps })}
            />
            <button
              type="button"
              disabled={readOnly}
              onClick={() => toggleDone(i)}
              aria-pressed={set.done}
              aria-label={set.done ? `Set ${i + 1} done. Mark not done` : `Mark set ${i + 1} done`}
              className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 ${
                set.done
                  ? "border-transparent bg-green-600 text-white dark:bg-green-500 dark:text-neutral-950"
                  : "border-neutral-200 bg-white text-neutral-400 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-500"
              }`}
            >
              <IconCheck size={18} strokeWidth={2.6} />
            </button>
          </div>
        ))}
      </div>

      {!readOnly && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1">
            <AddRowButton label="Add set" onClick={addSet} />
          </div>
          {sets.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(sets.slice(0, -1))}
              aria-label="Remove the last set"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <IconMinus size={18} strokeWidth={2.2} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A 44px number cell; keeps its own text so "62." survives mid-typing. */
function NumberCell({
  value,
  onChange,
  label,
  placeholder,
  decimal = false,
  readOnly,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  label: string;
  placeholder?: string;
  decimal?: boolean;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(fmt(value));
  const [lastValue, setLastValue] = useState(value);
  // Follow outside changes (a tick filling from Previous) without fighting typing.
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text.replace(",", ".")) !== value) setText(fmt(value));
  }
  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      pattern={decimal ? undefined : "[0-9]*"}
      value={text}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        onChange(e.target.value.trim() === "" || !Number.isFinite(n) ? undefined : n);
      }}
      className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-white text-center text-[16px] font-bold tabular-nums text-neutral-900 outline-none placeholder:font-medium placeholder:text-neutral-400 focus:border-emerald-600/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-emerald-400/50"
    />
  );
}
