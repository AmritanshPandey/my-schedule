"use client";

import { useEffect, useMemo, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { Milestone } from "@/lib/useScheduleDB";
import {
  calculateMilestoneEndDate,
  calculateNextMilestoneStart,
  normalizeDurationToDays,
  shiftFutureMilestones,
  type DurationType,
} from "@/lib/roadmapDates";
import { formatDate } from "@/lib/dateUtils";

export interface MilestoneSaveData {
  title: string;
  description?: string;
  startDate: string;
  plannedDurationDays: number;
  plannedEndDate: string;
  actualCompletedDate?: string;
  status: Milestone["status"];
  linkedActivities: string[];
  linkedTrackers: string[];
  sortOrder: number;
  targetDate?: string;
  estimatedDays?: number;
  linkedTrackerId?: string;
  completionStatus?: "pending" | "completed";
  completedDate?: string;
}

interface MilestoneSheetProps {
  mode: "create" | "edit";
  milestone?: Milestone | null;
  milestones: Milestone[];
  planStartDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: MilestoneSaveData) => void;
}

interface DraftState {
  title: string;
  description: string;
  startDate: string;
  durationValue: string;
  durationType: DurationType;
}

const DURATION_TYPES: Array<{ value: DurationType; label: string }> = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function inferDurationDraft(days: number): Pick<DraftState, "durationValue" | "durationType"> {
  if (days % 30 === 0) return { durationValue: String(days / 30), durationType: "months" };
  if (days % 7 === 0) return { durationValue: String(days / 7), durationType: "weeks" };
  return { durationValue: String(days), durationType: "days" };
}

function defaultStartDate(
  mode: "create" | "edit",
  milestone: Milestone | null | undefined,
  milestones: Milestone[],
  planStartDate?: string
): string {
  if (mode === "edit" && milestone) return milestone.startDate;
  const ordered = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);
  const last = ordered[ordered.length - 1];
  if (last) return calculateNextMilestoneStart(last.plannedEndDate);
  return planStartDate || new Date().toISOString().split("T")[0];
}

function emptyDraft(startDate: string): DraftState {
  return {
    title: "",
    description: "",
    startDate,
    durationValue: "7",
    durationType: "days",
  };
}

function milestoneToDraft(milestone: Milestone): DraftState {
  const duration = inferDurationDraft(milestone.plannedDurationDays);
  return {
    title: milestone.title,
    description: milestone.description ?? "",
    startDate: milestone.startDate,
    durationValue: duration.durationValue,
    durationType: duration.durationType,
  };
}

