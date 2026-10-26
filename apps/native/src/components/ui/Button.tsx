import { Children, type ReactNode } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { Text } from './Text';

/**
 * Native port of components/ui/Button.tsx. Container classes (fill, border,
 * shape) stay on the Pressable; the text classes the web put on the same
 * <button> move to the label Text, since native text doesn't inherit. String
 * children are wrapped automatically, so `<Button>Save</Button>` reads the
 * same as on the web; anything richer can take `BUTTON_TEXT[variant]`.
 */
type Variant = 'primary' | 'cta' | 'secondary' | 'ghost' | 'destructive' | 'dangerSecondary';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  textClassName?: string;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-neutral-950 active:bg-neutral-800 dark:bg-white dark:active:bg-neutral-100',
  cta: 'bg-[#008236] active:bg-[#006B2C] dark:bg-[#2FD46E] dark:active:bg-[#2FD46E]/90',
  secondary: 'border border-neutral-200 bg-white active:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:active:bg-white/[0.05]',
  ghost: 'active:bg-neutral-100 dark:active:bg-white/[0.07]',
  destructive: 'bg-rose-500 active:bg-rose-600 dark:bg-rose-500 dark:active:bg-rose-600',
  dangerSecondary: 'border border-neutral-200 active:border-rose-200 active:bg-rose-500/10 dark:border-white/10 dark:active:border-rose-500/20 dark:active:bg-rose-500/10',
};

export const BUTTON_TEXT: Record<Variant, string> = {
  primary: 'text-white dark:text-neutral-900',
  cta: 'text-white dark:text-neutral-950',
  secondary: 'text-neutral-600 dark:text-neutral-300',
  ghost: 'text-neutral-500 dark:text-neutral-400',
  destructive: 'text-white',
  dangerSecondary: 'text-neutral-500 dark:text-neutral-400',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3 rounded-full',
  md: 'h-11 px-4 rounded-full',
  lg: 'h-12 rounded-full',
};

const sizeText: Record<Size, string> = {
  sm: 'text-[13px]',
  md: 'text-[14px]',
  lg: 'text-[16px]',
};

export default function Button({
  variant = 'primary',
  size = 'lg',
  fullWidth = false,
  className = '',
  textClassName = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  const label = `font-semibold ${sizeText[size]} ${BUTTON_TEXT[variant]} ${textClassName}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...props}
      className={[
        'flex-row items-center justify-center gap-1.5 active:scale-[0.98]',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        disabled ? 'opacity-40' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? <Text className={label}>{child}</Text> : child,
      )}
    </Pressable>
  );
}
