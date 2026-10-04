import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { IconChevronLeft } from '@tabler/icons-react-native';
import { Icon, type TablerIcon } from './Icon';
import { Text } from './Text';

export interface DetailHeaderAction {
  icon: TablerIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  active?: boolean;
}

interface DetailHeaderProps {
  title: string;
  onBack: () => void;
  actions?: DetailHeaderAction[];
  rightSlot?: ReactNode;
  className?: string;
}

/** Native port of components/ui/DetailHeader.tsx — the sub-page header bar. */
export default function DetailHeader({ title, onBack, actions, rightSlot, className = '' }: DetailHeaderProps) {
  return (
    <View
      className={`h-16 shrink-0 flex-row items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 dark:border-white/[0.08] dark:bg-neutral-950 ${className}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        className="-ml-1.5 min-w-0 flex-1 flex-row items-center gap-1 active:scale-[0.94]"
      >
        <Icon icon={IconChevronLeft} size={24} strokeWidth={1.5} className="shrink-0 text-neutral-950 dark:text-white" />
        <Text className="truncate shrink text-[16px] font-semibold leading-none text-neutral-950 dark:text-white">{title}</Text>
      </Pressable>

      <View className="shrink-0 flex-row items-center gap-1">
        {rightSlot}
        {actions?.map((action, i) => {
          const tone = action.active
            ? 'bg-neutral-950 dark:bg-white'
            : action.destructive
              ? 'active:bg-rose-500/10'
              : 'active:bg-neutral-200/70 dark:active:bg-white/[0.07]';
          const iconTone = action.active ? 'text-white dark:text-neutral-950' : 'text-neutral-500 dark:text-neutral-400';
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onClick}
              className={`h-12 w-12 items-center justify-center rounded-full active:scale-[0.86] ${tone}`}
            >
              <Icon icon={action.icon} size={24} strokeWidth={2} className={iconTone} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
