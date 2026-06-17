"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconSparkles, IconCheck, IconCircleCheck, IconClock, IconTrash,
  IconChevronDown, IconX, IconCalendarEvent, IconDownload, IconUpload,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import type { Plan } from "@/lib/useScheduleDB";
import { parseSchedule, countTasks, type ParsedDay, type ParseResult } from "@/lib/scheduleParser";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { haptic } from "@/lib/haptics";

const PLAN_ICONS: Record<string, (typeof SECTION_ICONS)[number]["icon"]> = Object.fromEntries(
  SECTION_ICONS.map((s) => [s.name, s.icon])
);

const SAMPLE = `# Marathon Training
Description: 12-week sub-4 plan
Start: 2026-06-10
End: 2026-09-01

Monday
- Long run 6 AM
    - Warmup [easy pace] (10 min)
    - Main set [10k] (45 min)
    - Cooldown [stretch] (5 min)
Wednesday
- Tempo run 6 AM
    - 5x1k [race pace] (30 min)`;

// Downloadable starter file — a commented legend (// lines are ignored on import)
// followed by the marathon example so it parses back to the same plan.
const TEMPLATE = `// PlanR schedule template — edit this, then upload it back.
// Lines starting with // are ignored on import.
//
//   # Plan title           creates a new plan
//   Description: ...        plan description (optional)
//   Start: YYYY-MM-DD       plan start date (optional)
//   End: YYYY-MM-DD         plan end date (optional)
//   Monday, Tuesday ...     day headers group the tasks under them
//   - Task name 7 AM        a task (time optional)
//       - Subtask [info] (duration)   indent a bullet to make it a subtask
//
${SAMPLE}
`;

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
  onCommit: (result: ParseResult) => void;
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
  onCommit: (result: ParseResult) => void;
  onDone: () => void;
  /** Optional header element (e.g. the sheet's title/close). */
  header?: ReactNode;
}

