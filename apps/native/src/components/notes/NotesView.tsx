import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Dimensions, Pressable, ScrollView, View } from 'react-native';
import {
  IconActivity,
  IconBrain,
  IconCalendarEvent,
  IconCheck,
  IconLayoutGrid,
  IconLink,
  IconMoon,
  IconNote,
  IconNotebook,
  IconPinnedFilled,
  IconPlus,
  IconRepeat,
  IconSalad,
  IconSearch,
  IconTargetArrow,
  IconX,
} from '@tabler/icons-react-native';
import type { DayKey, Note, Plan, Task } from '@planr/core/lib/scheduleTypes';
import { checklistStats, deriveSnippet, deriveTitle } from '@planr/core/lib/notes/markdown';
import { bodyToPlainText } from '@planr/core/lib/notes/richText';
import { NOTE_TEMPLATE_DEFS, type NoteTemplateIconName } from '@planr/core/lib/notes/templates';
import { stableFieldHash } from '@planr/core/lib/hash';
import { todayISO } from '@planr/core/lib/dateUtils';
import { haptic } from '../../lib/haptics';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { AccentBadge, cycleAccentColor } from '../ui/Badge';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import DetailHeader from '../ui/DetailHeader';
import EmptyState from '../ui/EmptyState';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';
import NoteEditor from './NoteEditor';

const JS_DAYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const TEMPLATE_ICONS: Record<NoteTemplateIconName, TablerIcon> = {
  note: IconNote,
  'calendar-event': IconCalendarEvent,
  repeat: IconRepeat,
  salad: IconSalad,
  activity: IconActivity,
  'target-arrow': IconTargetArrow,
  moon: IconMoon,
  brain: IconBrain,
};

type NotePatch = Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'tags' | 'linkedTaskIds' | 'linkedPlanIds'>>;
type CreateNoteInput = Partial<Pick<Note, 'title' | 'body' | 'tags'>>;
export type CreateTaskFromNoteInput = { title: string; noteId: string; day: DayKey; planId?: string };

