import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconTargetArrow, IconPlus, IconChevronLeft, IconChevronRight, IconEdit, IconTrash, IconX } from '@tabler/icons-react-native';
import type { Goal, Schedule } from '@planr/core/lib/scheduleTypes';
import { archiveGoal, completeGoal, plansForGoal } from '@planr/core/lib/goalMutations';
import { calculateGoalProgress, type GoalProgressState } from '@planr/core/lib/goalProgress';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button, { BUTTON_TEXT } from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import ProgressBar from '../ui/ProgressBar';
import HealthBadge, { HEALTH_FILL } from '../ui/HealthBadge';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import GoalFormSheet from './GoalFormSheet';
import GoalConnectionsSection from './GoalConnectionsSection';

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const STATUS_LABEL: Record<Goal['status'], string> = { active: 'Active', completed: 'Completed', paused: 'Paused', archived: 'Archived' };

const STATUS_CLASS: Record<Goal['status'], { box: string; text: string }> = {
  active: { box: 'bg-emerald-500/10 dark:bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400' },
  completed: { box: 'bg-sky-500/10 dark:bg-sky-500/15', text: 'text-sky-600 dark:text-sky-400' },
  paused: { box: 'bg-amber-500/10 dark:bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400' },
  archived: { box: 'bg-neutral-500/10 dark:bg-white/[0.06]', text: 'text-neutral-500 dark:text-neutral-400' },
};

