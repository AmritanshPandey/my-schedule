"use client";

/**
 * Reusable two-phase AI action sheet.
 * Phase 1 — user states their goal + picks context chips
 * Phase 2 — AI streams, results render as selectable items
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconSparkles, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResultItem {
  id: string;
  label: string;
  meta?: string;
  badge?: string;
}

interface AIActionSheetProps {
  open: boolean;
  onClose: () => void;

  // Header
  title: string;
  contextLabel?: string;

  // Phase 1 — prompt
  inputPlaceholder?: string;
  quickPicks?: string[];
  ctaLabel: string;           // e.g. "Build Tasks"

  // Phase 2/3 — results
  resultSingular?: string;    // "task"
  resultPlural?: string;      // "tasks"
  addLabel?: string;          // overrides the computed "Add N tasks"

  // Generate + parse — parent provides these
  onGenerate: (goal: string, picks: string[]) => AsyncGenerator<string>;
  onParseResults: (raw: string) => ResultItem[];

  // Commit
  onAdd: (items: ResultItem[]) => void;
}

// ── Thinking dots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
          animate={{ opacity: [0.25, 1, 0.25], scale: [0.7, 1, 0.7] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AIActionSheet({
  open,
  onClose,
  title,
  contextLabel,
  inputPlaceholder = "What's your focus for this…",
  quickPicks = [],
  ctaLabel,
  resultSingular = "item",
  resultPlural = "items",
  onGenerate,
  onParseResults,
  onAdd,
}: AIActionSheetProps) {
  type Phase = "prompt" | "loading" | "result";
  const [phase, setPhase] = useState<Phase>("prompt");
  const [goal, setGoal] = useState("");
  const [activePicks, setActivePicks] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [results, setResults] = useState<ResultItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [streamCount, setStreamCount] = useState(0);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase("prompt");
      setGoal("");
      setActivePicks(new Set());
      setError(null);
      setResults([]);
      setSelected(new Set());
      setStreamCount(0);
      abortRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 120);
    } else {
      abortRef.current = true;
    }
  }, [open]);

  function togglePick(pick: string) {
    setActivePicks((prev) => {
      const next = new Set(prev);
      if (next.has(pick)) next.delete(pick);
      else next.add(pick);
      return next;
    });
  }

  function toggleResult(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    setPhase("loading");
    setError(null);
    setResults([]);
    setStreamCount(0);
    abortRef.current = false;

    try {
      let accumulated = "";
      const stream = onGenerate(goal.trim(), [...activePicks]);

      for await (const chunk of stream) {
        if (abortRef.current) break;
        accumulated += chunk;
        const partial = onParseResults(accumulated);
        if (partial.length > 0) {
          setStreamCount(partial.length);
        }
      }

      if (abortRef.current) return;

      const final = onParseResults(accumulated);
      if (final.length === 0) {
        setError("Couldn't parse results — try rephrasing your goal.");
        setPhase("prompt");
        return;
      }

      setResults(final);
      setSelected(new Set(final.map((r) => r.id)));
      setPhase("result");
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : "Generation failed");
        setPhase("prompt");
      }
    }
  }

  function handleAdd() {
    const items = results.filter((r) => selected.has(r.id));
    if (items.length > 0) onAdd(items);
    onClose();
  }

  function handleRetry() {
    setPhase("prompt");
    setResults([]);
  }

  const selectedCount = selected.size;
  const nLabel = selectedCount === 1 ? resultSingular : resultPlural;

  return (
    <BottomSheet open={open} onClose={onClose} desktopWidth="max-w-[460px]">
      <div className="px-5 pb-7 pt-2">

        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-2.5 pt-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
              <IconSparkles size={16} strokeWidth={2} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-[15px] font-bold text-neutral-900 dark:text-white">{title}</p>
              {contextLabel && (
                <p className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">{contextLabel}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-1.5 flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
          >
            <IconX size={15} strokeWidth={2} />
          </button>
        </div>

        <AnimatePresence mode="wait" initial={false}>

          {/* ── Phase 1: Prompt ───────────────────────────────────────────── */}
          {(phase === "prompt" || phase === "loading") && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {/* Goal input */}
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  Your goal
                </p>
                <textarea
                  ref={inputRef}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder={inputPlaceholder}
                  rows={2}
                  disabled={phase === "loading"}
                  className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[14px] font-medium text-neutral-900 placeholder-neutral-400 outline-none transition-all focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder-neutral-500 dark:focus:border-emerald-500/60"
                />
              </div>

              {/* Quick picks */}
              {quickPicks.length > 0 && (
                <div className="mb-5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    Focus areas
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {quickPicks.map((pick) => {
                      const on = activePicks.has(pick);
                      return (
                        <button
                          key={pick}
                          type="button"
                          onClick={() => togglePick(pick)}
                          disabled={phase === "loading"}
                          className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all disabled:opacity-50 ${
                            on
                              ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-white/[0.08] dark:bg-transparent dark:text-neutral-400 dark:hover:border-white/[0.15]"
                          }`}
                        >
                          {on && "✓ "}{pick}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-600 dark:border-red-500/10 dark:bg-red-500/5 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* CTA */}
              <motion.button
                type="button"
                onClick={handleGenerate}
                disabled={phase === "loading"}
                whileTap={phase !== "loading" ? { scale: 0.97 } : undefined}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3.5 text-[14px] font-bold text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-default disabled:opacity-70 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {phase === "loading" ? (
                  <>
                    <ThinkingDots />
                    <span>
                      {streamCount > 0 ? `Found ${streamCount} ${streamCount === 1 ? resultSingular : resultPlural}…` : "Thinking…"}
                    </span>
                  </>
                ) : (
                  <>
                    <IconSparkles size={15} strokeWidth={2.2} />
                    {ctaLabel}
                  </>
                )}
              </motion.button>
            </motion.div>
          )}

          {/* ── Phase 3: Results ──────────────────────────────────────────── */}
          {phase === "result" && results.length > 0 && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {/* Result header */}
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  {results.length} {results.length === 1 ? resultSingular : resultPlural} ready — select to add
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCount === results.length) setSelected(new Set());
                    else setSelected(new Set(results.map((r) => r.id)));
                  }}
                  className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  {selectedCount === results.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              {/* Result list */}
              <div className="mb-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-950/50">
                {results.map((item, i) => {
                  const on = selected.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleResult(item.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                        i < results.length - 1 ? "border-b border-neutral-100 dark:border-white/[0.05]" : ""
                      } ${on ? "bg-emerald-50/60 dark:bg-emerald-500/5" : "hover:bg-neutral-50 dark:hover:bg-white/[0.02]"}`}
                    >
                      <div className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        on
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-neutral-300 dark:border-neutral-600"
                      }`}>
                        {on && <IconCheck size={10} strokeWidth={3} className="text-white" />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[13px] font-semibold transition-colors ${
                          on ? "text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
                        }`}>
                          {item.label}
                        </p>
                        {item.meta && (
                          <p className="mt-0.5 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                            {item.meta}
                          </p>
                        )}
                      </div>

                      {item.badge && (
                        <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="flex h-12 items-center gap-1.5 rounded-2xl border border-neutral-200 px-4 text-[13px] font-semibold text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700 dark:border-white/[0.08] dark:text-neutral-400 dark:hover:border-white/[0.15]"
                >
                  Retry
                </button>
                <motion.button
                  type="button"
                  onClick={handleAdd}
                  disabled={selectedCount === 0}
                  whileTap={{ scale: 0.97 }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[14px] font-bold text-white transition-colors hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <IconCheck size={15} strokeWidth={2.5} />
                  Add {selectedCount} {nLabel}
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </BottomSheet>
  );
}
