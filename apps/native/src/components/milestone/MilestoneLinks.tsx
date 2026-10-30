import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconFlag3, IconPlus, IconX } from '@tabler/icons-react-native';
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
  className = '',
}: {
  milestones: readonly Milestone[];
  kind: MilestoneLinkKind;
  itemId: string;
  /** Limit the picker to one plan's milestones (tasks and trackers). Omit for routines. */
  planId?: string;
  onSetLink: (milestoneId: string, kind: MilestoneLinkKind, itemId: string, linked: boolean) => void;
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const linked = milestonesForItem(milestones, kind, itemId);
  const linkedIds = new Set(linked.map((m) => m.id));
  const options = linkableMilestones(milestones, planId).filter((m) => !linkedIds.has(m.id));
  if (linked.length === 0 && options.length === 0) return null;

  return (
    <View className={className} testID={`milestone-links-${kind}`}>
      <Text className="mb-1.5 text-[12px] font-bold text-neutral-500 dark:text-neutral-400">
        {linked.length > 0 ? 'Advances' : 'Not linked to a milestone'}
      </Text>
      <View className="flex-row flex-wrap items-center gap-1.5">
        {linked.map((m) => (
          <View
            key={m.id}
            className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-neutral-200 pl-3 pr-1 dark:border-white/10"
          >
            <Icon icon={IconFlag3} size={13} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
            <Text className="max-w-[180px] truncate text-[12.5px] font-bold text-neutral-700 dark:text-neutral-200" numberOfLines={1}>
              {m.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Unlink from ${m.title}`}
              onPress={() => { haptic('light'); onSetLink(m.id, kind, itemId, false); }}
              className="h-9 w-9 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.06]"
            >
              <Icon icon={IconX} size={13} strokeWidth={2.5} className="text-neutral-500 dark:text-neutral-400" />
            </Pressable>
          </View>
        ))}
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
