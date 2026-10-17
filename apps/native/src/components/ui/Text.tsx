import { forwardRef, type ComponentRef } from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { useColorScheme } from 'nativewind';

/**
 * The app's Text and TextInput — RN's own, plus the three things the PWA's
 * class strings expect from the browser that React Native doesn't give:
 *
 * 1. The font. app/globals.css sets "Avenir Next" once on <body> and the
 *    cascade does the rest; RN has no font inheritance, and React 19 dropped
 *    `defaultProps` for function components (RN's Text is one), so patching
 *    defaults can't reach it either. Every string goes through here instead.
 * 2. `truncate` / `line-clamp-N`. On the web these are CSS; NativeWind can
 *    only emit `overflow: hidden` for them. RN's equivalent is a prop, so the
 *    class is read and turned into `numberOfLines`.
 * 3. `tabular-nums`. NativeWind has no mapping for font-variant-numeric; RN
 *    takes it as the `fontVariant` style.
 *
 * Reading the class string keeps every ported component's markup a line-by-
 * line match for its web original rather than a re-expression of it.
 */
const BASE: TextStyle = { fontFamily: 'Avenir Next' };
const TNUM: TextStyle = { fontVariant: ['tabular-nums'] };

const TRUNCATE_RE = /(?:^|\s)truncate(?:\s|$)/;
const CLAMP_RE = /(?:^|\s)line-clamp-(\d)(?:\s|$)/;
const TNUM_RE = /(?:^|\s)tabular-nums(?:\s|$)/;

export type TextProps = RNTextProps & { className?: string };

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function Text({ className, style, numberOfLines, ...props }, ref) {
  const cls = className ?? '';
  const clamp = CLAMP_RE.exec(cls);
  const lines = numberOfLines ?? (TRUNCATE_RE.test(cls) ? 1 : clamp ? Number(clamp[1]) : undefined);
  return (
    <RNText
      ref={ref}
      className={cls}
      numberOfLines={lines}
      style={[BASE, TNUM_RE.test(cls) ? TNUM : null, style]}
      {...props}
    />
  );
});

export type TextInputProps = RNTextInputProps & { className?: string };

/**
 * `placeholder:text-*` has no native mapping either; the PWA's form chrome
 * uses neutral-500 (light) / neutral-400 (dark) placeholders, applied here as
 * the default so every field matches without repeating it.
 */
export type TextInputRef = ComponentRef<typeof RNTextInput>;

export const TextInput = forwardRef<TextInputRef, TextInputProps>(function TextInput(
  { className, style, placeholderTextColor, ...props },
  ref,
) {
  const { colorScheme } = useColorScheme();
  const cls = className ?? '';
  return (
    <RNTextInput
      ref={ref}
      className={cls}
      placeholderTextColor={placeholderTextColor ?? (colorScheme === 'dark' ? '#A3A3A3' : '#737373')}
      style={[BASE, TNUM_RE.test(cls) ? TNUM : null, style]}
      {...props}
    />
  );
});
