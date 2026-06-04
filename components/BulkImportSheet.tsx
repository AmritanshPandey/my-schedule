"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconSparkles, IconCheck, IconCircleCheck, IconClock, IconTrash,
  IconChevronDown, IconX, IconCalendarEvent,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import type { Plan } from "@/lib/useScheduleDB";
import { parseSchedule, countTasks, type ParsedDay } from "@/lib/scheduleParser";
import { haptic } from "@/lib/haptics";

const SAMPLE = `Monday
- Gym 7 AM
- Deep Work after breakfast
- GMAT practice in evening

Tuesday
- Cardio 6 AM
- Client work 10 AM
- Read 30 mins before bed`;

const TIME_OPTS: { label: string; sub: string; time: string }[] = [
  { label: "Morning", sub: "6 AM – 12 PM", time: "9:00 AM" },
  { label: "Afternoon", sub: "12 PM – 5 PM", time: "2:00 PM" },
  { label: "Evening", sub: "5 PM – 9 PM", time: "7:00 PM" },
  { label: "Night", sub: "9 PM – 12 AM", time: "9:00 PM" },
];

function endFrom(start: string): string {
  // +1h, reusing simple parse (kept local to avoid importing internals).
  const m = start.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return start;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  const total = (h * 60 + parseInt(m[2], 10) + 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const ampm = hh >= 12 ? "PM" : "AM";
  return `${hh % 12 || 12}:${String(total % 60).padStart(2, "0")} ${ampm}`;
}

interface BulkImportSheetProps {
  open: boolean;
  plans: Plan[];
  fallbackDay?: ParsedDay["day"];
  onClose: () => void;
  onCommit: (days: ParsedDay[]) => void;
}

export default function BulkImportSheet({ open, plans, fallbackDay = "monday", onClose, onCommit }: BulkImportSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="88vh">
      <div className="px-5 pt-2 pb-6">
        <BulkImportFlow
          plans={plans}
          fallbackDay={fallbackDay}
          onCommit={onCommit}
          onDone={onClose}
          header={<SheetHeader eyebrow="Bulk import" title="Paste Schedule" onClose={onClose} />}
        />
      </div>
    </BottomSheet>
  );
}

interface BulkImportFlowProps {
  plans: Plan[];
  fallbackDay?: ParsedDay["day"];
  onCommit: (days: ParsedDay[]) => void;
  onDone: () => void;
  /** Optional header element (e.g. the sheet's title/close). */
  header?: ReactNode;
}

