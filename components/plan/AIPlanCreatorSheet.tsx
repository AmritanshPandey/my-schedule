"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
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
import { buildSystemPrompt, parseAIAction, type AITask, type AIMilestone } from "@/lib/ai";
import { streamAI } from "@/lib/ai/providers/router";
import { useAIActions } from "@/lib/ai/useAIActions";
import { useAuth } from "@/contexts/AuthProvider";
import AISignInGate from "@/components/auth/AISignInGate";
import { resolveAccentColor, type AccentColor } from "@/lib/colorSystem";
import { localISODate, todayISO } from "@/lib/dateUtils";
import { validateTaskShapes, type TaskShapeIssue } from "@/lib/ai/validation/taskSchema";
import { runBusinessRules, resolveDayWindowMinutes, type RuleIssue } from "@/lib/ai/validation/businessRules";
import { buildTaskGenerationContext } from "@/lib/ai/context/planGenerationContext";
import { isTrackedTask } from "@/lib/taskCompletion";
import { formatDisplayTime } from "@/lib/timeUtils";
import { DAYS, type DayKey, type Plan, type Schedule } from "@/lib/useScheduleDB";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIPlanCreatorData {
  title: string;
  description: string;
  emoji: string;
  color: string;
  startDate?: string;
  endDate?: string;
  tasks: AITask[];
  milestones: AIMilestone[];
}

