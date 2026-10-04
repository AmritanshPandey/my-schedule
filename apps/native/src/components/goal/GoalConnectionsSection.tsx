import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconAlertTriangle, IconArrowsSplit2, IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react-native';
import type { Goal, GoalConnectionType, Schedule } from '@planr/core/lib/scheduleTypes';
import {
  connectGoals,
  connectionsForGoal,
  deriveConnectionImpacts,
  disconnectGoals,
  perspectiveLabel,
  CONNECTION_TYPE_OPTIONS,
} from '@planr/core/lib/goalConnections';
import { haptic } from '../../lib/haptics';
import Button from '../ui/Button';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

/**
 * Native port of components/goal/GoalConnectionsSection.tsx — how this goal
 * relates to others (depends on / supports / conflicts / shares a resource),
 * with the live impacts first. The goal `<select>` becomes a chip list.
 */
export default function GoalConnectionsSection({ goal, schedule, setSchedule }: { goal: Goal; schedule: Schedule; setSchedule: SetScheduleFn }) {
  const [adding, setAdding] = useState(false);
  const [draftType, setDraftType] = useState<GoalConnectionType>('depends_on');
  const [draftOtherId, setDraftOtherId] = useState('');

  const rows = useMemo(() => connectionsForGoal(schedule, goal.id), [schedule, goal.id]);
  const impacts = useMemo(() => deriveConnectionImpacts(schedule, goal.id), [schedule, goal.id]);
  const linkable = (schedule.goals ?? []).filter((g) => g.id !== goal.id && g.status !== 'archived');

  function handleAdd() {
    if (!draftOtherId) return;
    haptic('light');
    setSchedule((prev) => connectGoals(prev, goal.id, draftOtherId, draftType));
    setDraftOtherId('');
    setAdding(false);
  }

  return (
    <View>
      <View className="mb-2 flex-row items-center justify-between gap-2">
        <Text className={typography.eyebrow}>Connections</Text>
        {!adding && linkable.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic('light');
              setAdding(true);
            }}
            className="flex-row items-center gap-1"
          >
            <Icon icon={IconPlus} size={13} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
            <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Connect</Text>
          </Pressable>
        )}
      </View>

      {impacts.length > 0 && (
        <View className="mb-2.5 gap-1.5">
          {impacts.map((impact) => {
            const warn = impact.severity === 'warning';
            return (
              <View
                key={impact.connection.id}
                className={`flex-row items-start gap-2 rounded-xl border px-3 py-2.5 ${
                  warn ? 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/[0.08]' : 'border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]'
                }`}
              >
                <Icon
                  icon={warn ? IconAlertTriangle : IconInfoCircle}
                  size={14}
                  strokeWidth={2}
                  className={`mt-0.5 shrink-0 ${warn ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'}`}
                />
                <Text className={`flex-1 text-[12.5px] leading-relaxed ${warn ? 'text-amber-900 dark:text-amber-200' : 'text-neutral-600 dark:text-neutral-300'}`}>
                  {impact.message}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {rows.length === 0 && !adding && (
        <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">
          {linkable.length === 0
            ? 'Create another goal to connect this one to.'
            : 'Not connected to anything yet — link a goal this one depends on, supports, or competes with.'}
        </Text>
      )}

      {rows.length > 0 && (
        <View className="gap-1.5">
          {rows.map(({ connection, other, perspective }) => (
            <View
              key={connection.id}
              className="flex-row items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <Icon icon={IconArrowsSplit2} size={13} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                <Text className="min-w-0 flex-1 truncate text-[13px] text-neutral-700 dark:text-neutral-300">
                  <Text className="font-semibold">{perspectiveLabel(perspective)}</Text> {other.title}
                </Text>
              </View>
              <IconButton
                label={`Remove connection to ${other.title}`}
                variant="ghost"
                size="xs"
                radius="xl"
                onPress={() => {
                  haptic('light');
                  setSchedule((prev) => disconnectGoals(prev, connection.id));
                }}
              >
                <Icon icon={IconX} size={13} strokeWidth={2} className={ICON_BUTTON_TONE.ghost} />
              </IconButton>
            </View>
          ))}
        </View>
      )}

      {adding && (
        <View className="mt-2 gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900">
          <View className="flex-row flex-wrap gap-1.5">
            {CONNECTION_TYPE_OPTIONS.map((option) => {
              const on = draftType === option.type;
              return (
                <Pressable
                  key={option.type}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    haptic('light');
                    setDraftType(option.type);
                  }}
                  className={`w-[48.5%] rounded-xl border px-2.5 py-2 ${
                    on ? 'border-emerald-500/60 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/[0.09]' : 'border-neutral-200 dark:border-white/10'
                  }`}
                >
                  <Text className="text-[12.5px] font-bold text-neutral-900 dark:text-white">{option.label}</Text>
                  <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">{option.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row flex-wrap gap-1.5">
            {linkable.map((g) => {
              const on = draftOtherId === g.id;
              return (
                <Pressable
                  key={g.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setDraftOtherId(g.id)}
                  className={`rounded-full border px-3 py-1.5 ${on ? 'border-neutral-950 bg-neutral-950 dark:border-white dark:bg-white' : 'border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]'}`}
                >
                  <Text className={`text-[13px] font-semibold ${on ? 'text-white dark:text-neutral-900' : 'text-neutral-700 dark:text-neutral-300'}`}>{g.title}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row gap-2">
            <Button size="sm" onPress={handleAdd} disabled={!draftOtherId}>
              Connect
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                setAdding(false);
                setDraftOtherId('');
              }}
            >
              Cancel
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
