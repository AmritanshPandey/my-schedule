import { Pressable, View } from 'react-native';
import { IconPlus } from '@tabler/icons-react-native';
import { haptic } from '../../lib/haptics';
import { Icon, type TablerIcon } from './Icon';
import { Text } from './Text';
import Button, { BUTTON_TEXT } from './Button';

interface EmptyAction {
  label: string;
  onClick: () => void;
  /** Defaults to a plus icon. Pass `null` to render no leading icon. */
  icon?: TablerIcon | null;
}

interface EmptyStateProps {
  icon: TablerIcon;
  title: string;
  description: string;
  action?: EmptyAction;
  secondaryAction?: { label: string; onClick: () => void };
  center?: boolean;
  className?: string;
}

/** Native port of components/ui/EmptyState.tsx — the shared page empty state. */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  center = false,
  className = '',
}: EmptyStateProps) {
  const ActionIcon = action ? (action.icon === undefined ? IconPlus : action.icon) : null;
  return (
    <View className={`items-center gap-4 ${center ? 'flex-1 justify-center' : 'pt-16'} ${className}`}>
      <View className="h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <Icon icon={icon} size={30} strokeWidth={1.5} className="text-[#00A63E] dark:text-[#2FD46E]" />
      </View>
      <View className="items-center">
        <Text className="text-center text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">{title}</Text>
        <Text className="mt-1.5 max-w-[260px] text-center text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{description}</Text>
      </View>
      {action && (
        <Button
          variant="primary"
          size="md"
          onPress={() => {
            haptic('medium');
            action.onClick();
          }}
          icon={ActionIcon && <Icon icon={ActionIcon} size={16} strokeWidth={2.5} className={BUTTON_TEXT.primary} />}
          className="mt-2"
        >
          {action.label}
        </Button>
      )}
      {secondaryAction && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptic('light');
            secondaryAction.onClick();
          }}
        >
          <Text className="text-[13px] font-semibold text-neutral-500 underline dark:text-neutral-400">{secondaryAction.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
