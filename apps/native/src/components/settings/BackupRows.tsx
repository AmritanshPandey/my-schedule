import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, Share, View } from 'react-native';
import { IconChevronDown, IconDownload, IconFileText, IconHistory, IconSparkles, IconUpload } from '@tabler/icons-react-native';
import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { DAYS } from '@planr/core/lib/scheduleConstants';
import { backupFilename, buildBackupFile, parseBackup } from '@planr/core/lib/backup';
import { buildDemoSchedule } from '@planr/core/lib/demoData';
import { buildMarkdown, markdownFilename, type MarkdownScope } from '@planr/core/lib/markdownExport';
import { useAuth } from '../../contexts/AuthProvider';
import { fetchCloudBackup, listCloudBackups, type CloudBackupMeta } from '../../lib/cloudSync';
import { haptic } from '../../lib/haptics';
import { versionLabel } from '../../lib/buildInfo';
import ConfirmSheet from '../ui/ConfirmSheet';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button from '../ui/Button';
import { FORM_TEXTAREA_CLASS } from '../ui/Input';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';

function formatBackupDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

/** Whether there is anything here worth rescuing before it gets replaced. */
function hasAnyData(schedule: Schedule): boolean {
  return (
    schedule.plans.length > 0 ||
    schedule.notes.length > 0 ||
    schedule.rituals.length > 0 ||
    DAYS.some((day) => (schedule.activities[day]?.length ?? 0) > 0)
  );
}

/**
 * Hand the backup to the system share sheet — the phone's "download": save it
 * to Files, AirDrop it, mail it. Resolves true when it was actually shared
 * (iOS reports a dismissed sheet; Android always reports shared).
 */
async function shareBackup(schedule: Schedule): Promise<boolean> {
  const json = JSON.stringify(buildBackupFile(schedule, versionLabel()), null, 2);
  const result = await Share.share({ message: json, title: backupFilename() }, { subject: backupFilename() });
  return result.action === Share.sharedAction;
}

const ICON_TILE = 'h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.04]';
const ROW_BUTTON = 'shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 active:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.07]';
const ROW_BUTTON_TEXT = 'text-[11px] font-semibold text-neutral-700 dark:text-neutral-200';
const DIVIDER = 'mx-4 border-t border-neutral-100 dark:border-white/[0.05]';

function RowIcon({ icon }: { icon: typeof IconDownload }) {
  return (
    <View className={ICON_TILE}>
      <Icon icon={icon} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-300" />
    </View>
  );
}

/**
 * Native port of components/settings/BackupRows.tsx — export, Markdown export,
 * restore, demo data and cloud version history for the Settings Data card.
 *
 * What differs is only how a file leaves and enters the app: the web
 * downloads a .json/.md and reads one back through a file input; here the
 * same JSON/Markdown text goes out through the system share sheet, and a
 * backup comes back in by pasting its contents. Parsing, validation, the
 * confirm sheets and the "back up before demo data replaces everything" rule
 * are the web's, unchanged.
 */
