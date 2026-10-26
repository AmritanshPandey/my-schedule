import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconCheck, IconEdit, IconFlame, IconMinus, IconPlus, IconTrash, IconTrophy } from '@tabler/icons-react-native';
import type { Ritual, RitualCompletion } from '@planr/core/lib/scheduleTypes';
import { todayISO } from '@planr/core/lib/dateUtils';
import { calculateRitualStats } from '@planr/core/lib/consistency/calculateRitualStreak';
import { entriesForRitualDate } from '@planr/core/lib/ritualCompletions';
import { ritualDayProgress } from '@planr/core/lib/consistency/ritualDayStatus';
import { buildRitualMonthDays } from '@planr/core/lib/consistency/ritualCalendar';
import { quickAmountsForRitual } from '@planr/core/lib/quickAmounts';
import { describeRecurrence } from '@planr/core/lib/ritualRecurrence';
import { formatDisplayTime } from '@planr/core/lib/timeUtils';
import { haptic } from '../../lib/haptics';
import { iconGlyph, getIconPickerStyle } from '../SectionIcons';
import DetailHeader from '../ui/DetailHeader';
import ProgressBar from '../ui/ProgressBar';
import CheckDraw from '../ui/CheckDraw';
import { CARD, SOFT_PANEL } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';
import RoutineMonthCalendar from './RoutineMonthCalendar';

