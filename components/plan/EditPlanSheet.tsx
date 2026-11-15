"use client";

import { useEffect, useState } from "react";
import { categoryFromIcon, type Plan, type Schedule, type Goal } from "@/lib/useScheduleDB";
import { type AccentColor } from "@/lib/colorSystem";
import { SECTION_ICONS } from "@/components/SectionIcons";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input, { FORM_LABEL } from "@/components/ui/Input";
import { STICKY_SHEET_FOOTER } from "@/components/ui/FormChips";
import { daysBetween as daysBetweenUtil } from "@/lib/dateUtils";
import { recalculateRoadmapTimeline } from "@/lib/roadmapDates";
import { constrainTaskToPlanWindow } from "@/lib/planTaskWindow";
import { typography } from "@/components/ui/Typography";
import {
  PLAN_TITLE_MAX,
  DurationPresets,
  iconPickerClass,
} from "./planFormShared";
import DateInput from "@/components/ui/DateInput";

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

interface EditPlanSheetProps {
  planId: string | null;
  plan: Plan | null;
  setSchedule: SetScheduleFn;
  onClose: () => void;
  /** First-class Goals available to optionally link this Plan to. Omitted /
   * empty simply hides the picker — the relationship is always optional. */
  goals?: Goal[];
}

export default function EditPlanSheet({ planId, plan, setSchedule, onClose, goals = [] }: EditPlanSheetProps) {
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
    icon: "brain",
    color: "cyan" as AccentColor,
    goalId: "",
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
        goalId: plan.goalId ?? "",
      });
    }
  }, [planId, plan]);

  function handleSave() {
    if (!planId || !draft.title.trim()) return;
    const nextColor = draft.color;
    // Editing a plan never touches its tasks' colours: colour belongs to the
    // task (derived from its icon, overridable), so a plan-level edit must not
    // stomp choices the user made per task.
    setSchedule((prev) => {
      const existingPlan = prev.plans.find((item) => item.id === planId);
      if (!existingPlan) return prev;
      const updatedPlan = {
        ...existingPlan,
        startDate: draft.startDate || undefined,
        endDate: draft.endDate || undefined,
      };
      return {
        ...prev,
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
                goalId: draft.goalId || undefined,
              }
            : p
        ),
        activities: Object.fromEntries(
          Object.entries(prev.activities).map(([day, tasks]) => [
            day,
            tasks.map((task) =>
              task.planId === planId ? constrainTaskToPlanWindow(task, updatedPlan) : task
            ),
          ])
        ) as Schedule["activities"],
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
    <BottomSheet open={!!planId} onClose={onClose} maxHeight="80vh" className="scroll-pb-24">
      <div className="space-y-7 px-5 pt-5">
        <SheetHeader eyebrow="Edit" title="Plan details" onClose={onClose} />
        <div className="space-y-5">
          <div>
            <Input
              label="Title"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Plan title"
              autoFocus
              maxLength={PLAN_TITLE_MAX}
            />
            <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {draft.title.length}/{PLAN_TITLE_MAX}
            </p>
          </div>
          <Input
            label="Description (optional)"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="What it's for, in a line"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={FORM_LABEL}>Start date</p>
              <DateInput value={draft.startDate} onChange={(v) => setDraft((d) => ({ ...d, startDate: v }))} />
            </div>
            <div>
              <p className={FORM_LABEL}>
                End date{duration ? <span className="normal-case font-normal ml-1">({duration} days)</span> : null}
              </p>
              <DateInput value={draft.endDate} onChange={(v) => setDraft((d) => ({ ...d, endDate: v }))} />
            </div>
          </div>

          <DurationPresets
            startDate={draft.startDate}
            endDate={draft.endDate}
            onSelect={(s, e) => setDraft((d) => ({ ...d, startDate: s, endDate: e }))}
          />

          {goals.length > 0 && (
            <div>
              <p className={FORM_LABEL}>
                Goal <span className="normal-case font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
              </p>
              <select
                value={draft.goalId}
                onChange={(e) => setDraft((d) => ({ ...d, goalId: e.target.value }))}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              >
                <option value="">No goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className={`mb-2 ${typography.eyebrow}`}>Icon</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
                const sel = draft.icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={label}
                    onClick={() => setDraft((d) => ({ ...d, icon: name }))}
                    aria-pressed={sel}
                    className={`${iconPickerClass(sel)} min-h-16`}
                  >
                    <Icon size={22} strokeWidth={1.6} />
                    <span className="text-[11px] font-semibold leading-tight">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plans are neutral — identity comes from the icon, colour from tasks. */}
        </div>
        <div className={STICKY_SHEET_FOOTER}>
          <Button fullWidth onClick={handleSave} disabled={!draft.title.trim()}>
            Save changes
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
