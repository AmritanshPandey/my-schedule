"use client";

import { useEffect, useState } from "react";
import type { DayKey, Plan, Task } from "@/lib/useScheduleDB";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { accentStyles } from "@/lib/colorSystem";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import { IconCheck, IconPlus, IconX } from "@tabler/icons-react";

function emptyDraft(): Omit<Task, "id"> {
  return {
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    icon: "briefcase",
    color: "cyan",
    planId: "",
  };
}

function inputToDisplay(value: string): string {
  const m = value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return value.trim();
  let h = Number(m[1]);
  const min = m[2];
  const suf = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h.toString().padStart(2, "0")}:${min} ${suf}`;
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, "id">, repeatDays: DayKey[]) => void;
  plans: Plan[];
  activeDay: DayKey;
  initialPlanId?: string | null;
}

export default function AddTaskModal({ isOpen, onClose, onSave, plans, activeDay, initialPlanId }: AddTaskModalProps) {
  const [draft, setDraft] = useState<Omit<Task, "id">>(emptyDraft);
  const [repeatDays, setRepeatDays] = useState<DayKey[]>([activeDay]);
  const selectedPlan = plans.find((plan) => plan.id === draft.planId) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const initialPlan = plans.find((plan) => plan.id === initialPlanId) ?? null;
    setDraft(initialPlan
      ? { ...emptyDraft(), planId: initialPlan.id, icon: initialPlan.emoji, color: initialPlan.color }
      : emptyDraft()
    );
    setRepeatDays([activeDay]);
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDraft(emptyDraft());
        setRepeatDays([activeDay]);
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeDay, initialPlanId, isOpen, onClose, plans]);

  function handleSave() {
    const title = draft.title.trim();
    const startTime = inputToDisplay(draft.startTime);
    const endTime = inputToDisplay(draft.endTime);
    if (!title || !startTime || !endTime || !selectedPlan) return;
    onSave({
      ...draft,
      title,
      startTime,
      endTime,
      icon: selectedPlan.emoji,
      color: selectedPlan.color,
      planId: selectedPlan.id,
      description: draft.description?.trim() || undefined,
    }, repeatDays);
    setDraft(emptyDraft());
    setRepeatDays([activeDay]);
    onClose();
  }

  function handleClose() {
    setDraft(emptyDraft());
    setRepeatDays([activeDay]);
    onClose();
  }

  function selectPlan(plan: Plan) {
    setDraft((prev) => ({
      ...prev,
      planId: plan.id,
      icon: plan.emoji,
      color: plan.color,
    }));
  }

  const canSave = !!selectedPlan && !!draft.title.trim() && !!draft.startTime && !!draft.endTime;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md mx-auto bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
        {/* Form */}
        <div className="space-y-4 p-5 overflow-y-auto max-h-[82vh]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">Add Task / Activity</p>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-white/[0.07] dark:hover:text-neutral-300"
            >
              <IconX size={16} />
            </button>
          </div>

          {plans.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 p-5 text-center dark:border-white/10">
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Create a plan to start organizing activities and tracking progress.
              </p>
              <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                Activities need a parent plan before they can be scheduled.
              </p>
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Plan
              </p>
              <div className="flex flex-wrap gap-1.5">
                {plans.map((plan) => {
                  const ic = SECTION_ICONS.find((i) => i.name === plan.emoji);
                  const PI = (ic ?? SECTION_ICONS[0]).icon;
                  const sel = selectedPlan?.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => selectPlan(plan)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                        sel
                          ? `${accentStyles(plan.color).iconSolid} shadow-sm`
                          : `${accentStyles(plan.color).tint} ${accentStyles(plan.color).text} hover:opacity-90`
                      }`}
                    >
                      <PI size={11} strokeWidth={2} />
                      {plan.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Title + note */}
          <div className="space-y-2">
            <input
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Task title"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
            <input
              value={draft.description ?? ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Short note (optional)"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
          </div>

          <TimeSlotPicker
            startTime={draft.startTime}
            endTime={draft.endTime}
            onStartChange={(startTime) => setDraft((prev) => ({ ...prev, startTime }))}
            onEndChange={(endTime) => setDraft((prev) => ({ ...prev, endTime }))}
            activeDay={activeDay}
            repeatDays={repeatDays}
            onRepeatDaysChange={setRepeatDays}
          />

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="inline-flex flex-1 h-10 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              {plans.length === 0 ? <IconPlus size={15} /> : <IconCheck size={15} />}
              Add Task
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
