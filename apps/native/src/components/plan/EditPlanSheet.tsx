import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Plan, Schedule, Goal } from '@planr/core/lib/scheduleTypes';
import { categoryFromIcon, type AccentColor } from '@planr/core/lib/colorSystem';
import { daysBetween as daysBetweenUtil } from '@planr/core/lib/dateUtils';
import { recalculateRoadmapTimeline } from '@planr/core/lib/roadmapDates';
import { constrainTaskToPlanWindow } from '@planr/core/lib/planTaskWindow';
import { SECTION_ICONS } from '../SectionIcons';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DateInput from '../ui/DateInput';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { PLAN_TITLE_MAX, DurationPresets, iconPickerClass } from './planFormShared';
import { GoalChips } from './AddPlanSheet';

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

/**
 * Native port of components/plan/EditPlanSheet.tsx — edit a plan's details.
 * Saving re-constrains the plan's tasks to the new window and recomputes the
 * roadmap timeline, exactly like the web.
 */
export default function EditPlanSheet({
  planId,
  plan,
  setSchedule,
  onClose,
  goals = [],
}: {
  planId: string | null;
  plan: Plan | null;
  setSchedule: SetScheduleFn;
  onClose: () => void;
  goals?: Goal[];
}) {
  const [draft, setDraft] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    icon: 'brain',
    color: 'cyan' as AccentColor,
    goalId: '',
  });

  useEffect(() => {
    if (plan) {
      setDraft({
        title: plan.title,
        description: plan.description ?? '',
        startDate: plan.startDate ?? '',
        endDate: plan.endDate ?? '',
        icon: plan.emoji,
        color: plan.color,
        goalId: plan.goalId ?? '',
      });
    }
  }, [planId, plan]);

  function handleSave() {
    if (!planId || !draft.title.trim()) return;
    const nextColor = draft.color;
    setSchedule((prev) => {
      const existingPlan = prev.plans.find((item) => item.id === planId);
      if (!existingPlan) return prev;
      const updatedPlan = { ...existingPlan, startDate: draft.startDate || undefined, endDate: draft.endDate || undefined };
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
            : p,
        ),
        activities: Object.fromEntries(
          Object.entries(prev.activities).map(([day, tasks]) => [day, tasks.map((task) => (task.planId === planId ? constrainTaskToPlanWindow(task, updatedPlan) : task))]),
        ) as Schedule['activities'],
        milestones: [
          ...(prev.milestones ?? []).filter((m) => m.planId !== planId),
          ...recalculateRoadmapTimeline(
            (prev.milestones ?? []).filter((m) => m.planId === planId),
            draft.startDate || undefined,
          ),
        ],
      };
    });
    onClose();
  }

  const duration = daysBetweenUtil(draft.startDate, draft.endDate);

  return (
    <BottomSheet open={!!planId} onClose={onClose}>
      <View className="gap-4 p-5 pb-8">
        <SheetHeader eyebrow="Edit" title="Plan details" onClose={onClose} />
        <View className="gap-2.5">
          <View>
            <Input
              value={draft.title}
              onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))}
              placeholder="Plan title"
              maxLength={PLAN_TITLE_MAX}
              accessibilityLabel="Plan title"
            />
            <Text className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {draft.title.length}/{PLAN_TITLE_MAX}
            </Text>
          </View>
          <Input value={draft.description} onChangeText={(v) => setDraft((d) => ({ ...d, description: v }))} placeholder="Short description (optional)" accessibilityLabel="Plan description" />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <DateInput label="Start date" value={draft.startDate} onChange={(v) => setDraft((d) => ({ ...d, startDate: v }))} />
            </View>
            <View className="flex-1">
              <DateInput
                label={duration ? `End date (${duration} days)` : 'End date'}
                value={draft.endDate}
                onChange={(v) => setDraft((d) => ({ ...d, endDate: v }))}
                placeholder="Ongoing"
                clearable
              />
            </View>
          </View>

          <DurationPresets startDate={draft.startDate} endDate={draft.endDate} onSelect={(s, e) => setDraft((d) => ({ ...d, startDate: s, endDate: e }))} />

          {goals.length > 0 && (
            <View>
              <Text className={`mb-1 ${typography.eyebrow}`}>
                Goal <Text className="font-normal normal-case text-neutral-500 dark:text-neutral-400">(optional)</Text>
              </Text>
              <GoalChips goals={goals} value={draft.goalId} onChange={(id) => setDraft((d) => ({ ...d, goalId: id }))} />
            </View>
          )}

          <View>
            <Text className={`mb-2 ${typography.eyebrow}`}>Icon</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {SECTION_ICONS.map(({ name, label, icon: glyph }) => {
                const cls = iconPickerClass(draft.icon === name);
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: draft.icon === name }}
                    onPress={() => setDraft((d) => ({ ...d, icon: name }))}
                    className={`${cls.box} w-[18.5%]`}
                  >
                    <Icon icon={glyph} size={18} strokeWidth={1.5} className={cls.icon} />
                    <Text numberOfLines={1} className={`text-[9px] font-semibold leading-none ${cls.icon}`}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <Button fullWidth onPress={handleSave} disabled={!draft.title.trim()}>
          Save changes
        </Button>
      </View>
    </BottomSheet>
  );
}
