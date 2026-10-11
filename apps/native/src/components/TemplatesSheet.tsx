import { memo } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import {
  IconBarbell,
  IconBed,
  IconBook,
  IconBrain,
  IconBriefcase,
  IconCar,
  IconCheck,
  IconCode,
  IconFlag,
  IconLayoutList,
  IconRun,
  IconStar,
  IconX,
} from '@tabler/icons-react-native';
import { TEMPLATES, type Template } from '@planr/core/lib/templates';
import { accentStyles } from '@planr/core/lib/colorSystem';
import BottomSheet from './ui/BottomSheet';
import { typography } from './ui/Typography';
import { Icon, type TablerIcon } from './ui/Icon';
import { Text } from './ui/Text';

// ── Icon map (mirrors SectionIcons) ──────────────────────────────────────────

const ICON_MAP: Record<string, TablerIcon> = {
  barbell: IconBarbell,
  book: IconBook,
  briefcase: IconBriefcase,
  brain: IconBrain,
  code: IconCode,
  run: IconRun,
  star: IconStar,
  sleep: IconBed,
  car: IconCar,
};

// ── Duration label ─────────────────────────────────────────────────────────────

function durationLabel(days: number): string {
  if (days % 30 === 0) return `${days / 30} month${days / 30 > 1 ? 's' : ''}`;
  if (days % 7 === 0) return `${days / 7} week${days / 7 > 1 ? 's' : ''}`;
  return `${days} days`;
}

function Pill({ label, glyph }: { label: string; glyph?: TablerIcon }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-neutral-200 px-2 py-0.5 dark:border-white/[0.08]">
      {glyph && <Icon icon={glyph} size={10} className="shrink-0 text-neutral-500 dark:text-neutral-400" />}
      <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
    </View>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ template, onUse }: { template: Template; onUse: (t: Template) => void }) {
  const accent = accentStyles(template.color);

  return (
    <View className="rounded-2xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      {/* Header */}
      <View className="flex-row items-start gap-3 p-4 pb-3">
        <View className={`h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${accent.tint}`}>
          <Icon icon={ICON_MAP[template.emoji] ?? IconStar} size={20} strokeWidth={1.75} className={accent.icon} />
        </View>

        <View className="min-w-0 flex-1">
          <Text className="text-[16px] font-bold leading-snug text-neutral-900 dark:text-white">{template.title}</Text>
          <Text className="mt-0.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">{template.description}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View className="flex-row flex-wrap items-center gap-2 px-4 pb-3">
        <Pill label={durationLabel(template.durationDays)} />
        <Pill label={`${template.tasks.length} task${template.tasks.length > 1 ? 's' : ''}`} glyph={IconLayoutList} />
        <Pill label={`${template.milestones.length} milestones`} glyph={IconFlag} />
        {template.subtasks.length > 0 && <Pill label={`${template.subtasks.length} subtasks`} glyph={IconCheck} />}
      </View>

      {/* Milestone preview */}
      <View className="gap-1 px-4 pb-3">
        {template.milestones.map((m, i) => (
          <View key={i} className="flex-row items-center gap-2">
            <View className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
            <Text className="min-w-0 flex-1 truncate text-[12px] text-neutral-500 dark:text-neutral-400">{m.title}</Text>
            <Text className="shrink-0 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Day {m.offsetDays}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <View className="px-4 pb-4">
        <Pressable accessibilityRole="button" onPress={() => onUse(template)} className={`w-full items-center rounded-xl py-2.5 active:scale-[0.97] active:opacity-80 ${accent.tint}`}>
          <Text className={`text-[14px] font-bold ${accent.icon}`}>Use this template</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

interface TemplatesSheetProps {
  open: boolean;
  onClose: () => void;
  onApply: (template: Template) => void;
}

/**
 * Native port of components/TemplatesSheet.tsx — example plan templates, each
 * creating a plan with its tasks, subtasks and milestones already set up
 * (applied through the shared @planr/core applyTemplate).
 */
function TemplatesSheetInner({ open, onClose, onApply }: TemplatesSheetProps) {
  function handleUse(template: Template) {
    onApply(template);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} maxHeight={Dimensions.get('window').height * 0.92}>
      <View className="px-5 pb-8 pt-2">
        {/* Header */}
        <View className="mb-5 flex-row items-start justify-between">
          <View className="min-w-0 flex-1">
            <Text className={typography.eyebrow}>Get started</Text>
            <Text accessibilityRole="header" className="text-[22px] font-extrabold tracking-tight text-neutral-900 dark:text-white">
              Example templates
            </Text>
            <Text className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">Pick a template to create a plan with tasks and milestones already set up.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="ml-3 mt-0.5 h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200 dark:bg-white/[0.07] dark:active:bg-white/[0.12]"
          >
            <Icon icon={IconX} size={15} strokeWidth={2.5} className="text-neutral-500 dark:text-neutral-400" />
          </Pressable>
        </View>

        {/* Cards */}
        <View className="gap-3">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t.id} template={t} onUse={handleUse} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

export const TemplatesSheet = memo(TemplatesSheetInner);
export default TemplatesSheet;
