import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconCheck, IconEdit, IconFlame, IconMinus, IconPlus, IconTrash, IconTrophy, IconX } from '@tabler/icons-react-native';
import type { Ritual, RitualCompletion } from '@planr/core/lib/scheduleTypes';
import { todayISO } from '@planr/core/lib/dateUtils';
import { calculateRitualStats } from '@planr/core/lib/consistency/calculateRitualStreak';
import { entriesForRitualDate } from '@planr/core/lib/ritualCompletions';
import { ritualDayProgress } from '@planr/core/lib/consistency/ritualDayStatus';
import { buildRitualMonthDays } from '@planr/core/lib/consistency/ritualCalendar';
import { quickAmountsForRitual } from '@planr/core/lib/quickAmounts';
import { describeRecurrence } from '@planr/core/lib/ritualRecurrence';
import { followedPhrase, formatAmount, routineDetailItems, routineGoalLabel, routineWhenLabel } from '@planr/core/lib/routineDetails';
import { haptic } from '../../lib/haptics';
import { iconGlyph, getIconPickerStyle } from '../SectionIcons';
import DetailHeader from '../ui/DetailHeader';
import ProgressBar from '../ui/ProgressBar';
import { CARD, SOFT_PANEL } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';
import RoutineMonthCalendar from './RoutineMonthCalendar';
import FollowedPicker from './FollowedPicker';

