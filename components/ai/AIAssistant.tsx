"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconBolt,
  IconBrain,
  IconCalendarPlus,
  IconChartBar,
  IconChevronDown,
  IconFileText,
  IconMap2,
  IconPlus,
  IconRoad,
  IconSend,
  IconSettings,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { AISettingsSheet } from "@/components/ai/AISettingsSheet";
import AIActionSheet, { type ResultItem } from "@/components/ai/AIActionSheet";
import EnableIntelligencePrompt from "@/components/ai/EnableIntelligencePrompt";
import {
  streamGenerateTasks,
  parseGeneratedTasks,
  streamGenerateMilestones,
  parseGeneratedMilestones,
  streamGenerateMilestoneTasks,
  streamWeeklyInsight,
} from "@/lib/aiActions";
import type { AIGeneratedTask, AIGeneratedMilestone } from "@/lib/aiActions";
import type { AIActionResult } from "@/lib/ai";
import type { Plan, Schedule } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { useAIRuntime } from "@/lib/ai/useAIRuntime";
import { useAIActions } from "@/lib/ai/useAIActions";
import type { AIActionType } from "@/lib/ai/runtime";
import { IconLock } from "@tabler/icons-react";

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
  plans: Plan[];
  schedule: Schedule;
  initialPlanId?: string | null;
  ollamaUrl: string;
  ollamaModel: string;
  onAddGeneratedTasks: (tasks: AIGeneratedTask[], planId: string, milestoneId?: string) => void;
  onApplyAction: (action: AIActionResult) => void;
  onNavigateToPlan?: (planId: string) => void;
}

interface SheetConfig {
  title: string;
  contextLabel: string;
  ctaLabel: string;
  quickPicks: string[];
  resultSingular: string;
  resultPlural: string;
  onGenerate: (goal: string, picks: string[]) => AsyncGenerator<string>;
  onParseResults: (raw: string) => ResultItem[];
  onAdd: (items: ResultItem[]) => void;
}

interface Suggestion {
  id: string;
  label: string;
  iconBg: string;
  icon: React.ReactNode;
  onAction: () => void;
  /** Capability tier this action needs; used to lock items above the model's tier. */
  actionType?: AIActionType;
  locked?: boolean;
  lockedReason?: string;
}

