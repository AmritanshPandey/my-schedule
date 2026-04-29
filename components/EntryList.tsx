"use client";

import type { MetricEntry } from "@/lib/useScheduleDB";
import { IconTrash } from "@tabler/icons-react";

interface EntryListProps {
  entries: MetricEntry[]; // sorted asc; component reverses for display
  metric: { name: string; unit: string };
  onDelete: (id: string) => void;
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtVal(v: number, unit: string): string {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return unit ? `${s} ${unit}` : s;
}

export default function EntryList({ entries, metric, onDelete }: EntryListProps) {
  const reversed = [...entries].reverse();

  if (reversed.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      <div className="border-b border-neutral-100 px-4 py-2.5 dark:border-white/[0.07]">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Recent Entries
        </span>
      </div>
      <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
        {reversed.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{fmtDate(entry.date)}</span>
            <span className="flex-1 text-right text-sm font-semibold text-neutral-900 dark:text-white">
              {fmtVal(entry.value, metric.unit)}
            </span>
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 hover:bg-red-50 hover:text-red-500 dark:text-neutral-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors"
              title="Delete entry"
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