function StatusPill({ status }: { status: Goal['status'] }) {
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${STATUS_CLASS[status].box}`}>
      <Text className={`text-[11px] font-semibold ${STATUS_CLASS[status].text}`}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function GoalProgressBlock({ state, compact = false }: { state: GoalProgressState; compact?: boolean }) {
  if (!state.hasData) return null;
  return (
    <View className={compact ? 'mt-2' : 'mt-3'}>
      <View className="mb-1 flex-row items-baseline justify-between gap-2">
        <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
          {state.milestonesCompleted} of {state.milestoneTotal} done
        </Text>
        {state.progress !== null && <Text className="text-[11px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">{state.progress}% progress</Text>}
      </View>
      <ProgressBar pct={state.progress ?? 0} height={compact ? 4 : 6} fillClassName={HEALTH_FILL[state.health]} />
    </View>
  );
}

/**
 * Native port of components/goal/GoalListSheet.tsx — the Goals list and a
 * per-goal detail pane (derived progress, next milestone, complete/archive/
 * delete, connections, linked plans) in one sheet.
 */
export default function GoalListSheet({
  open,
  onClose,
  schedule,
  setSchedule,
  onDeleteGoal,
}: {
  open: boolean;
  onClose: () => void;
  schedule: Schedule;
  setSchedule: SetScheduleFn;
  onDeleteGoal: (goalId: string) => void;
}) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const goals = useMemo(() => schedule.goals ?? [], [schedule.goals]);
  const selectedGoal = selectedGoalId ? goals.find((g) => g.id === selectedGoalId) ?? null : null;

  const progressByGoal = useMemo(() => {
    const map = new Map<string, GoalProgressState>();
    for (const g of goals) map.set(g.id, calculateGoalProgress(schedule, g));
    return map;
  }, [goals, schedule]);

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
        <View className="gap-4 p-5 pb-8">
          {selectedGoal ? (
            <>
              <View className="flex-row items-start justify-between gap-3">
                <Pressable accessibilityRole="button" onPress={() => setSelectedGoalId(null)} className="flex-row items-center gap-1">
                  <Icon icon={IconChevronLeft} size={16} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
                  <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Goals</Text>
                </Pressable>
                <IconButton label="Close" variant="outline" size="sm" radius="xl" onPress={handleClose}>
                  <Icon icon={IconX} size={14} strokeWidth={2} className={ICON_BUTTON_TONE.outline} />
                </IconButton>
              </View>

              <View>
                <View className="mb-1 flex-row flex-wrap items-center gap-2">
                  <StatusPill status={selectedGoal.status} />
                  {selectedGoal.status === 'active' && <HealthBadge health={progressByGoal.get(selectedGoal.id)!.health} />}
                  {formatDate(selectedGoal.targetDate) && (
                    <Text className="text-[12px] text-neutral-500 dark:text-neutral-400">Target {formatDate(selectedGoal.targetDate)}</Text>
                  )}
                </View>
                <Text className="text-[20px] font-bold leading-snug text-neutral-950 dark:text-white">{selectedGoal.title}</Text>
                {selectedGoal.description ? (
                  <Text className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{selectedGoal.description}</Text>
                ) : null}
              </View>

              {(() => {
                const progress = progressByGoal.get(selectedGoal.id)!;
                return (
                  <View className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <Text className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{progress.statusMessage}</Text>
                    <GoalProgressBlock state={progress} />
                    {progress.nextMilestone && (
                      <View className="mt-3 border-t border-neutral-200 pt-3 dark:border-white/[0.08]">
                        <Text className={typography.eyebrow}>Next milestone</Text>
                        <Text className="mt-1 truncate text-[13px] font-semibold text-neutral-900 dark:text-white">{progress.nextMilestone.milestone.title}</Text>
                        <Text className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
                          {progress.nextMilestone.plan.title}
                          {' · '}
                          {progress.nextMilestone.daysUntil < 0
                            ? `${Math.abs(progress.nextMilestone.daysUntil)} day${Math.abs(progress.nextMilestone.daysUntil) === 1 ? '' : 's'} overdue`
                            : progress.nextMilestone.daysUntil === 0
                              ? 'due today'
                              : `in ${progress.nextMilestone.daysUntil} day${progress.nextMilestone.daysUntil === 1 ? '' : 's'}`}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}

              <View className="flex-row flex-wrap gap-2">
                <Button size="sm" variant="secondary" onPress={() => openEdit(selectedGoal)}>
                  <Icon icon={IconEdit} size={14} strokeWidth={2} className={BUTTON_TEXT.secondary} />
                  Edit
                </Button>
                {selectedGoal.status === 'active' && (
                  <Button size="sm" variant="cta" onPress={() => setSchedule((prev) => completeGoal(prev, selectedGoal.id))}>
                    Mark complete
                  </Button>
                )}
                {selectedGoal.status !== 'archived' && (
                  <Button size="sm" variant="secondary" onPress={() => setSchedule((prev) => archiveGoal(prev, selectedGoal.id))}>
                    Archive
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="dangerSecondary"
                  accessibilityLabel="Delete goal"
                  onPress={() => {
                    setSelectedGoalId(null);
                    onDeleteGoal(selectedGoal.id);
                  }}
                >
                  <Icon icon={IconTrash} size={14} strokeWidth={2} className={BUTTON_TEXT.dangerSecondary} />
                </Button>
              </View>

              <GoalConnectionsSection goal={selectedGoal} schedule={schedule} setSchedule={setSchedule} />

              <View>
                <Text className={`mb-2 ${typography.eyebrow}`}>Plans</Text>
                {(() => {
                  const linkedPlans = plansForGoal(schedule, selectedGoal.id);
                  if (linkedPlans.length === 0) {
                    return <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">No plans linked yet — link one from a Plan's Goal field.</Text>;
                  }
                  return (
                    <View className="gap-1.5">
                      {linkedPlans.map((p) => (
                        <View key={p.id} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                          <Text className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">{p.title}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            </>
          ) : (
            <>
              <SheetHeader eyebrow="Outcomes" title="Goals" onClose={handleClose} />
              {goals.length === 0 ? (
                <EmptyState
                  icon={IconTargetArrow}
                  title="No goals yet"
                  description="A Goal is the outcome behind your plans — e.g. “Get a senior UX job.” Optional, and plans work fine without one."
                  action={{ label: 'New goal', onClick: openCreate }}
                />
              ) : (
                <>
                  <View className="gap-2">
                    {goals.map((goal) => {
                      const progress = progressByGoal.get(goal.id)!;
                      return (
                        <Pressable
                          key={goal.id}
                          accessibilityRole="button"
                          onPress={() => setSelectedGoalId(goal.id)}
                          className="w-full flex-row items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 active:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900"
                        >
                          <View className="min-w-0 flex-1">
                            <View className="flex-row items-start justify-between gap-2">
                              <Text className="min-w-0 flex-1 truncate text-[14px] font-bold text-neutral-950 dark:text-white">{goal.title}</Text>
                              {goal.status === 'active' && <HealthBadge health={progress.health} />}
                            </View>
                            <View className="mt-1 flex-row flex-wrap items-center gap-2">
                              <StatusPill status={goal.status} />
                              {formatDate(goal.targetDate) && <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">Target {formatDate(goal.targetDate)}</Text>}
                              <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                {progress.planCount} {progress.planCount === 1 ? 'plan' : 'plans'}
                              </Text>
                            </View>
                            <GoalProgressBlock state={progress} compact />
                          </View>
                          <Icon icon={IconChevronRight} size={16} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
                        </Pressable>
                      );
                    })}
                  </View>
                  <Button fullWidth variant="secondary" onPress={openCreate}>
                    <Icon icon={IconPlus} size={16} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />
                    New goal
                  </Button>
                </>
              )}
            </>
          )}
        </View>
      </BottomSheet>

      <GoalFormSheet open={formOpen} onClose={() => setFormOpen(false)} setSchedule={setSchedule} goal={editingGoal} />
    </>
  );
}
