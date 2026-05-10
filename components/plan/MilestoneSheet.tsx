"use client";

import { useEffect, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { Milestone } from "@/lib/useScheduleDB";

interface MilestoneSheetProps {
  mode: "create" | "edit";
  milestone?: Milestone | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Milestone, "id" | "planId">) => void;
}

interface DraftState {
  title: string;
  description: string;
  targetDate: string;
  estimatedDays: string;
  notes: string;
}

function emptyDraft(): DraftState {
  return { title: "", description: "", targetDate: "", estimatedDays: "", notes: "" };
}

function milestoneToDraft(m: Milestone): DraftState {
  return {
    title: m.title,
    description: m.description ?? "",
    targetDate: m.targetDate ?? "",
    estimatedDays: m.estimatedDays != null ? String(m.estimatedDays) : "",
    notes: m.notes ?? "",
  };
}

export default function MilestoneSheet({
  mode,
  milestone,
  isOpen,
  onClose,
  onSave,
}: MilestoneSheetProps) {
  const [draft, setDraft] = useState<DraftState>(emptyDraft);

  useEffect(() => {
    if (isOpen) {
      setDraft(mode === "edit" && milestone ? milestoneToDraft(milestone) : emptyDraft());
    }
  }, [isOpen, mode, milestone]);

  function handleSave() {
    const title = draft.title.trim();
    if (!title) return;
    const estimatedDaysNum = draft.estimatedDays.trim()
      ? Number(draft.estimatedDays.trim())
      : undefined;
    onSave({
      title,
      description: draft.description.trim() || undefined,
      targetDate: draft.targetDate || undefined,
      estimatedDays: estimatedDaysNum && !isNaN(estimatedDaysNum) ? estimatedDaysNum : undefined,
      notes: draft.notes.trim() || undefined,
      completionStatus: milestone?.completionStatus ?? "pending",
      completedDate: milestone?.completedDate,
      linkedTrackerId: milestone?.linkedTrackerId,
      sortOrder: 0,
    });
    onClose();
  }

  const eyebrow = mode === "edit" ? "Edit" : "New";
  const title = mode === "edit" ? "Edit Milestone" : "Add Milestone";

  return (
    <BottomSheet open={isOpen} onClose={onClose} maxHeight="85vh">
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow={eyebrow} title={title} onClose={onClose} />

        <div className="space-y-3">
          <Input
            label="Title"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="e.g. Run 5km Continuously"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.title.trim()) handleSave();
            }}
          />

          <Input
            label="Description (optional)"
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Brief description…"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                Target Date
              </p>
              <input
                type="date"
                value={draft.targetDate}
                onChange={(e) => setDraft((d) => ({ ...d, targetDate: e.target.value }))}
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-900 outline-none focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] transition-colors"
              />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                Duration (days)
              </p>
              <input
                type="number"
                min="1"
                value={draft.estimatedDays}
                onChange={(e) => setDraft((d) => ({ ...d, estimatedDays: e.target.value }))}
                placeholder="e.g. 30"
                className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-900 outline-none focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] transition-colors"
              />
            </div>
          </div>

          <Input
            label="Notes (optional)"
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Any additional notes…"
          />
        </div>

        <Button fullWidth onClick={handleSave} disabled={!draft.title.trim()}>
          {mode === "edit" ? "Save Changes" : "Add Milestone"}
        </Button>
      </div>
    </BottomSheet>
  );
}
