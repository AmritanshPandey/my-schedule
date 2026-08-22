"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconArrowRight, IconBrain, IconEraser, IconSend, IconSparkles, IconX } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import { parseAIAction, buildSystemPrompt, buildPlanContext } from "@/lib/ai";
import type { AIActionResult } from "@/lib/ai";
import { streamAIChat } from "@/lib/aiClient";
import { getAIProviderState } from "@/lib/ai/config";
import { findPlanByTitle, findTasksByTitle } from "@/lib/planLookup";
import type { Plan, Ritual, Schedule } from "@/lib/useScheduleDB";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import type { AITask } from "@/lib/ai";
import { formatDisplayTime } from "@/lib/timeUtils";

interface Message {
  role: "user" | "assistant";
  text: string;
  action?: AIActionResult;
}

interface AIPanelProps {
  context: "plans" | "routine" | "strategy";
  plans: Plan[];
  rituals: Ritual[];
  schedule: Schedule;
  activePlan?: Plan;
  initialMessage?: string;
  onApplyAction: (result: AIActionResult) => void;
  onClose?: () => void;
}

const ACTION_LABELS: Record<AIActionResult["type"], string> = {
  create_plan: "New Plan",
  create_ritual: "New Ritual",
  create_strategy: "New Strategy",
  suggest_milestones: "Milestones",
  add_tracker: "New Tracker",
  add_task: "New Task",
  add_subtasks: "New Subtasks",
};

/**
 * Shown only while waiting for the FIRST token — once real text starts
 * streaming in, that token-by-token appearance already is the honest
 * progress signal, so this steps aside (see the `msg.text ? … : …` branch
 * below). The copy here is deliberately elapsed-time-based rather than a
 * fabricated checklist ("Analyzing…", "Drafting…") that would play out
 * identically no matter what's actually happening — a local model can
 * genuinely take several seconds before its first token, so the label
 * escalates honestly instead of pretending nothing changed, and it plateaus
 * (doesn't loop) so a long wait doesn't start to feel like it's lying.
 */
const THINKING_PHASES: { atMs: number; local: string; remote: string }[] = [
  { atMs: 0, local: "Thinking on your device…", remote: "Thinking…" },
  { atMs: 3500, local: "Still working…", remote: "Still working…" },
  { atMs: 9000, local: "Local models can take a moment — hang tight", remote: "Taking longer than usual…" },
];

function ThinkingStatus({ isLocal }: { isLocal: boolean }) {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    setPhaseIdx(0);
    const timers = THINKING_PHASES.slice(1).map((phase, i) => setTimeout(() => setPhaseIdx(i + 1), phase.atMs));
    return () => timers.forEach(clearTimeout);
  }, []);

  const label = isLocal ? THINKING_PHASES[phaseIdx].local : THINKING_PHASES[phaseIdx].remote;

  return (
    <span className="inline-flex items-center gap-2 py-0.5">
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <m.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
            animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
          />
        ))}
      </span>
      <AnimatePresence mode="wait">
        <m.span
          key={label}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.2 }}
          className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400"
        >
          {label}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

