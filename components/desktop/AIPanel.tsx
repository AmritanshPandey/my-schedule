"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconArrowRight, IconBrain, IconEraser, IconSend, IconSparkles, IconX } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";
import { streamOllamaChat, parseAIAction, buildSystemPrompt, buildPlanContext } from "@/lib/ai";
import type { AIActionResult } from "@/lib/ai";
import type { Plan, Ritual } from "@/lib/useScheduleDB";
import { DEFAULT_OLLAMA_MODEL } from "@/lib/ai";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import type { AITask } from "@/lib/ai";

interface Message {
  role: "user" | "assistant";
  text: string;
  action?: AIActionResult;
}

interface AIPanelProps {
  ollamaUrl: string;
  ollamaModel: string;
  context: "plans" | "routine" | "strategy";
  plans: Plan[];
  rituals: Ritual[];
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
};

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-0.5 py-1">
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
          animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
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
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-neutral-200 px-1 py-0.5 text-[9px] font-bold text-neutral-600 dark:bg-white/[0.10] dark:text-neutral-400">
                        {DAY_SHORT[t.day] ?? t.day}
                      </span>
                      <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">{t.title}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-neutral-400">{t.startTime}–{t.endTime}</span>
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

function ActionCard({ action, onApply }: { action: AIActionResult; onApply: (updated?: AIActionResult) => void }) {
  if (action.type === "create_plan") {
    return <PlanDraftCard action={action} onApply={onApply} />;
  }

  if (action.type === "suggest_milestones") return null;
  const title = action.payload.title;
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
      className="mt-2 rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white p-3 dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-neutral-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
            {ACTION_LABELS[action.type]}
          </span>
          <p className="mt-1 truncate text-[13px] font-semibold text-neutral-900 dark:text-white">{title}</p>
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
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-black/10 px-1 font-mono text-[11px] dark:bg-white/10">{children}</code>
  ),
};

const STARTER_PROMPTS: Record<"plans" | "routine" | "strategy", string[]> = {
  plans: [
    "Create a 30-day fitness plan",
    "Build a 90-day learning roadmap",
    "Design a personal project plan",
  ],
  routine: [
    "Design a productive morning routine",
    "Create an evening wind-down ritual",
    "Build a focused deep work habit",
  ],
  strategy: [
    "Write a progressive overload program",
    "Create a language learning strategy",
    "Design a habit stacking system",
  ],
};

function stripJsonBlocks(text: string): string {
  return text.replace(/```json[\s\S]*?```/g, "").trim();
}

export function AIPanel({ ollamaUrl, ollamaModel, context, plans, rituals, activePlan, initialMessage, onApplyAction, onClose }: AIPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const didAutoSend = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const model = ollamaModel || DEFAULT_OLLAMA_MODEL;

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
      for await (const chunk of streamOllamaChat(ollamaUrl, model, history, systemPrompt, context === "strategy", controller.signal)) {
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
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[30px] bg-neutral-950 text-white shadow-[0_40px_120px_rgba(15,23,42,0.35)] ring-1 ring-white/5">
      <div className="flex h-[76px] shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/95 px-4 shadow-sm shadow-black/10 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-3xl bg-blue-500/10 ring-1 ring-blue-500/15 dark:bg-blue-500/10">
            <IconSparkles size={18} strokeWidth={2} className="text-blue-600 dark:text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">AI Assistant</p>
            <p className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">
              {contextLabel}{activePlan ? ` · ${activePlan.title}` : ""} · {model}
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
              {error.includes("not reachable") && (
                <span className="mt-1 block text-[11px] text-rose-500">
                  Run: <code className="font-mono">ollama serve</code> then{" "}
                  <code className="font-mono">ollama pull {model}</code>
                </span>
              )}
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
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
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
                className="flex h-11 w-11 items-center justify-center rounded-3xl bg-white/10 ring-1 ring-white/10"
              >
                <IconBrain size={20} strokeWidth={1.5} className="text-white" />
              </m.div>

              <m.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-[13px] font-semibold text-white/90"
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
                    className="flex items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-3 text-left text-[13px] font-medium text-white shadow-sm shadow-black/20 transition hover:border-white/20 hover:bg-white/10"
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                        <IconSparkles size={14} strokeWidth={2} />
                      </span>
                      {prompt}
                    </span>
                    <IconArrowRight size={14} strokeWidth={2} className="ml-2 shrink-0 text-white/70" />
                  </m.button>
                ))}
              </div>

              {!ollamaUrl.includes("localhost") && (
                <m.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="max-w-[220px] rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
                >
                  Non-localhost URL detected. Make sure Ollama CORS allows this origin.
                </m.p>
              )}
            </m.div>
          )}
        </AnimatePresence>

        {messages.map((msg, i) => {
          const isStreamingThis = streaming && i === messages.length - 1 && msg.role === "assistant";
          const bubbleClass = msg.role === "user"
            ? "ml-auto rounded-[26px] rounded-br-[10px] bg-blue-600 text-white shadow-blue-600/20"
            : "mr-auto rounded-[26px] rounded-bl-[10px] border border-white/10 bg-white/5 text-white shadow-black/20";
          return (
            <m.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                <div className={`rounded-[26px] px-4 py-3 text-[13px] leading-relaxed ${bubbleClass}`}>
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
                    <ThinkingDots />
                  )}
                </div>
                {msg.action && (
                  <ActionCard
                    action={msg.action}
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
      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <m.div
          animate={focused ? { boxShadow: "0 0 0 2px rgba(59,130,246,0.16)" } : { boxShadow: "0 0 0 0px rgba(59,130,246,0)" }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-2 rounded-[28px] border border-white/10 bg-white/5 px-3 py-2 shadow-sm shadow-black/20 transition-colors"
          style={{ borderColor: focused ? "rgba(59,130,246,0.25)" : undefined }}
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
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none bg-transparent text-[13px] text-white outline-none placeholder:text-white/50 disabled:opacity-50"
            style={{ minHeight: "22px", maxHeight: "80px" }}
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
        <p className="mt-1.5 text-[10px] text-white/50">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
