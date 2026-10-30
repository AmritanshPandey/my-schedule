import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconCircleCheck, IconFlag3, IconPlus, IconX } from '@tabler/icons-react-native';
import type { Milestone } from '@planr/core/lib/scheduleTypes';
import { linkableMilestones, milestonesForItem, type MilestoneLinkKind } from '@planr/core/lib/milestoneLinks';
import { haptic } from '../../lib/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Native port of components/milestone/MilestoneLinks.tsx — which milestones
 * this task, tracker or routine advances, with link/unlink in place. The link
 * itself lives on the milestone (lib/milestoneLinks.ts).
 */
export default function MilestoneLinks({
  milestones,
  kind,
  itemId,
  planId,
  onSetLink,
  hideIds,
  className = '',
}: {
  milestones: readonly Milestone[];
  kind: MilestoneLinkKind;
  itemId: string;
  /** Limit the picker to one plan's milestones (tasks and trackers). Omit for routines. */
  planId?: string;
  onSetLink: (milestoneId: string, kind: MilestoneLinkKind, itemId: string, linked: boolean) => void;
  /** Milestones the surrounding card already shows (Tracking's milestone panel), so they aren't listed twice. */
  hideIds?: readonly string[];
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const linked = milestonesForItem(milestones, kind, itemId);
  const linkedIds = new Set(linked.map((m) => m.id));
  const options = linkableMilestones(milestones, planId).filter((m) => !linkedIds.has(m.id));
  const shown = hideIds ? linked.filter((m) => !hideIds.includes(m.id)) : linked;
  if (shown.length === 0 && options.length === 0) return null;
  // A link is only shown as missing when there truly is none; one the card
  // already shows elsewhere just isn't repeated.
  const label = shown.length > 0 ? (shown.length < linked.length ? 'Also advances' : 'Advances') : linked.length === 0 ? 'Not linked to a milestone' : null;

  return (
    <View className={className} testID={`milestone-links-${kind}`}>
      {label && (
        <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">{label}</Text>
      )}
      <View className="flex-row flex-wrap items-center gap-1.5">
        {shown.map((m) => {
          // A finished milestone is history: it stays listed, but unlinking
          // it now would quietly rewrite how it was measured.
          const done = m.status === 'completed' || !!m.actualCompletedDate;
          return (
            <View
              key={m.id}
              className={`min-h-11 flex-row items-center gap-1.5 rounded-full border border-neutral-200 pl-3 dark:border-white/10 ${done ? 'pr-3' : 'pr-1'}`}
            >
              <Icon
                icon={done ? IconCircleCheck : IconFlag3}
                size={13}
                strokeWidth={2}
                className="text-neutral-500 dark:text-neutral-400"
              />
              <Text
                className={`max-w-[180px] truncate text-[12.5px] font-bold ${done ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-700 dark:text-neutral-200'}`}
                numberOfLines={1}
                accessibilityLabel={done ? `${m.title}, completed` : undefined}
              >
                {m.title}
              </Text>
              {!done && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Unlink from ${m.title}`}
                  onPress={() => { haptic('light'); onSetLink(m.id, kind, itemId, false); }}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.06]"
                >
                  <Icon icon={IconX} size={13} strokeWidth={2.5} className="text-neutral-500 dark:text-neutral-400" />
                </Pressable>
              )}
            </View>
          );
        })}
        {options.length > 0 && !picking && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicking(true)}
            className="min-h-11 flex-row items-center gap-1 rounded-full px-3 active:bg-neutral-100 dark:active:bg-white/[0.06]"
          >
            <Icon icon={IconPlus} size={13} strokeWidth={2.5} className="text-neutral-600 dark:text-neutral-300" />
            <Text className="text-[12.5px] font-bold text-neutral-600 dark:text-neutral-300">Link to milestone</Text>
          </Pressable>
        )}
      </View>
      {picking && options.length > 0 && (
        <View className="mt-1.5 flex-row flex-wrap gap-1.5">
          {options.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              onPress={() => { haptic('light'); onSetLink(m.id, kind, itemId, true); setPicking(false); }}
              className="min-h-11 justify-center rounded-full border border-dashed border-neutral-300 px-3 active:bg-neutral-50 dark:border-white/15 dark:active:bg-white/[0.04]"
            >
              <Text className="text-[12.5px] font-semibold text-neutral-600 dark:text-neutral-300">+ {m.title}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => setPicking(false)} className="min-h-11 justify-center rounded-full px-3">
            <Text className="text-[12.5px] font-semibold text-neutral-500 dark:text-neutral-400">Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
