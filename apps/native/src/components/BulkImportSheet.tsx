import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dimensions, Pressable, Share, View } from 'react-native';
import { IconCalendarEvent, IconCheck, IconChevronDown, IconCircleCheck, IconClock, IconShare2, IconSparkles, IconTrash } from '@tabler/icons-react-native';
import type { DayKey, Plan } from '@planr/core/lib/scheduleTypes';
import { countTasks, parseSchedule, type ParsedDay, type ParseResult } from '@planr/core/lib/scheduleParser';
import { curriculumToParseResult, looksLikeCurriculum, parseCurriculum, weekdaysNeedingTime } from '@planr/core/lib/curriculumParser';
import { localISODate } from '@planr/core/lib/dateUtils';
import { formatDisplayTime } from '@planr/core/lib/timeUtils';
import { haptic } from '../lib/haptics';
import BottomSheet from './ui/BottomSheet';
import SheetHeader from './ui/SheetHeader';
import DateInput from './ui/DateInput';
import { Icon, type TablerIcon } from './ui/Icon';
import { Text, TextInput } from './ui/Text';
import { SECTION_ICONS } from './SectionIcons';

const PLAN_ICONS: Record<string, TablerIcon> = Object.fromEntries(SECTION_ICONS.map((s) => [s.name, s.icon]));

const SAMPLE = `# Marathon Training
Description: 12-week sub-4 plan
Start: 2026-06-10
End: 2026-09-01

Monday
- Long run 6 AM
    - Warmup [easy pace] (10 min)
    - Main set [10k] (45 min)
    - Cooldown [stretch] (5 min)
Wednesday
- Tempo run 6 AM
    - 5x1k [race pace] (30 min)`;

// The starter file — a commented legend (// lines are ignored on import)
// followed by the marathon example so it parses back to the same plan.
const TEMPLATE = `// PlanR schedule template — edit this, then paste it back.
// Lines starting with // are ignored on import.
//
//   # Plan title           creates a new plan
//   Description: ...        plan description (optional)
//   Start: YYYY-MM-DD       plan start date (optional)
//   End: YYYY-MM-DD         plan end date (optional)
//   Monday, Tuesday ...     day headers group the tasks under them
//   - Task name 7 AM        a task (time optional)
//       - Subtask [info] (duration)   indent a bullet to make it a subtask
//
${SAMPLE}
`;

const TIME_OPTS: { label: string; sub: string; time: string }[] = [
  { label: 'Morning', sub: '6 AM – 12 PM', time: '9:00 AM' },
  { label: 'Afternoon', sub: '12 PM – 5 PM', time: '2:00 PM' },
  { label: 'Evening', sub: '5 PM – 9 PM', time: '7:00 PM' },
  { label: 'Night', sub: '9 PM – 12 AM', time: '9:00 PM' },
];

