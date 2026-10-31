import { forwardRef, type ComponentRef } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps as RNTextInputProps,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { cssInterop, useColorScheme } from 'nativewind';

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
 * Text also follows the iOS text-size setting, capped at MAX_FONT_SCALE. The
 * PWA's pixel sizes don't scale at all, so its dense chrome (the week strip,
 * the tab bar, header rows) was never laid out for 2× text: uncapped, dates
 * clip and labels truncate. The cap still lets text grow for people who
 * need it; a caller can pass its own `maxFontSizeMultiplier` to differ.
 *
 * Reading the class string keeps every ported component's markup a line-by-
 * line match for its web original rather than a re-expression of it.
 *
 * 4. Tight leading. A browser lets glyphs spill out of a short line box;
 *    iOS cuts them off at the top. Avenir Next is tall (ascent + descent is
 *    about 1.37× its size), so the PWA's `leading-none` / `leading-tight`
 *    clipped every big number and title. See `fitLineHeight` below.
 */
const BASE: TextStyle = { fontFamily: 'Avenir Next' };
const TNUM: TextStyle = { fontVariant: ['tabular-nums'] };

/** How far the iOS text-size setting may enlarge text (see above). */
export const MAX_FONT_SCALE = 1.3;

const TRUNCATE_RE = /(?:^|\s)truncate(?:\s|$)/;
const CLAMP_RE = /(?:^|\s)line-clamp-(\d)(?:\s|$)/;
const TNUM_RE = /(?:^|\s)tabular-nums(?:\s|$)/;
const LEADING_RE = /(?:^|\s|:)leading-/;

/** Avenir Next's own ascent + descent, as a multiple of its font size. */
const NATURAL_LINE_HEIGHT = 1.37;

/**
 * Raises a line height shorter than the font to the font's own height, and
 * takes the difference back out of the vertical margins so the box keeps
 * the size the PWA's `leading-*` gave it. The glyphs then overhang the box
 * the way they do in a browser, instead of being clipped. Text that wraps
 * still grows by the extra space between its lines, which it needs: each
 * line would clip otherwise.
 */
function fitLineHeight(style: RNTextProps['style']): RNTextProps['style'] {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = flat?.fontSize;
  const lineHeight = flat?.lineHeight;
  if (!fontSize || !lineHeight) return style;
  const natural = Math.ceil(fontSize * NATURAL_LINE_HEIGHT);
  if (lineHeight >= natural) return style;
  const half = (natural - lineHeight) / 2;
  const top = Number(flat.marginTop ?? flat.marginVertical ?? flat.margin ?? 0);
  const bottom = Number(flat.marginBottom ?? flat.marginVertical ?? flat.margin ?? 0);
  return [style, { lineHeight: natural, marginTop: top - half, marginBottom: bottom - half }];
}

/** RN's Text with NativeWind's classes already resolved into `style`, so the line height can be read. */
const ResolvedText = forwardRef<ComponentRef<typeof RNText>, RNTextProps>(function ResolvedText({ style, ...props }, ref) {
  return <RNText ref={ref} style={fitLineHeight(style)} {...props} />;
});
cssInterop(ResolvedText, { className: 'style' });

export type TextProps = RNTextProps & { className?: string };

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function Text(
  { className, style, numberOfLines, maxFontSizeMultiplier = MAX_FONT_SCALE, ...props },
  ref,
) {
  const cls = className ?? '';
  const clamp = CLAMP_RE.exec(cls);
  const lines = numberOfLines ?? (TRUNCATE_RE.test(cls) ? 1 : clamp ? Number(clamp[1]) : undefined);
  // Only text with a `leading-*` class can need the line-height fix, and
  // routing it through ResolvedText costs a style flatten per render, so
  // everything else goes straight to RN's Text.
  const Inner = LEADING_RE.test(cls) ? ResolvedText : RNText;
  return (
    <Inner
      ref={ref}
      className={cls}
      numberOfLines={lines}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
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
  { className, style, placeholderTextColor, maxFontSizeMultiplier = MAX_FONT_SCALE, ...props },
  ref,
) {
  const { colorScheme } = useColorScheme();
  const cls = className ?? '';
  return (
    <RNTextInput
      ref={ref}
      className={cls}
      placeholderTextColor={placeholderTextColor ?? (colorScheme === 'dark' ? '#A3A3A3' : '#737373')}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[BASE, TNUM_RE.test(cls) ? TNUM : null, style]}
      {...props}
    />
  );
});