export default function MilestoneSheet({
  mode,
  milestone,
  milestones,
  planStartDate,
  isOpen,
  onClose,
  onSave,
}: MilestoneSheetProps) {
  const [draft, setDraft] = useState<DraftState>(() =>
    emptyDraft(defaultStartDate(mode, milestone, milestones, planStartDate))
  );

  const orderedMilestones = useMemo(
    () => [...milestones].sort((a, b) => a.sortOrder - b.sortOrder),
    [milestones]
  );
  const milestoneIndex = milestone
    ? orderedMilestones.findIndex((item) => item.id === milestone.id)
    : -1;
  const canEditStartDate = mode === "create"
    ? orderedMilestones.length === 0
    : milestoneIndex <= 0;

  useEffect(() => {
    if (!isOpen) return;
    const startDate = defaultStartDate(mode, milestone, milestones, planStartDate);
    setDraft(mode === "edit" && milestone ? milestoneToDraft(milestone) : emptyDraft(startDate));
  }, [isOpen, mode, milestone, milestones, planStartDate]);

  const durationValue = Number(draft.durationValue);
  const plannedDurationDays = normalizeDurationToDays(durationValue, draft.durationType);
  const plannedEndDate = draft.startDate
    ? calculateMilestoneEndDate(draft.startDate, plannedDurationDays)
    : "";

  const preview = useMemo(() => {
    if (mode !== "edit" || !milestone || !draft.startDate || !plannedEndDate) return null;
    const recalculated = shiftFutureMilestones(
      orderedMilestones,
      milestone.id,
      {
        startDate: draft.startDate,
        plannedDurationDays,
        plannedEndDate,
      },
      canEditStartDate ? draft.startDate : planStartDate
    );
    const originalFuture = orderedMilestones.filter((item) => item.sortOrder > milestone.sortOrder);
    const recalculatedFuture = recalculated.filter((item) => item.sortOrder > milestone.sortOrder);
    const firstOriginal = originalFuture[0];
    const firstRecalculated = recalculatedFuture[0];
    const shiftDays = firstOriginal && firstRecalculated
      ? daysBetween(firstOriginal.startDate, firstRecalculated.startDate)
      : plannedDurationDays - milestone.plannedDurationDays;

    return {
      count: originalFuture.length,
      shiftDays,
    };
  }, [
    canEditStartDate,
    draft.startDate,
    milestone,
    mode,
    orderedMilestones,
    planStartDate,
    plannedDurationDays,
    plannedEndDate,
  ]);

  function handleSave() {
    const title = draft.title.trim();
    if (!title || !draft.startDate || !plannedEndDate) return;
    const status = milestone?.status === "completed" ? "completed" : "upcoming";
    onSave({
      title,
      description: draft.description.trim() || undefined,
      startDate: draft.startDate,
      plannedDurationDays,
      plannedEndDate,
      actualCompletedDate: milestone?.actualCompletedDate,
      status,
      linkedActivities: milestone?.linkedActivities ?? [],
      linkedTrackers: milestone?.linkedTrackers ?? [],
      sortOrder: milestone?.sortOrder ?? orderedMilestones.length,
      targetDate: plannedEndDate,
      estimatedDays: plannedDurationDays,
      linkedTrackerId: milestone?.linkedTrackers[0],
      completionStatus: status === "completed" ? "completed" : "pending",
      completedDate: milestone?.actualCompletedDate,
    });
    onClose();
  }

  const eyebrow = mode === "edit" ? "Edit" : "New";
  const title = mode === "edit" ? "Edit Milestone" : "Add Milestone";
  const canSave = !!draft.title.trim() && !!draft.startDate && plannedDurationDays > 0;

  return (
    <BottomSheet open={isOpen} onClose={onClose} maxHeight="85vh">
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow={eyebrow} title={title} onClose={onClose} />

        <div className="space-y-3">
          <Input
            label="Title"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="e.g. Build Running Habit"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) handleSave();
            }}
          />

          <Input
            label="Description (optional)"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Brief description..."
          />

          {/* Start Date — full width row */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Start Date
            </p>
            <input
              type="date"
              value={draft.startDate}
              disabled={!canEditStartDate}
              onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
              className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
            />
          </div>

          {/* Duration — full width row, number + unit in flex */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Duration
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={draft.durationValue}
                onChange={(e) => setDraft((d) => ({ ...d, durationValue: e.target.value }))}
                placeholder="14"
                className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
              />
              <select
                value={draft.durationType}
                onChange={(e) => setDraft((d) => ({ ...d, durationType: e.target.value as DurationType }))}
                className="h-11 w-[120px] shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] font-semibold text-neutral-700 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
              >
                {DURATION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Calculated End
            </p>
            <p className="mt-1 text-[15px] font-bold text-neutral-900 dark:text-white">
              {draft.startDate && plannedEndDate
                ? `${formatDate(draft.startDate)} - ${formatDate(plannedEndDate)}`
                : "Set a start date"}
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
              {plannedDurationDays} {plannedDurationDays === 1 ? "day" : "days"}
            </p>
          </div>

          {preview && preview.count > 0 && preview.shiftDays !== 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                This change will shift {preview.count} future milestone{preview.count === 1 ? "" : "s"} by {preview.shiftDays > 0 ? "+" : ""}{preview.shiftDays} days.
              </p>
            </div>
          )}

        </div>

        <Button fullWidth onClick={handleSave} disabled={!canSave}>
          {mode === "edit" ? "Save Changes" : "Add Milestone"}
        </Button>
      </div>
    </BottomSheet>
  );
}