export function BulkImportFlow({ plans, fallbackDay = "monday", onCommit, onDone, header }: BulkImportFlowProps) {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<ParseResult>({ days: [], plans: [] });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-parse on text change (cheap, synchronous).
  useEffect(() => {
    setResult(parseSchedule(text, plans, fallbackDay));
    setCollapsed(new Set());
  }, [text, plans, fallbackDay]);

  const { days, plans: newPlans } = result;
  const total = countTasks(days);
  const missing = useMemo(
    () => days.flatMap((d) => d.tasks.filter((t) => t.needsTime).map((t) => ({ day: d, task: t }))),
    [days]
  );
  const current = missing[0];

  function setTaskTime(taskId: string, time: string) {
    haptic("light");
    setResult((prev) => ({
      ...prev,
      days: prev.days.map((d) => ({
        ...d,
        tasks: d.tasks.map((t) => t.id === taskId ? { ...t, startTime: time, endTime: endFrom(time), needsTime: false } : t),
      })),
    }));
    setCollapsed((prev) => { const next = new Set(prev); current && next.delete(current.day.day); return next; });
  }

  function toggleDay(day: string) {
    setCollapsed((prev) => { const next = new Set(prev); next.has(day) ? next.delete(day) : next.add(day); return next; });
  }

  function commit() {
    if (total === 0) return;
    haptic("medium");
    onCommit(result);
    onDone();
  }

  function downloadTemplate() {
    haptic("light");
    const blob = new Blob([TEMPLATE], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-schedule-template.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (file.size > 50_000) return; // ignore oversized files
    try {
      const contents = await file.text();
      haptic("light");
      setText(contents);
    } catch {
      // ignore unreadable files
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {header ? (
        <div className="flex items-start justify-between gap-3">
          {header}
          <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
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
        <p className="-mt-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Paste a plan — we&apos;ll turn it into scheduled tasks. One line per task, with day headers like &quot;Monday&quot;.
        </p>
      )}

        {/* Step 1 — paste */}
        <Step n={1} title="Paste your plan">
          <button
            type="button"
            onClick={() => { haptic("light"); setText(""); }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-500 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-neutral-400 dark:hover:bg-white/[0.05]"
          >
            <IconTrash size={14} strokeWidth={2} />Clear
          </button>
        </Step>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[12px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-neutral-300 dark:hover:bg-white/[0.05]"
          >
            <IconDownload size={14} strokeWidth={2} />Download template
          </button>
          <button
            type="button"
            onClick={() => { haptic("light"); fileInputRef.current?.click(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[12px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-neutral-300 dark:hover:bg-white/[0.05]"
          >
            <IconUpload size={14} strokeWidth={2} />Upload file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
        <div className="relative overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04)] dark:border-white/[0.08] dark:bg-neutral-900">
          <div className="border-b border-neutral-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-white/[0.06] dark:text-neutral-500">
            Source
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={SAMPLE}
            className="h-[210px] w-full resize-y bg-transparent px-4 py-3 font-sans text-[15px] leading-7 text-neutral-900 outline-none placeholder:text-neutral-300 dark:text-white dark:placeholder:text-neutral-600"
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
            {newPlans.length > 0 && (
              <div className="flex flex-col gap-2">
                {newPlans.map((p) => {
                  const Icon = PLAN_ICONS[p.emoji] ?? IconCalendarEvent;
                  return (
                    <div key={p.ref} className="flex items-start gap-3 rounded-[24px] border border-neutral-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(10,10,10,0.04)] dark:border-white/[0.08] dark:bg-neutral-900">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                        <Icon size={17} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-600 dark:text-emerald-400">
                            <IconSparkles size={11} strokeWidth={2.5} />New plan
                          </span>
                          <span className="truncate text-[15px] font-bold text-neutral-900 dark:text-white">{p.title}</span>
                        </div>
                        {p.description && (
                          <p className="mt-1 truncate text-[13px] text-neutral-500 dark:text-neutral-400">{p.description}</p>
                        )}
                        {(p.startDate || p.endDate) && (
                          <p className="mt-1 text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                            {p.startDate ?? "…"} → {p.endDate ?? "…"}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {days.map((d) => {
                const isCollapsed = collapsed.has(d.day);
                return (
                  <div key={d.day} className="overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04)] dark:border-white/[0.08] dark:bg-neutral-900">
                    <button type="button" onClick={() => toggleDay(d.day)} className="flex w-full items-center gap-2.5 text-left">
                      <div className="flex w-full items-center gap-2.5 px-4 py-3.5">
                        <IconCalendarEvent size={16} strokeWidth={2} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[15px] font-bold text-neutral-900 dark:text-white">{d.label}</span>
                        <span className="ml-auto text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">{d.tasks.length} task{d.tasks.length !== 1 ? "s" : ""}</span>
                        <IconChevronDown size={16} strokeWidth={2} className={`shrink-0 text-neutral-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                      </div>
                    </button>
                    {!isCollapsed && (
                      <div className="border-t border-neutral-100 px-4 py-3 dark:border-white/[0.06]">
                        <div className="flex flex-col gap-2">
                        {d.tasks.map((t) => (
                          <div key={t.id} className="rounded-[20px] border border-neutral-100 px-3 py-3 dark:border-white/[0.05]">
                            <div className="flex items-center gap-2.5">
                              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">{t.title}</span>
                              {t.needsTime ? (
                                <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                                  <IconClock size={13} strokeWidth={2} />Time?
                                </span>
                              ) : (
                                <span className="shrink-0 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">{t.startTime}</span>
                              )}
                            </div>
                            {t.subtasks && t.subtasks.length > 0 && (
                              <div className="mt-2 flex flex-col gap-1.5 border-l-2 border-emerald-500/18 pl-3">
                                {t.subtasks.map((s) => (
                                  <div key={s.id} className="flex items-center gap-1.5 text-[12px]">
                                    <span className="h-1 w-1 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                                    <span className="min-w-0 truncate font-medium text-neutral-600 dark:text-neutral-300">{s.title}</span>
                                    {s.info && <span className="shrink-0 truncate text-neutral-400 dark:text-neutral-500">· {s.info}</span>}
                                    {s.duration && (
                                      <span className="ml-auto shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">{s.duration}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        </div>
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
                  className="rounded-[24px] border border-amber-500/28 bg-amber-50/85 p-4 dark:border-amber-500/20 dark:bg-amber-500/10"
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
                        className="rounded-2xl border border-amber-500/25 bg-white px-2 py-2.5 text-center transition-colors hover:border-amber-500 dark:bg-neutral-900"
                      >
                        <span className="block text-[12px] font-semibold text-neutral-800 dark:text-neutral-200">{o.label}</span>
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
                  className="flex items-center gap-2.5 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_1px_2px_rgba(10,10,10,0.04)] dark:border-white/[0.08] dark:bg-neutral-900"
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
          className="mt-1 flex w-full flex-col items-center gap-0.5 rounded-full bg-neutral-900 py-3.5 text-white shadow-[0_10px_24px_rgba(10,10,10,0.12)] transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
        >
          <span className="flex items-center gap-2 text-[15px] font-bold">
            <IconCircleCheck size={18} strokeWidth={2} />
            {newPlans.length > 0
              ? `Create Plan + ${total} Task${total !== 1 ? "s" : ""}`
              : `Create ${total} Task${total !== 1 ? "s" : ""}`}
          </span>
          <span className="text-[12px] font-medium opacity-90">
            {newPlans.length > 0 ? "Review and create your plan" : "Review and create your tasks"}
          </span>
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
