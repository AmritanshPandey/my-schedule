import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, View, type TextInputSelectionChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  IconBold,
  IconCalendarPlus,
  IconCheck,
  IconChecklist,
  IconChevronLeft,
  IconColumnInsertRight,
  IconColumnRemove,
  IconHeading,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconPalette,
  IconPin,
  IconPinnedFilled,
  IconPlus,
  IconRowInsertBottom,
  IconRowRemove,
  IconShare2,
  IconSparkles,
  IconStrikethrough,
  IconTable,
  IconTag,
  IconTrash,
  IconX,
} from '@tabler/icons-react-native';
import type { DayKey, Note, Plan, Task } from '@planr/core/lib/scheduleTypes';
import { resolveLinkedTasks } from '@planr/core/lib/notes/linkedTasks';
import { buildDeleteConfirmationCopy } from '@planr/core/lib/deleteConfirm';
import { stableFieldHash } from '@planr/core/lib/hash';
import { NOTE_COLORS } from '@planr/core/lib/notes/markdown';
import { bodyToPlainText, checklistStatsFromBody, extractTagsFromBody, mergeNoteTags } from '@planr/core/lib/notes/richText';
import { bodyToMarkdown } from '@planr/core/lib/notes/htmlToMarkdown';
import {
  applyTextColor,
  canDeleteTableColumn,
  canDeleteTableRow,
  colorAt,
  cycleHeading,
  headingLevelAt,
  insertTable,
  insertTagText,
  lineKindAt,
  lineStartOffset,
  removeTagText,
  selectedOrCurrentLine,
  shiftIndent,
  tableAddColumnAfter,
  tableAddRowAfter,
  tableContextAt,
  tableDelete,
  tableDeleteColumn,
  tableDeleteRow,
  toggleChecklistLine,
  toggleInlineMark,
  toggleListKind,
  type TextEdit,
  type TextSelection,
} from '@planr/core/lib/notes/markdownEdit';
import { deriveTaskTitleFromNoteText } from '@planr/core/lib/notes/dailyCapture';
import { haptic } from '../../lib/haptics';
import { ACCENT_CLASSES, cycleAccentColor } from '../ui/Badge';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import ConfirmSheet from '../ui/ConfirmSheet';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text, TextInput, type TextInputRef } from '../ui/Text';
import { SECTION_ICONS } from '../SectionIcons';
import NoteMarkdown from './NoteMarkdown';
import TaskLinkPicker from './TaskLinkPicker';

type NotePatch = Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'tags' | 'linkedTaskIds' | 'linkedPlanIds'>>;
type CreateTaskFromNoteInput = { title: string; noteId: string; day: DayKey; planId?: string };

interface NoteEditorProps {
  note: Note;
  onUpdate: (id: string, patch: NotePatch) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  /** De-duplicated tasks (for the link picker + chip titles). */
  tasks: Task[];
  plans: Plan[];
  /** Open a task referenced by the note. */
  onOpenTask: (taskId: string) => void;
  onCreateTaskFromNote?: (input: CreateTaskFromNoteInput) => string | undefined;
  /** Open a plan this note was used to generate (see linkedPlanIds). */
  onOpenPlan?: (planId: string) => void;
  todayDay: DayKey;
}

type SaveState = 'idle' | 'saving' | 'saved';

function tagKey(tags: string[]): string {
  return mergeNoteTags(tags)
    .map((tag) => tag.toLowerCase())
    .join('|');
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ToolbarButton({
  children,
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`h-9 min-w-9 shrink-0 items-center justify-center rounded-xl px-2 ${
        active ? 'bg-neutral-900 dark:bg-white' : 'active:bg-neutral-100 dark:active:bg-white/[0.06]'
      } ${disabled ? 'opacity-35' : ''}`}
    >
      {children}
    </Pressable>
  );
}

function ToolIcon({ icon, active = false, size = 18 }: { icon: TablerIcon; active?: boolean; size?: number }) {
  return <Icon icon={icon} size={size} strokeWidth={2} className={active ? 'text-white dark:text-neutral-900' : 'text-neutral-600 dark:text-neutral-300'} />;
}

