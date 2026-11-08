import { View } from 'react-native';
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
  secondaryAction?: { label: string; onClick: () => void; icon?: TablerIcon };
  center?: boolean;
  className?: string;
}

/**
 * Native port of components/ui/EmptyState.tsx — the one empty state, on every
 * tab: a dashed card, a neutral icon tile (green stays for progress), title,
 * one line of copy, and buttons with icons.
 */
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
    <View className={`${center ? 'flex-1 justify-center' : ''} ${className}`}>
      <View className="items-center rounded-2xl border border-dashed border-neutral-200 bg-white px-5 py-8 dark:border-white/[0.10] dark:bg-neutral-900">
        <View className="mb-3 h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
          <Icon icon={icon} size={20} strokeWidth={1.8} className="text-neutral-600 dark:text-neutral-300" />
        </View>
        <Text className="text-center text-[16px] font-bold text-neutral-950 dark:text-white">{title}</Text>
        <Text className="mt-1 max-w-[280px] text-center text-[13px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">{description}</Text>
        {(action || secondaryAction) && (
          <View className="mt-4 flex-row flex-wrap items-center justify-center gap-2">
            {action && (
              <Button
                variant="primary"
                size="md"
                onPress={() => {
                  haptic('medium');
                  action.onClick();
                }}
                icon={ActionIcon && <Icon icon={ActionIcon} size={16} strokeWidth={2.5} className={BUTTON_TEXT.primary} />}
              >
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                variant="secondary"
                size="md"
                onPress={() => {
                  haptic('light');
                  secondaryAction.onClick();
                }}
                icon={secondaryAction.icon && <Icon icon={secondaryAction.icon} size={16} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}
              >
                {secondaryAction.label}
              </Button>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
