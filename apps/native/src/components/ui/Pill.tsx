import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from './Text';

/** Native port of components/ui/Pill.tsx — status/label pill with variants. */
type Variant = 'neutral' | 'subtle' | 'selected' | 'success' | 'warning' | 'danger';
type Size = 'sm' | 'md';

const variantClasses: Record<Variant, { box: string; text: string }> = {
  neutral: { box: 'border-neutral-200 bg-white dark:border-white/[0.12] dark:bg-transparent', text: 'text-neutral-500 dark:text-neutral-400' },
  subtle: { box: 'border-transparent bg-neutral-100 dark:bg-white/[0.06]', text: 'text-neutral-600 dark:text-neutral-400' },
  selected: { box: 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white', text: 'text-white dark:text-neutral-900' },
  success: { box: 'border-green-500/30 bg-green-500/10', text: 'text-green-700 dark:text-green-400' },
  warning: { box: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
  danger: { box: 'border-rose-500/30 bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
};

const sizeClasses: Record<Size, { box: string; text: string }> = {
  sm: { box: 'gap-1 px-2.5 py-1', text: 'text-[12px]' },
  md: { box: 'gap-1.5 px-3 py-1', text: 'text-[13px]' },
};

export const PILL_TEXT = (variant: Variant) => variantClasses[variant].text;

export default function Pill({
  variant = 'neutral',
  size = 'md',
  icon,
  className = '',
  children,
}: {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View
      className={`shrink-0 flex-row items-center self-start rounded-full border ${variantClasses[variant].box} ${sizeClasses[size].box} ${className}`}
    >
      {icon}
      <Text className={`font-semibold ${variantClasses[variant].text} ${sizeClasses[size].text}`}>{children}</Text>
    </View>
  );
}
