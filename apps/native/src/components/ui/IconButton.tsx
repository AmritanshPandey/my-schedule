import type { ReactNode } from 'react';
import { Pressable, type PressableProps } from 'react-native';

/**
 * Native port of components/ui/IconButton.tsx. The icon child carries its own
 * color class (no CSS color inheritance on native); `tone` exposes the
 * variant's text color so callers can pass it straight to <Icon>.
 */
type Variant = 'outline' | 'soft' | 'ghost' | 'dangerGhost';
type Size = 'tiny' | 'xxs' | 'xs' | 'sm' | 'md';
type Radius = 'lg' | 'xl' | 'full';

interface IconButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  radius?: Radius;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  outline: 'border border-neutral-200 active:bg-neutral-100 dark:border-white/10 dark:active:bg-white/[0.07]',
  soft: 'bg-neutral-100 active:bg-neutral-200 dark:bg-white/[0.07] dark:active:bg-white/[0.10]',
  ghost: 'active:bg-neutral-100 dark:active:bg-white/[0.07]',
  dangerGhost: 'active:bg-rose-500/10 dark:active:bg-rose-500/10',
};

/** The variant's icon color — what `text-*` on the web button gave its icon. */
export const ICON_BUTTON_TONE: Record<Variant, string> = {
  outline: 'text-neutral-500 dark:text-neutral-400',
  soft: 'text-neutral-500 dark:text-neutral-400',
  ghost: 'text-neutral-500 dark:text-neutral-400',
  dangerGhost: 'text-neutral-500 dark:text-neutral-400',
};

const sizeClasses: Record<Size, string> = {
  tiny: 'h-[18px] w-[18px]',
  xxs: 'h-6 w-6',
  xs: 'h-8 w-8',
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

const radiusClasses: Record<Radius, string> = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

export default function IconButton({
  label,
  variant = 'ghost',
  size = 'sm',
  radius = 'xl',
  className = '',
  children,
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      {...props}
      className={[
        'shrink-0 items-center justify-center',
        disabled ? 'opacity-40' : '',
        variantClasses[variant],
        sizeClasses[size],
        radiusClasses[radius],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Pressable>
  );
}
