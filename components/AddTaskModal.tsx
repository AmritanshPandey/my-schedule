"use client";

import { useEffect, useState } from "react";
import type { Plan, Task } from "@/lib/useScheduleDB";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import { accentStyles, colorFromIcon } from "@/lib/colorSystem";
import { IconCheck, IconX } from "@tabler/icons-react";

function emptyDraft(): Omit<Task, "id"> {
  return {
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    icon: "briefcase",
    color: colorFromIcon("briefcase"),
    planId: undefined,
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

function calcDuration(start: string, end: string): string | null {
  const toMin = (v: string) => {
    const m = v.match(/^(\d{2}):(\d{2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null || e <= s) return null;
  const total = e - s;
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (h > 0 && min > 0) return `${h}h ${min}m`;
  if (h > 0) return `${h}h`;
  return `${min}m`;
}

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, "id">) => void;
  plans: Plan[];
}

export default function AddTaskModal({ isOpen, onClose, onSave, plans }: AddTaskModalProps) {
  const [draft, setDraft] = useState<Omit<Task, "id">>(emptyDraft);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  function handleSave() {
    const title = draft.title.trim();
    const startTime = inputToDisplay(draft.startTime);
    const endTime = inputToDisplay(draft.endTime);
    if (!title || !startTime || !endTime) return;
    onSave({ ...draft, title, startTime, endTime, description: draft.description?.trim() || undefined });
    setDraft(emptyDraft());
    onClose();
  }

  function handleClose() {
    setDraft(emptyDraft());
    onClose();
  }

  function selectPlan(plan: Plan) {
    const deselect = draft.planId === plan.id;
    setDraft((prev) => ({
      ...prev,
      planId: deselect ? undefined : plan.id,
      icon: deselect ? prev.icon : plan.emoji,
      color: deselect ? prev.color : plan.color,
    }));
  }

  const duration = calcDuration(draft.startTime, draft.endTime);
  const ac = accentStyles(draft.color);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md mx-auto bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between gap-3 px-5 py-4 border-b border-neutral-100 dark:border-white/[0.07] ${ac.tint}`}>
          <div className="flex items-center gap-2.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${ac.iconSolid}`}>
              {(() => {
                const ic = SECTION_ICONS.find((i) => i.name === draft.icon);
                const I = (ic ?? SECTION_ICONS[0]).icon;
                return <I size={14} strokeWidth={2} />;
              })()}
            </div>
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              Add Task / Activity
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.07] transition-colors"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 p-5 overflow-y-auto max-h-[82vh]">
          {/* Icon picker */}
          <div className="grid grid-cols-5 gap-1.5">
            {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
              const ic = getIconPickerStyle(name);
              const sel = draft.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={label}
                  onClick={() => setDraft((prev) => ({ ...prev, icon: name, color: colorFromIcon(name) }))}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-all duration-150 ${
                    sel ? `${ic.solid} shadow-sm scale-[1.04]` : `${ic.tint} ${ic.text} hover:scale-[1.04]`
                  }`}
                >
                  <Icon size={17} strokeWidth={1.5} />
                  <span className={`text-[9px] font-semibold leading-none ${sel ? "text-white/80" : ""}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

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

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Start</p>
              <input
                type="time"
                value={draft.startTime}
                onChange={(e) => setDraft((prev) => ({ ...prev, startTime: e.target.value }))}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                End{duration && <span className="ml-1 font-normal text-neutral-400">· {duration}</span>}
              </p>
              <input
                type="time"
                value={draft.endTime}
                onChange={(e) => setDraft((prev) => ({ ...prev, endTime: e.target.value }))}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
              />
            </div>
          </div>

          {/* Plan link */}
          {plans.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Link to plan
              </p>
              <div className="flex flex-wrap gap-1.5">
                {plans.map((plan) => {
                  const ic = SECTION_ICONS.find((i) => i.name === plan.emoji);
                  const PI = (ic ?? SECTION_ICONS[0]).icon;
                  const sel = draft.planId === plan.id;
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

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              className={`inline-flex flex-1 h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 ${ac.iconSolid}`}
            >
              <IconCheck size={15} />
              Add Task
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
