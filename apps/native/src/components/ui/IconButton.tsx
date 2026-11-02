import type { ReactNode } from 'react';
import { Pressable, type PressableProps } from 'react-native';

/**
 * Native port of components/ui/IconButton.tsx; the spec is DESIGN.md §5
 * Buttons. Always a circle, always labelled. The icon child carries its own
 * colour class (no CSS colour inheritance on native): pass it
 * `ICON_BUTTON_TONE[variant]`.
 */
export type IconButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface IconButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: IconButtonVariant;
  size?: Size;
  /** A toggle's on state: renders as `primary` and reports `selected`. */
  selected?: boolean;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<IconButtonVariant, string> = {
  primary: 'bg-neutral-950 active:bg-neutral-800 dark:bg-white dark:active:bg-neutral-200',
  secondary: 'bg-black/[0.05] active:bg-black/[0.09] dark:bg-white/[0.08] dark:active:bg-white/[0.14]',
  ghost: 'active:bg-black/[0.05] dark:active:bg-white/[0.08]',
  destructive: 'active:bg-[#E11D48]/10 dark:active:bg-[#E11D48]/[0.14]',
};

/** The variant's icon colour — what `text-*` on the web button gave its icon. */
export const ICON_BUTTON_TONE: Record<IconButtonVariant, string> = {
  primary: 'text-white dark:text-neutral-950',
  secondary: 'text-neutral-800 dark:text-neutral-100',
  ghost: 'text-neutral-600 dark:text-neutral-300',
  destructive: 'text-neutral-600 dark:text-neutral-300',
};

const sizeClasses: Record<Size, string> = {
  xs: 'h-6 w-6',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-11 w-11',
};

// Grows each size's hit area to at least 44px.
const hitSlop: Record<Size, number | undefined> = { xs: 10, sm: 6, md: 2, lg: undefined };

export default function IconButton({
  label,
  variant = 'secondary',
  size = 'md',
  selected,
  className = '',
  children,
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      hitSlop={hitSlop[size]}
      {...props}
      className={[
        'shrink-0 items-center justify-center rounded-full active:scale-[0.94]',
        disabled ? 'opacity-40' : '',
        variantClasses[selected ? 'primary' : variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Pressable>
  );
}
