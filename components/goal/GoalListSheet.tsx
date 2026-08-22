"use client";

import { useState } from "react";
import type { Goal, Schedule } from "@/lib/useScheduleDB";
import { archiveGoal, completeGoal, plansForGoal } from "@/lib/goalMutations";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import IconButton from "@/components/ui/IconButton";
import {
  IconTargetArrow,
  IconPlus,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import GoalFormSheet from "./GoalFormSheet";

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

interface GoalListSheetProps {
  open: boolean;
  onClose: () => void;
  schedule: Schedule;
  setSchedule: SetScheduleFn;
  /** Parent owns the confirm-then-delete flow (same pattern as onDeletePlan). */
  onDeleteGoal: (goalId: string) => void;
}

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const STATUS_LABEL: Record<Goal["status"], string> = {
  active: "Active",
  completed: "Completed",
  paused: "Paused",
  archived: "Archived",
};

const STATUS_CLASS: Record<Goal["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
  completed: "bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  paused: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
  archived: "bg-neutral-500/10 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400",
};

function StatusPill({ status }: { status: Goal["status"] }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The entire Goal UI lives here: a list (with create entry point) and a
 * per-Goal detail pane, both inside one sheet. Deliberately small — no
 * dashboard, no health/score/insights (see PlanR Improvement 03 §19-23).
 */
export default function GoalListSheet({ open, onClose, schedule, setSchedule, onDeleteGoal }: GoalListSheetProps) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const goals = schedule.goals ?? [];
  const selectedGoal = selectedGoalId ? goals.find((g) => g.id === selectedGoalId) ?? null : null;

  function handleClose() {
    setSelectedGoalId(null);
    onClose();
  }

  function openCreate() {
    setEditingGoal(null);
    setFormOpen(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoal(goal);
    setFormOpen(true);
  }

  return (
    <>
      <BottomSheet open={open && !formOpen} onClose={handleClose}>
        <div className="space-y-4 p-5 pb-8">
          {selectedGoal ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedGoalId(null)}
                  className="flex items-center gap-1 text-[13px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                >
                  <IconChevronLeft size={16} strokeWidth={2.2} />
                  Goals
                </button>
                <IconButton label="Close" variant="outline" size="sm" radius="xl" onClick={handleClose}>
                  <IconX size={14} strokeWidth={2} />
                </IconButton>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <StatusPill status={selectedGoal.status} />
                  {formatDate(selectedGoal.targetDate) && (
                    <span className="text-[12px] text-neutral-400 dark:text-neutral-500">
                      Target {formatDate(selectedGoal.targetDate)}
                    </span>
                  )}
                </div>
                <h2 className="text-[20px] font-bold leading-snug text-neutral-950 dark:text-white">{selectedGoal.title}</h2>
                {selectedGoal.description && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{selectedGoal.description}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(selectedGoal)}>
                  <IconEdit size={14} strokeWidth={2} className="mr-1.5" />
                  Edit
                </Button>
                {selectedGoal.status === "active" && (
                  <Button size="sm" variant="cta" onClick={() => setSchedule((prev) => completeGoal(prev, selectedGoal.id))}>
                    Mark Complete
                  </Button>
                )}
                {selectedGoal.status !== "archived" && (
                  <Button size="sm" variant="secondary" onClick={() => setSchedule((prev) => archiveGoal(prev, selectedGoal.id))}>
                    Archive
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="dangerSecondary"
                  onClick={() => { setSelectedGoalId(null); onDeleteGoal(selectedGoal.id); }}
                >
                  <IconTrash size={14} strokeWidth={2} />
                </Button>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  Plans
                </p>
                {(() => {
                  const linkedPlans = plansForGoal(schedule, selectedGoal.id);
                  if (linkedPlans.length === 0) {
                    return (
                      <p className="text-[13px] text-neutral-400 dark:text-neutral-500">
                        No plans linked yet — link one from a Plan&apos;s Goal field.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      {linkedPlans.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] font-medium text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300"
                        >
                          {p.title}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <>
              <SheetHeader eyebrow="Outcomes" title="Goals" onClose={handleClose} />

              {goals.length === 0 ? (
                <EmptyState
                  icon={IconTargetArrow}
                  title="No goals yet"
                  description="A Goal is the outcome behind your plans — e.g. “Get a senior UX job.” Optional, and plans work fine without one."
                  action={{ label: "New Goal", onClick: openCreate }}
                />
              ) : (
                <>
                  <div className="space-y-2">
                    {goals.map((goal) => {
                      const planCount = plansForGoal(schedule, goal.id).length;
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => setSelectedGoalId(goal.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900 dark:hover:border-white/20"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-bold text-neutral-950 dark:text-white">{goal.title}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <StatusPill status={goal.status} />
                              {formatDate(goal.targetDate) && (
                                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                                  Target {formatDate(goal.targetDate)}
                                </span>
                              )}
                              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                                {planCount} {planCount === 1 ? "plan" : "plans"}
                              </span>
                            </div>
                          </div>
                          <IconChevronRight size={16} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
                        </button>
                      );
                    })}
                  </div>
                  <Button fullWidth variant="secondary" onClick={openCreate}>
                    <IconPlus size={16} strokeWidth={2.2} className="mr-1.5" />
                    New Goal
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </BottomSheet>

      <GoalFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        setSchedule={setSchedule}
        goal={editingGoal}
      />
    </>
  );
}
