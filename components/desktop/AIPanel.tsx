"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconArrowRight, IconBrain, IconEraser, IconSend, IconSparkles, IconX } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import { parseAIAction, buildSystemPrompt, buildPlanContext } from "@/lib/ai";
import type { AIActionResult } from "@/lib/ai";
import { streamAIChat } from "@/lib/aiClient";
import { getAIProviderState } from "@/lib/ai/config";
import { useAIReady } from "@/lib/ai/useAIReady";
import { preloadBrowserModel } from "@/lib/ai/providers/browser";
import { resolvePlanTarget, resolveTaskTarget, describeTargetProblem } from "@/lib/ai/targets";
import type { Plan, Ritual, Schedule } from "@/lib/useScheduleDB";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import type { AITask } from "@/lib/ai";
import { formatDisplayTime } from "@/lib/timeUtils";
import { buildCreateTaskProposal, type AIProposal } from "@/lib/aiProposal";
import { ProposalPreviewCard } from "@/components/ai/ProposalPreviewCard";
import { AIThinkingStatus, AIStreamingCursor } from "@/components/ai/AIThinkingStatus";
import { AIErrorBanner } from "@/components/ai/AIErrorBanner";

interface Message {
  role: "user" | "assistant";
  text: string;
  action?: AIActionResult;
  proposal?: AIProposal;
}

interface AIPanelProps {
  context: "plans" | "routine";
  plans: Plan[];
  rituals: Ritual[];
  schedule: Schedule;
  activePlan?: Plan;
  initialMessage?: string;
  onApplyAction: (result: AIActionResult) => void;
  /** AI Proposal boundary — currently only the `add_task` action goes
   * through this instead of `onApplyAction` (see PlanR Improvement 04).
   * `onProposalAccept` returns whether execution actually succeeded (it can
   * fail — e.g. a stale/deleted plan) so the card shows the true outcome. */
  onProposalCreated: (proposal: AIProposal) => void;
  onProposalAccept: (proposal: AIProposal) => boolean;
  onProposalReject: (proposal: AIProposal) => void;
  onClose?: () => void;
}

const ACTION_LABELS: Record<AIActionResult["type"], string> = {
  create_plan: "New Plan",
  create_ritual: "New Ritual",
  suggest_milestones: "Milestones",
  add_tracker: "New Tracker",
  add_task: "New Task",
  add_subtasks: "New Subtasks",
  ask_clarification: "Question",
};

// Shown only while waiting for the FIRST token — once real text starts
// streaming in, that token-by-token appearance already is the honest
// progress signal (see the `msg.text ? … : …` branch below). AIThinkingStatus
// (components/ai/AIThinkingStatus.tsx) carries the elapsed-time-escalating
// label copy and the dot-pulse/cursor animations this file used to define
// locally.

const DAY_SHORT: Record<string, string> = { monday:"Mo", tuesday:"Tu", wednesday:"We", thursday:"Th", friday:"Fr", saturday:"Sa", sunday:"Su" };

const COLOR_SWATCHES: { value: string; bg: string; ring: string }[] = [
  { value: "emerald", bg: "bg-emerald-500", ring: "ring-emerald-400" },
  { value: "blue",    bg: "bg-blue-500",    ring: "ring-blue-400" },
  { value: "violet",  bg: "bg-violet-500",  ring: "ring-violet-400" },
  { value: "pink",    bg: "bg-pink-500",    ring: "ring-pink-400" },
  { value: "amber",   bg: "bg-amber-500",   ring: "ring-amber-400" },
  { value: "cyan",    bg: "bg-cyan-500",    ring: "ring-cyan-400" },
];