export default function BackupRows({ schedule, onRestoreData }: { schedule: Schedule; onRestoreData?: (raw: unknown) => boolean }) {
  const { isGuest } = useAuth();
  const [pendingRaw, setPendingRaw] = useState<unknown>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'done' | 'error'; message: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<CloudBackupMeta[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cloudRestoreId, setCloudRestoreId] = useState<string | null>(null);
  const [cloudRestoring, setCloudRestoring] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(
    () => () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const showFeedback = useCallback((kind: 'done' | 'error', message: string) => {
    setFeedback({ kind, message });
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 5_000);
  }, []);

  const handleExport = useCallback(async () => {
    haptic('light');
    try {
      if (await shareBackup(schedule)) showFeedback('done', 'Backup exported.');
    } catch {
      showFeedback('error', 'Export failed — try again.');
    }
  }, [schedule, showFeedback]);

  const handleMarkdown = useCallback(
    async (scope: MarkdownScope) => {
      haptic('light');
      try {
        const result = await Share.share({ message: buildMarkdown(scope, schedule), title: markdownFilename(scope) }, { subject: markdownFilename(scope) });
        if (result.action === Share.sharedAction) showFeedback('done', `${scope[0].toUpperCase()}${scope.slice(1)} exported as Markdown.`);
      } catch {
        showFeedback('error', 'Export failed — try again.');
      }
    },
    [schedule, showFeedback],
  );

  const handlePasted = useCallback(() => {
    try {
      const raw = parseBackup(pasteText);
      setPasteOpen(false);
      setPasteText('');
      setPendingRaw(raw);
      setConfirmOpen(true);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : "Couldn't read that backup.");
    }
  }, [pasteText, showFeedback]);

  const handleRestoreConfirm = useCallback(() => {
    setConfirmOpen(false);
    if (pendingRaw == null || !onRestoreData) return;
    const ok = onRestoreData(pendingRaw);
    setPendingRaw(null);
    if (ok) haptic('light');
    showFeedback(ok ? 'done' : 'error', ok ? 'Backup restored.' : "That backup couldn't be loaded — your data is unchanged.");
  }, [pendingRaw, onRestoreData, showFeedback]);

  /**
   * Install the demo dataset, saving what's already here first. The backup is
   * not a formality: this replaces the entire schedule, and "Clear all data"
   * is not a way back for a signed-in user. A backup that wasn't saved aborts
   * the whole thing rather than proceeding unprotected.
   */
  const handleDemoConfirm = useCallback(async () => {
    setDemoOpen(false);
    if (!onRestoreData) return;

    let backedUp = false;
    if (hasAnyData(schedule)) {
      try {
        backedUp = await shareBackup(schedule);
      } catch {
        backedUp = false;
      }
      if (!backedUp) {
        showFeedback('error', "Couldn't save a backup first — nothing was replaced.");
        return;
      }
    }

    const ok = onRestoreData(buildDemoSchedule());
    if (ok) haptic('light');
    showFeedback(
      ok ? 'done' : 'error',
      ok
        ? backedUp
          ? 'Demo data loaded. Your previous data was exported as a backup first.'
          : 'Demo data loaded.'
        : "Couldn't load the demo data — your data is unchanged.",
    );
  }, [schedule, onRestoreData, showFeedback]);

  const toggleHistory = useCallback(async () => {
    haptic('light');
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (!opening || history !== null) return;
    setHistoryLoading(true);
    try {
      setHistory(await listCloudBackups());
    } catch {
      setHistory([]);
      showFeedback('error', "Couldn't load version history.");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyOpen, history, showFeedback]);

  const handleCloudRestore = useCallback(async () => {
    const id = cloudRestoreId;
    setCloudRestoreId(null);
    if (!id || !onRestoreData) return;
    setCloudRestoring(true);
    try {
      const raw = await fetchCloudBackup(id);
      if (raw == null) {
        showFeedback('error', 'That snapshot is no longer available.');
        return;
      }
      const ok = onRestoreData(raw);
      if (ok) haptic('light');
      showFeedback(ok ? 'done' : 'error', ok ? `Restored the snapshot from ${formatBackupDate(id)}.` : "That snapshot couldn't be loaded — your data is unchanged.");
    } catch {
      showFeedback('error', "Couldn't fetch that snapshot — check your connection.");
    } finally {
      setCloudRestoring(false);
    }
  }, [cloudRestoreId, onRestoreData, showFeedback]);

  return (
    <>
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <RowIcon icon={IconDownload} />
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Export backup</Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">Exports everything as JSON · plans, history, notes</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void handleExport()} className={ROW_BUTTON}>
          <Text className={ROW_BUTTON_TEXT}>Export</Text>
        </Pressable>
      </View>
      <View className={DIVIDER} />
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <RowIcon icon={IconFileText} />
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Export for AI analysis</Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">Readable Markdown · paste into an AI chat to review execution</Text>
        </View>
        <View className="shrink-0 flex-row gap-1.5">
          {(['plans', 'weeklies', 'tasks'] as const).map((scope) => (
            <Pressable
              key={scope}
              accessibilityRole="button"
              accessibilityLabel={`Export ${scope} as Markdown`}
              onPress={() => void handleMarkdown(scope)}
              className="rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 active:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.07]"
            >
              <Text className={`capitalize ${ROW_BUTTON_TEXT}`}>{scope}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {onRestoreData && (
        <>
          <View className={DIVIDER} />
          <View className="flex-row items-center gap-3 px-4 py-3.5">
            <RowIcon icon={IconUpload} />
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Restore from backup</Text>
              <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">Replaces current data with the backup's contents</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic('light');
                setPasteOpen(true);
              }}
              className={ROW_BUTTON}
            >
              <Text className={ROW_BUTTON_TEXT}>Restore</Text>
            </Pressable>
          </View>
          <View className={DIVIDER} />
          <View className="flex-row items-center gap-3 px-4 py-3.5">
            <RowIcon icon={IconSparkles} />
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Load demo data</Text>
              <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">Ten weeks of sample history · see every screen with real numbers</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic('light');
                setDemoOpen(true);
              }}
              className={ROW_BUTTON}
            >
              <Text className={ROW_BUTTON_TEXT}>Load</Text>
            </Pressable>
          </View>
        </>
      )}
      {!isGuest && onRestoreData && (
        <>
          <View className={DIVIDER} />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: historyOpen }}
            onPress={() => void toggleHistory()}
            className="w-full flex-row items-center gap-3 px-4 py-3.5 active:bg-neutral-50 dark:active:bg-white/[0.03]"
          >
            <RowIcon icon={IconHistory} />
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Version history</Text>
              <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">Daily cloud snapshots · roll back if something goes wrong</Text>
            </View>
            <View style={{ transform: [{ rotate: historyOpen ? '180deg' : '0deg' }] }}>
              <Icon icon={IconChevronDown} size={14} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
            </View>
          </Pressable>
          {historyOpen && (
            <View className="px-4 pb-3">
              {historyLoading ? (
                <View className="flex-row items-center gap-2 py-2">
                  <ActivityIndicator size="small" />
                  <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Loading snapshots…</Text>
                </View>
              ) : !history || history.length === 0 ? (
                <Text className="py-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                  No snapshots yet — one is saved automatically with the first sync of each day.
                </Text>
              ) : (
                <View className="rounded-xl border border-neutral-100 dark:border-white/[0.06]">
                  {history.map((b, i) => (
                    <View key={b.id} className={`flex-row items-center gap-3 px-3 py-2 ${i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.05]' : ''}`}>
                      <Text className="flex-1 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">{formatBackupDate(b.id)}</Text>
                      <Pressable
                        accessibilityRole="button"
                        disabled={cloudRestoring}
                        onPress={() => {
                          haptic('light');
                          setCloudRestoreId(b.id);
                        }}
                        className={`rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 active:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.07] ${
                          cloudRestoring ? 'opacity-50' : ''
                        }`}
                      >
                        <Text className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">Restore</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </>
      )}
      {feedback && (
        <Text
          accessibilityLiveRegion="polite"
          className={`px-4 pb-3 text-[11px] font-semibold ${feedback.kind === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        >
          {feedback.message}
        </Text>
      )}

      {/* Paste-to-restore — the native stand-in for the web's file input. */}
      <BottomSheet
        open={pasteOpen}
        onClose={() => {
          setPasteOpen(false);
          setPasteText('');
        }}
        maxHeight={Dimensions.get('window').height * 0.85}
      >
        <View className="gap-4 px-5 pb-8 pt-4">
          <SheetHeader
            eyebrow="Restore"
            title="Paste a backup"
            onClose={() => {
              setPasteOpen(false);
              setPasteText('');
            }}
          />
          <Text className="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Open a PlanR backup file (from Export backup), copy all of its contents, and paste them here.
          </Text>
          <TextInput
            value={pasteText}
            onChangeText={setPasteText}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder='{"app": "PlanR", …}'
            accessibilityLabel="Backup contents"
            className={`${FORM_TEXTAREA_CLASS} max-h-60 min-h-[140px] text-[12px]`}
          />
          <Button fullWidth onPress={handlePasted} disabled={!pasteText.trim()}>
            Continue
          </Button>
        </View>
      </BottomSheet>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setPendingRaw(null);
        }}
        onConfirm={handleRestoreConfirm}
        title="Restore this backup?"
        description="Everything currently in the app is replaced with the backup's contents. Consider exporting a backup of the current data first."
        confirmLabel="Restore backup"
      />
      <ConfirmSheet
        open={cloudRestoreId !== null}
        onClose={() => setCloudRestoreId(null)}
        onConfirm={() => void handleCloudRestore()}
        title={cloudRestoreId ? `Restore ${formatBackupDate(cloudRestoreId)}?` : 'Restore snapshot?'}
        description="Everything currently in the app is replaced with that day's snapshot. Consider exporting a backup of the current data first."
        confirmLabel="Restore snapshot"
      />
      <ConfirmSheet
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onConfirm={() => void handleDemoConfirm()}
        title="Load demo data?"
        description={
          hasAnyData(schedule)
            ? 'Everything currently in the app is replaced with a sample dataset. Your current data is exported as a backup first — restore it from there to come back.'
            : 'Fills the app with a sample dataset: three plans, ten weeks of history, trackers and notes.'
        }
        confirmLabel="Load demo data"
      />
    </>
  );
}
