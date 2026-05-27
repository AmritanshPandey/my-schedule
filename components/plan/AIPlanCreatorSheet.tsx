"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconArrowLeft,
  IconRefresh,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import { streamOllamaChat, buildSystemPrompt, parseAIAction, type AITask } from "@/lib/ai";
import { resolveAccentColor, type AccentColor } from "@/lib/colorSystem";
import { todayISO } from "@/lib/dateUtils";
import type { Plan } from "@/lib/useScheduleDB";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIPlanCreatorData {
  title: string;
  description: string;
  emoji: string;
  color: string;
  startDate?: string;
  endDate?: string;
  tasks: AITask[];
}

interface AIPlanCreatorSheetProps {
  open: boolean;
  onClose: () => void;
  onCreatePlan: (data: AIPlanCreatorData) => void;
  ollamaUrl?: string;
  ollamaModel?: string;
  existingPlans?: Pick<Plan, "title" | "category" | "description">[];
}

// ── Streaming status ──────────────────────────────────────────────────────────

const GEN_PHRASES = [
  "Thinking…",
  "Designing your plan…",
  "Building tasks…",
  "Adding details…",
  "Finalizing…",
];

function GenStreamingStatus() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % GEN_PHRASES.length), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={GEN_PHRASES[idx]}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.22 }}
        className="shimmer-text text-[13px] font-medium"
      >
        {GEN_PHRASES[idx]}
      </motion.span>
    </AnimatePresence>
  );
}

// ── Color swatch config ───────────────────────────────────────────────────────

const COLOR_OPTIONS: { value: AccentColor; bg: string; ring: string }[] = [
  { value: "blue",    bg: "bg-blue-500",    ring: "ring-blue-400" },
  { value: "emerald", bg: "bg-emerald-500", ring: "ring-emerald-400" },
  { value: "violet",  bg: "bg-violet-500",  ring: "ring-violet-400" },
  { value: "pink",    bg: "bg-pink-500",    ring: "ring-pink-400" },
  { value: "amber",   bg: "bg-amber-500",   ring: "ring-amber-400" },
  { value: "cyan",    bg: "bg-cyan-500",    ring: "ring-cyan-400" },
];

// ── Duration presets ──────────────────────────────────────────────────────────

