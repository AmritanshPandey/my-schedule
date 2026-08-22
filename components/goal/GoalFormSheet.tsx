"use client";

import { useEffect, useState } from "react";
import type { Goal, Schedule } from "@/lib/useScheduleDB";
import { createGoal, updateGoal } from "@/lib/goalMutations";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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
    <BottomSheet open={open} onClose={onClose}>
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow={goal ? "Edit" : "New"} title={goal ? "Edit Goal" : "Create Goal"} onClose={onClose} />

        <div className="space-y-2.5">
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Goal — e.g. Get a senior UX design job"
              autoFocus
              maxLength={GOAL_TITLE_MAX}
              onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) handleSubmit(); }}
            />
            <p className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
              {title.length}/{GOAL_TITLE_MAX}
            </p>
          </div>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (optional)"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Start date</p>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Target date</p>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07] dark:[color-scheme:dark]"
              />
            </div>
          </div>
        </div>

        <Button fullWidth onClick={handleSubmit} disabled={!title.trim()}>
          {goal ? "Save Changes" : "Create Goal"}
        </Button>
      </div>
    </BottomSheet>
  );
}
