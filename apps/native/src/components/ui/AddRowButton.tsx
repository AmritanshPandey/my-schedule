import { Pressable } from 'react-native';
import { IconPlus } from '@tabler/icons-react-native';
import { Icon } from './Icon';
import { Text } from './Text';

/** Native port of components/ui/AddRowButton.tsx — the dashed "add another" row. */
export default function AddRowButton({
  label,
  onClick,
  align = 'center',
  className = '',
}: {
  label: string;
  onClick: () => void;
  align?: 'center' | 'start';
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onClick}
      className={`h-11 w-full flex-row items-center gap-2 rounded-full border border-dashed border-neutral-200 px-3 active:border-neutral-300 dark:border-white/10 ${
        align === 'center' ? 'justify-center' : ''
      } ${className}`}
    >
      <Icon icon={IconPlus} size={14} strokeWidth={2.5} className="text-neutral-500 dark:text-neutral-400" />
      <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
    </Pressable>
  );
}
