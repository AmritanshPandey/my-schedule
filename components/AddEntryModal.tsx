"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";

interface AddEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: number, date: string) => void;
  metric?: { name: string; unit: string };
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

export default function AddEntryModal({ isOpen, onClose, onSave, metric }: AddEntryModalProps) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || !date) return;
    onSave(num, date);
    setValue("");
    setDate(todayISO());
    onClose();
  }

  function handleClose() {
    setValue("");
    setDate(todayISO());
    onClose();
  }

  if (!isOpen) return null;

  const metricLabel = metric
    ? `${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`
    : "Value";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-[32px] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
        </div>

        <div className="space-y-4 px-5 pt-4 pb-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Log</p>
              <h2 className="text-[18px] font-semibold text-neutral-950 dark:text-white mt-0.5">New Entry</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5 transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>

          <div>
            <p className={`mb-1.5 ${LABEL}`}>{metricLabel}</p>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="0"
              autoFocus
              className="
              h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]"
            />
          </div>

          <div>
            <p className={`mb-1.5 ${LABEL}`}>Date</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="
              h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!value || isNaN(parseFloat(value))}
              className="inline-flex flex-1 h-12 items-center justify-center gap-1.5 rounded-2xl bg-neutral-950 text-[15px] font-semibold text-white transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <IconCheck size={16} strokeWidth={2.5} />
              Save Entry
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-12 items-center px-5 rounded-2xl border border-neutral-200 text-[14px] font-semibold text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
