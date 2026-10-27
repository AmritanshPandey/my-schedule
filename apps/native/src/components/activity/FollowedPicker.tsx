import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import { useColorScheme } from 'nativewind';
import { FOLLOWED_OPTIONS } from '@planr/core/lib/routineDetails';
import { haptic } from '../../lib/haptics';
import { Text } from '../ui/Text';

/** The rail runs between the first and last option; the steps are even. */
const MIN = FOLLOWED_OPTIONS[0];
const MAX = FOLLOWED_OPTIONS[FOLLOWED_OPTIONS.length - 1];
const STEP = (MAX - MIN) / (FOLLOWED_OPTIONS.length - 1);

/** Knob diameter (web: `.followed-slider` thumb). */
const THUMB = 28;

const fraction = (pct: number) => (pct - MIN) / (MAX - MIN);

/** Nearest allowed rating to a raw value. */
const snap = (raw: number) => Math.min(MAX, Math.max(MIN, MIN + Math.round((raw - MIN) / STEP) * STEP));

interface FollowedPickerProps {
  /** The current rating, or null when the day isn't rated/done. */
  value: number | null;
  onChange: (pct: number) => void;
  /** Names the routine for screen readers. */
  routineTitle: string;
  /** Smaller caption above the slider; omit for none. */
  prompt?: string;
  className?: string;
}

/**
 * Native port of components/activity/FollowedPicker.tsx — "How closely did
 * you follow it?", the optional second beat after marking a routine done.
 *
 * A slider, not a row of chips: four coarse steps, because this is a feel for
 * the day rather than a measurement, so the knob snaps between them and the
 * rail shows its detents. Dragging only moves a local draft; the rating is
 * written once, on release. Screen readers get an adjustable control that
 * steps up and down.
 */
export default function FollowedPicker({ value, onChange, routineTitle, prompt, className = '' }: FollowedPickerProps) {
  const { colorScheme } = useColorScheme();
  // An unrated done day already counts as fully followed, so the knob starts
  // where the day actually stands rather than at an invented zero.
  const committed = value ?? MAX;
  const [draft, setDraft] = useState(committed);
  const [width, setWidth] = useState(0);
  const dragging = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const widthRef = useRef(0);
  widthRef.current = width;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // A rating changed elsewhere (the row and the detail view share a day) wins
  // whenever the knob is not under a finger.
  useEffect(() => {
    if (!dragging.current) setDraft(committed);
  }, [committed]);

  const travel = Math.max(0, width - THUMB);
  const centre = (pct: number) => fraction(pct) * travel + THUMB / 2;

  const panResponder = useMemo(() => {
    const pctAt = (x: number) => {
      const t = Math.max(0, widthRef.current - THUMB);
      if (t === 0) return draftRef.current;
      return snap(MIN + ((x - THUMB / 2) / t) * (MAX - MIN));
    };
    const move = (x: number) => {
      const next = pctAt(x);
      if (next !== draftRef.current) {
        haptic('light');
        draftRef.current = next;
        setDraft(next);
      }
    };
    const release = () => {
      if (!dragging.current) return;
      dragging.current = false;
      onChangeRef.current(draftRef.current);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the gesture once horizontal: a sheet or list scrolling under the
      // finger should not steal a drag along the rail.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        dragging.current = true;
        move(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => move(e.nativeEvent.locationX),
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    });
  }, []);

  const step = (dir: 1 | -1) => {
    const next = snap(draftRef.current + dir * STEP);
    if (next === draftRef.current) return;
    haptic('light');
    setDraft(next);
    onChange(next);
  };

  return (
    <View className={className}>
      <View className="mb-1.5 flex-row items-baseline justify-between gap-3">
        {prompt ? <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{prompt}</Text> : <View />}
        {/* Decorative: the slider announces its own value. */}
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          className="text-[13px] font-extrabold tabular-nums text-neutral-900 dark:text-neutral-50"
        >
          {draft}%
        </Text>
      </View>

      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`How closely you followed ${routineTitle}`}
        accessibilityValue={{ min: MIN, max: MAX, now: draft, text: `${draft}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        className="relative h-11 justify-center"
        {...panResponder.panHandlers}
      >
        <View pointerEvents="none" className="h-2 rounded-full bg-neutral-200 dark:bg-white/[0.14]" />
        {width > 0 && (
          <>
            <View
              pointerEvents="none"
              className="absolute left-0 h-2 rounded-full bg-green-600 dark:bg-emerald-500"
              style={{ width: centre(draft) }}
            />
            {/* Detents: the rail looks continuous, so the stops have to be visible. */}
            {FOLLOWED_OPTIONS.map((pct) => (
              <View
                key={pct}
                pointerEvents="none"
                className={`absolute h-[3px] w-[3px] rounded-full ${pct <= draft ? 'bg-white/70' : 'bg-neutral-400/70 dark:bg-white/30'}`}
                style={{ left: centre(pct) - 1.5 }}
              />
            ))}
            <View
              pointerEvents="none"
              className="absolute rounded-full border border-white/80 bg-white dark:border-white/[0.25] dark:bg-neutral-200"
              style={{
                left: centre(draft) - THUMB / 2,
                width: THUMB,
                height: THUMB,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: colorScheme === 'dark' ? 0.5 : 0.18,
                shadowRadius: 6,
                elevation: 4,
              }}
            />
          </>
        )}
      </View>
    </View>
  );
}
