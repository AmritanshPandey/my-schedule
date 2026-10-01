import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { GoalDirection, Milestone, ProgressTracker } from '@planr/core/lib/scheduleTypes';
import { uid } from '@planr/core/lib/id';
import { formatDateShort } from '@planr/core/lib/dateUtils';
import {
  calculateMilestoneEndDate,
  calculateNextMilestoneStart,
  cascadeMilestoneDates,
  normalizeDurationToDays,
  normalizeMilestoneTimeline,
  type DurationType,
} from '@planr/core/lib/roadmapDates';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import { colors } from '../theme/colors';

type RootStackParamList = {
  NewMilestone: { planId: string; milestoneId?: string };
};

const DURATION_TYPES: { value: DurationType; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
];

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3.5 py-2 ${
        active ? 'border-black bg-black dark:border-white dark:bg-white' : 'border-black/[0.12] bg-white dark:border-white/[0.12] dark:bg-neutral-900'
      }`}
    >
      <Text className={`text-[13px] font-semibold ${active ? 'text-white dark:text-black' : 'text-black dark:text-white'}`} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  c,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  c: { muted: string };
}) {
  return (
    <View className="flex-1">
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={keyboardType}
        className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
      />
    </View>
  );
}

/**
 * Create/edit a milestone, including its "success metric" — pick one of the
 * plan's existing trackers, or define a brand-new one right here (title,
 * unit, direction, target, starting value). Native port of
 * components/plan/MilestoneSheet.tsx: same three-mode picker (None/Existing/
 * Define new), same rule that an already-linked tracker is shown read-only
 * here and managed from the milestone's own detail screen instead, so
 * there's one place that mutates the link, not two.
 */
export default function NewMilestoneScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'NewMilestone'>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const { planId, milestoneId } = route.params;
  const schedule = getSchedule();
  const planMilestones = useMemo(
    () => (schedule.milestones ?? []).filter((m) => m.planId === planId).sort((a, b) => a.sortOrder - b.sortOrder),
    [schedule, planId],
  );
  const trackers = useMemo(() => schedule.progressTrackers.filter((t) => t.planId === planId), [schedule, planId]);
  const existing = milestoneId ? planMilestones.find((m) => m.id === milestoneId) ?? null : null;
  const plan = schedule.plans.find((p) => p.id === planId);

  const defaultStart = existing
    ? existing.startDate
    : planMilestones.length > 0
    ? calculateNextMilestoneStart(planMilestones[planMilestones.length - 1].plannedEndDate)
    : plan?.startDate ?? new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [startDate, setStartDate] = useState(defaultStart);
  const [durationValue, setDurationValue] = useState(existing ? String(existing.plannedDurationDays) : '14');
  const [durationType, setDurationType] = useState<DurationType>('days');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const canEditStartDate = !!existing || planMilestones.length === 0;

  // Success metric — only editable while nothing's linked yet, same rule as web.
  const linkedTrackerId = existing?.linkedTrackers?.[0];
  const alreadyLinkedTracker = linkedTrackerId ? trackers.find((t) => t.id === linkedTrackerId) ?? null : null;
  const [metricMode, setMetricMode] = useState<'none' | 'existing' | 'new'>(linkedTrackerId ? 'existing' : 'none');
  const [existingTrackerId, setExistingTrackerId] = useState(linkedTrackerId ?? '');
  const [newTitle, setNewTitle] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newDirection, setNewDirection] = useState<GoalDirection>('increase_good');
  const [newGoalValue, setNewGoalValue] = useState('');
  const [newStartingValue, setNewStartingValue] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: existing ? 'Edit Milestone' : 'Add Milestone' });
  }, [navigation, existing]);

  const durationDays = normalizeDurationToDays(Number(durationValue) || 0, durationType);
  const plannedEndDate = startDate && durationDays > 0 ? calculateMilestoneEndDate(startDate, durationDays) : '';
  const canSave = !!title.trim() && !!startDate && durationDays > 0;

  function save() {
    const trimmed = title.trim();
    if (!trimmed || !plannedEndDate) return;
    const now = new Date().toISOString();

    let linkedTrackers = existing?.linkedTrackers ?? [];
    let newTrackerToCreate: ProgressTracker | null = null;
    const trimmedNewTitle = newTitle.trim();
    if (metricMode === 'new' && trimmedNewTitle) {
      const goalValue = newGoalValue.trim() ? Number(newGoalValue) : undefined;
      const startingValue = newStartingValue.trim() ? Number(newStartingValue) : undefined;
      const trackerId = uid();
      newTrackerToCreate = {
        id: trackerId,
        planId,
        title: trimmedNewTitle,
        type: 'number',
        unit: newUnit.trim() || undefined,
        goalDirection: newDirection,
        goalValue: Number.isFinite(goalValue) ? goalValue : undefined,
        startingValue: Number.isFinite(startingValue) ? startingValue : undefined,
      };
      linkedTrackers = [trackerId];
    } else if (metricMode === 'existing' && existingTrackerId) {
      linkedTrackers = [existingTrackerId];
    }

    updateSchedule((s) => {
      const withTracker = newTrackerToCreate
        ? { ...s, progressTrackers: [...s.progressTrackers, newTrackerToCreate] }
        : s;

      if (existing) {
        const otherMilestones = (withTracker.milestones ?? []).filter((m) => m.planId !== planId);
        const thisPlanMilestones = (withTracker.milestones ?? []).filter((m) => m.planId === planId);
        return {
          ...withTracker,
          milestones: [
            ...otherMilestones,
            ...cascadeMilestoneDates(thisPlanMilestones, existing.id, {
              title: trimmed,
              description: description.trim() || undefined,
              startDate,
              plannedDurationDays: durationDays,
              plannedEndDate,
              linkedTrackers,
              updatedAt: now,
            }),
          ],
        };
      }

      const newMilestone: Milestone = {
        id: uid(),
        planId,
        title: trimmed,
        description: description.trim() || undefined,
        startDate,
        plannedDurationDays: durationDays,
        plannedEndDate,
        status: 'upcoming',
        linkedActivities: [],
        linkedTrackers,
        createdAt: now,
        updatedAt: now,
        sortOrder: planMilestones.length,
      };
      const otherMilestones = (withTracker.milestones ?? []).filter((m) => m.planId !== planId);
      const thisPlanMilestones = [...(withTracker.milestones ?? []).filter((m) => m.planId === planId), newMilestone];
      const roadmapStartDate = thisPlanMilestones.length === 1 ? newMilestone.startDate : plan?.startDate;
      return {
        ...withTracker,
        milestones: [...otherMilestones, ...normalizeMilestoneTimeline(thisPlanMilestones, roadmapStartDate)],
      };
    });
    navigation.goBack();
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 48 }}>
      <View>
        <FieldLabel>Title</FieldLabel>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Build Running Habit"
          placeholderTextColor={c.muted}
          autoFocus={!existing}
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View>
        <FieldLabel>Description (optional)</FieldLabel>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Brief description..."
          placeholderTextColor={c.muted}
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[15px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View>
        <FieldLabel>Start date</FieldLabel>
        <Pressable
          onPress={() => canEditStartDate && setDatePickerOpen(true)}
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 dark:border-white/[0.09] dark:bg-neutral-900"
          style={{ opacity: canEditStartDate ? 1 : 0.5 }}
        >
          <Text className="text-[15px] text-black dark:text-white">{formatDateShort(startDate)}</Text>
        </Pressable>
        {datePickerOpen && (
          <DateTimePicker
            value={new Date(`${startDate}T12:00:00`)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            themeVariant={colorScheme ?? 'light'}
            onChange={(_e, date) => {
              setDatePickerOpen(Platform.OS === 'ios');
              if (date) setStartDate(date.toISOString().slice(0, 10));
            }}
          />
        )}
      </View>

      <View className="flex-row gap-3">
        <TextField label="Duration" value={durationValue} onChangeText={setDurationValue} keyboardType="numeric" c={c} />
        <View className="flex-1">
          <FieldLabel>Unit</FieldLabel>
          <View className="flex-row gap-1.5">
            {DURATION_TYPES.map((t) => (
              <Chip key={t.value} label={t.label} active={durationType === t.value} onPress={() => setDurationType(t.value)} />
            ))}
          </View>
        </View>
      </View>

      {startDate && plannedEndDate && (
        <View className="rounded-2xl border border-black/[0.08] bg-white px-4 py-3 dark:border-white/[0.09] dark:bg-neutral-900">
          <FieldLabel>Calculated end</FieldLabel>
          <Text className="text-[16px] font-bold text-black dark:text-white">
            {formatDateShort(startDate)} – {formatDateShort(plannedEndDate)}
          </Text>
          <Text className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
            {durationDays} {durationDays === 1 ? 'day' : 'days'}
          </Text>
        </View>
      )}

      {/* Success metric — the target this milestone is matched against,
          jointly with how consistently its linked tasks get done. */}
      {alreadyLinkedTracker ? (
        <View className="rounded-2xl border border-black/[0.08] bg-white px-4 py-3 dark:border-white/[0.09] dark:bg-neutral-900">
          <FieldLabel>Success metric</FieldLabel>
          <Text className="text-[14px] font-semibold text-black dark:text-white">
            {alreadyLinkedTracker.title}
            {alreadyLinkedTracker.unit ? ` (${alreadyLinkedTracker.unit})` : ''}
          </Text>
          <Text className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
            Manage this from the milestone's detail screen.
          </Text>
        </View>
      ) : (
        <View>
          <FieldLabel>Success metric (optional)</FieldLabel>
          <View className="mb-2 flex-row flex-wrap gap-1.5">
            <Chip label="None" active={metricMode === 'none'} onPress={() => setMetricMode('none')} />
            {trackers.length > 0 && (
              <Chip
                label="Existing tracker"
                active={metricMode === 'existing'}
                onPress={() => {
                  setMetricMode('existing');
                  if (!existingTrackerId) setExistingTrackerId(trackers[0].id);
                }}
              />
            )}
            <Chip label="Define new" active={metricMode === 'new'} onPress={() => setMetricMode('new')} />
          </View>

          {metricMode === 'existing' && trackers.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5">
              {trackers.map((t) => (
                <Chip
                  key={t.id}
                  label={t.title + (t.unit ? ` (${t.unit})` : '')}
                  active={existingTrackerId === t.id}
                  onPress={() => setExistingTrackerId(t.id)}
                />
              ))}
            </View>
          )}

          {metricMode === 'new' && (
            <View className="gap-2.5 rounded-2xl border border-black/[0.08] bg-white p-3 dark:border-white/[0.09] dark:bg-neutral-900">
              <TextField label="Metric title" value={newTitle} onChangeText={setNewTitle} placeholder="e.g. Weight" c={c} />
              <View className="flex-row gap-2">
                <TextField label="Unit" value={newUnit} onChangeText={setNewUnit} placeholder="kg" c={c} />
                <View className="flex-1">
                  <FieldLabel>Direction</FieldLabel>
                  <View className="flex-row gap-1.5">
                    <Chip label="Increase ↑" active={newDirection === 'increase_good'} onPress={() => setNewDirection('increase_good')} />
                    <Chip label="Decrease ↓" active={newDirection === 'decrease_good'} onPress={() => setNewDirection('decrease_good')} />
                  </View>
                </View>
              </View>
              <View className="flex-row gap-2">
                <TextField label="Target value" value={newGoalValue} onChangeText={setNewGoalValue} placeholder="75" keyboardType="decimal-pad" c={c} />
                <TextField label="Starting value" value={newStartingValue} onChangeText={setNewStartingValue} placeholder="82" keyboardType="decimal-pad" c={c} />
              </View>
            </View>
          )}
        </View>
      )}

      <Pressable
        onPress={save}
        disabled={!canSave}
        className="mt-2 items-center rounded-full bg-black py-3.5 disabled:opacity-40 dark:bg-white"
      >
        <Text className="text-[15px] font-bold text-white dark:text-black">{existing ? 'Save changes' : 'Add milestone'}</Text>
      </Pressable>
    </ScrollView>
  );
}
