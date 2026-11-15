import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconChevronDown, IconSettings } from '@tabler/icons-react-native';
import type { DayKey, Plan, RunPlanInputs, Schedule, Session } from '@planr/core/lib/scheduleTypes';
import { actualFor, formatDistance, formatPace, headline, paceSecPerKm, plannedDistanceM, sessionState } from '@planr/core/lib/sessions';
import { pendingAdjustment, planWeekIndex, plannedAvgPace } from '@planr/core/lib/runAdjustments';
import { haptic } from '../../lib/haptics';
import Button from '../ui/Button';
import Pill from '../ui/Pill';
import WeekdayPicker from '../ui/WeekdayPicker';
import TimeInput from '../ui/TimeInput';
import { FORM_LABEL } from '../ui/Input';
import { InternalSectionTitle, SectionIconButton } from '../ui/InternalSectionTitle';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import AdjustmentCard from './AdjustmentCard';
import { GUIDANCE } from './RunPlanSetupSheet';

export interface PlanSessionsSectionProps {
  schedule: Schedule;
  plan: Plan;
  todayISO: string;
  onOpenSession: (sessionId: string) => void;
  onDecide?: (adjustmentId: string, decision: 'accepted' | 'held') => void;
  onUpdateInputs?: (patch: Partial<Pick<RunPlanInputs, 'runDays' | 'startTime'>>) => void;
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

/** Native port of components/session/PlanSessionsSection.tsx. */
export default function PlanSessionsSection({ schedule, plan, todayISO, onOpenSession, onDecide, onUpdateInputs }: PlanSessionsSectionProps) {
  const sessions = (schedule.sessions ?? []).filter((s) => s.planId === plan.id).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const currentWeek = planWeekIndex(plan, todayISO);
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(() => new Set([currentWeek]));
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<DayKey[]>(plan.generator?.inputs.runDays ?? []);
  const [time, setTime] = useState(plan.generator?.inputs.startTime ?? '');
  const pending = pendingAdjustment(schedule, plan.id);
  const easyPace = plan.generator?.inputs.easyPaceSecPerKm ?? 360;

  const weeks = new Map<number, Session[]>();
  for (const s of sessions) {
    const k = s.generated?.weekIndex ?? planWeekIndex(plan, s.dateISO);
    weeks.set(k, [...(weeks.get(k) ?? []), s]);
  }
  const timed = sessions
    .map((s) => ({ s, log: actualFor(schedule, s.id) }))
    .filter((x) => x.log?.actual && x.log.source !== 'mark')
    .slice(-6);
  const badDays = days.length < 3 || days.length > 5;

  return (
    <View>
      <InternalSectionTitle
        title="Runs"
        className="mb-4"
        actions={
          onUpdateInputs ? (
            <SectionIconButton label="Edit run days" onClick={() => setEditing((v) => !v)} icon={<Icon icon={IconSettings} size={16} strokeWidth={2} className="text-neutral-700 dark:text-neutral-200" />} />
          ) : undefined
        }
      />

      {pending && onDecide ? (
        <View className="mb-4">
          <AdjustmentCard adjustment={pending} onDecide={(d) => onDecide(pending.id, d)} />
        </View>
      ) : null}

      {editing && onUpdateInputs ? (
        <View className="mb-4 gap-3 rounded-2xl border border-neutral-200/70 p-4 dark:border-white/[0.07]">
          <View>
            <Text className={FORM_LABEL}>Run days</Text>
            <WeekdayPicker selected={days} onChange={setDays} allowEmpty />
          </View>
          <TimeInput label="Usual time" value={time} onChange={setTime} />
          <Text className="text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">Runs you've done or moved yourself stay where they are.</Text>
          <Button
            variant="primary"
            fullWidth
            disabled={badDays}
            onPress={() => {
              onUpdateInputs({ runDays: days, ...(time ? { startTime: time } : {}) });
              setEditing(false);
            }}
          >
            {badDays ? 'Pick 3 to 5 run days' : 'Update plan'}
          </Button>
        </View>
      ) : null}

      {timed.length > 0 ? (
        <View className="mb-4 rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-white/[0.07] dark:bg-neutral-900">
          <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">Pace</Text>
          <View className="mt-2 gap-1.5">
            {timed.map(({ s, log }) => {
              const pace = paceSecPerKm(log!.actual!);
              const delta = pace - plannedAvgPace(s, easyPace);
              return (
                <View key={s.id} className="flex-row items-center justify-between gap-3">
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                    {shortDate(s.dateISO)} · {s.title}
                  </Text>
                  <Text className="text-[13px] font-semibold tabular-nums text-neutral-900 dark:text-white">
                    {formatPace(pace)}
                    <Text className="font-medium text-neutral-500 dark:text-neutral-400">
                      {'  '}{Math.abs(delta) < 3 ? 'on plan' : delta < 0 ? `${-delta} s faster` : `${delta} s slower`}
                    </Text>
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="gap-2">
        {[...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([k, list]) => {
          const counted = list.filter((s) => s.status !== 'skipped');
          const done = counted.filter((s) => s.status === 'done').length;
          const plannedM = list.reduce((n, s) => n + plannedDistanceM(s), 0);
          const ranM = list.reduce((n, s) => n + (actualFor(schedule, s.id)?.actual?.distanceM ?? 0), 0);
          const open = openWeeks.has(k);
          return (
            <View key={k} className="rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => {
                  haptic('light');
                  setOpenWeeks((prev) => {
                    const next = new Set(prev);
                    if (next.has(k)) next.delete(k);
                    else next.add(k);
                    return next;
                  });
                }}
                className="min-h-[52px] flex-row items-center justify-between gap-3 px-4 py-3"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">Week {k}{k === currentWeek ? ' · this week' : ''}</Text>
                  <Text className="text-[12.5px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                    {done} of {counted.length} done · planned {formatDistance(plannedM)}{ranM > 0 ? ` · ran ${formatDistance(ranM)}` : ''}
                  </Text>
                </View>
                <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                  <Icon icon={IconChevronDown} size={18} strokeWidth={2} className="text-neutral-500" />
                </View>
              </Pressable>
              {open ? (
                <View className="border-t border-neutral-200/70 px-2 py-1 dark:border-white/[0.07]">
                  {list.map((s) => {
                    const st = sessionState(s, todayISO);
                    return (
                      <Pressable
                        key={s.id}
                        accessibilityRole="button"
                        onPress={() => {
                          haptic('light');
                          onOpenSession(s.id);
                        }}
                        className="min-h-[44px] flex-row items-center justify-between gap-3 rounded-xl px-2 py-2 active:bg-neutral-50 dark:active:bg-white/[0.03]"
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-[13.5px] font-semibold text-neutral-900 dark:text-white">{shortDate(s.dateISO)} · {s.title}</Text>
                          <Text numberOfLines={1} className="text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">{headline(s)}</Text>
                        </View>
                        {st === 'done' ? (
                          <Pill variant="success" size="sm">Done</Pill>
                        ) : st === 'missed' ? (
                          <Pill variant="danger" size="sm">Missed</Pill>
                        ) : st === 'skipped' ? (
                          <Pill variant="subtle" size="sm">Skipped</Pill>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <Text className="mt-3 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{GUIDANCE}</Text>
    </View>
  );
}
