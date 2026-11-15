"use client";

import { useEffect, useMemo, useState } from "react";
import type { Goal, Schedule } from "@/lib/useScheduleDB";
import { createGoal, updateGoal } from "@/lib/goalMutations";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input, { FORM_LABEL } from "@/components/ui/Input";
import { STICKY_SHEET_FOOTER } from "@/components/ui/FormChips";
import BuilderHints from "@/components/intelligence/BuilderHints";
import { reviewGoalDraft } from "@/lib/intelligence/builderChecks";
import DateInput from "@/components/ui/DateInput";

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

export const GOAL_TITLE_MAX = 60;

interface GoalFormSheetProps {
  open: boolean;
  onClose: () => void;
  setSchedule: SetScheduleFn;
  /** Present = edit this Goal. Absent/null = create a new one. */
  goal?: Goal | null;
}

/**
 * Single shared create/edit form — a Goal's fields (title, description,
 * start/target date) are simple enough that, unlike Plans, one form covers
 * both modes.
 */
export default function GoalFormSheet({ open, onClose, setSchedule, goal }: GoalFormSheetProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? "");
    setDescription(goal?.description ?? "");
    setStartDate(goal?.startDate ?? "");
    setTargetDate(goal?.targetDate ?? "");
  }, [open, goal]);

  // Advisory only — a vague or undated goal still saves.
  const hints = useMemo(
    () => reviewGoalDraft({ title, description, startDate, targetDate }),
    [title, description, startDate, targetDate],
  );

  function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    if (goal) {
      setSchedule((prev) =>
        updateGoal(prev, goal.id, {
          title: trimmedTitle,
          description,
          startDate,
          targetDate,
        })
      );
    } else {
      setSchedule((prev) =>
        createGoal(prev, {
          title: trimmedTitle,
          description,
          startDate,
          targetDate,
        })
      );
    }
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} className="scroll-pb-24">
      <div className="space-y-6 px-5 pt-5">
        <SheetHeader eyebrow={goal ? "Edit" : "New"} title={goal ? "Edit goal" : "Create goal"} onClose={onClose} />

        <div className="space-y-5">
          <div>
            <Input
              label="Goal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Get a senior UX design job"
              autoFocus
              maxLength={GOAL_TITLE_MAX}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) handleSubmit(); }}
            />
            <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {title.length}/{GOAL_TITLE_MAX}
            </p>
          </div>
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why it matters, in a line"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={FORM_LABEL}>Start date</p>
              <DateInput value={startDate} onChange={(v) => setStartDate(v)} />
            </div>
            <div>
              <p className={FORM_LABEL}>Target date</p>
              <DateInput value={targetDate} onChange={(v) => setTargetDate(v)} />
            </div>
          </div>
        </div>

        <BuilderHints hints={hints} />

        <div className={STICKY_SHEET_FOOTER}>
          <Button fullWidth onClick={handleSubmit} disabled={!title.trim()}>
            {goal ? "Save changes" : "Create goal"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