interface AIPlanCreatorSheetProps {
  open: boolean;
  onClose: () => void;
  onCreatePlan: (data: AIPlanCreatorData) => void;
  existingPlans?: Pick<Plan, "title" | "category" | "description">[];
  /** Used to build generation context (today's load, deadlines) and to run
   *  business-rule checks (time budget, duplicates) against the real
   *  schedule before the plan is ever created. */
  schedule: Schedule;
  todayKey: DayKey;
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
      <m.span
        key={GEN_PHRASES[idx]}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.22 }}
        className="animate-status-pulse text-[13px] font-medium text-neutral-500 dark:text-neutral-400"
      >
        {GEN_PHRASES[idx]}
      </m.span>
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
  return localISODate(d);
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
  existingPlans = [],
  schedule,
  todayKey,
}: AIPlanCreatorSheetProps) {
  const [step, setStep] = useState<"input" | "question" | "review">("input");
  const [goal, setGoal] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set at most once per generation attempt — see runGenerate's "ask once,
  // then proceed" bound.
  const [clarifyingQuestion, setClarifyingQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  // Editable draft fields
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [emoji, setEmoji] = useState("brain");
  const [color, setColor] = useState<AccentColor>("violet");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tasks, setTasks] = useState<AITask[]>([]);
  const [milestones, setMilestones] = useState<AIMilestone[]>([]);
  const [ruleIssues, setRuleIssues] = useState<RuleIssue[]>([]);

  const ai = useAIActions();
  const { user: aiUser } = useAuth();
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // Reset when sheet closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setStep("input");
        setGoal("");
        setStreaming(false);
        setErrorMsg(null);
        setClarifyingQuestion(""); setAnswer("");
        setTitle(""); setDesc(""); setEmoji("brain");
        setColor("violet"); setStartDate(""); setEndDate(""); setTasks([]); setMilestones([]);
        setRuleIssues([]);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Cleanup abort on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  async function runGenerate(followUp?: { question: string; answer: string }) {
    if (!ai.available || !goal.trim() || streaming) return;
    setStreaming(true);
    setErrorMsg(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: goal }];
    if (followUp) {
      messages.push({ role: "assistant", content: followUp.question });
      messages.push({ role: "user", content: followUp.answer || "(no answer given — use your best judgment)" });
    }

    let accumulated = "";
    try {
      // Full plan creation with tasks in one shot. planContext carries
      // today's real load (existing tasks/rituals/deadlines) so generated
      // tasks don't ignore what's already on the calendar.
      const planContext = buildTaskGenerationContext(schedule, todayKey);
      const systemPrompt = buildSystemPrompt("plans", planContext, existingPlans);
      for await (const chunk of streamAI(aiUser, messages, systemPrompt, false, controller.signal)) {
        accumulated += chunk;
      }
      const action = parseAIAction(accumulated);
      if (action?.type === "create_plan") {
        const p = action.payload;

        // Shape validation (Zod) — additive, on top of parseAIAction's own
        // lenient coercion. Drops any task whose shape or duration remains
        // invalid after that, reporting why.
        const { valid: shapeValidTasks, issues: shapeIssues } = validateTaskShapes(p.tasks ?? []);

        setTitle(p.title);
        setDesc(p.description);
        setEmoji(p.emoji ?? "brain");
        setColor(resolveAccentColor(p.color, p.emoji ?? "brain"));
        setStartDate(p.startDate ?? "");
        setEndDate(p.endDate ?? "");
        setTasks(shapeValidTasks);
        setMilestones(p.milestones ?? []);
        setRuleIssues([
          // Shape-invalid tasks are already excluded from `tasks` above —
          // there's nothing left to "fix", so this is informational, not
          // blocking (only genuine business-rule violations block Create).
          ...shapeIssues.map((i: TaskShapeIssue): RuleIssue => ({
            severity: "warning",
            message: `Dropped "${i.title}" — ${i.message}`,
          })),
        ]);
        setStep("review");
        return;
      }

      const trimmed = accumulated.trim();
      // Only the FIRST call (no followUp yet) can turn into a question — the
      // retry after an answer always falls through to the error below, which
      // is what keeps this bounded to one clarifying round.
      const looksLikeJSON = /^[[{]/.test(trimmed) || trimmed.includes("```");
      if (!followUp && trimmed.length > 0 && !looksLikeJSON) {
        setClarifyingQuestion(trimmed);
        setAnswer("");
        setStep("question");
        setTimeout(() => answerRef.current?.focus(), 120);
        return;
      }
      setErrorMsg("The AI didn't return a valid plan. Try rephrasing your goal.");
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        setErrorMsg(err instanceof Error ? err.message : "Generation failed. Try again.");
      }
    } finally {
      setStreaming(false);
    }
  }

  function handleGenerate() {
    void runGenerate();
  }

  function handleAnswerSubmit() {
    void runGenerate({ question: clarifyingQuestion, answer: answer.trim() });
  }

  function handleSkipQuestion() {
    void runGenerate({ question: clarifyingQuestion, answer: "" });
  }

  // Re-run semantic checks from the editable draft. Otherwise an issue from a
  // generated task or milestone would still block creation after its removal.
  const businessRuleIssues = useMemo(() => {
    const { dayStartMinutes, dayEndMinutes } = resolveDayWindowMinutes(schedule.preferences ?? {});
    const existingTasksByDay = DAYS.reduce<Partial<Record<DayKey, { title: string; startTime: string; endTime: string }[]>>>(
      (acc, day) => {
        acc[day] = (schedule.activities[day] ?? []).filter(isTrackedTask);
        return acc;
      },
      {},
    );
    return runBusinessRules(tasks, milestones, {
      existingTasksByDay,
      rituals: schedule.rituals ?? [],
      dayStartMinutes,
      dayEndMinutes,
      planEndDate: endDate || undefined,
      todayISO: todayISO(),
    });
  }, [endDate, milestones, schedule.activities, schedule.preferences, schedule.rituals, tasks]);

  const displayedRuleIssues = [...ruleIssues, ...businessRuleIssues];
  const hasBlockingIssues = displayedRuleIssues.some((i) => i.severity === "error");

  function handleCreate() {
    if (!title.trim() || hasBlockingIssues) return;
    onCreatePlan({ title, description: desc, emoji, color, startDate, endDate, tasks, milestones });
  }

  // ── Step 1: Input ────────────────────────────────────────────────────────

  function renderInput() {
    return (
      <div className="space-y-5 p-5 pb-8">
        <SheetHeader
          eyebrow="AI"
          title="Plan with AI"
          onClose={onClose}
        />

        {!ai.available ? (
          <AISignInGate />
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
                  <m.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-2 px-1"
                  >
                    <GenStreamingStatus />
                  </m.div>
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

  // ── Step 2: Clarifying question ──────────────────────────────────────────

  function renderQuestion() {
    return (
      <div className="space-y-5 p-5 pb-8">
        <SheetHeader eyebrow="AI" title="Plan with AI" onClose={onClose} />

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-2.5 dark:border-emerald-500/15 dark:bg-emerald-500/5">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
            <IconSparkles size={11} strokeWidth={2.2} />
            One quick thing
          </p>
          <p className="text-[14px] font-medium leading-snug text-neutral-800 dark:text-neutral-200">
            {clarifyingQuestion}
          </p>
        </div>

        <textarea
          ref={answerRef}
          value={answer}
          rows={2}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !streaming) {
              e.preventDefault();
              handleAnswerSubmit();
            }
          }}
          placeholder="Your answer…"
          disabled={streaming}
          className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
        />

        {streaming && (
          <div className="flex items-center gap-2 px-1">
            <GenStreamingStatus />
          </div>
        )}

        {errorMsg && !streaming && (
          <p className="text-[13px] text-red-500 dark:text-red-400">{errorMsg}</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSkipQuestion}
            disabled={streaming}
            className="flex h-12 items-center gap-1.5 rounded-xl border border-neutral-200 px-4 text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 disabled:opacity-40 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04]"
          >
            Skip
          </button>
          <div className="flex-1">
            <Button fullWidth onClick={handleAnswerSubmit} disabled={streaming}>
              {streaming ? "Generating…" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Review & Edit ─────────────────────────────────────────────────

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
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[16px] font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20"
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

        {/* Rule issues — shape drops + business-rule warnings, surfaced before commit */}
        {displayedRuleIssues.length > 0 && (
          <div className="space-y-1.5">
            {["error", "warning"].map((severity) => {
              const group = displayedRuleIssues.filter((i) => i.severity === severity);
              if (group.length === 0) return null;
              const isError = severity === "error";
              return (
                <div
                  key={severity}
                  className={`rounded-xl border px-3.5 py-2.5 text-[12px] leading-snug ${
                    isError
                      ? "border-red-100 bg-red-50 text-red-700 dark:border-red-500/15 dark:bg-red-500/5 dark:text-red-300"
                      : "border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-500/15 dark:bg-amber-500/5 dark:text-amber-300"
                  }`}
                >
                  <p className="mb-1 font-semibold uppercase tracking-[0.06em] text-[10px]">
                    {isError ? "Needs attention" : "Worth a look"}
                  </p>
                  <ul className="space-y-0.5">
                    {group.map((issue, i) => (
                      <li key={i}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

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
                      {t.day} · {formatDisplayTime(t.startTime)}–{formatDisplayTime(t.endTime)}
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

        {/* Milestones */}
        {milestones.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Generated Milestones ({milestones.length})
            </p>
            <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-white/[0.08]">
              {milestones.map((m, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-neutral-100 px-3 py-2.5 last:border-0 dark:border-white/[0.06]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{m.title}</p>
                    {m.targetDate && (
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{m.targetDate}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setMilestones((prev) => prev.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
                  >
                    <IconX size={13} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button fullWidth onClick={handleCreate} disabled={!title.trim() || hasBlockingIssues}>
          {hasBlockingIssues ? "Resolve issues above to continue" : "Create Plan"}
        </Button>
      </div>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <AnimatePresence mode="wait">
        {step === "input" && (
          <m.div
            key="input"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderInput()}
          </m.div>
        )}
        {step === "question" && (
          <m.div
            key="question"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {renderQuestion()}
          </m.div>
        )}
        {step === "review" && (
          <m.div
            key="review"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            {renderReview()}
          </m.div>
        )}
      </AnimatePresence>
    </BottomSheet>
  );
}