interface RoutineDetailViewProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  onBack: () => void;
  onToggleCheckbox: () => void;
  onLogAmount: (amount: number) => void;
  onUndoLastLog: () => void;
  onRemoveLog: (entryId: string) => void;
  onToggleStep: (stepId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function timeOfDay(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  return formatDisplayTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400';

/**
 * Native port of components/activity/RoutineDetailView.tsx — the full-height
 * routine page. Its top section adapts to the trackingType (quantity/duration/
 * count: progress + quick-add + entry list; checkbox: today's status;
 * checklist/times: the step list), with the same streak / best streak /
 * 30-day adherence / dots block and month calendar underneath every type.
 */
export default function RoutineDetailView({
  ritual,
  ritualCompletions,
  trackingStart,
  onBack,
  onToggleCheckbox,
  onLogAmount,
  onUndoLastLog,
  onRemoveLog,
  onToggleStep,
  onEdit,
  onDelete,
}: RoutineDetailViewProps) {
  const insets = useSafeAreaInsets();
  const [customValue, setCustomValue] = useState('');
  const today = todayISO();
  const now = new Date(`${today}T00:00:00`);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const trackingType = ritual.trackingType ?? 'checkbox';
  const todaysEntries = entriesForRitualDate(ritualCompletions, ritual.id, today);
  const progress = ritualDayProgress(ritual, todaysEntries);
  const stats = calculateRitualStats(ritual, ritualCompletions, today, trackingStart);
  const quickAmounts = quickAmountsForRitual(ritual);
  const iconStyle = getIconPickerStyle(ritual.icon ?? '');
  const Glyph = iconGlyph(ritual.icon ?? '');
  const calendarDays = useMemo(
    () => buildRitualMonthDays(ritual, ritualCompletions, calYear, calMonth, today, trackingStart),
    [ritual, ritualCompletions, calYear, calMonth, today, trackingStart],
  );

  function prevCalMonth() {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else setCalMonth((m) => m - 1);
  }
  function nextCalMonth() {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else setCalMonth((m) => m + 1);
  }

  function handleCustomLog() {
    const value = parseFloat(customValue);
    if (!Number.isFinite(value) || value <= 0) return;
    haptic('medium');
    onLogAmount(value);
    setCustomValue('');
  }

  return (
    <View className="min-h-0 flex-1 bg-[#F5F5F5] dark:bg-[#0E0E0E]">
      <DetailHeader
        title={ritual.title}
        onBack={onBack}
        actions={[
          { icon: IconEdit, label: 'Edit routine', onClick: onEdit },
          { icon: IconTrash, label: 'Delete routine', onClick: onDelete, destructive: true },
        ]}
      />

      <ScrollView className="min-h-0 flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View className="w-full gap-5">
          {/* ── Identity ─────────────────────────────────────────────────── */}
          <View className="flex-row items-center gap-3">
            <View className={`h-12 w-12 shrink-0 items-center justify-center rounded-full ${ritual.icon ? iconStyle.tint : 'bg-neutral-100 dark:bg-white/[0.06]'}`}>
              <Icon icon={Glyph} size={22} strokeWidth={1.8} className={ritual.icon ? iconStyle.text : 'text-neutral-500 dark:text-neutral-400'} />
            </View>
            <View className="min-w-0 flex-1">
              {ritual.description && <Text className="truncate text-[13px] text-neutral-500 dark:text-neutral-400">{ritual.description}</Text>}
              <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                {ritual.anyTime ? 'Anytime' : formatDisplayTime(ritual.time)} · {describeRecurrence(ritual)}
              </Text>
            </View>
          </View>

          {/* ── Today's progress — adaptive by trackingType ─────────────────── */}
          <View className={`overflow-hidden ${CARD}`}>
            <Text className={`px-4 pt-4 ${EYEBROW}`}>Today's progress</Text>

            {(trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count') && (
              <View className="gap-3 px-4 pb-4 pt-2">
                <View className="flex-row items-baseline justify-between">
                  <Text className="text-[22px] font-black tabular-nums text-neutral-950 dark:text-white">
                    {progress.value}
                    <Text className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
                      {' '}
                      / {ritual.target ?? '–'}
                      {ritual.unit ? ` ${ritual.unit}` : ''}
                    </Text>
                  </Text>
                  {progress.complete && (
                    <View className="flex-row items-center gap-1">
                      <Icon icon={IconCheck} size={13} strokeWidth={2.6} className="text-emerald-600 dark:text-emerald-400" />
                      <Text className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">Done</Text>
                    </View>
                  )}
                </View>
                <ProgressBar
                  pct={ritual.target ? Math.min(100, Math.round((progress.value / ritual.target) * 100)) : progress.value > 0 ? 100 : 0}
                  height={8}
                  fillClassName="bg-green-500"
                />
                <View className="flex-row flex-wrap items-center gap-1.5">
                  {progress.value > 0 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Undo last log"
                      onPress={() => {
                        haptic('light');
                        onUndoLastLog();
                      }}
                      className="h-9 w-9 items-center justify-center rounded-full border border-neutral-200 dark:border-white/[0.10]"
                    >
                      <Icon icon={IconMinus} size={15} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                    </Pressable>
                  )}
                  {quickAmounts.map((amount) => (
                    <Pressable
                      key={amount}
                      accessibilityRole="button"
                      accessibilityLabel={`Log ${amount}${ritual.unit ? ` ${ritual.unit}` : ''}`}
                      onPress={() => {
                        haptic('medium');
                        onLogAmount(amount);
                      }}
                      className="h-9 flex-row items-center gap-1 rounded-full border border-neutral-200 px-3 active:bg-neutral-50 dark:border-white/[0.10] dark:active:bg-white/[0.05]"
                    >
                      <Icon icon={IconPlus} size={12} strokeWidth={2.6} className="text-neutral-700 dark:text-neutral-200" />
                      <Text className="text-[12px] font-bold text-neutral-700 dark:text-neutral-200">
                        {amount}
                        {ritual.unit ? ` ${ritual.unit}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                  <View className="h-9 flex-row items-center gap-1 rounded-full border border-neutral-200 pl-3 pr-1 dark:border-white/[0.10]">
                    <TextInput
                      keyboardType="decimal-pad"
                      value={customValue}
                      onChangeText={setCustomValue}
                      onSubmitEditing={handleCustomLog}
                      returnKeyType="done"
                      placeholder="Custom"
                      accessibilityLabel="Custom amount"
                      className="w-16 py-0 text-[12px] font-semibold text-neutral-800 dark:text-neutral-100"
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Log custom amount"
                      onPress={handleCustomLog}
                      disabled={!customValue}
                      className={`h-7 w-7 items-center justify-center rounded-full ${customValue ? '' : 'opacity-30'}`}
                    >
                      <Icon icon={IconPlus} size={14} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                    </Pressable>
                  </View>
                </View>

                {todaysEntries.length > 0 && (
                  <View className={`mt-1 overflow-hidden ${SOFT_PANEL}`}>
                    {todaysEntries.map((entry, i) => (
                      <View
                        key={entry.id ?? `${entry.date}-${entry.value}-${i}`}
                        className={`flex-row items-center justify-between px-3 py-2 ${i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}`}
                      >
                        <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{timeOfDay(entry.timestamp)}</Text>
                        <View className="flex-row items-center gap-2">
                          <Text className="text-[13px] font-bold tabular-nums text-neutral-800 dark:text-neutral-100">
                            {entry.value}
                            {ritual.unit ? ` ${ritual.unit}` : ''}
                          </Text>
                          {entry.id && (
                            <Pressable accessibilityRole="button" accessibilityLabel="Delete entry" hitSlop={10} onPress={() => onRemoveLog(entry.id!)}>
                              <Icon icon={IconTrash} size={13} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {trackingType === 'checklist' && (
              <View className="gap-1.5 px-4 pb-4 pt-2">
                {(ritual.steps ?? []).length === 0 ? (
                  <Text className="py-2 text-[13px] text-neutral-500 dark:text-neutral-400">
                    No steps yet — edit this routine to add some.
                  </Text>
                ) : (
                  ritual.steps!.map((step) => {
                    const done = todaysEntries.some((e) => e.stepId === step.id);
                    const label = step.label;
                    return (
                      <Pressable
                        key={step.id}
                        accessibilityRole="checkbox"
                        accessibilityLabel={label}
                        accessibilityState={{ checked: done }}
                        onPress={() => {
                          haptic('light');
                          onToggleStep(step.id);
                        }}
                        className="w-full flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-neutral-50 dark:active:bg-white/[0.04]"
                      >
                        <View
                          className={`h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                            done ? 'border-transparent bg-green-500' : 'border-neutral-300 dark:border-neutral-600'
                          }`}
                        >
                          {done && <Icon icon={IconCheck} size={14} strokeWidth={3} className="text-white" />}
                        </View>
                        <Text
                          className={`text-[14px] font-semibold tabular-nums ${
                            done ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-100'
                          }`}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}

            {trackingType === 'checkbox' && (
              <View className="px-4 pb-4 pt-2">
                <View className="flex-row items-center justify-between">
                  <Text className={`text-[16px] font-bold ${progress.complete ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
                    {progress.complete ? 'Completed' : 'Not yet'}
                  </Text>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={progress.complete ? 'Mark incomplete' : 'Mark complete'}
                    accessibilityState={{ checked: progress.complete }}
                    onPress={() => {
                      haptic('light');
                      onToggleCheckbox();
                    }}
                    className={`h-11 w-11 items-center justify-center rounded-full border-[2.5px] active:scale-[0.9] ${
                      progress.complete ? 'border-transparent bg-green-500' : 'border-neutral-300 dark:border-neutral-600'
                    }`}
                  >
                    <CheckDraw visible={progress.complete} size={22} strokeWidth={3} className="text-white" />
                  </Pressable>
                </View>

                {/* Purely descriptive — one tap above covers all of these;
                    they're never checked off individually (that's what
                    trackingType "checklist" is for). */}
                {(ritual.steps ?? []).length > 0 && (
                  <View className="mt-3 flex-row flex-wrap gap-1.5">
                    {ritual.steps!.map((step) => (
                      <View key={step.id} className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                        <Text className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">{step.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── Consistency ──────────────────────────────────────────────────── */}
          <View className={`gap-3 p-4 ${CARD}`}>
            <Text className={EYEBROW}>Consistency</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <View className="flex-row items-center gap-1">
                  <Icon icon={IconFlame} size={15} strokeWidth={2.4} className="text-emerald-500" />
                  <Text className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.streak}</Text>
                </View>
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Current streak</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-1">
                  <Icon icon={IconTrophy} size={15} strokeWidth={2.2} className="text-amber-500" />
                  <Text className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.bestStreak}</Text>
                </View>
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Best streak</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.adherencePct}%</Text>
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Last 30 days</Text>
              </View>
            </View>
            <View className="flex-row items-center justify-between gap-1.5 pt-1">
              {stats.dots.map((done, i) => (
                <View key={i} className={`h-2 flex-1 rounded-full ${done ? 'bg-green-500' : 'bg-neutral-200 dark:bg-white/10'}`} />
              ))}
            </View>
          </View>

          <RoutineMonthCalendar year={calYear} month={calMonth} days={calendarDays} onPrevMonth={prevCalMonth} onNextMonth={nextCalMonth} />

          {ritual.notes && (
            <View className={`p-4 ${CARD}`}>
              <Text className={`mb-1.5 ${EYEBROW}`}>Notes</Text>
              <Text className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{ritual.notes}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
