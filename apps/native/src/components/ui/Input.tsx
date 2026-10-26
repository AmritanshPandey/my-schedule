import { forwardRef, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Text, TextInput, type TextInputProps, type TextInputRef as RNTextInput } from './Text';
import { typography } from './Typography';

/**
 * Native port of components/ui/Input.tsx — same form chrome constants (minus
 * the browser-only placeholder/color-scheme/focus variants, which the
 * TextInput wrapper and RN's own keyboard handling cover).
 */
const FORM_CONTROL_CHROME =
  'min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-900 focus:border-emerald-600/60 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-emerald-400/50 dark:focus:bg-white/[0.07]';

export const FORM_CONTROL_BASE = `w-full ${FORM_CONTROL_CHROME} text-[16px] font-medium`;
export const FORM_INPUT_CLASS = `${FORM_CONTROL_BASE} h-11 px-4`;
export const SETTINGS_CONTROL_CLASS = `${FORM_CONTROL_CHROME} h-10 px-3 text-[16px] font-semibold`;
export const SETTINGS_ICON_BUTTON_CLASS =
  'h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 dark:border-white/10';
export const FORM_TEXTAREA_CLASS = `${FORM_CONTROL_BASE} min-h-[76px] max-h-36 px-4 py-3 leading-snug`;
export const FORM_LABEL = `mb-1.5 ${typography.eyebrow}`;

interface InputProps extends TextInputProps {
  label?: string;
}

/**
 * Delay autoFocus by ~300ms so the sheet's slide-in finishes before the
 * keyboard opens (same reasoning as the web: focusing mid-animation makes the
 * panel jump as the keyboard pushes it).
 */
function useDelayedFocus(ref: React.RefObject<RNTextInput | null>, autoFocus?: boolean) {
  useEffect(() => {
    if (!autoFocus) return undefined;
    const t = setTimeout(() => ref.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [ref, autoFocus]);
}

function assignRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as React.MutableRefObject<T | null>).current = value;
}

const Input = forwardRef<RNTextInput, InputProps>(function Input({ label, className = '', autoFocus, ...props }, ref) {
  const innerRef = useRef<RNTextInput | null>(null);
  useDelayedFocus(innerRef, autoFocus);
  return (
    <View className="w-full">
      {label && <Text className={FORM_LABEL}>{label}</Text>}
      <TextInput
        ref={(el) => {
          innerRef.current = el;
          assignRef(ref, el);
        }}
        {...props}
        className={`${FORM_INPUT_CLASS} ${className}`}
      />
    </View>
  );
});

interface TextareaProps extends TextInputProps {
  label?: string;
}

export const Textarea = forwardRef<RNTextInput, TextareaProps>(function Textarea(
  { label, className = '', autoFocus, ...props },
  ref,
) {
  const innerRef = useRef<RNTextInput | null>(null);
  useDelayedFocus(innerRef, autoFocus);
  return (
    <View className="w-full">
      {label && <Text className={FORM_LABEL}>{label}</Text>}
      <TextInput
        ref={(el) => {
          innerRef.current = el;
          assignRef(ref, el);
        }}
        multiline
        textAlignVertical="top"
        scrollEnabled
        {...props}
        className={`${FORM_TEXTAREA_CLASS} ${className}`}
      />
    </View>
  );
});

export default Input;