function Divider() {
  return <View className="mx-0.5 h-5 w-px shrink-0 bg-neutral-200 dark:bg-white/[0.08]" />;
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <View className="flex-row items-center gap-1">
      {state === 'saved' && <Icon icon={IconCheck} size={12} strokeWidth={3} className="text-neutral-500 dark:text-neutral-400" />}
      <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{state === 'saving' ? 'Saving…' : 'Saved'}</Text>
    </View>
  );
}

/**
 * Native port of components/notes/NoteEditor.tsx — a full-page note: title,
 * pin / share / delete, the meta line (updated · words · checked), tags,
 * linked tasks (open, unlink, link more, create a task from the current line)
 * and linked plans, the body, and the formatting toolbar, with the web's
 * debounced autosave and flush-on-leave.
 *
 * The web edits rich HTML in tiptap, which needs a DOM. Here the body is
 * edited in its markdown form (@planr/core/lib/notes/htmlToMarkdown converts
 * a rich body on open): it renders formatted — headings, lists, tables,
 * colors — with checklist boxes tickable in place, and a tap or any toolbar
 * action switches to editing the text with the same toolbar the web has.
 * An untouched body is never rewritten; an edited one is saved as markdown,
 * which the web opens through bodyToEditorHtml like any older note.
 */
export default function NoteEditor({ note, onUpdate, onDelete, onBack, tasks, plans, onOpenTask, onCreateTaskFromNote, onOpenPlan, todayDay }: NoteEditorProps) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(note.title);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const plansById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  // plan.emoji is a Tabler icon NAME — resolve it to a component.
  const planIcon = useMemo(() => {
    const byName = new Map(SECTION_ICONS.map((s) => [s.name, s.icon]));
    return new Map(plans.map((p) => [p.id, byName.get(p.emoji) ?? SECTION_ICONS[0].icon]));
  }, [plans]);
  const linkedTasks = useMemo(() => resolveLinkedTasks(note.linkedTaskIds, tasksById), [note.linkedTaskIds, tasksById]);
  const linkedPlans = useMemo(() => (note.linkedPlanIds ?? []).map((id) => plansById.get(id)).filter((p): p is Plan => !!p), [note.linkedPlanIds, plansById]);

  function addLinkedTask(taskId: string) {
    const next = Array.from(new Set([...(note.linkedTaskIds ?? []), taskId]));
    onUpdate(note.id, { linkedTaskIds: next });
  }
  function removeLinkedTask(taskId: string) {
    onUpdate(note.id, { linkedTaskIds: (note.linkedTaskIds ?? []).filter((id) => id !== taskId) });
  }
  function removeLinkedPlan(planId: string) {
    onUpdate(note.id, { linkedPlanIds: (note.linkedPlanIds ?? []).filter((id) => id !== planId) });
  }

  // The body as opened, and its markdown form. Until the markdown changes,
  // the stored body (rich or not) is what gets saved — opening a note never
  // rewrites it.
  const originalBodyRef = useRef(note.body);
  const initialMarkdownRef = useRef(bodyToMarkdown(note.body));
  const [markdown, setMarkdown] = useState(initialMarkdownRef.current);
  const draftBody = markdown === initialMarkdownRef.current ? originalBodyRef.current : markdown;

  const [headerTags, setHeaderTags] = useState<string[]>(note.tags ?? []);
  const bodyTags = useMemo(() => extractTagsFromBody(draftBody), [draftBody]);
  const [tagInput, setTagInput] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [pillInputOpen, setPillInputOpen] = useState(false);
  const [pillDraft, setPillDraft] = useState('');
  const [taskCreateState, setTaskCreateState] = useState<'idle' | 'added' | 'missing'>('idle');
  const [editing, setEditing] = useState(() => !initialMarkdownRef.current.trim());
  const [selection, setSelection] = useState<TextSelection>({ start: initialMarkdownRef.current.length, end: initialMarkdownRef.current.length });
  const [pendingSelection, setPendingSelection] = useState<TextSelection | undefined>(undefined);

  const bodyInputRef = useRef<TextInputRef | null>(null);
  const selectionRef = useRef(selection);
  const lastLineIndexRef = useRef<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskCreateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraft = useRef({ title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) });
  const lastSavedDraft = useRef({ title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) });
  const displayTagsRef = useRef<string[]>(mergeNoteTags(note.tags ?? [], extractTagsFromBody(note.body)));

  const displayTags = useMemo(() => mergeNoteTags(headerTags, bodyTags), [headerTags, bodyTags]);
  const displayTagsKey = useMemo(() => tagKey(displayTags), [displayTags]);
  const plainBody = useMemo(() => bodyToPlainText(draftBody), [draftBody]);
  const wordCount = useMemo(() => plainBody.trim().split(/\s+/).filter(Boolean).length, [plainBody]);
  const checklistState = useMemo(() => checklistStatsFromBody(draftBody), [draftBody]);
  const deleteCopy = useMemo(
    () =>
      buildDeleteConfirmationCopy('note', {
        name: title.trim() || note.title || undefined,
        description: 'This note will be permanently removed.',
      }),
    [note.title, title],
  );

  // Opening a different note resets everything to it.
  useEffect(() => {
    setTitle(note.title);
    setHeaderTags(note.tags ?? []);
    setTagInput('');
    setConfirmDelete(false);
    setColorMenuOpen(false);
    setPillInputOpen(false);
    setPillDraft('');
    setTaskCreateState('idle');
    originalBodyRef.current = note.body;
    initialMarkdownRef.current = bodyToMarkdown(note.body);
    setMarkdown(initialMarkdownRef.current);
    setEditing(!initialMarkdownRef.current.trim());
    lastLineIndexRef.current = null;
    latestDraft.current = { title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) };
    lastSavedDraft.current = { title: note.title, body: note.body, tagsKey: tagKey(note.tags ?? []) };
    setSaveState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useEffect(() => {
    latestDraft.current = { title, body: draftBody, tagsKey: displayTagsKey };
  }, [title, draftBody, displayTagsKey]);

  useEffect(() => {
    displayTagsRef.current = displayTags;
  }, [displayTags]);

  // Debounced autosave — same 500ms rhythm and "Saving… / Saved" badge as the web.
  useEffect(() => {
    if (title === lastSavedDraft.current.title && draftBody === lastSavedDraft.current.body && displayTagsKey === lastSavedDraft.current.tagsKey) {
      return;
    }
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate(note.id, { title, body: draftBody, tags: displayTags });
      lastSavedDraft.current = { title, body: draftBody, tagsKey: displayTagsKey };
      setSaveState('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [displayTags, displayTagsKey, draftBody, note.id, onUpdate, title]);

  // Flush anything unsaved when the editor goes away.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (taskCreateTimer.current) clearTimeout(taskCreateTimer.current);
      const draft = latestDraft.current;
      const saved = lastSavedDraft.current;
      if (draft.title !== saved.title || draft.body !== saved.body || draft.tagsKey !== saved.tagsKey) {
        onUpdate(note.id, { title: draft.title, body: draft.body, tags: displayTagsRef.current });
      }
    };
  }, [note.id, onUpdate]);

  // Focus the body as soon as editing starts.
  useEffect(() => {
    if (!editing) return;
    const id = setTimeout(() => bodyInputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [editing]);

  function flushAndBack() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const nextTags = mergeNoteTags(headerTags, bodyTags);
    const draft = { title, body: draftBody, tagsKey: tagKey(nextTags) };
    if (draft.title !== lastSavedDraft.current.title || draft.body !== lastSavedDraft.current.body || draft.tagsKey !== lastSavedDraft.current.tagsKey) {
      onUpdate(note.id, { title: draft.title, body: draft.body, tags: nextTags });
      lastSavedDraft.current = draft;
    }
    Keyboard.dismiss();
    onBack();
  }

  // The web copies to the clipboard; the share sheet carries Copy among its
  // actions, with no clipboard module needed.
  async function shareNote() {
    const text = title.trim() ? `# ${title.trim()}\n\n${plainBody}` : plainBody;
    haptic('light');
    try {
      await Share.share({ message: text, title: title.trim() || 'Note' });
    } catch {
      // dismissed
    }
  }

  function togglePin() {
    haptic('light');
    onUpdate(note.id, { pinned: !note.pinned });
  }

  function addTag() {
    const raw = tagInput.trim().replace(/^#/, '').slice(0, 24);
    if (!raw) return;
    haptic('light');
    setHeaderTags((prev) => mergeNoteTags(prev, [raw]));
    setTagInput('');
  }

  function removeTag(tag: string) {
    haptic('light');
    setHeaderTags((prev) => prev.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
    // The web removes the tag's pills from the body too.
    setMarkdown((prev) => {
      const next = removeTagText(prev, tag);
      return next === prev ? prev : next;
    });
  }

  // ── Editing ──────────────────────────────────────────────────────────────

  function onSelectionChange(e: TextInputSelectionChangeEvent) {
    const sel = e.nativeEvent.selection;
    selectionRef.current = sel;
    setSelection(sel);
    lastLineIndexRef.current = markdown.slice(0, sel.start).split('\n').length - 1;
    if (pendingSelection) setPendingSelection(undefined);
  }

  /** Start editing with the cursor at the end of line `index` (or the end). */
  function beginEditingAt(index: number | null) {
    const lines = markdown.split('\n');
    const pos = index === null || index >= lines.length ? markdown.length : lineStartOffset(markdown, index) + (lines[index]?.length ?? 0);
    const sel = { start: pos, end: pos };
    selectionRef.current = sel;
    setSelection(sel);
    setPendingSelection(sel);
    if (index !== null) lastLineIndexRef.current = index;
    setEditing(true);
  }

  function applyEdit(fn: (text: string, sel: TextSelection) => TextEdit) {
    const sel = editing ? selectionRef.current : { start: markdown.length, end: markdown.length };
    const result = fn(markdown, sel);
    setMarkdown(result.text);
    selectionRef.current = result.selection;
    setSelection(result.selection);
    setPendingSelection(result.selection);
    if (!editing) setEditing(true);
  }

  function toggleCheck(lineIndex: number) {
    haptic('light');
    setMarkdown((prev) => toggleChecklistLine(prev, lineIndex));
  }

  function applyColor(colorName: string | null) {
    applyEdit((text, sel) => applyTextColor(text, sel, colorName));
    setColorMenuOpen(false);
  }

  function insertPill() {
    const sel = selectionRef.current;
    const label = editing && sel.end > sel.start ? markdown.slice(sel.start, sel.end).trim() : '';
    if (!label) {
      setPillDraft('');
      setPillInputOpen(true);
      return;
    }
    commitPill(label);
  }

  function commitPill(rawLabel: string) {
    const normalizedLabel = rawLabel.replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 24).trim();
    if (!normalizedLabel) return;
    applyEdit((text, sel) => insertTagText(text, sel, normalizedLabel));
    setHeaderTags((prev) => mergeNoteTags(prev, [normalizedLabel]));
    setPillDraft('');
    setPillInputOpen(false);
    haptic('light');
  }

  function showTaskCreateState(state: 'added' | 'missing') {
    setTaskCreateState(state);
    if (taskCreateTimer.current) clearTimeout(taskCreateTimer.current);
    taskCreateTimer.current = setTimeout(() => setTaskCreateState('idle'), 1800);
  }

  function selectedOrCurrentLineText(): string {
    if (editing) return selectedOrCurrentLine(markdown, selectionRef.current);
    const idx = lastLineIndexRef.current;
    return idx === null ? '' : markdown.split('\n')[idx] ?? '';
  }

  function createTaskFromSelection() {
    if (!onCreateTaskFromNote) return;
    const taskTitle = deriveTaskTitleFromNoteText(selectedOrCurrentLineText());
    if (!taskTitle) {
      showTaskCreateState('missing');
      return;
    }
    const taskId = onCreateTaskFromNote({ title: taskTitle, noteId: note.id, day: todayDay, planId: linkedTasks[0]?.planId });
    if (!taskId) {
      showTaskCreateState('missing');
      return;
    }
    const linkedIds = note.linkedTaskIds ?? [];
    if (!linkedIds.includes(taskId)) onUpdate(note.id, { linkedTaskIds: [...linkedIds, taskId] });
    haptic('light');
    showTaskCreateState('added');
  }

  function handleDone() {
    if (editing) {
      setEditing(false);
      setColorMenuOpen(false);
      setPillInputOpen(false);
      Keyboard.dismiss();
      return;
    }
    flushAndBack();
  }

  const cursor = selection.start;
  const kind = editing ? lineKindAt(markdown, cursor) : null;
  const headingLevel = editing ? headingLevelAt(markdown, cursor) : 0;
  const activeColor = editing ? colorAt(markdown, cursor) : null;
  const activeColorHex = activeColor ? NOTE_COLORS.find((c) => c.name === activeColor)?.hex ?? null : null;
  const tableCtx = editing ? tableContextAt(markdown, cursor) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-white dark:bg-neutral-950">
      <View className="border-b border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-950">
        <View className="h-16 w-full flex-row items-center gap-2.5 px-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={flushAndBack} hitSlop={8} className="-ml-1.5 shrink-0 active:scale-90">
            <Icon icon={IconChevronLeft} size={24} strokeWidth={1.5} className="text-neutral-950 dark:text-white" />
          </Pressable>

          <View className="min-w-0 flex-1">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              accessibilityLabel="Note title"
              returnKeyType="next"
              onSubmitEditing={() => beginEditingAt(null)}
              className="w-full py-0 text-[16px] font-semibold leading-tight text-neutral-900 dark:text-white"
              placeholderTextColor="#D4D4D4"
            />
          </View>

          <View className="shrink-0 flex-row items-center gap-0.5">
            <SaveBadge state={saveState} />
            <IconButton label="Share note" variant="ghost" size="md" radius="xl" onPress={() => void shareNote()}>
              <Icon icon={IconShare2} size={16} strokeWidth={2} className={ICON_BUTTON_TONE.ghost} />
            </IconButton>
            <IconButton label={note.pinned ? 'Unpin note' : 'Pin note'} variant="ghost" size="md" radius="xl" onPress={togglePin}>
              <Icon icon={note.pinned ? IconPinnedFilled : IconPin} size={16} strokeWidth={2} className={note.pinned ? 'text-amber-500' : ICON_BUTTON_TONE.ghost} />
            </IconButton>
            <IconButton
              label="Delete note"
              variant="dangerGhost"
              size="md"
              radius="xl"
              onPress={() => {
                haptic('light');
                setConfirmDelete(true);
              }}
            >
              <Icon icon={IconTrash} size={16} strokeWidth={2} className={ICON_BUTTON_TONE.dangerGhost} />
            </IconButton>
          </View>
        </View>
      </View>

      <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="border-b border-neutral-100 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-neutral-950">
          <Text className="text-[12px] leading-none text-neutral-500 dark:text-neutral-400">
            {formatUpdatedAt(note.updatedAt)} · {wordCount} {wordCount === 1 ? 'word' : 'words'}
            {checklistState ? ` · ${checklistState.done}/${checklistState.total} checked` : ''}
          </Text>
          <View className="mt-3 flex-row flex-wrap items-center gap-1.5">
            {displayTags.map((tag) => {
              const tone = ACCENT_CLASSES[cycleAccentColor(stableFieldHash(tag.toLowerCase()))];
              return (
                <View key={tag} className={`min-h-7 flex-row items-center gap-1 rounded-full border pl-2.5 pr-1.5 ${tone.box}`}>
                  <Text className={`text-[12px] font-semibold ${tone.text}`}>{tag}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${tag}`} hitSlop={8} onPress={() => removeTag(tag)} className="ml-0.5 opacity-60">
                    <Icon icon={IconX} size={11} strokeWidth={2.5} className={tone.text} />
                  </Pressable>
                </View>
              );
            })}
            <TextInput
              value={tagInput}
              onChangeText={(v) => {
                if (v.endsWith(',')) {
                  setTagInput(v.slice(0, -1));
                  setTimeout(addTag, 0);
                } else setTagInput(v);
              }}
              onSubmitEditing={addTag}
              onBlur={addTag}
              blurOnSubmit={false}
              returnKeyType="done"
              placeholder={displayTags.length === 0 ? 'Add tag...' : '+ tag'}
              maxLength={24}
              autoCapitalize="none"
              accessibilityLabel="Add tag"
              placeholderTextColor="#D4D4D4"
              className={`h-7 min-w-0 rounded-full border border-dashed px-2.5 py-0 text-[12px] font-semibold text-neutral-600 dark:text-neutral-300 ${
                displayTags.length === 0 ? 'w-24 border-neutral-200 dark:border-white/[0.10]' : 'w-16 border-transparent'
              }`}
            />
          </View>
        </View>

        {/* Linked tasks */}
        <View className="border-b border-neutral-100 bg-neutral-50/60 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="items-center gap-2 px-4 py-3">
            <View className="shrink-0 flex-row items-center gap-1">
              <Icon icon={IconLink} size={12} strokeWidth={2.2} className="text-neutral-600 dark:text-neutral-400" />
              <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">Linked tasks</Text>
            </View>
            {linkedTasks.map((task) => (
              <View
                key={task.id}
                className="min-h-9 shrink-0 flex-row items-center gap-1 rounded-full border border-neutral-200 bg-white py-1 pl-2.5 pr-1 dark:border-white/[0.12] dark:bg-white/[0.04]"
              >
                <Pressable accessibilityRole="button" onPress={() => onOpenTask(task.id)} className="max-w-[180px] flex-row items-center gap-1.5">
                  <Icon icon={planIcon.get(task.planId) ?? SECTION_ICONS[0].icon} size={13} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                  <Text className="truncate text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">{task.title}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Unlink ${task.title}`}
                  onPress={() => removeLinkedTask(task.id)}
                  className="h-6 w-6 shrink-0 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.08]"
                >
                  <Icon icon={IconX} size={12} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setLinkPickerOpen(true)}
              className="min-h-9 shrink-0 flex-row items-center gap-1.5 rounded-full border border-dashed border-neutral-300 bg-white/70 px-3 dark:border-white/[0.14] dark:bg-white/[0.03]"
            >
              <Icon icon={IconPlus} size={13} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
              <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Link task</Text>
            </Pressable>
            {onCreateTaskFromNote && (
              <Pressable
                accessibilityRole="button"
                onPress={createTaskFromSelection}
                className="min-h-9 shrink-0 flex-row items-center gap-1.5 rounded-full border border-neutral-900 bg-neutral-900 px-3.5 active:bg-neutral-800 dark:border-white dark:bg-white"
              >
                <Icon icon={IconCalendarPlus} size={13} strokeWidth={2.4} className="text-white dark:text-neutral-900" />
                <Text className="text-[13px] font-semibold text-white dark:text-neutral-900">Create task</Text>
              </Pressable>
            )}
            {taskCreateState !== 'idle' && (
              <Text className={`shrink-0 text-[12px] font-semibold ${taskCreateState === 'added' ? 'text-emerald-500' : 'text-neutral-500 dark:text-neutral-400'}`}>
                {taskCreateState === 'added' ? 'Added to Today' : 'Select text first'}
              </Text>
            )}
          </ScrollView>
        </View>

        {/* Linked plans — only once a note has been used to generate a plan. */}
        {linkedPlans.length > 0 && (
          <View className="border-b border-neutral-100 bg-neutral-50/60 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 px-4 py-3">
              <View className="shrink-0 flex-row items-center gap-1">
                <Icon icon={IconSparkles} size={12} strokeWidth={2.2} className="text-neutral-600 dark:text-neutral-400" />
                <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">Linked plans</Text>
              </View>
              {linkedPlans.map((plan) => (
                <View
                  key={plan.id}
                  className="min-h-9 shrink-0 flex-row items-center gap-1 rounded-full border border-neutral-200 bg-white py-1 pl-2.5 pr-1 dark:border-white/[0.12] dark:bg-white/[0.04]"
                >
                  <Pressable accessibilityRole="button" onPress={() => onOpenPlan?.(plan.id)} className="max-w-[180px] flex-row items-center gap-1.5">
                    <Icon icon={planIcon.get(plan.id) ?? SECTION_ICONS[0].icon} size={13} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                    <Text className="truncate text-[13px] font-semibold text-neutral-700 dark:text-neutral-200">{plan.title}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Unlink ${plan.title}`}
                    onPress={() => removeLinkedPlan(plan.id)}
                    className="h-6 w-6 shrink-0 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.08]"
                  >
                    <Icon icon={IconX} size={12} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View className="w-full px-4 pb-8 pt-4">
          {editing ? (
            <TextInput
              ref={bodyInputRef}
              value={markdown}
              onChangeText={setMarkdown}
              onSelectionChange={onSelectionChange}
              selection={pendingSelection}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              placeholder="Start writing…"
              accessibilityLabel="Note body"
              className="min-h-[384px] p-0 text-[16px] leading-[28px] text-neutral-800 dark:text-neutral-50"
            />
          ) : (
            <NoteMarkdown markdown={markdown} onToggleCheck={toggleCheck} onPressLine={(i) => beginEditingAt(i)} />
          )}
        </View>
      </ScrollView>

      <TaskLinkPicker open={linkPickerOpen} tasks={tasks} plans={plans} linkedIds={note.linkedTaskIds ?? []} onAdd={addLinkedTask} onClose={() => setLinkPickerOpen(false)} />

      {/* Toolbar — clears the home indicator like IOSBottomNav (max(20, inset+8)). */}
      <View
        className="shrink-0 border-t border-neutral-100 bg-white px-2 py-2 dark:border-white/[0.06] dark:bg-neutral-950"
        style={{ paddingBottom: editing ? 8 : Math.max(20, insets.bottom + 8) }}
      >
        <View className="w-full gap-2 px-3">
          {tableCtx && (
            <View className="flex-row items-center gap-1 rounded-2xl border border-neutral-200 bg-neutral-50 px-2 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <ToolbarButton label="Add row below" onPress={() => applyEdit((t) => tableAddRowAfter(t, tableCtx))}>
                <ToolIcon icon={IconRowInsertBottom} size={17} />
              </ToolbarButton>
              <ToolbarButton label="Add column right" onPress={() => applyEdit((t) => tableAddColumnAfter(t, tableCtx))}>
                <ToolIcon icon={IconColumnInsertRight} size={17} />
              </ToolbarButton>
              <ToolbarButton label="Delete row" disabled={!canDeleteTableRow(tableCtx)} onPress={() => applyEdit((t) => tableDeleteRow(t, tableCtx))}>
                <ToolIcon icon={IconRowRemove} size={17} />
              </ToolbarButton>
              <ToolbarButton label="Delete column" disabled={!canDeleteTableColumn(tableCtx)} onPress={() => applyEdit((t) => tableDeleteColumn(t, tableCtx))}>
                <ToolIcon icon={IconColumnRemove} size={17} />
              </ToolbarButton>
              <Divider />
              <ToolbarButton label="Delete table" onPress={() => applyEdit((t) => tableDelete(t, tableCtx))}>
                <ToolIcon icon={IconTrash} size={16} />
              </ToolbarButton>
            </View>
          )}

          {colorMenuOpen && (
            <View className="flex-row items-center gap-2 self-end rounded-2xl border border-neutral-200 bg-white p-2.5 dark:border-white/[0.1] dark:bg-neutral-900">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove color"
                onPress={() => applyColor(null)}
                className="h-9 w-9 items-center justify-center rounded-full border-2 border-neutral-200 bg-white active:scale-95 dark:border-white/[0.12] dark:bg-neutral-800"
              >
                <Icon icon={IconX} size={12} strokeWidth={2.5} className="text-neutral-500 dark:text-neutral-400" />
              </Pressable>
              {NOTE_COLORS.map((color) => (
                <Pressable
                  key={color.name}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${color.name}`}
                  onPress={() => applyColor(color.name)}
                  className="h-9 w-9 items-center justify-center rounded-full active:scale-95"
                  style={{ backgroundColor: color.hex }}
                >
                  {activeColor === color.name && <Icon icon={IconCheck} size={14} strokeWidth={3} color="#FFFFFF" />}
                </Pressable>
              ))}
            </View>
          )}

          {pillInputOpen && (
            <View className="flex-row items-center gap-2 self-start rounded-xl border border-neutral-200 bg-white px-2 py-1.5 dark:border-white/[0.08] dark:bg-neutral-900">
              <TextInput
                value={pillDraft}
                onChangeText={(v) => setPillDraft(v.slice(0, 24))}
                onSubmitEditing={() => commitPill(pillDraft)}
                autoFocus
                placeholder="Pill label"
                accessibilityLabel="Pill label"
                className="w-28 py-0 text-[13px] font-medium text-neutral-800 dark:text-white"
              />
              <Pressable accessibilityRole="button" onPress={() => commitPill(pillDraft)} className="rounded-lg bg-neutral-900 px-2.5 py-1 dark:bg-white">
                <Text className="text-[11px] font-semibold text-white dark:text-neutral-900">Add</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                hitSlop={8}
                onPress={() => {
                  setPillInputOpen(false);
                  setPillDraft('');
                }}
              >
                <Icon icon={IconX} size={12} strokeWidth={2.5} className="text-neutral-500 dark:text-neutral-400" />
              </Pressable>
            </View>
          )}

          <View className="w-full flex-row items-center gap-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" className="min-w-0 flex-1" contentContainerClassName="items-center gap-0.5">
              <ToolbarButton label="Checklist" active={kind === 'checklist'} onPress={() => applyEdit((t, s) => toggleListKind(t, s, 'checklist'))}>
                <ToolIcon icon={IconChecklist} active={kind === 'checklist'} />
              </ToolbarButton>
              <ToolbarButton label="Numbered list" active={kind === 'ordered'} onPress={() => applyEdit((t, s) => toggleListKind(t, s, 'ordered'))}>
                <ToolIcon icon={IconListNumbers} active={kind === 'ordered'} />
              </ToolbarButton>
              <ToolbarButton label="Bullet list" active={kind === 'bullet'} onPress={() => applyEdit((t, s) => toggleListKind(t, s, 'bullet'))}>
                <ToolIcon icon={IconList} active={kind === 'bullet'} />
              </ToolbarButton>
              <ToolbarButton label={headingLevel ? `Heading ${headingLevel}` : 'Heading'} active={headingLevel > 0} onPress={() => applyEdit(cycleHeading)}>
                <View className="relative flex-row items-center">
                  <ToolIcon icon={IconHeading} active={headingLevel > 0} />
                  {headingLevel > 0 && (
                    <Text className="absolute -bottom-1 -right-1.5 text-[9px] font-bold leading-none text-white dark:text-neutral-900">{headingLevel}</Text>
                  )}
                </View>
              </ToolbarButton>

              <Divider />

              <ToolbarButton label="Indent" onPress={() => applyEdit((t, s) => shiftIndent(t, s, 1))}>
                <ToolIcon icon={IconIndentIncrease} />
              </ToolbarButton>
              <ToolbarButton label="Outdent" onPress={() => applyEdit((t, s) => shiftIndent(t, s, -1))}>
                <ToolIcon icon={IconIndentDecrease} />
              </ToolbarButton>

              <Divider />

              <ToolbarButton label="Bold" onPress={() => applyEdit((t, s) => toggleInlineMark(t, s, '**'))}>
                <ToolIcon icon={IconBold} />
              </ToolbarButton>
              <ToolbarButton label="Italic" onPress={() => applyEdit((t, s) => toggleInlineMark(t, s, '*'))}>
                <ToolIcon icon={IconItalic} />
              </ToolbarButton>
              <ToolbarButton label="Strikethrough" onPress={() => applyEdit((t, s) => toggleInlineMark(t, s, '~~'))}>
                <ToolIcon icon={IconStrikethrough} />
              </ToolbarButton>
              <ToolbarButton label="Insert pill" active={pillInputOpen} onPress={insertPill}>
                <ToolIcon icon={IconTag} active={pillInputOpen} />
              </ToolbarButton>

              <Divider />

              <ToolbarButton label="Insert table" onPress={() => applyEdit(insertTable)}>
                <ToolIcon icon={IconTable} />
              </ToolbarButton>
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Text color"
              accessibilityState={{ expanded: colorMenuOpen }}
              onPress={() => setColorMenuOpen((v) => !v)}
              className={`relative h-9 shrink-0 flex-row items-center gap-1.5 rounded-xl px-3 ${
                colorMenuOpen ? 'bg-neutral-200 dark:bg-white/[0.15]' : 'bg-neutral-100 active:bg-neutral-200 dark:bg-white/[0.06] dark:active:bg-white/[0.1]'
              }`}
            >
              <Icon icon={IconPalette} size={16} strokeWidth={2} className={colorMenuOpen ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-300'} />
              <Text className={`text-[12px] font-semibold ${colorMenuOpen ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-300'}`}>Color</Text>
              {activeColorHex && !colorMenuOpen && <View className="h-2.5 w-2.5 rounded-full border-2 border-white dark:border-neutral-950" style={{ backgroundColor: activeColorHex }} />}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handleDone} className="shrink-0 rounded-xl bg-neutral-900 px-4 py-2 dark:bg-white">
              <Text className="text-[13px] font-bold text-white dark:text-neutral-900">Done</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          haptic('medium');
          onDelete(note.id);
        }}
        title={deleteCopy.title}
        description={deleteCopy.description}
        confirmLabel={deleteCopy.confirmLabel}
      />
    </KeyboardAvoidingView>
  );
}

