import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconNotebook, IconPinnedFilled, IconPlus, IconSearch, IconX } from '@tabler/icons-react-native';
import type { Note } from '@planr/core/lib/scheduleTypes';
import { createNote, getNotes, updateNote } from '../storage/notesStore';
import EmptyState from '../components/EmptyState';
import { colors } from '../theme/colors';

type RootStackParamList = {
  NoteEditor: { noteId: string };
};

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** No markdown/rich-text on native yet — title/snippet are plain first-line splits. */
function deriveTitle(note: Note): string {
  if (note.title.trim()) return note.title.trim();
  const firstLine = note.body.split('\n').find((l) => l.trim());
  return firstLine?.trim().slice(0, 80) || 'Untitled note';
}

function deriveSnippet(note: Note): string {
  const lines = note.body.split('\n').map((l) => l.trim()).filter(Boolean);
  const rest = note.title.trim() ? lines : lines.slice(1);
  return rest.join(' ').slice(0, 140);
}

function NoteRow({ note, onPress, onTogglePin, mutedColor }: {
  note: Note;
  onPress: () => void;
  onTogglePin: () => void;
  mutedColor: string;
}) {
  const snippet = deriveSnippet(note);
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-neutral-100 bg-white px-4 py-3 dark:border-white/[0.06] dark:bg-neutral-900/40"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text numberOfLines={1} className="flex-1 text-[16px] font-semibold text-neutral-900 dark:text-white">
          {deriveTitle(note)}
        </Text>
        <View className="flex-row shrink-0 items-center gap-1.5">
          <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            {relativeDate(note.updatedAt)}
          </Text>
          <Pressable
            onPress={onTogglePin}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={note.pinned ? 'Unpin note' : 'Pin note'}
          >
            <IconPinnedFilled size={15} strokeWidth={2} color={note.pinned ? '#F59E0B' : mutedColor} />
          </Pressable>
        </View>
      </View>
      {snippet.length > 0 && (
        <Text numberOfLines={2} className="mt-0.5 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
          {snippet}
        </Text>
      )}
    </Pressable>
  );
}

export default function NotesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState('');

  const refresh = useCallback(() => setNotes(getNotes()), []);
  useFocusEffect(refresh);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => {
            const note = createNote();
            navigation.navigate('NoteEditor', { noteId: note.id });
          }}
          accessibilityRole="button"
          accessibilityLabel="New note"
          hitSlop={8}
        >
          <IconPlus size={22} strokeWidth={2.2} color={c.text} />
        </Pressable>
      ),
    });
  }, [navigation, c.text]);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((n) => (n.title + ' ' + n.body).toLowerCase().includes(q));
  }, [sorted, query]);

  function togglePin(note: Note) {
    updateNote(note.id, { pinned: !note.pinned });
    refresh();
  }

  return (
    <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]">
      <View className="px-4 pt-3 pb-1">
        <View className="relative">
          <View pointerEvents="none" className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
            <IconSearch size={15} strokeWidth={2} color={c.muted} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search notes"
            placeholderTextColor={c.muted}
            className="h-10 rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-9 text-[14px] text-black dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              <IconX size={15} strokeWidth={2} color={c.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, paddingTop: 12, gap: 8 }}
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            onPress={() => navigation.navigate('NoteEditor', { noteId: item.id })}
            onTogglePin={() => togglePin(item)}
            mutedColor={c.muted}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon={IconNotebook}
            title={notes.length === 0 ? 'No notes yet' : 'No matching notes'}
            description={
              notes.length === 0
                ? 'Tap + to start a note — jot a paragraph or a quick thought.'
                : 'Try a different search.'
            }
          />
        }
      />
    </View>
  );
}
