import { useLayoutEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { IconPinnedFilled, IconTrash } from '@tabler/icons-react-native';
import { deleteNote, getNotes, updateNote } from '../storage/notesStore';
import { colors } from '../theme/colors';

type RootStackParamList = {
  NoteEditor: { noteId: string };
};

export default function NoteEditorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'NoteEditor'>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const initial = getNotes().find((n) => n.id === route.params.noteId) ?? null;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);

  function save(patch: { title?: string; body?: string; pinned?: boolean }) {
    updateNote(route.params.noteId, patch);
  }

  function handleDelete() {
    deleteNote(route.params.noteId);
    navigation.goBack();
  }

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    save({ pinned: next });
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="flex-row items-center gap-4">
          <Pressable onPress={togglePin} accessibilityRole="button" accessibilityLabel={pinned ? 'Unpin note' : 'Pin note'} hitSlop={8}>
            <IconPinnedFilled size={19} strokeWidth={2} color={pinned ? '#F59E0B' : c.muted} />
          </Pressable>
          <Pressable onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete note" hitSlop={8}>
            <IconTrash size={19} strokeWidth={2} color="#FB2C36" />
          </Pressable>
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, pinned, c.muted]);

  if (!initial) {
    return <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" />;
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white dark:bg-neutral-950"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={(v) => {
            setTitle(v);
            save({ title: v });
          }}
          placeholder="Title"
          placeholderTextColor={c.muted}
          className="text-[22px] font-extrabold text-black dark:text-white"
        />
        <TextInput
          value={body}
          onChangeText={(v) => {
            setBody(v);
            save({ body: v });
          }}
          placeholder="Start writing…"
          placeholderTextColor={c.muted}
          multiline
          textAlignVertical="top"
          className="min-h-[300px] flex-1 text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