interface RoutineDetailViewProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  onBack: () => void;
  /** Mark today done, rated 1–100 for how closely it was followed. */
  onMarkDone: (followed: number) => void;
  onUnmarkDone: () => void;
  onLogAmount: (amount: number) => void;
  onUndoLastLog: () => void;
  onRemoveLog: (entryId: string) => void;
  onToggleStep: (stepId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400';
const CHIP = 'rounded-full border border-neutral-200 px-3 py-1 dark:border-white/[0.10]';
const CHIP_TEXT = 'text-[12px] font-bold text-neutral-700 dark:text-neutral-200';

/**
 * Native port of components/activity/RoutineDetailView.tsx — the full-height
 * routine page, built around the same loop as the list row: mark today done
 * with one tap, then (if you like) say how closely you followed it.
 * Everything else is support: the plan itself (items and their times, the
 * goal, the steps), optional logging for routines measured in amounts, and the
 * record (streaks, times in the last 30 days, how closely followed).
 */
export default function RoutineDetailView({
  ritual,
  ritualCompletions,
  trackingStart,
  onBack,
  onMarkDone,
  onUnmarkDone,
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
  const measured = trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count';
  const tickable = trackingType === 'checklist';
  const todaysEntries = entriesForRitualDate(ritualCompletions, ritual.id, today);
  const loggedEntries = todaysEntries.filter((e) => e.value !== undefined);
  const progress = ritualDayProgress(ritual, todaysEntries);
  const stats = calculateRitualStats(ritual, ritualCompletions, today, trackingStart);
  const quickAmounts = quickAmountsForRitual(ritual);
  const items = routineDetailItems(ritual);
  const goal = routineGoalLabel(ritual);
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

  const unit = ritual.unit ? ` ${ritual.unit}` : '';
  const hasPlan = items.length > 0 || !!goal || !!ritual.duration || !!ritual.notes;

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

      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full gap-5">
          {/* ── Identity ─────────────────────────────────────────────────── */}
          <View className="flex-row items-center gap-3">
            <View className={`h-12 w-12 shrink-0 items-center justify-center rounded-full ${ritual.icon ? iconStyle.tint : 'bg-neutral-100 dark:bg-white/[0.06]'}`}>
              <Icon icon={Glyph} size={22} strokeWidth={1.8} className={ritual.icon ? iconStyle.text : 'text-neutral-500 dark:text-neutral-400'} />
            </View>
            <View className="min-w-0 flex-1">
              {ritual.description ? <Text className="text-[13px] leading-snug text-neutral-600 dark:text-neutral-300">{ritual.description}</Text> : null}
              <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                {routineWhenLabel(ritual)} · {describeRecurrence(ritual)}
              </Text>
            </View>
          </View>

          {/* ── Today: one tap, then how closely ─────────────────────────── */}
          <View testID="routine-today" className={`gap-3 p-4 ${CARD}`}>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className={EYEBROW}>Today</Text>
                <Text
                  className={`mt-1 text-[18px] font-black leading-tight ${
                    progress.complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-950 dark:text-white'
                  }`}
                >
                  {progress.complete ? 'Done' : 'Not done yet'}
                </Text>
                {progress.followed !== null && (
                  <Text className="mt-0.5 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
                    {progress.complete
                      ? followedPhrase(progress.followed).replace(/^./, (c) => c.toUpperCase())
                      : `${progress.followed}% so far`}
                  </Text>
                )}
              </View>
              {!progress.complete ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    haptic('medium');
                    onMarkDone(100);
                  }}
                  className="h-12 shrink-0 flex-row items-center gap-2 rounded-full bg-neutral-950 px-5 active:bg-neutral-800 dark:bg-white dark:active:bg-neutral-200"
                >
                  <Icon icon={IconCheck} size={17} strokeWidth={2.8} className="text-white dark:text-neutral-950" />
                  <Text className="text-[14px] font-extrabold text-white dark:text-neutral-950">Mark done</Text>
                </Pressable>
              ) : progress.markedDone ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    haptic('light');
                    onUnmarkDone();
                  }}
                  className="h-11 shrink-0 flex-row items-center gap-1.5 rounded-full border border-neutral-200 px-4 active:bg-neutral-50 dark:border-white/[0.12] dark:active:bg-white/[0.05]"
                >
                  <Icon icon={IconX} size={14} strokeWidth={2.4} className="text-neutral-700 dark:text-neutral-200" />
                  <Text className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200">Mark not done</Text>
                </Pressable>
              ) : null}
            </View>

            {progress.complete && (
              <FollowedPicker
                prompt="How closely did you follow it?"
                value={progress.followed}
                routineTitle={ritual.title}
                onChange={(pct) => onMarkDone(pct)}
              />
            )}
          </View>

          {/* ── The plan — reference detail, never a gate ───────────────── */}
          {hasPlan && (
            <View testID="routine-plan" className={`gap-3 p-4 ${CARD}`}>
              <Text className={EYEBROW}>The plan</Text>

              {(goal || ritual.duration) && (
                <View className="flex-row flex-wrap gap-1.5">
                  {goal && (
                    <View className={CHIP}>
                      <Text className={CHIP_TEXT}>{goal}</Text>
                    </View>
                  )}
                  {ritual.duration ? (
                    <View className={CHIP}>
                      <Text className={CHIP_TEXT}>About {ritual.duration} min</Text>
                    </View>
                  ) : null}
                </View>
              )}

              {items.length > 0 && (
                <View>
                  {tickable && (
                    <Text className="mb-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                      Tick them off as you go if it helps. Marking the day done covers all of them.
                    </Text>
                  )}
                  <View className={`overflow-hidden ${SOFT_PANEL}`}>
                    {items.map((item, i) => {
                      const ticked = tickable && todaysEntries.some((e) => e.stepId === item.id);
                      const row = (
                        <>
                          {tickable && (
                            <View
                              className={`h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                                ticked ? 'border-transparent bg-green-500' : 'border-neutral-300 dark:border-neutral-600'
                              }`}
                            >
                              {ticked && <Icon icon={IconCheck} size={14} strokeWidth={3} className="text-white" />}
                            </View>
                          )}
                          {item.time && (
                            <Text className="w-[68px] shrink-0 text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{item.time}</Text>
                          )}
                          <Text
                            className={`min-w-0 flex-1 text-[14px] font-semibold tabular-nums ${
                              ticked ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-800 dark:text-neutral-100'
                            }`}
                          >
                            {item.label}
                          </Text>
                        </>
                      );
                      const divider = i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : '';
                      return tickable ? (
                        <Pressable
                          key={item.id}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: ticked }}
                          onPress={() => {
                            haptic('light');
                            onToggleStep(item.id);
                          }}
                          className={`min-h-[44px] w-full flex-row items-center gap-3 px-3 py-2 active:bg-neutral-100/60 dark:active:bg-white/[0.04] ${divider}`}
                        >
                          {row}
                        </Pressable>
                      ) : (
                        <View key={item.id} className={`min-h-[44px] flex-row items-center gap-3 px-3 py-2 ${divider}`}>
                          {row}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {ritual.notes ? <Text className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{ritual.notes}</Text> : null}
            </View>
          )}

          {/* ── Optional amounts, for routines measured that way ─────────── */}
          {measured && (
            <View className={`gap-3 p-4 ${CARD}`}>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text className={EYEBROW}>
                  Log an amount <Text className="font-semibold normal-case tracking-normal text-neutral-500 dark:text-neutral-400">· optional</Text>
                </Text>
                <Text className="text-[13px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
                  {formatAmount(progress.value)}
                  {ritual.target ? ` / ${formatAmount(ritual.target)}` : ''}
                  {unit}
                </Text>
              </View>
              {ritual.target ? <ProgressBar pct={Math.min(100, Math.round((progress.value / ritual.target) * 100))} height={6} fillClassName="bg-green-500" /> : null}
              <View className="flex-row flex-wrap items-center gap-1.5">
                {progress.value > 0 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Undo last amount"
                    onPress={() => {
                      haptic('light');
                      onUndoLastLog();
                    }}
                    className="h-11 w-11 items-center justify-center rounded-full border border-neutral-200 dark:border-white/[0.10]"
                  >
                    <Icon icon={IconMinus} size={15} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                  </Pressable>
                )}
                {quickAmounts.map((amount) => (
                  <Pressable
                    key={amount}
                    accessibilityRole="button"
                    accessibilityLabel={`Log ${formatAmount(amount)}${unit}`}
                    onPress={() => {
                      haptic('medium');
                      onLogAmount(amount);
                    }}
                    className="h-11 flex-row items-center gap-1 rounded-full border border-neutral-200 px-3.5 active:bg-neutral-50 dark:border-white/[0.10] dark:active:bg-white/[0.05]"
                  >
                    <Icon icon={IconPlus} size={12} strokeWidth={2.6} className="text-neutral-700 dark:text-neutral-200" />
                    <Text className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200">
                      {formatAmount(amount)}
                      {unit}
                    </Text>
                  </Pressable>
                ))}
                <View className="h-11 flex-row items-center gap-1 rounded-full border border-neutral-200 pl-3.5 pr-1 dark:border-white/[0.10]">
                  <TextInput
                    keyboardType="decimal-pad"
                    value={customValue}
                    onChangeText={setCustomValue}
                    onSubmitEditing={handleCustomLog}
                    returnKeyType="done"
                    placeholder="Other"
                    accessibilityLabel="Other amount"
                    className="w-16 py-0 text-[13px] font-semibold text-neutral-800 dark:text-neutral-100"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Log other amount"
                    onPress={handleCustomLog}
                    disabled={!customValue}
                    className={`h-9 w-9 items-center justify-center rounded-full ${customValue ? '' : 'opacity-30'}`}
                  >
                    <Icon icon={IconPlus} size={14} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                  </Pressable>
                </View>
              </View>

              {/* What was logged today — amounts only. When in the day each one
                  happened isn't the point of a routine. */}
              {loggedEntries.length > 0 && (
                <View accessibilityLabel="Logged today" className="flex-row flex-wrap gap-1.5">
                  {loggedEntries.map((entry, i) => (
                    <View key={entry.id ?? `${entry.date}-${i}`} className="h-8 flex-row items-center gap-1 rounded-full bg-neutral-100 pl-3 pr-1 dark:bg-white/[0.06]">
                      <Text className="text-[12px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
                        {formatAmount(entry.value ?? 0)}
                        {unit}
                      </Text>
                      {entry.id && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${formatAmount(entry.value ?? 0)}${unit}`}
                          hitSlop={10}
                          onPress={() => onRemoveLog(entry.id!)}
                          className="h-6 w-6 items-center justify-center rounded-full"
                        >
                          <Icon icon={IconX} size={12} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ── The record ───────────────────────────────────────────────── */}
          <View className={`gap-3 p-4 ${CARD}`}>
            <Text className={EYEBROW}>Consistency</Text>
            <View className="flex-row flex-wrap" style={{ rowGap: 16 }}>
              <View className="w-1/2">
                <View className="flex-row items-center gap-1">
                  <Icon icon={IconFlame} size={15} strokeWidth={2.4} className="text-emerald-600 dark:text-emerald-400" />
                  <Text className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.streak}</Text>
                </View>
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Current streak</Text>
              </View>
              <View className="w-1/2">
                <View className="flex-row items-center gap-1">
                  <Icon icon={IconTrophy} size={15} strokeWidth={2.2} className="text-amber-600 dark:text-amber-400" />
                  <Text className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.bestStreak}</Text>
                </View>
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Best streak</Text>
              </View>
              <View className="w-1/2">
                <Text className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.timesDone}×</Text>
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Done · last 30 days</Text>
              </View>
              <View className="w-1/2">
                <Text className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.followedPct}%</Text>
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Followed · last 30 days</Text>
              </View>
            </View>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="flex-row items-center justify-between gap-1.5 pt-1">
              {stats.dots.map((done, i) => (
                <View key={i} className={`h-2 flex-1 rounded-full ${done ? 'bg-green-500' : 'bg-neutral-200 dark:bg-white/10'}`} />
              ))}
            </View>
          </View>

          <RoutineMonthCalendar year={calYear} month={calMonth} days={calendarDays} onPrevMonth={prevCalMonth} onNextMonth={nextCalMonth} />
        </View>
      </ScrollView>
    </View>
  );
}
