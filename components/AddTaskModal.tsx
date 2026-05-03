"use client";

import { useEffect, useRef, useState } from "react";
import type { DayKey, Plan, Task } from "@/lib/useScheduleDB";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { accentStyles } from "@/lib/colorSystem";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedPlan = plans.find((plan) => plan.id === draft.planId) ?? null;

  useEffect(() => {
    if (!isOpen) return;
    const initialPlan = plans.find((plan) => plan.id === initialPlanId) ?? null;
    setDraft(initialPlan
      ? { ...emptyDraft(), planId: initialPlan.id, icon: initialPlan.emoji, color: initialPlan.color }
      : emptyDraft()
    );
    setRepeatDays([activeDay]);
    setDropdownOpen(false);
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (dropdownOpen) { setDropdownOpen(false); return; }
        setDraft(emptyDraft());
        setRepeatDays([activeDay]);
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeDay, initialPlanId, isOpen, onClose, plans]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

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
    setDropdownOpen(false);
    onClose();
  }

  function handleClose() {
    setDraft(emptyDraft());
    setRepeatDays([activeDay]);
    setDropdownOpen(false);
    onClose();
  }

  function selectPlan(plan: Plan) {
    setDraft((prev) => ({ ...prev, planId: plan.id, icon: plan.emoji, color: plan.color }));
    setDropdownOpen(false);
  }

  const canSave = !!selectedPlan && !!draft.title.trim() && !!draft.startTime && !!draft.endTime;

  if (!isOpen) return null;

  const selectedAccent = selectedPlan ? accentStyles(selectedPlan.color) : null;
  const selectedIcon = selectedPlan
    ? (SECTION_ICONS.find((i) => i.name === selectedPlan.emoji) ?? SECTION_ICONS[0]).icon
    : null;
  const SelectedIcon = selectedIcon;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-[32px] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
        </div>

        <div className="space-y-4 px-5 pt-4 pb-8 overflow-y-auto max-h-[88vh]">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Add</p>
              <h2 className="text-[18px] font-semibold text-neutral-950 dark:text-white mt-0.5">Task / Activity</h2>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5 transition-colors"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Plan selector */}
          {plans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 p-6 text-center dark:border-white/10">
              <p className="text-[14px] font-semibold text-neutral-700 dark:text-neutral-300">Create a plan first</p>
              <p className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
                Activities need a parent plan before they can be scheduled.
              </p>
            </div>
          ) : (
            <div ref={dropdownRef} className="relative">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Plan</p>

              {/* Trigger */}
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className={`flex h-11 w-full items-center gap-3 rounded-xl border px-3 text-left transition-all ${
                  selectedPlan
                    ? "border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]"
                    : "border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]"
                }`}
              >
                {selectedPlan && SelectedIcon && selectedAccent ? (
                  <>
                    <div className={`h-6 w-6 shrink-0 rounded-lg flex items-center justify-center ${selectedAccent.tint} ${selectedAccent.icon}`}>
                      <SelectedIcon size={13} strokeWidth={2} />
                    </div>
                    <span className="flex-1 text-[14px] font-semibold text-neutral-900 dark:text-white truncate">
                      {selectedPlan.title}
                    </span>
                  </>
                ) : (
                  <span className="flex-1 text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
                    Select a plan…
                  </span>
                )}
                <IconChevronDown
                  size={16}
                  strokeWidth={2}
                  className={`shrink-0 text-neutral-400 transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Dropdown list */}
              {dropdownOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 rounded-2xl border border-neutral-200 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.10)] overflow-hidden dark:border-white/10 dark:bg-neutral-900">
                  <div className="max-h-[220px] overflow-y-auto">
                    {plans.map((plan, i) => {
                      const ic = SECTION_ICONS.find((s) => s.name === plan.emoji) ?? SECTION_ICONS[0];
                      const PlanIcon = ic.icon;
                      const accent = accentStyles(plan.color);
                      const isSelected = selectedPlan?.id === plan.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => selectPlan(plan)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            i > 0 ? "border-t border-neutral-100 dark:border-white/[0.05]" : ""
                          } ${
                            isSelected
                              ? "bg-neutral-50 dark:bg-white/[0.04]"
                              : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${accent.tint} ${accent.icon}`}>
                            <PlanIcon size={14} strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-neutral-900 dark:text-white truncate">
                              {plan.title}
                            </p>
                            {plan.description && (
                              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
                                {plan.description}
                              </p>
                            )}
                          </div>
                          {isSelected && (
                            <div className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center ${accent.tint} ${accent.icon}`}>
                              <IconCheck size={10} strokeWidth={3} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
              className="
             h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]
              "
            />
            <input
              value={draft.description ?? ""}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Short note (optional)"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              className="
              h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]
              "
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
              className="inline-flex flex-1 h-12 items-center justify-center gap-1.5 rounded-2xl bg-neutral-950 text-[15px] font-semibold text-white transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <IconCheck size={16} strokeWidth={2.5} />
              Add Task
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-12 items-center px-5 rounded-2xl border border-neutral-200 text-[14px] font-semibold text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