function PlanDraftCard({ action, onApply }: { action: Extract<AIActionResult, { type: "create_plan" }>; onApply: (updated: AIActionResult) => void }) {
  const defaultIcon = SECTION_ICONS.find((s) => s.name === action.payload.emoji) ? action.payload.emoji : "brain";
  const [title, setTitle]     = useState(action.payload.title);
  const [desc, setDesc]       = useState(action.payload.description);
  const [iconName, setIcon]   = useState(defaultIcon);
  const [color, setColor]     = useState(action.payload.color ?? "emerald");
  const [startDate, setStart] = useState(action.payload.startDate ?? "");
  const [endDate, setEnd]     = useState(action.payload.endDate ?? "");
  const [tasks, setTasks]     = useState<AITask[]>(action.payload.tasks ?? []);

  const selectedEntry = SECTION_ICONS.find((s) => s.name === iconName) ?? SECTION_ICONS[0];
  const selectedStyle = getIconPickerStyle(iconName);

  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-2 w-full rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.10] dark:bg-neutral-900"
    >
      <div className="mb-3 flex items-center gap-1.5">
        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
          New Plan
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">Review and edit before creating</span>
      </div>

      {/* Icon preview + Title */}
      <div className="mb-2.5 flex items-center gap-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selectedStyle.tint}`}>
          <selectedEntry.icon size={18} strokeWidth={1.8} className={selectedStyle.text} />
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Plan title"
          className="flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[13px] font-semibold text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20"
        />
      </div>

      {/* Icon grid */}
      <div className="mb-2.5 grid grid-cols-6 gap-1 sm:grid-cols-10">
        {SECTION_ICONS.map((entry) => {
          const st = getIconPickerStyle(entry.name);
          const selected = iconName === entry.name;
          return (
            <button
              key={entry.name}
              type="button"
              title={entry.label}
              onClick={() => setIcon(entry.name)}
              className={`flex items-center justify-center rounded-lg p-1.5 transition-all ${
                selected ? st.tint + " ring-1 ring-inset ring-current/20" : "hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
              }`}
            >
              <entry.icon size={14} strokeWidth={1.8} className={selected ? st.text : "text-neutral-400 dark:text-neutral-500"} />
            </button>
          );
        })}
      </div>

      {/* Description */}
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Short description (optional)"
        rows={2}
        className="mb-2.5 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] text-neutral-700 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:focus:border-white/20"
      />

      {/* Color swatches */}
      <div className="mb-2.5 flex items-center gap-1.5">
        {COLOR_SWATCHES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setColor(s.value)}
            className={`h-5 w-5 rounded-full transition-all ${s.bg} ${color === s.value ? `ring-2 ring-offset-1 ${s.ring} dark:ring-offset-neutral-900` : "opacity-50 hover:opacity-80"}`}
          />
        ))}
      </div>

      {/* Tasks */}
      {tasks.length > 0 && (
        <div className="mb-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{tasks.length} task{tasks.length !== 1 ? "s" : ""} generated</p>
            <button type="button" onClick={() => setTasks([])} className="text-[10px] text-neutral-400 hover:text-rose-500 dark:hover:text-rose-400">Remove all</button>
          </div>
          <div className="flex flex-col gap-1">
            {tasks.map((t, i) => {
              const entry = SECTION_ICONS.find((s) => s.name === t.icon) ?? SECTION_ICONS[0];
              const st = getIconPickerStyle(t.icon);
              return (
                <div key={i} className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-neutral-50 px-2.5 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${st.tint}`}>
                    <entry.icon size={12} strokeWidth={2} className={st.text} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 rounded bg-neutral-200 px-1 py-0.5 text-[9px] font-bold text-neutral-600 dark:bg-white/[0.10] dark:text-neutral-400">
                        {DAY_SHORT[t.day] ?? t.day}
                      </span>
                      {/* min-w-0 is required here: as a flex item, its default
                          min-width is content-based, which silently defeats
                          `truncate` and lets long titles push the row wider
                          than the card. */}
                      <span className="min-w-0 truncate text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">{t.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-neutral-400">{formatDisplayTime(t.startTime)}–{formatDisplayTime(t.endTime)}</span>
                    </div>
                    {t.subtasks && t.subtasks.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                        {t.subtasks.join(" · ")}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 text-neutral-300 hover:text-rose-500 dark:text-neutral-600 dark:hover:text-rose-400">
                    <IconX size={12} strokeWidth={2} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dates — dark:[color-scheme:dark] matches every other date input in
          the app (AddPlanSheet/EditPlanSheet/TaskSheet): without it, the
          browser renders its native calendar icon assuming a light page,
          so it goes near-invisible (or the wrong color) against a dark
          card. Missing here was the one thing actually broken; the rest is
          this card's own compact sizing, kept as-is. */}
      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <p className="mb-0.5 text-[10px] font-medium text-neutral-400">Start date</p>
          <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)}
            className="w-[144px] rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-700 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]" />
        </div>
        <div className="flex-1">
          <p className="mb-0.5 text-[10px] font-medium text-neutral-400">End date</p>
          <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)}
            className="w-[144px] rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-700 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]" />
        </div>
      </div>

      <m.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={!title.trim()}
        onClick={() => onApply({
          type: "create_plan",
          payload: { title: title.trim(), description: desc.trim(), emoji: iconName, color, startDate: startDate || undefined, endDate: endDate || undefined, tasks },
        })}
        className="w-full rounded-xl bg-emerald-600 py-2 text-[13px] font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-40 dark:bg-emerald-500 dark:hover:bg-emerald-400"
      >
        Create Plan{tasks.length > 0 ? ` + ${tasks.length} task${tasks.length !== 1 ? "s" : ""}` : ""}
      </m.button>
    </m.div>
  );
}

/**
 * What the card should show BEFORE Apply is clicked, for actions whose real
 * target (a plan, a set of tasks) is resolved by name at apply-time — so a
 * bad or ambiguous match is visible upfront instead of only discoverable
 * after the fact. Every path here is still safe to Apply (handleApplyAction
 * has its own fallback/toast for an unresolved target); this is purely
 * informational.
 */
function resolvePreview(
  action: Exclude<AIActionResult, { type: "create_plan" } | { type: "ask_clarification" }>,
  plans: Plan[],
  schedule: Schedule,
  activePlan: Plan | undefined,
): { title: string; detail: string | null; warn: boolean } {
  switch (action.type) {
    case "create_ritual":
      return { title: action.payload.title, detail: null, warn: false };

    // Every branch below resolves exactly as the apply path does. They used to
    // fall back to `activePlan ?? plans[0]`, so the card promised "→ Marathon
    // Training" for a plan the model had misnamed — and the write then went
    // somewhere else, or nowhere. A preview that disagrees with the apply is
    // worse than no preview.
    case "add_task": {
      const target = resolvePlanTarget(plans, action.payload.planTitle);
      if (action.payload.planTitle && target.status !== "resolved") {
        return {
          title: action.payload.title,
          detail: describeTargetProblem(target, "plan"),
          warn: true,
        };
      }
      return {
        title: action.payload.title,
        detail: target.status === "resolved" ? `→ ${target.value.title}` : "No plan (standalone)",
        warn: false,
      };
    }

    case "add_tracker": {
      const target = resolvePlanTarget(plans, action.payload.planTitle);
      if (target.status !== "resolved") {
        return { title: action.payload.title, detail: describeTargetProblem(target, "plan"), warn: true };
      }
      return { title: action.payload.title, detail: `→ ${target.value.title}`, warn: false };
    }

    case "suggest_milestones": {
      const count = action.payload.milestones.length;
      const label = `${count} milestone${count !== 1 ? "s" : ""}`;
      const target = resolvePlanTarget(plans, action.payload.planTitle);
      if (target.status !== "resolved") {
        return { title: label, detail: describeTargetProblem(target, "plan"), warn: true };
      }
      return { title: label, detail: `→ ${target.value.title}`, warn: false };
    }

    case "add_subtasks": {
      const count = action.payload.subtasks.length;
      const label = `${count} step${count !== 1 ? "s" : ""}`;
      const target = resolveTaskTarget(schedule, action.payload.taskTitle);
      if (target.status !== "resolved") {
        return { title: label, detail: describeTargetProblem(target, "task"), warn: true };
      }
      return { title: label, detail: `→ "${target.value.title}"`, warn: false };
    }
  }
}

/**
 * The model asking which plan or task was meant.
 *
 * Rendered instead of an Apply card: there is nothing to approve yet. Options
 * are the real names it could have meant, so answering is a tap rather than
 * retyping a title the matcher then has to guess at again.
 */
function ClarificationCard({
  payload,
  onAnswer,
}: {
  payload: { question: string; options?: string[]; field?: string };
  onAnswer?: (answer: string) => void;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-2 rounded-2xl border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-400/25 dark:bg-amber-400/[0.07]"
    >
      <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-400/20 dark:text-amber-300">
        Needs an answer
      </span>
      <p className="mt-1 text-[13px] font-semibold text-neutral-900 dark:text-white">{payload.question}</p>
      {payload.options && payload.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {payload.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onAnswer?.(option)}
              className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-400/35 dark:bg-neutral-900 dark:text-amber-200 dark:hover:bg-amber-400/10"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </m.div>
  );
}

function ActionCard({
  action,
  plans,
  schedule,
  activePlan,
  onApply,
  onAnswer,
}: {
  action: AIActionResult;
  plans: Plan[];
  schedule: Schedule;
  activePlan?: Plan;
  onApply: (updated?: AIActionResult) => void;
  onAnswer?: (answer: string) => void;
}) {
  if (action.type === "create_plan") {
    return <PlanDraftCard action={action} onApply={onApply} />;
  }

  // A question is not a change to approve — it has no Apply. Answering it sends
  // the choice back as the next message, which is how the model learns which
  // plan or task was meant instead of picking one itself.
  if (action.type === "ask_clarification") {
    return <ClarificationCard payload={action.payload} onAnswer={onAnswer} />;
  }

  const { title, detail, warn } = resolvePreview(action, plans, schedule, activePlan);

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-2 rounded-2xl border border-emerald-200/60 bg-white p-3 dark:border-emerald-500/[0.18] dark:bg-neutral-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
            {ACTION_LABELS[action.type]}
          </span>
          <p className="mt-1 truncate text-[13px] font-semibold text-neutral-900 dark:text-white">{title}</p>
          {detail && (
            <p className={`mt-0.5 truncate text-[11px] leading-relaxed ${warn ? "text-amber-600 dark:text-amber-400" : "text-neutral-400 dark:text-neutral-500"}`}>
              {warn ? "⚠ " : ""}{detail}
            </p>
          )}
        </div>
        <m.button
          type="button"
          onClick={() => onApply()}
          whileTap={{ scale: 0.93 }}
          className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white transition-opacity hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          Apply
        </m.button>
      </div>
    </m.div>
  );
}

const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-1 list-disc pl-4 space-y-0.5">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-1 list-decimal pl-4 space-y-0.5">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 font-bold text-[14px]">{children}</p>,
  h2: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 font-bold">{children}</p>,
  h3: ({ children }: { children?: React.ReactNode }) => <p className="mb-0.5 font-semibold">{children}</p>,
  // Fenced code blocks render as <pre><code>…</code></pre> with no wrap by
  // default — a long line would otherwise force the whole chat frame wider.
  // Let the block scroll horizontally within itself instead.
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-1.5 max-w-full overflow-x-auto rounded-lg bg-black/10 p-2 text-[11px] dark:bg-white/10">{children}</pre>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="break-words rounded bg-black/10 px-1 font-mono text-[11px] dark:bg-white/10">{children}</code>
  ),
};

/**
 * Starter chips carry the action they mean. The label used to be sent as a
 * bare string, throwing that away and leaving the model to re-derive the
 * action from a prompt describing every type — the hardest part of the job,
 * and where a small model burns its budget and degenerates.
 *
 * `action` omitted means genuinely ambiguous; those still go through the full
 * decide-then-act prompt.
 */
const STARTER_PROMPTS: Record<"plans" | "routine", { label: string; action?: string }[]> = {
  plans: [
    { label: "Create a 30-day fitness plan", action: "create_plan" },
    { label: "Add a commitment for an appointment", action: "add_task" },
    { label: "Add a tracker to an existing plan", action: "add_tracker" },
    { label: "Suggest milestones for an existing plan", action: "suggest_milestones" },
  ],
  routine: [
    { label: "Design a productive morning routine", action: "create_ritual" },
    { label: "Create an evening wind-down ritual", action: "create_ritual" },
    { label: "Add subtasks to an existing task", action: "add_subtasks" },
  ],
};

function stripJsonBlocks(text: string): string {
  const withoutFenced = text.replace(/```json[\s\S]*?```/g, "").trim();
  if (withoutFenced !== text.trim()) return withoutFenced;
  // The model doesn't always wrap its JSON in a fence (confirmed live with
  // MLX/Qwen3, unlike Gemini which mostly did) — strip a trailing bare
  // {...} object too, mirroring lib/ai.ts's extractJSONCandidate fallback.
  // Anchored to the end of the string so a stray "{" earlier in genuine
  // prose is never touched.
  return text.replace(/\{[\s\S]*\}\s*$/, "").trim();
}

export function AIPanel({ context, plans, rituals, schedule, activePlan, initialMessage, onApplyAction, onProposalCreated, onProposalAccept, onProposalReject, onClose }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const didAutoSend = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Local (mlx/ollama) vs remote changes the honest thing to say while
  // waiting on a first token — see AIThinkingStatus's isLocal prop.
  const isLocalProvider = useMemo(() => getAIProviderState().active !== "openai-compatible", []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(context, activePlan ? buildPlanContext(activePlan) : undefined, plans, rituals),
    [context, activePlan, plans, rituals],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ready = useAIReady();

  function handleDownloadModel() {
    void preloadBrowserModel(getAIProviderState().browser.model).catch(() => {
      // The status bar reports the error phase; nothing to add here.
    });
  }

  async function handleSend(overrideText?: string, actionHint?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);

    const userMessage: Message = { role: "user", text };
    const assistantMessage: Message = { role: "assistant", text: "" };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setStreaming(true);

    const history = [...messages, userMessage].map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.role === "assistant" ? stripJsonBlocks(m.text) : m.text,
    }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let fullText = "";
    try {
      // Always request the larger token budget: with the unified prompt, any
      // context can emit a create_plan with several bundled tasks — it's a
      // ceiling, not a forced length.
      for await (const chunk of streamAIChat(history, systemPrompt, 4096, controller.signal, actionHint)) {
        fullText += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], text: fullText };
          return updated;
        });
      }
      const action = parseAIAction(fullText);
      if (action?.type === "add_task") {
        // AI Proposal boundary (PlanR Improvement 04): add_task never goes
        // straight to onApplyAction — it's built into a reviewable AIProposal
        // instead, and AI_PROPOSAL_CREATED is recorded immediately so an
        // ignored suggestion still leaves a lifecycle trace.
        const proposal = buildCreateTaskProposal(action, plans);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], proposal };
          return updated;
        });
        onProposalCreated(proposal);
      } else if (action) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], action };
          return updated;
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((prev) => prev.slice(0, -1));
      } else {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  useEffect(() => {
    if (initialMessage && !didAutoSend.current) {
      didAutoSend.current = true;
      handleSend(initialMessage);
    }
  }, [initialMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update just the resolved proposal's status in place, so its card shows
  // "Added"/"Dismissed" without touching any other message. Deliberately
  // does NOT close the panel (unlike onApplyAction below) — the user should
  // see that confirmation before the panel goes away.
  function setProposalStatus(proposalId: string, status: AIProposal["status"]) {
    setMessages((prev) =>
      prev.map((m) => (m.proposal?.id === proposalId ? { ...m, proposal: { ...m.proposal, status } } : m))
    );
  }

  function handleProposalAccept(proposal: AIProposal) {
    const ok = onProposalAccept(proposal);
    setProposalStatus(proposal.id, ok ? "accepted" : "failed");
  }

  function handleProposalReject(proposal: AIProposal) {
    onProposalReject(proposal);
    setProposalStatus(proposal.id, "rejected");
  }

  const contextLabel = context === "plans" ? "Plans" : "Routine";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 dark:border-white/10 dark:bg-neutral-950 dark:text-white">
      <div className="flex h-[76px] shrink-0 items-center justify-between gap-3 border-b border-neutral-100 bg-white px-4 dark:border-white/10 dark:bg-neutral-950">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-500/15 dark:bg-blue-500/10">
            <IconSparkles size={18} strokeWidth={2} className="text-blue-600 dark:text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">AI Assistant</p>
            <p className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">
              {contextLabel}{activePlan ? ` · ${activePlan.title}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AnimatePresence>
            {messages.length > 0 && (
              <m.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                type="button"
                onClick={() => { setMessages([]); setError(null); }}
                title="New chat"
                whileTap={{ scale: 0.92 }}
                className="flex h-9 w-9 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-white/[0.08] dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-blue-500/20 dark:hover:text-blue-300"
              >
                <IconEraser size={14} strokeWidth={2} />
              </m.button>
            )}
          </AnimatePresence>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI assistant"
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:border-white/[0.08] dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-white/20 dark:hover:text-white"
            >
              <IconX size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-3">
          <AIErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3">
        {/* No mode="wait": there is a single stable child key below, so there is
            nothing to sequence, and mode="wait" would only reintroduce the
            "incoming child waits on an exit that may never finish" hazard. */}
        <AnimatePresence>
          {/* One child, one key. The model has to exist before any of this
              works, but deriving the *content* rather than swapping keys means
              AnimatePresence never has to run an exit here — so there is no
              flash of the starters while the cache check resolves, and no
              dependence on a transition completing. */}
          {messages.length === 0 && (
            <m.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full flex-col items-center justify-center gap-4 text-center"
            >
              <m.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05, type: "spring", stiffness: 260, damping: 20 }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/10"
              >
                <IconBrain size={20} strokeWidth={1.5} className="text-neutral-700 dark:text-white" />
              </m.div>

              {/* Nothing decisive while the cache check is still running. */}
              {ready.state === "checking" && <span className="sr-only">Checking AI</span>}

              {ready.state === "needs-download" && (
                <div className="flex flex-col items-center gap-4 px-6">
                  <div>
                    <p className="text-[13px] font-semibold text-neutral-800 dark:text-white/90">
                      One-time download to use AI here
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                      PlanR runs its model inside this tab, so nothing you write leaves your
                      device. It needs {ready.downloadLabel} once, then it&apos;s cached.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadModel}
                    className="rounded-full bg-neutral-900 px-5 py-2.5 text-[13px] font-bold text-white dark:bg-white dark:text-neutral-900"
                  >
                    Download model ({ready.downloadLabel})
                  </button>
                </div>
              )}

              {ready.state === "downloading" && (
                <div className="flex flex-col items-center gap-3 px-6">
                  <p className="text-[13px] font-semibold text-neutral-800 dark:text-white/90">
                    Downloading the model… {ready.progress ?? 0}%
                  </p>
                  <div className="h-1.5 w-48 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                      style={{ width: `${ready.progress ?? 0}%` }}
                    />
                  </div>
                  <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
                    You can close this — it keeps going in the background.
                  </p>
                </div>
              )}

              {(ready.state === "ready" || ready.state === "not-configured") && (
              <m.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-[13px] font-semibold text-neutral-800 dark:text-white/90"
              >
                What would you like to build?
              </m.p>
              )}

              {(ready.state === "ready" || ready.state === "not-configured") && (
              <div className="flex w-full flex-col gap-1.5 px-2">
                {STARTER_PROMPTS[context].map((starter, i) => (
                  <m.button
                    key={starter.label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.06, ease: "easeOut" }}
                    type="button"
                    onClick={() => void handleSend(starter.label, starter.action)}
                    disabled={streaming}
                    whileHover={streaming ? {} : { x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-between rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-[13px] font-medium text-neutral-900 transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/10"
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-white">
                        <IconSparkles size={14} strokeWidth={2} />
                      </span>
                      {starter.label}
                    </span>
                    <IconArrowRight size={14} strokeWidth={2} className="ml-2 shrink-0 text-neutral-400 dark:text-white/70" />
                  </m.button>
                ))}
              </div>
              )}
            </m.div>
          )}
        </AnimatePresence>

        {messages.map((msg, i) => {
          const isStreamingThis = streaming && i === messages.length - 1 && msg.role === "assistant";
          const bubbleClass = msg.role === "user"
            ? "ml-auto rounded-2xl rounded-br-[10px] bg-blue-600 text-white"
            : "mr-auto rounded-2xl rounded-bl-[10px] border border-neutral-200 bg-neutral-50 text-neutral-900 dark:border-white/10 dark:bg-white/5 dark:text-white";
          return (
            <m.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`min-w-0 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                {/* max-w-full is load-bearing, not decorative: the wrapper's
                    items-end/items-start keeps this a shrink-to-fit flex
                    item, so overflow-wrap alone won't force it to shrink —
                    without an explicit max-width an unbroken token still
                    grows the box past the frame before wrapping engages. */}
                <div className={`min-w-0 max-w-full break-words rounded-2xl px-4 py-3 text-[13px] leading-relaxed [overflow-wrap:anywhere] ${bubbleClass}`}>
                  {msg.role === "user" ? (
                    msg.text
                  ) : msg.text ? (
                    <>
                      <ReactMarkdown components={mdComponents}>
                        {stripJsonBlocks(msg.text)}
                      </ReactMarkdown>
                      {isStreamingThis && <AIStreamingCursor />}
                    </>
                  ) : (
                    <AIThinkingStatus isLocal={isLocalProvider} />
                  )}
                </div>
                {msg.proposal ? (
                  <ProposalPreviewCard
                    proposal={msg.proposal}
                    onAccept={handleProposalAccept}
                    onReject={handleProposalReject}
                  />
                ) : msg.action ? (
                  <ActionCard
                    action={msg.action}
                    plans={plans}
                    schedule={schedule}
                    activePlan={activePlan}
                    onApply={(updated) => onApplyAction(updated ?? msg.action!)}
                  />
                ) : null}
              </div>
            </m.div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-neutral-200 px-3 py-3 dark:border-white/10">
        <m.div
          transition={{ duration: 0.15 }}
          className={`flex items-end gap-2 rounded-2xl border bg-neutral-50 px-3 py-2 transition-colors dark:bg-white/5 ${focused ? "border-blue-500/50 dark:border-blue-500/30" : "border-neutral-200 dark:border-white/10"}`}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Ask about ${contextLabel.toLowerCase()}…`}
            rows={3}
            disabled={streaming}
            className="flex-1 resize-none bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 disabled:opacity-50 dark:text-white dark:placeholder:text-white/50"
            style={{ minHeight: "72px", maxHeight: "160px" }}
          />
          <m.button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || streaming}
            whileTap={{ scale: 0.88 }}
            whileHover={input.trim() && !streaming ? { scale: 1.08 } : {}}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white transition-opacity disabled:opacity-30 hover:bg-blue-500"
          >
            <IconSend size={13} strokeWidth={2.5} />
          </m.button>
        </m.div>
        <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-white/50">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
