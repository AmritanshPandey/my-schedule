import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconArrowRight, IconCheck, IconTargetArrow } from '@tabler/icons-react-native';
import type { Milestone, Plan, Schedule } from '@planr/core/lib/scheduleTypes';
import type { MilestoneState } from '@planr/core/lib/milestoneHealth';
import { proposeAdaptations, type Adaptation, type AdaptationOffer } from '@planr/core/lib/milestoneAdaptation';
import { computeSlotReliability } from '@planr/core/lib/slotReliability';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button from '../ui/Button';
import Toggle from '../ui/Toggle';
import EmptyState from '../ui/EmptyState';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Native port of components/plan/AdaptMilestoneSheet.tsx — what to do about
 * an off-pace milestone. Options come from proposeAdaptations; picking one
 * only expands its diff, and a separate Apply commits it.
 */
export default function AdaptMilestoneSheet({
  open,
  onClose,
  milestone,
  plan,
  state,
  schedule,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  milestone: Milestone;
  plan: Plan;
  state: MilestoneState;
  schedule: Schedule;
  onApply: (adaptation: Adaptation) => void;
}) {
  const reliability = useMemo(() => (open ? computeSlotReliability(schedule) : null), [open, schedule]);
  const offers = useMemo(
    () => (open ? proposeAdaptations({ milestone, plan, state, schedule, reliability }) : []),
    [open, milestone, plan, state, schedule, reliability],
  );

  const [selectedKind, setSelectedKind] = useState<Adaptation['kind'] | null>(null);
  const [cascade, setCascade] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelectedKind(offers[0]?.adaptation.kind ?? null);
    const extend = offers.find((o) => o.adaptation.kind === 'extend_target');
    setCascade(extend?.adaptation.kind === 'extend_target' ? extend.adaptation.cascade : true);
  }, [open, offers]);

  const selected = offers.find((o) => o.adaptation.kind === selectedKind) ?? null;

  function handleApply() {
    if (!selected) return;
    const adaptation = selected.adaptation.kind === 'extend_target' ? { ...selected.adaptation, cascade } : selected.adaptation;
    onApply(adaptation);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View className="gap-4 p-5 pb-8">
        <SheetHeader eyebrow="Adjust" title={milestone.title} onClose={onClose} />
        {offers.length === 0 ? (
          <EmptyState
            icon={IconTargetArrow}
            title="Nothing to adjust yet"
            description="This milestone has no linked tasks or tracker, so there's no pace to correct. Link the work it's measured by first."
          />
        ) : (
          <>
            <Text className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">{state.statusMessage}</Text>
            <View className="gap-2">
              {offers.map((offer) => (
                <OfferRow
                  key={offer.adaptation.kind}
                  offer={offer}
                  selected={offer.adaptation.kind === selectedKind}
                  onSelect={() => setSelectedKind(offer.adaptation.kind)}
                  cascade={cascade}
                  onCascadeChange={setCascade}
                />
              ))}
            </View>
            <Button fullWidth onPress={handleApply} disabled={!selected}>
              {selected ? selected.label : 'Choose an adjustment'}
            </Button>
            <Text className="text-center text-[11.5px] text-neutral-500 dark:text-neutral-400">Nothing is deleted. You can change any of this again afterwards.</Text>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

function OfferRow({
  offer,
  selected,
  onSelect,
  cascade,
  onCascadeChange,
}: {
  offer: AdaptationOffer;
  selected: boolean;
  onSelect: () => void;
  cascade: boolean;
  onCascadeChange: (next: boolean) => void;
}) {
  const extend = offer.adaptation.kind === 'extend_target' ? offer.adaptation : null;

  return (
    <View
      className={`rounded-2xl border ${
        selected ? 'border-emerald-500/60 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/[0.07]' : 'border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900'
      }`}
    >
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onSelect} className="w-full flex-row items-start gap-3 p-4">
        <View
          className={`mt-0.5 h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
            selected ? 'border-emerald-500 bg-emerald-500' : 'border-neutral-300 dark:border-white/20'
          }`}
        >
          {selected && <Icon icon={IconCheck} size={12} strokeWidth={3} className="text-white" />}
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-bold text-neutral-950 dark:text-white">{offer.label}</Text>
          <Text className="mt-0.5 text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">{offer.rationale}</Text>
        </View>
      </Pressable>

      {selected && (
        <View className="border-t border-neutral-200/70 px-4 py-3 dark:border-white/[0.08]">
          <Text className={`mb-1.5 ${typography.eyebrow}`}>What changes</Text>
          <View className="gap-1">
            {offer.changes.map((change, i) => (
              <View key={i} className="flex-row items-start gap-1.5">
                <Icon icon={IconArrowRight} size={13} strokeWidth={2} className="mt-[3px] shrink-0 text-neutral-500 dark:text-neutral-400" />
                <Text className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-neutral-700 dark:text-neutral-300">{change}</Text>
              </View>
            ))}
          </View>

          {extend && extend.downstreamCount > 0 && (
            <View className="mt-3 flex-row items-center justify-between gap-3 border-t border-neutral-200/70 pt-3 dark:border-white/[0.08]">
              <View className="min-w-0 flex-1">
                <Text className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-200">Move later milestones too</Text>
                <Text className="text-[11.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {cascade ? 'Everything after this shifts by the same amount.' : 'Later milestones keep their dates, so the time left for them shrinks.'}
                </Text>
              </View>
              <Toggle on={cascade} onChange={onCascadeChange} label="Move later milestones too" />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