const DURATION_PRESETS: { label: string; days: number | null }[] = [
  { label: "30 days",  days: 30 },
  { label: "60 days",  days: 60 },
  { label: "90 days",  days: 90 },
  { label: "6 months", days: 180 },
  { label: "Ongoing",  days: null },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Example chips ─────────────────────────────────────────────────────────────

const EXAMPLE_GOALS = [
  "Run a 5K in 8 weeks",
  "Prepare for the GMAT by October",
  "Build a daily fitness habit",
  "Learn a new programming language",
];

// ── Main component ────────────────────────────────────────────────────────────

export default function AIPlanCreatorSheet({
  open,
  onClose,
  onCreatePlan,
  ollamaUrl,
  ollamaModel,
  existingPlans = [],
}: AIPlanCreatorSheetProps) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [goal, setGoal] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Editable draft fields
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [emoji, setEmoji] = useState("brain");
  const [color, setColor] = useState<AccentColor>("violet");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tasks, setTasks] = useState<AITask[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset when sheet closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep("input");
        setGoal("");
        setStreaming(false);
        setErrorMsg(null);
        setTitle(""); setDesc(""); setEmoji("brain");
        setColor("violet"); setStartDate(""); setEndDate(""); setTasks([]);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cleanup abort on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function handleGenerate() {
    if (!ollamaUrl || !ollamaModel || !goal.trim() || streaming) return;
    setStreaming(true);
    setErrorMsg(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = "";
    try {
      const systemPrompt = buildSystemPrompt("plans", undefined, existingPlans);
      for await (const chunk of streamOllamaChat(
        ollamaUrl, ollamaModel,
        [{ role: "user", content: goal }],
        systemPrompt, false, controller.signal,
      )) {
        accumulated += chunk;
      }
      const action = parseAIAction(accumulated);
      if (action?.type === "create_plan") {
        const p = action.payload;
        setTitle(p.title);
        setDesc(p.description);
        setEmoji(p.emoji ?? "brain");
        setColor(resolveAccentColor(p.color, p.emoji ?? "brain"));
        setStartDate(p.startDate ?? "");
        setEndDate(p.endDate ?? "");
        setTasks(p.tasks ?? []);
        setStep("review");
      } else {
        setErrorMsg("The AI didn't return a valid plan. Try rephrasing your goal.");
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        setErrorMsg("Couldn't reach Ollama — is it running?");
      }
    } finally {
      setStreaming(false);
    }
  }

  function handleCreate() {
    if (!title.trim()) return;
    onCreatePlan({ title, description: desc, emoji, color, startDate, endDate, tasks });
  }

  const noOllama = !ollamaUrl || !ollamaModel;

  // ── Step 1: Input ────────────────────────────────────────────────────────

  function renderInput() {
    return (
      <div className="space-y-5 p-5 pb-8">
        <SheetHeader
          eyebrow="AI"
          title="Plan with AI"
          onClose={onClose}
        />

        {noOllama ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-8 text-center dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-neutral-100 dark:bg-white/[0.06]">
              <IconSparkles size={22} strokeWidth={1.5} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <p className="text-[14px] font-semibold text-neutral-700 dark:text-neutral-200">No AI model connected</p>
            <p className="max-w-[220px] text-[13px] leading-relaxed text-neutral-400 dark:text-neutral-500">
              Connect an Ollama model in Settings to create plans with AI.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                What&apos;s your goal?
              </p>
              <textarea
                ref={textareaRef}
                value={goal}
                rows={2}
                onChange={(e) => {
                  setGoal(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && goal.trim() && !streaming) {
                    e.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder="e.g. &quot;Train for a half marathon in 16 weeks&quot;"
                disabled={streaming}
                className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
                style={{ minHeight: "80px", maxHeight: "160px" }}
              />

              {/* Example chips */}
              {!goal && !streaming && (
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLE_GOALS.map((eg) => (
                    <button
                      key={eg}
                      type="button"
                      onClick={() => {
                        setGoal(eg);
                        setTimeout(() => textareaRef.current?.focus(), 0);
                      }}
                      className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[12px] font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-400 dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
                    >
                      {eg}
                    </button>
                  ))}
                </div>
              )}

              {/* Streaming status */}
              <AnimatePresence>
                {streaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-2 px-1"
                  >
                    <GenStreamingStatus />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              {errorMsg && !streaming && (
                <p className="text-[13px] text-red-500 dark:text-red-400">{errorMsg}</p>
              )}
            </div>

            <Button
              fullWidth
              onClick={() => void handleGenerate()}
              disabled={!goal.trim() || streaming}
            >
              {streaming ? "Generating…" : "Generate Plan →"}
            </Button>
          </>
        )}
      </div>
    );
  }

  // ── Step 2: Review & Edit ─────────────────────────────────────────────────

  function renderReview() {
    const today = todayISO();

    return (
      <div className="space-y-5 p-5 pb-8">
        {/* Header with back arrow */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep("input")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
          >
            <IconArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Review Plan</p>
          </div>
          <button
            type="button"
            disabled={streaming}
            onClick={() => { setStep("input"); void handleGenerate(); }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04]"
          >
            <IconRefresh size={12} strokeWidth={2.5} className={streaming ? "animate-spin" : ""} />
            Regenerate
          </button>
        </div>

        {/* Title + Description */}
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Plan title"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[15px] font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Short description (optional)"
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20"
          />
        </div>

        {/* Icon picker */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Icon</p>
          <div className="grid grid-cols-6 gap-1.5">
            {SECTION_ICONS.slice(0, 18).map(({ name, label, icon: Icon }) => {
              const ic = getIconPickerStyle(name);
              const sel = emoji === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={label}
                  onClick={() => {
                    setEmoji(name);
                    // sync color to the icon's natural color
                    import("@/lib/colorSystem").then(({ colorFromIcon }) => setColor(colorFromIcon(name)));
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-all duration-150 ${sel ? `${ic.solid} scale-105` : `${ic.tint} ${ic.text} hover:scale-105`}`}
                >
                  <Icon size={17} strokeWidth={1.5} />
                  <span className={`text-[9px] font-semibold leading-none ${sel ? "text-white/80" : ""}`}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Color picker */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Color</p>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map(({ value, bg, ring }) => (
              <button
                key={value}
                type="button"
                onClick={() => setColor(value)}
                className={`h-7 w-7 rounded-full transition-all ${bg} ${color === value ? `ring-2 ring-offset-2 ${ring} scale-110 ring-offset-white dark:ring-offset-neutral-900` : "opacity-60 hover:opacity-100"}`}
              />
            ))}
          </div>
        </div>

        {/* Dates */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Duration</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map(({ label, days }) => {
              const isActive = days !== null
                ? startDate === today && endDate === addDays(days)
                : startDate === today && !endDate;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setStartDate(today);
                    setEndDate(days !== null ? addDays(days) : "");
                  }}
                  className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-all ${isActive
                    ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                    : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-900 outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:[color-scheme:dark]"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-900 outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:[color-scheme:dark]"
            />
          </div>
        </div>

        {/* Tasks */}
        {tasks.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Generated Tasks ({tasks.length})
            </p>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-white/[0.08]">
              {tasks.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-0 dark:border-white/[0.06]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{t.title}</p>
                    <p className="text-[11px] capitalize text-neutral-400 dark:text-neutral-500">
                      {t.day} · {t.startTime}–{t.endTime}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
                  >
                    <IconX size={13} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button fullWidth onClick={handleCreate} disabled={!title.trim()}>
          Create Plan
        </Button>
      </div>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <AnimatePresence mode="wait">
        {step === "input" ? (
          <motion.div
            key="input"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderInput()}
          </motion.div>
        ) : (
          <motion.div
            key="review"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {renderReview()}
          </motion.div>
        )}
      </AnimatePresence>
    </BottomSheet>
  );
}
