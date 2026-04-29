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

  const label = metric
    ? `${metric.name}${metric.unit ? ` (${metric.unit})` : ""}`
    : "Value";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-sm mx-auto bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-100 dark:border-white/[0.07]">
          <span className="text-sm font-semibold text-neutral-900 dark:text-white">Log Entry</span>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.07] transition-colors"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {label}
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="0"
              autoFocus
              className="h-11 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-neutral-400">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!value || isNaN(parseFloat(value))}
              className="inline-flex flex-1 h-10 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 text-sm font-medium text-white transition-all hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <IconCheck size={15} />
              Save Entry
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