function StreamingCursor() {
  return (
    <m.span
      className="inline-block ml-0.5 h-[13px] w-[2px] rounded-full bg-neutral-400 align-middle dark:bg-neutral-500"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

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

      {/* Dates */}
      <div className="mb-3 flex gap-2">
        <div className="flex-1">
          <p className="mb-0.5 text-[10px] font-medium text-neutral-400">Start date</p>
          <input type="date" value={startDate} onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-700 outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300" />
        </div>
        <div className="flex-1">
          <p className="mb-0.5 text-[10px] font-medium text-neutral-400">End date</p>
          <input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[11px] text-neutral-700 outline-none dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300" />
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
  action: Exclude<AIActionResult, { type: "create_plan" }>,
  plans: Plan[],
  schedule: Schedule,
  activePlan: Plan | undefined,
): { title: string; detail: string | null; warn: boolean } {
  switch (action.type) {
    case "create_ritual":
    case "create_strategy":
      return { title: action.payload.title, detail: null, warn: false };

    case "add_task": {
      const plan = findPlanByTitle(plans, action.payload.planTitle);
      if (action.payload.planTitle && !plan) {
        return { title: action.payload.title, detail: `No plan matched "${action.payload.planTitle}" — will add without one`, warn: true };
      }
      return { title: action.payload.title, detail: plan ? `→ ${plan.title}` : "No plan (standalone)", warn: false };
    }

    case "add_tracker": {
      const plan = findPlanByTitle(plans, action.payload.planTitle) ?? activePlan ?? plans[0];
      if (!plan) return { title: action.payload.title, detail: "No plan exists yet — create one first", warn: true };
      return { title: action.payload.title, detail: `→ ${plan.title}`, warn: false };
    }

    case "suggest_milestones": {
      const count = action.payload.milestones.length;
      const label = `${count} milestone${count !== 1 ? "s" : ""}`;
      const plan = findPlanByTitle(plans, action.payload.planTitle) ?? activePlan ?? plans[0];
      if (!plan) return { title: label, detail: "No plan exists yet — create one first", warn: true };
      return { title: label, detail: `→ ${plan.title}`, warn: false };
    }

    case "add_subtasks": {
      const count = action.payload.subtasks.length;
      const label = `${count} step${count !== 1 ? "s" : ""}`;
      const matches = findTasksByTitle(schedule, action.payload.taskTitle);
      if (matches.length === 0) {
        return { title: label, detail: `No task found named "${action.payload.taskTitle}"`, warn: true };
      }
      return { title: label, detail: `→ "${action.payload.taskTitle}"`, warn: false };
    }
  }
}

function ActionCard({
  action,
  plans,
  schedule,
  activePlan,
  onApply,
}: {
  action: AIActionResult;
  plans: Plan[];
  schedule: Schedule;
  activePlan?: Plan;
  onApply: (updated?: AIActionResult) => void;
}) {
  if (action.type === "create_plan") {
    return <PlanDraftCard action={action} onApply={onApply} />;
  }

  const { title, detail, warn } = resolvePreview(action, plans, schedule, activePlan);
  const htmlExcerpt =
    action.type === "create_strategy" && action.payload.htmlContent
      ? action.payload.htmlContent
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 130)
      : null;

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
          {htmlExcerpt && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
              {htmlExcerpt}…
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

const STARTER_PROMPTS: Record<"plans" | "routine" | "strategy", string[]> = {
  plans: [
    "Create a 30-day fitness plan",
    "Add a commitment for an appointment",
    "Add a tracker to an existing plan",
    "Suggest milestones for an existing plan",
  ],
  routine: [
    "Design a productive morning routine",
    "Create an evening wind-down ritual",
    "Add subtasks to an existing task",
  ],
  strategy: [
    "Write a progressive overload program",
    "Create a language learning strategy",
    "Design a habit stacking system",
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

export function AIPanel({ context, plans, rituals, schedule, activePlan, initialMessage, onApplyAction, onClose }: AIPanelProps) {
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
  // waiting on a first token — see ThinkingStatus above.
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

  async function handleSend(overrideText?: string) {
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
      // context can now emit a long create_strategy doc or a create_plan with
      // several bundled tasks — it's a ceiling, not a forced length.
      for await (const chunk of streamAIChat(history, systemPrompt, 4096, controller.signal)) {
        fullText += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], text: fullText };
          return updated;
        });
      }
      const action = parseAIAction(fullText);
      if (action) {
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

  const contextLabel = context === "plans" ? "Plans" : context === "strategy" ? "Strategy" : "Routine";

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
      <AnimatePresence>
        {error && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mt-3 flex items-start gap-2 overflow-hidden rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/20 dark:bg-rose-500/10"
          >
            <p className="flex-1 text-[12px] font-medium text-rose-700 dark:text-rose-400">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 text-rose-400 hover:text-rose-600"
            >
              <IconX size={14} strokeWidth={2} />
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3">
        <AnimatePresence mode="wait">
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

              <m.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-[13px] font-semibold text-neutral-800 dark:text-white/90"
              >
                What would you like to build?
              </m.p>

              <div className="flex w-full flex-col gap-1.5 px-2">
                {STARTER_PROMPTS[context].map((prompt, i) => (
                  <m.button
                    key={prompt}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.06, ease: "easeOut" }}
                    type="button"
                    onClick={() => void handleSend(prompt)}
                    disabled={streaming}
                    whileHover={streaming ? {} : { x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-between rounded-full border border-neutral-200 bg-neutral-50 px-4 py-3 text-left text-[13px] font-medium text-neutral-900 transition hover:border-neutral-300 hover:bg-neutral-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/10"
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-white">
                        <IconSparkles size={14} strokeWidth={2} />
                      </span>
                      {prompt}
                    </span>
                    <IconArrowRight size={14} strokeWidth={2} className="ml-2 shrink-0 text-neutral-400 dark:text-white/70" />
                  </m.button>
                ))}
              </div>
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
                      {isStreamingThis && <StreamingCursor />}
                    </>
                  ) : (
                    <ThinkingStatus isLocal={isLocalProvider} />
                  )}
                </div>
                {msg.action && (
                  <ActionCard
                    action={msg.action}
                    plans={plans}
                    schedule={schedule}
                    activePlan={activePlan}
                    onApply={(updated) => onApplyAction(updated ?? msg.action!)}
                  />
                )}
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
