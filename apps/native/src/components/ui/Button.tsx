import { Children, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Text } from './Text';

/**
 * Native port of components/ui/Button.tsx; the spec is DESIGN.md §5 Buttons.
 * Container classes (fill, shape) stay on the Pressable; the text classes the
 * web put on the same <button> move to the label Text, since native text
 * doesn't inherit. String children are wrapped automatically, so
 * `<Button>Save</Button>` reads the same as on the web; an `icon` takes
 * `BUTTON_TEXT[variant]` for its colour.
 */
export type ButtonVariant = 'primary' | 'cta' | 'secondary' | 'ghost' | 'destructive' | 'destructiveSecondary';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant;
  size?: Size;
  fullWidth?: boolean;
  /** Shows a spinner in place of `icon` and ignores presses. */
  loading?: boolean;
  /** Leading icon, coloured with `BUTTON_TEXT[variant]`. */
  icon?: ReactNode;
  /** Trailing icon, for navigation only ("Today ›"). */
  trailingIcon?: ReactNode;
  className?: string;
  textClassName?: string;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-neutral-950 active:bg-neutral-800 dark:bg-white dark:active:bg-neutral-200',
  cta: 'bg-[#008236] active:bg-[#006B2C] dark:bg-[#2FD46E] dark:active:bg-[#28BF62]',
  secondary: 'bg-black/[0.05] active:bg-black/[0.09] dark:bg-white/[0.08] dark:active:bg-white/[0.14]',
  ghost: 'active:bg-black/[0.05] dark:active:bg-white/[0.08]',
  destructive: 'bg-[#E11D48] active:bg-[#BE123C]',
  destructiveSecondary: 'bg-[#E11D48]/10 active:bg-[#E11D48]/[0.16] dark:bg-[#E11D48]/[0.14] dark:active:bg-[#E11D48]/[0.22]',
};

export const BUTTON_TEXT: Record<ButtonVariant, string> = {
  primary: 'text-white dark:text-neutral-950',
  cta: 'text-white dark:text-neutral-950',
  secondary: 'text-neutral-900 dark:text-neutral-100',
  ghost: 'text-neutral-600 dark:text-neutral-300',
  destructive: 'text-white',
  destructiveSecondary: 'text-[#BE123C] dark:text-[#FB7185]',
};

// The same values as BUTTON_TEXT, for ActivityIndicator, which takes a colour.
const SPINNER: Record<ButtonVariant, [light: string, dark: string]> = {
  primary: ['#FFFFFF', '#0A0A0A'],
  cta: ['#FFFFFF', '#0A0A0A'],
  secondary: ['#171717', '#F5F5F5'],
  ghost: ['#525252', '#D4D4D4'],
  destructive: ['#FFFFFF', '#FFFFFF'],
  destructiveSecondary: ['#BE123C', '#FB7185'],
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 px-3.5',
  md: 'h-11 px-4',
  lg: 'h-12 px-5',
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
  loading = false,
  icon,
  trailingIcon,
  className = '',
  textClassName = '',
  children,
  disabled,
  onPress,
  ...props
}: ButtonProps) {
  const { colorScheme } = useColorScheme();
  const label = `font-semibold ${sizeText[size]} ${BUTTON_TEXT[variant]} ${textClassName}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: loading }}
      disabled={disabled}
      // sm draws at 36px; grow its hit area to 44.
      hitSlop={size === 'sm' ? 4 : undefined}
      onPress={loading ? undefined : onPress}
      {...props}
      className={[
        'flex-row items-center justify-center gap-1.5 rounded-full active:scale-[0.97]',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        disabled ? 'opacity-40' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? <ActivityIndicator size="small" color={SPINNER[variant][colorScheme === 'dark' ? 1 : 0]} /> : icon}
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? <Text className={label}>{child}</Text> : child,
      )}
      {trailingIcon}
    </Pressable>
  );
}