function StreamingCursor() {
  return (
    <motion.span
      className="inline-block ml-0.5 h-[12px] w-[2px] rounded-full bg-neutral-500 align-middle"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.85, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function PlanIconEl({ plan }: { plan: Plan }) {
  const entry = SECTION_ICONS.find((s) => s.name === plan.emoji);
  if (!entry) return null;
  return <entry.icon size={12} strokeWidth={2} />;
}

export default function AIAssistant({
  open,
  onClose,
  plans,
  schedule,
  initialPlanId,
  ollamaUrl,
  ollamaModel,
  onAddGeneratedTasks,
  onApplyAction,
  onNavigateToPlan,
}: AIAssistantProps) {
  const runtime = useAIRuntime();
  const ai = useAIActions(ollamaUrl, ollamaModel);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId ?? null);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [showEnablePrompt, setShowEnablePrompt] = useState(false);
  const [customGoal, setCustomGoal] = useState("");
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [sheetConfig, setSheetConfig] = useState<SheetConfig | null>(null);
  const [insightState, setInsightState] = useState<null | "loading" | string>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  useEffect(() => {
    if (initialPlanId !== undefined) setSelectedPlanId(initialPlanId ?? null);
  }, [initialPlanId]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setInsightState(null);
      setPlanPickerOpen(false);
    }
  }, [open]);

  const planMilestones = useMemo(
    () => (schedule.milestones ?? []).filter((m) => m.planId === selectedPlanId),
    [schedule.milestones, selectedPlanId],
  );

  const activeMilestone = useMemo(
    () => planMilestones.find((m) => m.status === "active") ?? planMilestones[0] ?? null,
    [planMilestones],
  );

  const weekContext = useMemo(() => {
    if (!selectedPlan) return "";
    const lines: string[] = [`Plan: "${selectedPlan.title}"`];
    let done = 0, total = 0;
    for (const day of DAYS) {
      const tasks = (schedule.activities[day] ?? []).filter((t) => t.planId === selectedPlan.id);
      total += tasks.length;
      done += tasks.filter((t) => t.completed).length;
    }
    lines.push(`Tasks this week: ${done}/${total} completed`);
    if (activeMilestone) {
      lines.push(`Active milestone: "${activeMilestone.title}" — due ${activeMilestone.plannedEndDate}`);
    }
    const trackers = schedule.progressTrackers.filter((t) => t.planId === selectedPlan.id);
    if (trackers.length > 0) {
      lines.push(`Trackers: ${trackers.map((t) => t.title).join(", ")}`);
    }
    return lines.join(". ");
  }, [selectedPlan, schedule, activeMilestone]);

  const parsedTasksRef = useRef<AIGeneratedTask[]>([]);
  const parsedMilestonesRef = useRef<AIGeneratedMilestone[]>([]);

  function guardAction(fn: () => void) {
    if (!ai.available) {
      setShowEnablePrompt(true);
      return;
    }
    fn();
  }

  function buildTaskSheet(label: string, planCtx?: { title: string; description?: string }): SheetConfig {
    const plan = planCtx ?? { title: selectedPlan?.title ?? "plan", description: selectedPlan?.description };
    const useOllama = !!(ollamaUrl && ollamaModel);
    return {
      title: label,
      contextLabel: selectedPlan?.title ?? "",
      ctaLabel: "Build Tasks",
      quickPicks: ["Mornings", "Evenings", "Weekdays only", "Short sessions", "High intensity"],
      resultSingular: "task",
      resultPlural: "tasks",
      onGenerate: async function* (goal, picks) {
        const hints = [customGoal, goal, ...picks].filter(Boolean).join(". ");
        if (useOllama) {
          yield* streamGenerateTasks(ollamaUrl, ollamaModel, { title: plan.title, description: hints || plan.description });
          return;
        }
        const tasks = await runtime.generateTasks(plan.title, hints || plan.description);
        yield JSON.stringify(tasks);
      },
      onParseResults: (raw) => {
        const tasks = parseGeneratedTasks(raw);
        parsedTasksRef.current = tasks;
        return tasks.map((t, i) => ({
          id: String(i),
          label: t.title,
          meta: `${t.day.charAt(0).toUpperCase() + t.day.slice(1)} · ${t.startTime}–${t.endTime}`,
          badge: t.icon,
        }));
      },
      onAdd: (items) => {
        if (!selectedPlanId) return;
        const indices = new Set(items.map((r) => Number(r.id)));
        onAddGeneratedTasks(
          parsedTasksRef.current.filter((_, i) => indices.has(i)),
          selectedPlanId,
        );
      },
    };
  }

  function buildMilestoneTaskSheet(): SheetConfig {
    return {
      title: `Tasks for "${activeMilestone?.title ?? "milestone"}"`,
      contextLabel: selectedPlan?.title ?? "",
      ctaLabel: "Build Tasks",
      quickPicks: ["Step-by-step", "Quick wins", "Deep work", "Weekly check-ins"],
      resultSingular: "task",
      resultPlural: "tasks",
      onGenerate: async function* (goal, picks) {
        if (!activeMilestone || !selectedPlan) return;
        const hints = [customGoal, goal, ...picks].filter(Boolean).join(". ");
        yield* ai.streamMilestoneTasks(
          { title: activeMilestone.title, description: hints || activeMilestone.description },
          { title: selectedPlan.title, description: selectedPlan.description },
        );
      },
      onParseResults: (raw) => {
        const tasks = parseGeneratedTasks(raw);
        parsedTasksRef.current = tasks;
        return tasks.map((t, i) => ({
          id: String(i),
          label: t.title,
          meta: `${t.day.charAt(0).toUpperCase() + t.day.slice(1)} · ${t.startTime}–${t.endTime}`,
          badge: t.icon,
        }));
      },
      onAdd: (items) => {
        if (!selectedPlanId) return;
        const indices = new Set(items.map((r) => Number(r.id)));
        onAddGeneratedTasks(
          parsedTasksRef.current.filter((_, i) => indices.has(i)),
          selectedPlanId,
          activeMilestone?.id,
        );
      },
    };
  }

  function buildMilestoneSheet(): SheetConfig {
    return {
      title: "Build Milestone Roadmap",
      contextLabel: selectedPlan?.title ?? "",
      ctaLabel: "Build Roadmap",
      quickPicks: ["Quarterly", "Monthly", "Bi-weekly", "Ambitious", "Conservative"],
      resultSingular: "milestone",
      resultPlural: "milestones",
      onGenerate: async function* (goal, picks) {
        if (!selectedPlan) return;
        const hints = [customGoal, goal, ...picks].filter(Boolean).join(". ");
        yield* ai.streamMilestones({
          title: selectedPlan.title,
          description: hints || selectedPlan.description,
          startDate: selectedPlan.startDate,
          endDate: selectedPlan.endDate,
        });
      },
      onParseResults: (raw) => {
        const milestones = parseGeneratedMilestones(raw);
        parsedMilestonesRef.current = milestones;
        return milestones.map((m, i) => ({
          id: String(i),
          label: m.title,
          meta: m.description,
          badge: m.targetDate,
        }));
      },
      onAdd: (items) => {
        const indices = new Set(items.map((r) => Number(r.id)));
        const selected = parsedMilestonesRef.current.filter((_, i) => indices.has(i));
        onApplyAction({ type: "suggest_milestones", payload: { milestones: selected } });
        if (selectedPlanId) onNavigateToPlan?.(selectedPlanId);
      },
    };
  }

  async function handleAnalyzeConsistency() {
    if (!weekContext) return;
    const insightStream = ai.streamWeeklyInsight(weekContext);
    if (!insightStream) return; // needs Ollama for long-context analysis
    setInsightState("loading");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let text = "";
    try {
      for await (const chunk of insightStream) {
        if (controller.signal.aborted) break;
        text += chunk;
        setInsightState(text);
      }
    } catch {
      if (!controller.signal.aborted) setInsightState(null);
    }
  }

  const suggestions: Suggestion[] = useMemo(() => {
    if (!selectedPlan) {
      return [
        {
          id: "new-plan",
          label: "Create a new plan with AI",
          actionType: "generate-plan",
          iconBg: "bg-violet-100 dark:bg-violet-500/15",
          icon: <IconBrain size={14} strokeWidth={2} className="text-violet-600 dark:text-violet-400" />,
          onAction: () => guardAction(() =>
            setSheetConfig(buildTaskSheet("Design a New Plan", { title: customGoal || "new plan", description: customGoal }))
          ),
        },
        {
          id: "morning-routine",
          label: "Design a productive morning routine",
          actionType: "improve-routine",
          iconBg: "bg-amber-100 dark:bg-amber-500/15",
          icon: <IconBolt size={14} strokeWidth={2} className="text-amber-600 dark:text-amber-400" />,
          onAction: () => guardAction(() =>
            setSheetConfig(buildTaskSheet("Morning Routine Tasks", { title: "Morning Routine", description: customGoal || "productive morning routine" }))
          ),
        },
        {
          id: "strategy",
          label: "Write a strategy document",
          actionType: "weekly-insight",
          iconBg: "bg-sky-100 dark:bg-sky-500/15",
          icon: <IconFileText size={14} strokeWidth={2} className="text-sky-600 dark:text-sky-400" />,
          onAction: () => guardAction(() => setAiSettingsOpen(true)),
        },
        {
          id: "roadmap",
          label: "Build a 30-day learning roadmap",
          actionType: "generate-tasks",
          iconBg: "bg-rose-100 dark:bg-rose-500/15",
          icon: <IconMap2 size={14} strokeWidth={2} className="text-rose-600 dark:text-rose-400" />,
          onAction: () => guardAction(() =>
            setSheetConfig(buildTaskSheet("Learning Roadmap Tasks", { title: "30-Day Learning Roadmap", description: customGoal || "systematic learning" }))
          ),
        },
      ];
    }

    const hasMilestones = planMilestones.length > 0;
    const planTaskCount = DAYS.reduce(
      (acc, d) => acc + (schedule.activities[d] ?? []).filter((t) => t.planId === selectedPlan.id).length,
      0,
    );

    const items: Suggestion[] = [];

    if (hasMilestones && activeMilestone) {
      items.push({
        id: "milestone-tasks",
        label: `Generate tasks for "${activeMilestone.title}"`,
        actionType: "generate-tasks",
        iconBg: "bg-violet-100 dark:bg-violet-500/15",
        icon: <IconCalendarPlus size={14} strokeWidth={2} className="text-violet-600 dark:text-violet-400" />,
        onAction: () => guardAction(() => setSheetConfig(buildMilestoneTaskSheet())),
      });
    } else {
      items.push({
        id: "generate-tasks",
        label: "Generate weekly tasks for this plan",
        actionType: "generate-tasks",
        iconBg: "bg-violet-100 dark:bg-violet-500/15",
        icon: <IconCalendarPlus size={14} strokeWidth={2} className="text-violet-600 dark:text-violet-400" />,
        onAction: () => guardAction(() => setSheetConfig(buildTaskSheet("Generate Tasks"))),
      });
    }

    items.push({
      id: hasMilestones ? "expand-milestones" : "build-roadmap",
      label: hasMilestones ? "Add missing milestones to roadmap" : "Build a milestone roadmap",
      actionType: "generate-milestones",
      iconBg: "bg-pink-100 dark:bg-pink-500/15",
      icon: <IconRoad size={14} strokeWidth={2} className="text-pink-600 dark:text-pink-400" />,
      onAction: () => guardAction(() => setSheetConfig(buildMilestoneSheet())),
    });

    items.push({
      id: "consistency",
      label: insightState ? "Refresh consistency analysis" : "Analyze this week's consistency",
      actionType: "weekly-insight",
      iconBg: "bg-emerald-100 dark:bg-emerald-500/15",
      icon: <IconChartBar size={14} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />,
      onAction: () => guardAction(handleAnalyzeConsistency),
    });

    if (planTaskCount > 0) {
      items.push({
        id: "optimize",
        label: "Optimize this week's task schedule",
        actionType: "generate-tasks",
        iconBg: "bg-amber-100 dark:bg-amber-500/15",
        icon: <IconBolt size={14} strokeWidth={2} className="text-amber-600 dark:text-amber-400" />,
        onAction: () => guardAction(() => setSheetConfig(buildTaskSheet("Optimize Task Schedule"))),
      });
    } else {
      items.push({
        id: "strategy-doc",
        label: "Write a strategy document for this plan",
        actionType: "weekly-insight",
        iconBg: "bg-amber-100 dark:bg-amber-500/15",
        icon: <IconFileText size={14} strokeWidth={2} className="text-amber-600 dark:text-amber-400" />,
        onAction: () => guardAction(() => setAiSettingsOpen(true)),
      });
    }

    return items.slice(0, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan, planMilestones, activeMilestone, insightState, customGoal, schedule.activities]);

  // Gate each suggestion by what the current model/backend is trusted to do.
  // Locked items stay visible with a hint instead of disappearing.
  const gatedSuggestions = useMemo(
    () =>
      suggestions.map((s) => {
        if (!s.actionType) return s;
        const a = ai.availability(s.actionType);
        return { ...s, locked: !a.available, lockedReason: a.lockedReason };
      }),
    [suggestions, ai],
  );

  function handleSend() {
    if (!customGoal.trim() || !selectedPlan) return;
    setSheetConfig(buildTaskSheet("Generate Tasks", { title: selectedPlan.title, description: customGoal }));
    setCustomGoal("");
  }

  const panel = (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 shadow-sm shadow-fuchsia-500/25">
            <IconSparkles size={15} strokeWidth={2} className="text-white" />
          </div>
          <span className="text-[15px] font-bold text-neutral-900 dark:text-white tracking-[-0.2px]">
            AI Assistant
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAiSettingsOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
            title="AI Settings"
          >
            <IconSettings size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
          >
            <IconX size={16} strokeWidth={2} />
          </button>
        </div>

        <AISettingsSheet open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">

        {/* Greeting */}
        <div className="mb-5">
          <h2 className="text-[22px] font-bold leading-tight text-neutral-900 dark:text-white tracking-[-0.4px]">
            Hey Amritansh,
          </h2>
          <p className="mt-1 text-[14px] text-neutral-500 dark:text-neutral-400 leading-snug">
            {selectedPlan
              ? `How can I help you move forward with "${selectedPlan.title}"?`
              : "Select a plan and I'll help you move forward."}
          </p>
        </div>

        {/* Enable local intelligence prompt */}
        <AnimatePresence>
          {(showEnablePrompt || (!runtime.enabled && runtime.status === "disabled")) && (
            <EnableIntelligencePrompt
              status={runtime.status}
              downloadProgress={runtime.downloadProgress}
              modelSizeMB={runtime.modelSizeMB}
              onEnable={() => { runtime.enable(); setShowEnablePrompt(false); }}
              onDismiss={() => setShowEnablePrompt(false)}
            />
          )}
          {runtime.enabled && !runtime.modelCached && runtime.status !== "ready" && runtime.status !== "disabled" && (
            <EnableIntelligencePrompt
              status={runtime.status}
              downloadProgress={runtime.downloadProgress}
              modelSizeMB={runtime.modelSizeMB}
              onEnable={runtime.enable}
              onDismiss={() => {}}
            />
          )}
        </AnimatePresence>

        {/* Input card */}
        <div className="mb-5 rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-neutral-900/60">

          {/* Plan context chip */}
          <div className="border-b border-neutral-100 px-3.5 pt-3 pb-2.5 dark:border-white/[0.05]">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPlanPickerOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.07]"
              >
                {selectedPlan ? (
                  <>
                    <span className="text-[11px]">
                      <PlanIconEl plan={selectedPlan} />
                    </span>
                    <span className="max-w-[160px] truncate">{selectedPlan.title}</span>
                  </>
                ) : (
                  <span className="text-neutral-400 dark:text-neutral-500">Select plan</span>
                )}
                <IconChevronDown
                  size={12}
                  strokeWidth={2.5}
                  className={`shrink-0 text-neutral-400 transition-transform duration-150 ${planPickerOpen ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence>
                {planPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute left-0 top-full z-20 mt-1.5 w-[220px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-white/[0.08] dark:bg-neutral-900"
                  >
                    {plans.length === 0 ? (
                      <p className="px-3 py-3 text-[12px] text-neutral-400">No plans yet</p>
                    ) : (
                      plans.map((plan) => {
                        const entry = SECTION_ICONS.find((s) => s.name === plan.emoji);
                        const IconComp = entry?.icon;
                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => { setSelectedPlanId(plan.id); setPlanPickerOpen(false); setInsightState(null); }}
                            className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04] ${
                              plan.id === selectedPlanId
                                ? "text-neutral-900 dark:text-white"
                                : "text-neutral-600 dark:text-neutral-400"
                            }`}
                          >
                            {IconComp && (
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-white/[0.06]">
                                <IconComp size={12} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                              </span>
                            )}
                            <span className="truncate">{plan.title}</span>
                            {plan.id === selectedPlanId && (
                              <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Describe your focus or goal…"
            rows={2}
            className="w-full resize-none bg-transparent px-3.5 py-2.5 text-[14px] text-neutral-900 placeholder-neutral-400 outline-none dark:text-white dark:placeholder-neutral-500"
          />

          {/* Bottom actions */}
          <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2 dark:border-white/[0.05]">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.06]"
            >
              <IconPlus size={16} strokeWidth={2} />
            </button>
            <motion.button
              type="button"
              onClick={handleSend}
              disabled={!customGoal.trim() || !selectedPlan}
              whileTap={{ scale: 0.9 }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 transition-opacity disabled:opacity-30 hover:bg-emerald-600"
            >
              <IconSend size={13} strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>

        {/* Inline insight block */}
        <AnimatePresence>
          {insightState && (
            <motion.div
              key="insight"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-4 overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/5"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
                  Consistency Analysis
                </p>
                <button
                  type="button"
                  onClick={() => { abortRef.current?.abort(); setInsightState(null); }}
                  className="ml-auto text-emerald-400 hover:text-emerald-600"
                >
                  <IconX size={12} strokeWidth={2} />
                </button>
              </div>
              {insightState === "loading" ? (
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.7, 1, 0.7] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed text-emerald-900 dark:text-emerald-100">
                  {insightState}
                  <StreamingCursor />
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action suggestions */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            Action suggestions
          </p>

          <div className="space-y-0.5">
            {gatedSuggestions.map((s) => (
              <motion.button
                key={s.id}
                type="button"
                onClick={s.locked ? undefined : s.onAction}
                disabled={s.locked}
                aria-disabled={s.locked}
                whileTap={s.locked ? undefined : { scale: 0.98 }}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors ${
                  s.locked
                    ? "cursor-default opacity-60"
                    : "hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
                }`}
              >
                <span className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${s.iconBg}`}>
                  {s.icon}
                  {s.locked && (
                    <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-neutral-200 ring-2 ring-white dark:bg-neutral-700 dark:ring-neutral-950">
                      <IconLock size={8} strokeWidth={2.5} className="text-neutral-500 dark:text-neutral-300" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-neutral-800 dark:text-neutral-200 leading-snug">
                    {s.label}
                  </span>
                  {s.locked && s.lockedReason && (
                    <span className="mt-0.5 block text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                      {s.lockedReason}
                    </span>
                  )}
                </span>
              </motion.button>
            ))}

            {/* What else */}
            <motion.button
              type="button"
              onClick={() => textareaRef.current?.focus()}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center text-cyan-500">
                <IconPlus size={15} strokeWidth={2.5} />
              </span>
              <span className="text-[13px] font-medium text-neutral-400 dark:text-neutral-500">
                What else can AI help with?
              </span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Action sheet */}
      {sheetConfig && (
        <AIActionSheet
          open={!!sheetConfig}
          onClose={() => setSheetConfig(null)}
          title={sheetConfig.title}
          contextLabel={sheetConfig.contextLabel}
          ctaLabel={sheetConfig.ctaLabel}
          quickPicks={sheetConfig.quickPicks}
          resultSingular={sheetConfig.resultSingular}
          resultPlural={sheetConfig.resultPlural}
          onGenerate={sheetConfig.onGenerate}
          onParseResults={sheetConfig.onParseResults}
          onAdd={(items) => { sheetConfig.onAdd(items); setSheetConfig(null); }}
        />
      )}
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight="92dvh" className="flex flex-col">
      <div className="h-[84dvh] max-h-[700px] flex flex-col overflow-hidden rounded-t-[28px]">
        {panel}
      </div>
    </BottomSheet>
  );
}