function endFrom(start: string): string {
  // +1h, reusing simple parse (kept local to avoid importing internals).
  const m = start.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return start;
  let h = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === 'PM') h += 12;
  const total = (h * 60 + parseInt(m[2], 10) + 60) % (24 * 60);
  const hh = Math.floor(total / 60);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${hh % 12 || 12}:${String(total % 60).padStart(2, '0')} ${ampm}`;
}

function Step({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-emerald-600">
        <Text className="text-[12px] font-bold text-white">{n}</Text>
      </View>
      <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">{title}</Text>
      {children}
    </View>
  );
}

const OUTLINE_BUTTON =
  'flex-row items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 active:bg-neutral-50 dark:border-white/[0.1] dark:bg-white/[0.03] dark:active:bg-white/[0.05]';

interface BulkImportSheetProps {
  open: boolean;
  plans: Plan[];
  fallbackDay?: ParsedDay['day'];
  onClose: () => void;
  onCommit: (result: ParseResult) => void;
}

/**
 * Native port of components/BulkImportSheet.tsx — paste a plan, see it parsed
 * live (day lists via parseSchedule, multi-week curricula via
 * parseCurriculum), answer the missing times, and create the plan and tasks.
 * The template goes out through the share sheet; a file's contents come in
 * by pasting into the source field. ("Parse with AI" belongs to the on-device
 * AI the native build doesn't include.)
 */
export default function BulkImportSheet({ open, plans, fallbackDay = 'monday', onClose, onCommit }: BulkImportSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} maxHeight={Dimensions.get('window').height * 0.88}>
      <View className="px-5 pb-6 pt-2">
        <BulkImportFlow
          plans={plans}
          fallbackDay={fallbackDay}
          onCommit={onCommit}
          onDone={onClose}
          header={<SheetHeader eyebrow="Bulk import" title="Paste schedule" onClose={onClose} />}
        />
      </View>
    </BottomSheet>
  );
}

interface BulkImportFlowProps {
  plans: Plan[];
  fallbackDay?: ParsedDay['day'];
  onCommit: (result: ParseResult) => void;
  onDone: () => void;
  header?: ReactNode;
}

export function BulkImportFlow({ plans, fallbackDay = 'monday', onCommit, onDone, header }: BulkImportFlowProps) {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<ParseResult>({ days: [], plans: [] });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // A multi-week curriculum ("WEEK 1 …") is a different grammar from a flat
  // day list — detected from the text so the user doesn't have to pick a mode.
  const curriculum = useMemo(() => (looksLikeCurriculum(text) ? parseCurriculum(text) : null), [text]);
  const needTimeFor = useMemo(() => (curriculum ? weekdaysNeedingTime(curriculum) : []), [curriculum]);
  const [planTitle, setPlanTitle] = useState('');
  const [startDateISO, setStartDateISO] = useState(() => localISODate(new Date()));
  const [startTimes, setStartTimes] = useState<Partial<Record<DayKey, string>>>({});

  // Re-parse on text change (cheap, synchronous, offline).
  useEffect(() => {
    setResult(
      curriculum
        ? curriculumToParseResult(curriculum, {
            planTitle: planTitle.trim() || 'Imported plan',
            startDateISO,
            startTimeByWeekday: startTimes,
          })
        : parseSchedule(text, plans, fallbackDay),
    );
    setCollapsed(new Set());
  }, [text, plans, fallbackDay, curriculum, planTitle, startDateISO, startTimes]);

  const { days, plans: newPlans } = result;
  const total = countTasks(days);
  const missing = useMemo(() => days.flatMap((d) => d.tasks.filter((t) => t.needsTime).map((t) => ({ day: d, task: t }))), [days]);
  const current = missing[0];

  function setTaskTime(taskId: string, time: string) {
    haptic('light');
    setResult((prev) => ({
      ...prev,
      days: prev.days.map((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, startTime: time, endTime: endFrom(time), needsTime: false } : t)),
      })),
    }));
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (current) next.delete(current.day.day);
      return next;
    });
  }

  function toggleDay(day: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function commit() {
    if (total === 0) return;
    haptic('medium');
    onCommit(result);
    onDone();
  }

  async function shareTemplate() {
    haptic('light');
    try {
      await Share.share({ message: TEMPLATE, title: 'my-schedule-template.txt' });
    } catch {
      // dismissed
    }
  }

  return (
    <View className="gap-5">
      {header && (
        <View className="gap-3">
          {header}
          <View className="flex-row items-start justify-between gap-3">
            <Text className="min-w-0 flex-1 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              Paste a plan — we'll turn it into scheduled tasks. One line per task, with day headers like "Monday".
            </Text>
            <View className="mt-0.5 shrink-0 flex-row items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5">
              <Icon icon={IconSparkles} size={14} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
              <Text className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Parsing</Text>
            </View>
          </View>
        </View>
      )}

      {/* Step 1 — paste */}
      <Step n={1} title="Paste your plan">
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptic('light');
            setText('');
          }}
          className="ml-auto flex-row items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 active:bg-neutral-50 dark:border-white/[0.1] dark:bg-white/[0.03]"
        >
          <Icon icon={IconTrash} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
          <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Clear</Text>
        </Pressable>
      </Step>
      <View className="flex-row flex-wrap items-center gap-2">
        <Pressable accessibilityRole="button" onPress={() => void shareTemplate()} className={OUTLINE_BUTTON}>
          <Icon icon={IconShare2} size={14} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
          <Text className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">Share template</Text>
        </Pressable>
      </View>
      <View className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
        <View className="border-b border-neutral-100 px-4 py-2.5 dark:border-white/[0.06]">
          <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">Source</Text>
        </View>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="none"
          placeholder={SAMPLE}
          accessibilityLabel="Schedule source"
          className="h-[210px] w-full px-4 py-3 text-[16px] leading-7 text-neutral-900 dark:text-white"
        />
        <Text className="absolute bottom-2 right-3 text-[11px] text-neutral-500 dark:text-neutral-400">{text.length}/2000</Text>
      </View>

      {total > 0 && (
        <View className="flex-row items-center gap-2">
          <View className="h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-500/15">
            <Icon icon={IconCheck} size={12} strokeWidth={3} className="text-emerald-600 dark:text-emerald-400" />
          </View>
          <Text className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400">Parsed</Text>
          <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">
            · {total} task{total !== 1 ? 's' : ''} found
          </Text>
        </View>
      )}

      {/* Step 2 — preview */}
      {days.length > 0 && (
        <>
          <Step n={2} title="Preview (auto-detected)" />
          {newPlans.length > 0 && (
            <View className="gap-2">
              {newPlans.map((p) => (
                <View key={p.ref} className="flex-row items-start gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                  <View className="h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12">
                    <Icon icon={PLAN_ICONS[p.emoji] ?? IconCalendarEvent} size={17} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <View className="flex-row items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5">
                        <Icon icon={IconSparkles} size={11} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />
                        <Text className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-600 dark:text-emerald-400">New plan</Text>
                      </View>
                      <Text className="min-w-0 flex-1 truncate text-[16px] font-bold text-neutral-900 dark:text-white">{p.title}</Text>
                    </View>
                    {p.description ? <Text className="mt-1 truncate text-[13px] text-neutral-500 dark:text-neutral-400">{p.description}</Text> : null}
                    {(p.startDate || p.endDate) && (
                      <Text className="mt-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                        {p.startDate ?? '…'} → {p.endDate ?? '…'}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
          {curriculum && (
            // Everything a curriculum can't state for itself — asked once per weekday.
            <View className="gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] px-4 py-3.5">
              <View className="flex-row flex-wrap items-baseline gap-2">
                <Text className="text-[13px] font-bold text-violet-700 dark:text-violet-300">{curriculum.weeks.length}-week plan detected</Text>
                <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  {total} sessions
                  {curriculum.ignoredLines.length > 0 ? ` · ${curriculum.ignoredLines.length} line(s) skipped` : ' · every line used'}
                </Text>
              </View>

              <View className="gap-1">
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Plan name</Text>
                <TextInput
                  value={planTitle}
                  onChangeText={setPlanTitle}
                  placeholder="Imported plan"
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[13px] font-semibold text-neutral-900 dark:border-white/[0.1] dark:bg-neutral-900 dark:text-white"
                />
              </View>

              <View className="gap-1">
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Week 1 starts</Text>
                <DateInput value={startDateISO} onChange={(v) => v && setStartDateISO(v)} />
              </View>

              {needTimeFor.length > 0 && (
                <View className="gap-2">
                  <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Start time for sessions the text doesn't time</Text>
                  {needTimeFor.map((day) => (
                    <View key={day} className="flex-row items-center gap-2">
                      <Text className="w-20 shrink-0 text-[12px] font-semibold capitalize text-neutral-700 dark:text-neutral-200">{day}</Text>
                      <View className="flex-1 flex-row flex-wrap gap-1.5">
                        {TIME_OPTS.map((o) => {
                          const active = (startTimes[day] ?? '9:00 AM') === o.time;
                          return (
                            <Pressable
                              key={o.time}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              onPress={() => {
                                haptic('light');
                                setStartTimes((p) => ({ ...p, [day]: o.time }));
                              }}
                              className={`rounded-full border px-2.5 py-1 ${active ? 'border-violet-500 bg-violet-500' : 'border-neutral-200 bg-white dark:border-white/[0.1] dark:bg-neutral-900'}`}
                            >
                              <Text className={`text-[11px] font-semibold ${active ? 'text-white' : 'text-neutral-600 dark:text-neutral-300'}`}>{o.time}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
          <View className="gap-2.5">
            {days.map((d) => {
              const isCollapsed = collapsed.has(d.day);
              return (
                <View key={d.day} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: !isCollapsed }} onPress={() => toggleDay(d.day)} className="w-full flex-row items-center gap-2.5 px-4 py-3.5">
                    <Icon icon={IconCalendarEvent} size={16} strokeWidth={2} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <Text className="text-[16px] font-bold text-neutral-900 dark:text-white">{d.label}</Text>
                    <Text className="ml-auto text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {d.tasks.length} task{d.tasks.length !== 1 ? 's' : ''}
                    </Text>
                    <View style={{ transform: [{ rotate: isCollapsed ? '-90deg' : '0deg' }] }}>
                      <Icon icon={IconChevronDown} size={16} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                    </View>
                  </Pressable>
                  {!isCollapsed && (
                    <View className="gap-2 border-t border-neutral-100 px-4 py-3 dark:border-white/[0.06]">
                      {d.tasks.map((t) => (
                        <View key={t.id} className="rounded-[20px] border border-neutral-100 px-3 py-3 dark:border-white/[0.05]">
                          <View className="flex-row items-center gap-2.5">
                            <Text className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">{t.title}</Text>
                            {t.needsTime ? (
                              <View className="shrink-0 flex-row items-center gap-1">
                                <Icon icon={IconClock} size={13} strokeWidth={2} className="text-amber-600 dark:text-amber-400" />
                                <Text className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">Time?</Text>
                              </View>
                            ) : (
                              <Text className="shrink-0 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                                {formatDisplayTime(t.startTime)}
                                {t.endTime ? `–${formatDisplayTime(t.endTime)}` : ''}
                              </Text>
                            )}
                          </View>
                          {/* A dated session lands on one specific day. */}
                          {t.dateISO && (
                            <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                              {new Date(`${t.dateISO}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                            </Text>
                          )}
                          {t.subtasks && t.subtasks.length > 0 && (
                            <View className="mt-2 gap-1.5 border-l-2 border-emerald-500/18 pl-3">
                              {t.subtasks.map((s) => (
                                <View key={s.id} className="flex-row items-center gap-1.5">
                                  <View className="h-1 w-1 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600" />
                                  <Text className="min-w-0 shrink truncate text-[12px] font-medium text-neutral-600 dark:text-neutral-300">{s.title}</Text>
                                  {s.info ? <Text className="shrink truncate text-[12px] text-neutral-500 dark:text-neutral-400">· {s.info}</Text> : null}
                                  {s.duration ? (
                                    <View className="ml-auto shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 dark:bg-white/[0.06]">
                                      <Text className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">{s.duration}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Step 3 — missing info Q&A */}
      {total > 0 && (
        <>
          <Step n={3} title="Missing information" />
          {current ? (
            <View className="rounded-[24px] border border-amber-500/28 bg-amber-50/85 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <View className="flex-row items-start gap-2.5">
                <View className="h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/25">
                  <Icon icon={IconClock} size={15} strokeWidth={2} className="text-amber-700 dark:text-amber-400" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">What time should this happen?</Text>
                  <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                    {current.task.title} ({current.day.label})
                  </Text>
                </View>
                <View className="shrink-0 rounded-full bg-amber-500/25 px-2.5 py-0.5">
                  <Text className="text-[11px] font-bold text-amber-700 dark:text-amber-400">{missing.length === 1 ? 'Last one' : `${total - missing.length + 1} of ${total}`}</Text>
                </View>
              </View>
              <View className="mt-3 flex-row flex-wrap" style={{ margin: -4 }}>
                {TIME_OPTS.map((o) => (
                  <View key={o.label} style={{ width: '50%', padding: 4 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setTaskTime(current.task.id, o.time)}
                      className="items-center rounded-2xl border border-amber-500/25 bg-white px-2 py-2.5 active:border-amber-500 dark:bg-neutral-900"
                    >
                      <Text className="text-[12px] font-semibold text-neutral-800 dark:text-neutral-200">{o.label}</Text>
                      <Text className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{o.sub}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              {current.task.suggestedTime && (
                <View className="mt-3 flex-row items-center gap-2">
                  <Icon icon={IconSparkles} size={14} strokeWidth={2} className="text-amber-500" />
                  <Text className="text-[12px] font-bold text-neutral-600 dark:text-neutral-300">Smart suggestion: {current.task.suggestedTime}</Text>
                  <Pressable accessibilityRole="button" onPress={() => setTaskTime(current.task.id, current.task.suggestedTime!)} className="ml-auto" hitSlop={8}>
                    <Text className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">Use this</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View className="flex-row items-center gap-2.5 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.08] dark:bg-neutral-900">
              <View className="h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500">
                <Icon icon={IconCheck} size={15} strokeWidth={3} className="text-white" />
              </View>
              <View>
                <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">All set!</Text>
                <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">Every task has a time.</Text>
              </View>
            </View>
          )}
        </>
      )}

      {/* Create */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: total === 0 }}
        disabled={total === 0}
        onPress={commit}
        className={`mt-1 w-full items-center gap-0.5 rounded-full bg-neutral-900 py-3.5 active:scale-[0.98] active:bg-neutral-800 dark:bg-white ${total === 0 ? 'opacity-50' : ''}`}
      >
        <View className="flex-row items-center gap-2">
          <Icon icon={IconCircleCheck} size={18} strokeWidth={2} className="text-white dark:text-neutral-900" />
          <Text className="text-[16px] font-bold text-white dark:text-neutral-900">
            {newPlans.length > 0 ? `Create Plan + ${total} Task${total !== 1 ? 's' : ''}` : `Create ${total} Task${total !== 1 ? 's' : ''}`}
          </Text>
        </View>
        <Text className="text-[12px] font-medium text-white opacity-90 dark:text-neutral-900">
          {newPlans.length > 0 ? 'Review and create your plan' : 'Review and create your tasks'}
        </Text>
      </Pressable>
    </View>
  );
}