export function BulkImportFlow({ plans, fallbackDay = "monday", onCommit, onDone, header }: BulkImportFlowProps) {
  const [text, setText] = useState(SAMPLE);
  const [days, setDays] = useState<ParsedDay[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Re-parse on text change (cheap, synchronous).
  useEffect(() => {
    setDays(parseSchedule(text, plans, fallbackDay));
    setCollapsed(new Set());
  }, [text, plans, fallbackDay]);

  const total = countTasks(days);
  const missing = useMemo(
    () => days.flatMap((d) => d.tasks.filter((t) => t.needsTime).map((t) => ({ day: d, task: t }))),
    [days]
  );
  const current = missing[0];

  function setTaskTime(taskId: string, time: string) {
    haptic("light");
    setDays((prev) => prev.map((d) => ({
      ...d,
      tasks: d.tasks.map((t) => t.id === taskId ? { ...t, startTime: time, endTime: endFrom(time), needsTime: false } : t),
    })));
    setCollapsed((prev) => { const next = new Set(prev); current && next.delete(current.day.day); return next; });
  }

  function toggleDay(day: string) {
    setCollapsed((prev) => { const next = new Set(prev); next.has(day) ? next.delete(day) : next.add(day); return next; });
  }

  function commit() {
    if (total === 0) return;
    haptic("medium");
    onCommit(days);
    onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      {header ? (
        <div className="flex items-start justify-between gap-3">
          {header}
          <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
            <IconSparkles size={14} strokeWidth={2} />
            Parsing
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
            Paste a plan — we&apos;ll turn it into scheduled tasks.
          </p>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <IconSparkles size={13} strokeWidth={2} />
            Parsing
          </span>
        </div>
      )}

      {header && (
        <p className="-mt-2 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
          Paste a plan — we&apos;ll turn it into scheduled tasks. One line per task, with day headers like &quot;Monday&quot;.
        </p>
      )}

        {/* Step 1 — paste */}
        <Step n={1} title="Paste your plan">
          <button
            type="button"
            onClick={() => { haptic("light"); setText(""); }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] font-bold text-neutral-500 hover:bg-neutral-50 dark:border-white/[0.1] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
          >
            <IconTrash size={14} strokeWidth={2} />Clear
          </button>
        </Step>
        <div className="relative rounded-2xl border-[1.5px] border-emerald-500/70 bg-white p-3.5 dark:bg-neutral-900">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={SAMPLE}
            className="h-[150px] w-full resize-y bg-transparent font-mono text-[12.5px] leading-[1.7] text-neutral-900 outline-none placeholder:text-neutral-300 dark:text-white dark:placeholder:text-neutral-600"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-neutral-300 dark:text-neutral-600">
            {text.length}/2000
          </span>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <IconCheck size={12} strokeWidth={3} />
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">Parsed</span>
            <span className="text-neutral-400 dark:text-neutral-500">· {total} task{total !== 1 ? "s" : ""} found</span>
          </div>
        )}

        {/* Step 2 — preview */}
        {days.length > 0 && (
          <>
            <Step n={2} title="Preview (auto-detected)" />
            <div className="flex flex-col gap-2.5">
              {days.map((d) => {
                const isCollapsed = collapsed.has(d.day);
                return (
                  <div key={d.day} className="rounded-2xl border border-neutral-200 p-3 dark:border-white/[0.08]">
                    <button type="button" onClick={() => toggleDay(d.day)} className="flex w-full items-center gap-2.5 text-left">
                      <IconCalendarEvent size={16} strokeWidth={2} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-[14px] font-bold text-neutral-900 dark:text-white">{d.label}</span>
                      <span className="ml-auto text-[12px] font-bold text-emerald-600 dark:text-emerald-400">{d.tasks.length} task{d.tasks.length !== 1 ? "s" : ""}</span>
                      <IconChevronDown size={16} strokeWidth={2} className={`shrink-0 text-neutral-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    </button>
                    {!isCollapsed && (
                      <div className="mt-2.5 flex flex-col gap-2">
                        {d.tasks.map((t) => (
                          <div key={t.id} className="flex items-center gap-2.5 rounded-xl border border-neutral-100 px-2.5 py-2 dark:border-white/[0.05]">
                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{t.title}</span>
                            {t.needsTime ? (
                              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-amber-600 dark:text-amber-400">
                                <IconClock size={13} strokeWidth={2} />Time?
                              </span>
                            ) : (
                              <span className="shrink-0 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">{t.startTime}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Step 3 — missing info Q&A */}
        {total > 0 && (
          <>
            <Step n={3} title="Missing information" />
            <AnimatePresence mode="wait" initial={false}>
              {current ? (
                <motion.div
                  key={current.task.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  className="rounded-2xl border border-amber-500/35 bg-amber-50 p-3.5 dark:border-amber-500/20 dark:bg-amber-500/10"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-500/25 text-amber-700 dark:text-amber-400">
                      <IconClock size={15} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-neutral-900 dark:text-white">What time should this happen?</p>
                      <p className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{current.task.title} ({current.day.label})</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-500/25 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      {missing.length === 1 ? "Last one" : `${total - missing.length + 1} of ${total}`}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {TIME_OPTS.map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        onClick={() => setTaskTime(current.task.id, o.time)}
                        className="rounded-xl border border-amber-500/30 bg-white px-2 py-2 text-center transition-colors hover:border-amber-500 dark:bg-neutral-900"
                      >
                        <span className="block text-[12px] font-bold text-neutral-800 dark:text-neutral-200">{o.label}</span>
                        <span className="block text-[10px] font-medium text-neutral-400 dark:text-neutral-500">{o.sub}</span>
                      </button>
                    ))}
                  </div>
                  {current.task.suggestedTime && (
                    <div className="mt-3 flex items-center gap-2">
                      <IconSparkles size={14} strokeWidth={2} className="text-amber-500" />
                      <span className="text-[12px] font-bold text-neutral-600 dark:text-neutral-300">Smart suggestion: {current.task.suggestedTime}</span>
                      <button
                        type="button"
                        onClick={() => setTaskTime(current.task.id, current.task.suggestedTime!)}
                        className="ml-auto text-[12px] font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        Use this
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="all-set" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                    <IconCheck size={15} strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-neutral-900 dark:text-white">All set!</p>
                    <p className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">Every task has a time.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Create */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          disabled={total === 0}
          onClick={commit}
          className="mt-1 flex w-full flex-col items-center gap-0.5 rounded-full bg-emerald-600 py-3 text-white disabled:opacity-50"
        >
          <span className="flex items-center gap-2 text-[15px] font-bold">
            <IconCircleCheck size={18} strokeWidth={2} />
            Create {total} Task{total !== 1 ? "s" : ""}
          </span>
          <span className="text-[12px] font-medium opacity-90">Review and create your tasks</span>
        </motion.button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-emerald-600 text-[12px] font-bold text-white">{n}</span>
      <span className="text-[14px] font-bold text-neutral-900 dark:text-white">{title}</span>
      {children}
    </div>
  );
}
