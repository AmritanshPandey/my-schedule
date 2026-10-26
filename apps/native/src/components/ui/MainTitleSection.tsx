import { memo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { IconCheck, IconChecklist } from '@tabler/icons-react-native';
import { Eyebrow, PageTitle } from './Typography';
import ProgressBar from './ProgressBar';
import { ICON, Icon } from './Icon';
import { Text } from './Text';

/** Native port of components/ui/MainTitleSection.tsx. */
type ProgressMeta = { done: number; total: number } | 'done';

export function CtaActionButton({ label, icon, onClick }: { label: string; icon?: ReactNode; onClick: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onClick}
      className="min-h-[44px] flex-row items-center gap-2 rounded-full border-[1.5px] border-neutral-200 bg-white px-4 py-[10px] active:scale-[0.97] active:bg-neutral-100 dark:border-white/15 dark:bg-neutral-900 dark:active:bg-neutral-800"
    >
      {icon}
      <Text className="text-[13px] font-bold text-neutral-700 dark:text-neutral-300">{label}</Text>
    </Pressable>
  );
}

export function IconActionButton({
  icon,
  saveIcon,
  saving = false,
  onClick,
  show = true,
  label,
}: {
  icon: ReactNode;
  saveIcon?: ReactNode;
  saving?: boolean;
  onClick: () => void;
  show?: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onClick}
      className={`h-10 w-10 items-center justify-center rounded-[10px] border-[1.5px] active:scale-[0.92] ${
        saving
          ? 'border-neutral-950 bg-neutral-950 dark:border-white dark:bg-white'
          : 'border-neutral-200 bg-white active:bg-neutral-100 dark:border-white/10 dark:bg-neutral-900 dark:active:bg-white/[0.07]'
      }`}
    >
      {saving && saveIcon ? saveIcon : icon}
    </Pressable>
  );
}

function MainTitleSectionInner({
  label,
  title,
  smallTitle = false,
  progressMeta,
  progressBar,
  actions,
  className = '',
}: {
  label?: string;
  title: string;
  smallTitle?: boolean;
  progressMeta?: ProgressMeta;
  progressBar?: { pct: number };
  actions?: ReactNode;
  className?: string;
}) {
  const isDone = progressMeta === 'done';
  const counter = !isDone && progressMeta !== undefined ? (progressMeta as { done: number; total: number }) : null;

  return (
    <View className={className}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          {label && <Eyebrow className="mb-2">{label}</Eyebrow>}
          <View className="flex-row items-baseline gap-[9px]">
            <PageTitle className={smallTitle ? 'text-[20px] tracking-[-0.5px]' : ''}>{title}</PageTitle>
            {isDone && (
              <View className="shrink-0 flex-row items-center gap-1">
                <Icon icon={IconCheck} {...ICON.badge} strokeWidth={2.5} className="text-green-500 dark:text-green-400" />
                <Text className="text-[13px] font-bold leading-none tracking-[-0.1px] text-green-500 dark:text-green-400">Done</Text>
              </View>
            )}
            {counter && (
              <View className="shrink-0 flex-row items-center gap-1">
                <Icon icon={IconChecklist} {...ICON.badge} strokeWidth={1.8} className="text-neutral-500 dark:text-neutral-400" />
                <Text className="text-[13px] font-bold leading-none tracking-[-0.1px] tabular-nums text-neutral-500 dark:text-neutral-400">
                  {counter.done}/{counter.total}
                </Text>
              </View>
            )}
          </View>
        </View>
        {actions && <View className="shrink-0 flex-row items-center gap-2">{actions}</View>}
      </View>
      {progressBar !== undefined && (
        <ProgressBar pct={progressBar.pct} height={4} rounded="rounded-[2px]" fillClassName="bg-green-500" className="mt-[10px]" />
      )}
    </View>
  );
}

export const MainTitleSection = memo(MainTitleSectionInner);