interface NotesViewProps {
  notes: Note[];
  onCreate: (input?: CreateNoteInput) => string; // creates a note, returns its id
  onUpdate: (id: string, patch: NotePatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** De-duplicated tasks + plans for note→task linking, and the open handler. */
  tasks: Task[];
  plans: Plan[];
  onOpenTask: (taskId: string) => void;
  onCreateTaskFromNote?: (input: CreateTaskFromNoteInput) => string | undefined;
  onOpenPlan?: (planId: string) => void;
  initialEditingId?: string | null;
  onInitialEditingHandled?: () => void;
  todayDateISO?: string;
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function tagColor(tag: string) {
  return cycleAccentColor(stableFieldHash(tag.toLowerCase()));
}

function SectionLabel({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5 px-1 pb-1">
      {icon}
      <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">{label}</Text>
    </View>
  );
}

function NoteCard({ note, onSelect, onTogglePin }: { note: Note; onSelect: () => void; onTogglePin: () => void }) {
  const stats = checklistStats(note.body);
  const snippet = deriveSnippet(note);
  const tags = note.tags ?? [];
  const linkCount = note.linkedTaskIds?.length ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={deriveTitle(note)}
      onPress={onSelect}
      className="w-full rounded-2xl border border-neutral-100 bg-white px-4 py-3 active:border-neutral-200 active:bg-neutral-50 dark:border-white/[0.06] dark:bg-neutral-900/40 dark:active:bg-white/[0.04]"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="min-w-0 flex-1 truncate text-[16px] font-semibold text-neutral-900 dark:text-white">{deriveTitle(note)}</Text>
        <View className="shrink-0 flex-row items-center gap-1.5">
          <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{relativeDate(note.updatedAt)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={note.pinned ? 'Unpin note' : 'Pin note'}
            accessibilityState={{ selected: !!note.pinned }}
            hitSlop={8}
            onPress={() => {
              haptic('light');
              onTogglePin();
            }}
            className="-mr-1 h-6 w-6 items-center justify-center rounded-lg"
          >
            <Icon icon={IconPinnedFilled} size={15} strokeWidth={2} className={note.pinned ? 'text-amber-500' : 'text-neutral-500 dark:text-neutral-400'} />
          </Pressable>
        </View>
      </View>
      {snippet ? <Text className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">{snippet}</Text> : null}
      {(stats || tags.length > 0 || linkCount > 0) && (
        <View className="mt-2 flex-row flex-wrap items-center gap-1.5">
          {linkCount > 0 && (
            <View className="flex-row items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-white/[0.06]">
              <Icon icon={IconLink} size={11} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
              <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{linkCount}</Text>
            </View>
          )}
          {stats && (
            <View
              className={`flex-row items-center gap-1 rounded-full px-2 py-0.5 ${
                stats.done === stats.total ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-neutral-100 dark:bg-white/[0.06]'
              }`}
            >
              <Icon
                icon={IconCheck}
                size={11}
                strokeWidth={3}
                className={stats.done === stats.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500 dark:text-neutral-400'}
              />
              <Text className={`text-[11px] font-semibold ${stats.done === stats.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
                {stats.done}/{stats.total}
              </Text>
            </View>
          )}
          {tags.map((tag) => (
            <AccentBadge key={tag} color={tagColor(tag)}>
              {tag}
            </AccentBadge>
          ))}
        </View>
      )}
    </Pressable>
  );
}

/**
 * Native port of components/notes/NotesView.tsx's phone layout — the notes
 * list (search, tag filters, pinned first, newest within each group) and the
 * editor that slides over it, plus "Start from a template".
 */
export default function NotesView({
  notes,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
  tasks,
  plans,
  onOpenTask,
  onCreateTaskFromNote,
  onOpenPlan,
  initialEditingId,
  onInitialEditingHandled,
  todayDateISO = todayISO(),
}: NotesViewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const todayDay = useMemo(() => JS_DAYS[new Date(`${todayDateISO}T00:00:00`).getDay()] ?? 'monday', [todayDateISO]);
  const slide = useRef(new Animated.Value(0)).current;

  // Pinned notes float to the top; within each group, most-recently-updated first.
  const sorted = useMemo(() => [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt)), [notes]);

  // Every distinct tag across all notes, for the filter chip row.
  const allTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const n of notes) {
      for (const t of n.tags ?? []) {
        const key = t.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          tags.push(t);
        }
      }
    }
    return tags.sort((a, b) => a.localeCompare(b));
  }, [notes]);

  // Drop selected tags that no longer exist on any note.
  useEffect(() => {
    setSelectedTags((prev) => prev.filter((t) => allTags.some((a) => a.toLowerCase() === t.toLowerCase())));
  }, [allTags]);

  // Search the body's plain text (not raw rich-HTML) so it matches visible words.
  const searchIndex = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes) map.set(n.id, (n.title + ' ' + bodyToPlainText(n.body)).toLowerCase());
    return map;
  }, [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((n) => {
      if (q && !(searchIndex.get(n.id) ?? '').includes(q)) return false;
      if (selectedTags.length > 0) {
        const noteTags = (n.tags ?? []).map((t) => t.toLowerCase());
        if (!selectedTags.every((t) => noteTags.includes(t.toLowerCase()))) return false;
      }
      return true;
    });
  }, [sorted, query, selectedTags, searchIndex]);

  const editingNote = editingId ? notes.find((n) => n.id === editingId) ?? null : null;

  // The editor slides in from the right, like the web's tween (instant under
  // Reduce Motion).
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    Animated.timing(slide, { toValue: editingNote ? 1 : 0, duration: reducedMotion ? 0 : 240, useNativeDriver: true }).start();
  }, [editingNote, slide, reducedMotion]);

  // Android back closes the open note before it leaves Notes. Registered
  // while editing only, after the shell's own handler, so it runs first.
  const editing = !!editingNote;
  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditingId(null);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  useEffect(() => {
    if (!initialEditingId) return;
    if (!notes.some((note) => note.id === initialEditingId)) return;
    setEditingId(initialEditingId);
    onInitialEditingHandled?.();
  }, [initialEditingId, notes, onInitialEditingHandled]);

  function handleCreate(input?: CreateNoteInput) {
    haptic('light');
    const id = onCreate(input);
    setEditingId(id);
  }

  function toggleTagFilter(tag: string) {
    haptic('light');
    setSelectedTags((prev) => (prev.some((t) => t.toLowerCase() === tag.toLowerCase()) ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...prev, tag]));
  }

  function handleDelete(id: string) {
    onDelete(id);
    setEditingId(null);
  }

  const pinnedNotes = filtered.filter((n) => n.pinned);
  const otherNotes = filtered.filter((n) => !n.pinned);
  const renderCard = (note: Note) => (
    <NoteCard
      key={note.id}
      note={note}
      onSelect={() => {
        haptic('light');
        setEditingId(note.id);
      }}
      onTogglePin={() => onUpdate(note.id, { pinned: !note.pinned })}
    />
  );

  const width = Dimensions.get('window').width;

  return (
    <View className="relative flex-1 overflow-hidden bg-white dark:bg-neutral-950">
      <Animated.View
        style={{
          flex: 1,
          opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }),
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.12] }) }],
        }}
        pointerEvents={editingNote ? 'none' : 'auto'}
      >
        <DetailHeader
          title="Notes"
          onBack={onClose}
          actions={[
            { icon: IconLayoutGrid, label: 'New from template', onClick: () => setTemplatePickerOpen(true) },
            { icon: IconPlus, label: 'New note', onClick: () => handleCreate() },
          ]}
        />

        {/* Search */}
        <View className="px-4 pb-3 pt-3">
          <View className="relative justify-center">
            <View pointerEvents="none" className="absolute left-3 z-10">
              <Icon icon={IconSearch} size={15} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes"
              accessibilityLabel="Search notes"
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-9 text-[14px] text-neutral-900 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')} className="absolute right-2.5">
                <Icon icon={IconX} size={15} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Tag filter chips */}
        {allTags.length > 0 && (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-4 pb-3">
              {allTags.map((tag) => {
                const on = selectedTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                return (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => toggleTagFilter(tag)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 ${on ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white' : 'border-neutral-200 dark:border-white/[0.1]'}`}
                  >
                    <Text className={`text-[12px] font-semibold ${on ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}`}>{tag}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* List */}
        <ScrollView className="min-h-0 flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 128 }} keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            notes.length === 0 ? (
              <EmptyState
                icon={IconNotebook}
                title="No notes yet"
                description="Tap New to start a note — jot a paragraph or a checklist."
                action={{ label: 'New note', onClick: () => handleCreate() }}
                secondaryAction={{ label: 'Browse templates', onClick: () => setTemplatePickerOpen(true) }}
              />
            ) : (
              <EmptyState icon={IconSearch} title="No matching notes" description={selectedTags.length > 0 ? 'Try different tags or search.' : 'Try a different search.'} />
            )
          ) : (
            <>
              {pinnedNotes.length > 0 && (
                <View className="gap-1.5">
                  <SectionLabel icon={<Icon icon={IconPinnedFilled} size={12} strokeWidth={2.5} className="text-neutral-600 dark:text-neutral-400" />} label="Pinned" />
                  {pinnedNotes.map(renderCard)}
                </View>
              )}
              <View className={`gap-1.5 ${pinnedNotes.length > 0 ? 'mt-4' : ''}`}>
                {pinnedNotes.length > 0 && otherNotes.length > 0 && <SectionLabel label="Notes" />}
                {otherNotes.map(renderCard)}
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>

      {editingNote && (
        <Animated.View
          className="absolute inset-0 bg-white dark:bg-neutral-950"
          style={{ transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }] }}
        >
          <NoteEditor
            note={editingNote}
            onUpdate={onUpdate}
            onDelete={handleDelete}
            onBack={() => setEditingId(null)}
            tasks={tasks}
            plans={plans}
            onOpenTask={onOpenTask}
            onCreateTaskFromNote={onCreateTaskFromNote}
            onOpenPlan={onOpenPlan}
            todayDay={todayDay}
          />
        </Animated.View>
      )}

      <BottomSheet open={templatePickerOpen} onClose={() => setTemplatePickerOpen(false)}>
        <View className="gap-2 p-5 pb-8">
          <SheetHeader eyebrow="New note" title="Start from a template" onClose={() => setTemplatePickerOpen(false)} />
          <View className="gap-1.5 pt-1">
            {NOTE_TEMPLATE_DEFS.map(({ id, label, description, iconName, title, tags, body }) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                onPress={() => {
                  setTemplatePickerOpen(false);
                  handleCreate({ title, tags, body });
                }}
                className="w-full flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 active:bg-neutral-50 dark:border-white/[0.08] dark:bg-neutral-900 dark:active:bg-white/[0.03]"
              >
                <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
                  <Icon icon={TEMPLATE_ICONS[iconName]} size={20} strokeWidth={1.8} className="text-neutral-500 dark:text-neutral-400" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[16px] font-bold text-neutral-900 dark:text-white">{label}</Text>
                  <Text className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">{description}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}
