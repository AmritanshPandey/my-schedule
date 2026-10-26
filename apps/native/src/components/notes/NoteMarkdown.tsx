import { Fragment, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import { COLOR_TOKEN_RE, INLINE_RE, NOTE_COLORS, groupBlocks, parseLine, type ParsedLine } from '@planr/core/lib/notes/markdown';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Inline emphasis — the native port of lib/notes/markdown.tsx's renderInline:
 * {c=color} spans, **bold**, ~~strike~~, `code` and *italic*, as nested Text.
 */
export function renderInline(text: string): ReactNode {
  const parts = text.split(INLINE_RE);
  return parts.map((p, i) => {
    if (!p) return null;
    const color = p.match(COLOR_TOKEN_RE);
    if (color) {
      const hex = NOTE_COLORS.find((c) => c.name === color[1])?.hex;
      return (
        <Text key={i} style={{ color: hex }}>
          {renderInline(color[2])}
        </Text>
      );
    }
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
      return (
        <Text key={i} className="font-semibold">
          {p.slice(2, -2)}
        </Text>
      );
    if (p.startsWith('~~') && p.endsWith('~~') && p.length > 4)
      return (
        <Text key={i} className="line-through opacity-70">
          {p.slice(2, -2)}
        </Text>
      );
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2)
      return (
        <Text key={i} className="rounded-[5px] bg-neutral-100 text-[14.7px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200" style={{ fontFamily: MONO }}>
          {p.slice(1, -1)}
        </Text>
      );
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
      return (
        <Text key={i} style={{ fontStyle: 'italic' }}>
          {p.slice(1, -1)}
        </Text>
      );
    return <Fragment key={i}>{p}</Fragment>;
  });
}

const PROSE = 'text-[16px] leading-[28px] text-neutral-800 dark:text-neutral-50';
const HEADING: Record<number, string> = {
  1: 'text-[27px] font-bold leading-[32px] text-neutral-900 dark:text-white',
  2: 'text-[21.6px] font-bold leading-[26px] text-neutral-900 dark:text-white',
  3: 'text-[18.4px] font-bold leading-[22px] text-neutral-900 dark:text-white',
};

const isListKind = (k: ParsedLine['kind']) => k === 'checklist' || k === 'bullet' || k === 'ordered';

/**
 * A note's markdown, rendered the way the web's `.note-prose` editor shows it
 * — headings, paragraphs, bullet / numbered lists, checklists and tables —
 * with checklist boxes tickable in place. Tapping any other line hands its
 * index to `onPressLine` (the editor uses it to start editing there).
 */
export default function NoteMarkdown({
  markdown,
  onToggleCheck,
  onPressLine,
  placeholder,
}: {
  markdown: string;
  onToggleCheck: (lineIndex: number) => void;
  onPressLine: (lineIndex: number) => void;
  placeholder?: string;
}) {
  const lines = markdown.split('\n');
  if (!markdown.trim()) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Start writing" onPress={() => onPressLine(0)} className="min-h-[384px]">
        <Text className={`${PROSE} text-neutral-400 dark:text-neutral-500`}>{placeholder ?? 'Start writing…'}</Text>
      </Pressable>
    );
  }

  const blocks = groupBlocks(lines);
  let prevKind: ParsedLine['kind'] | 'table' | null = null;

  return (
    <View className="min-h-[384px] pb-6">
      {blocks.map((block) => {
        if (block.kind === 'table') {
          const gap = prevKind === null ? 0 : 14;
          prevKind = 'table';
          const [header, ...body] = block.rows;
          return (
            <ScrollView key={`t-${block.start}`} horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: gap }}>
              <Pressable onPress={() => onPressLine(block.start)} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                {[header, ...body].map((row, ri) => (
                  <View key={ri} className={`flex-row ${ri < body.length ? 'border-b border-neutral-200 dark:border-neutral-700' : ''}`}>
                    {row.map((cell, ci) => (
                      <View
                        key={ci}
                        style={{ minWidth: 136, paddingVertical: 12.8, paddingHorizontal: 14.4 }}
                        className={`${ci < row.length - 1 ? 'border-r border-neutral-200 dark:border-neutral-700' : ''} ${ri === 0 ? 'bg-neutral-50 dark:bg-neutral-800' : ''}`}
                      >
                        <Text className={`${PROSE} ${ri === 0 ? 'font-bold' : ''}`}>{renderInline(cell)}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </Pressable>
            </ScrollView>
          );
        }

        const index = block.index;
        const line = parseLine(lines[index] ?? '');
        const gap = prevKind === null ? 0 : isListKind(line.kind) && prevKind !== null && isListKind(prevKind as ParsedLine['kind']) ? 3 : 14;
        prevKind = line.kind;
        const indent = isListKind(line.kind) ? line.indent * 24 : 0;

        if (line.kind === 'blank') {
          return <Pressable key={index} accessibilityLabel="Empty line" onPress={() => onPressLine(index)} style={{ marginTop: gap, height: 24 }} />;
        }

        if (line.kind === 'heading') {
          return (
            <Pressable key={index} onPress={() => onPressLine(index)} style={{ marginTop: gap }}>
              <Text accessibilityRole="header" className={HEADING[line.level ?? 1]}>
                {renderInline(line.text)}
              </Text>
            </Pressable>
          );
        }

        if (line.kind === 'checklist') {
          return (
            <View key={index} className="flex-row items-start gap-2.5" style={{ marginTop: gap, marginLeft: indent }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!line.checked }}
                accessibilityLabel={line.text || 'Checklist item'}
                hitSlop={8}
                onPress={() => onToggleCheck(index)}
                className={`mt-[6px] h-[18px] w-[18px] items-center justify-center rounded-[4px] border-[1.5px] ${
                  line.checked ? 'border-[#00A63E] bg-[#00A63E]' : 'border-neutral-400 bg-white dark:border-neutral-500 dark:bg-neutral-900'
                }`}
              >
                {line.checked && <Icon icon={IconCheck} size={12} strokeWidth={3} className="text-white" />}
              </Pressable>
              <Pressable className="min-w-0 flex-1" onPress={() => onPressLine(index)}>
                <Text className={PROSE}>{renderInline(line.text)}</Text>
              </Pressable>
            </View>
          );
        }

        if (line.kind === 'bullet' || line.kind === 'ordered') {
          return (
            <Pressable key={index} onPress={() => onPressLine(index)} className="flex-row items-start" style={{ marginTop: gap, marginLeft: indent }}>
              <Text className={`${PROSE} w-6 text-center`}>{line.kind === 'bullet' ? '•' : `${line.order ?? 1}.`}</Text>
              <Text className={`${PROSE} min-w-0 flex-1`}>{renderInline(line.text)}</Text>
            </Pressable>
          );
        }

        return (
          <Pressable key={index} onPress={() => onPressLine(index)} style={{ marginTop: gap }}>
            <Text className={PROSE}>{renderInline(line.text)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
