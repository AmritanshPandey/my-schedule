"use client";

import { useEffect, useState } from "react";
import { categoryFromIcon, type Plan, type Schedule } from "@/lib/useScheduleDB";
import { type AccentColor } from "@/lib/colorSystem";
import { SECTION_ICONS } from "@/components/SectionIcons";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { daysBetween as daysBetweenUtil } from "@/lib/dateUtils";
import { recalculateRoadmapTimeline } from "@/lib/roadmapDates";
import {
  PLAN_TITLE_MAX,
  PlanColorPicker,
  DurationPresets,
  iconPickerClass,
} from "./planFormShared";

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

interface EditPlanSheetProps {
  planId: string | null;
  plan: Plan | null;
  setSchedule: SetScheduleFn;
  onClose: () => void;
}

export default function EditPlanSheet({ planId, plan, setSchedule, onClose }: EditPlanSheetProps) {
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    icon: "brain",
    color: "cyan" as AccentColor,
  });

  // Sync draft when the plan being edited changes
  useEffect(() => {
    if (plan) {
      setDraft({
        title: plan.title,
        description: plan.description ?? "",
        startDate: plan.startDate ?? "",
        endDate: plan.endDate ?? "",
        icon: plan.emoji,
        color: plan.color,
      });
    }
  }, [planId, plan]);

  function handleSave() {
    if (!planId || !draft.title.trim()) return;
    const nextColor = draft.color;
    setSchedule((prev) => {
      const prevPlan = prev.plans.find((p) => p.id === planId);
      const colorChanged = prevPlan?.color !== nextColor;
      const activities = colorChanged
        ? (Object.fromEntries(
            Object.entries(prev.activities).map(([day, tasks]) => [
              day,
              tasks.map((t) => (t.planId === planId ? { ...t, color: nextColor } : t)),
            ])
          ) as typeof prev.activities)
        : prev.activities;
      return {
        ...prev,
        activities,
        plans: prev.plans.map((p) =>
          p.id === planId
            ? {
                ...p,
                title: draft.title.trim(),
                description: draft.description.trim() || undefined,
                startDate: draft.startDate || undefined,
                endDate: draft.endDate || undefined,
                emoji: draft.icon,
                color: nextColor,
                category: categoryFromIcon(draft.icon),
              }
            : p
        ),
        milestones: [
          ...(prev.milestones ?? []).filter((m) => m.planId !== planId),
          ...recalculateRoadmapTimeline(
            (prev.milestones ?? []).filter((m) => m.planId === planId),
            draft.startDate || undefined
          ),
        ],
      };
    });
    onClose();
  }

  const duration = daysBetweenUtil(draft.startDate, draft.endDate);

  return (
    <BottomSheet open={!!planId} onClose={onClose} maxHeight="80vh">
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow="Edit" title="Plan Details" onClose={onClose} />
        <div className="space-y-2.5">
          <div>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Plan title"
              autoFocus
              maxLength={PLAN_TITLE_MAX}
            />
            <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
              {draft.title.length}/{PLAN_TITLE_MAX}
            </p>
          </div>
          <Input
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Short description (optional)"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Start date</p>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                End date{duration ? <span className="normal-case font-normal ml-1">({duration} days)</span> : null}
              </p>
              <input
                type="date"
                value={draft.endDate}
                onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <DurationPresets
            startDate={draft.startDate}
            endDate={draft.endDate}
            onSelect={(s, e) => setDraft((d) => ({ ...d, startDate: s, endDate: e }))}
          />

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Icon</p>
            <div className="grid grid-cols-5 gap-1.5">
              {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
                const sel = draft.icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={label}
                    onClick={() => setDraft((d) => ({ ...d, icon: name }))}
                    className={iconPickerClass(sel)}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span className="text-[9px] font-semibold leading-none">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <PlanColorPicker
            value={draft.color}
            onChange={(c) => setDraft((d) => ({ ...d, color: c }))}
          />
        </div>
        <Button
          fullWidth
          onClick={handleSave}
          disabled={!draft.title.trim()}
        >
          Save Changes
        </Button>
      </div>
    </BottomSheet>
  );
}
