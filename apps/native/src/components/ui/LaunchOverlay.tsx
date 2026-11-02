import { useEffect, useRef, useState } from 'react';
import { Animated, Appearance, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../../lib/useReducedMotion';

/** ios/PlanRNative/Images.xcassets/SplashBackground — keep the two in step. */
const BACKGROUND = { light: '#F3F4F1', dark: '#0E0E0E' } as const;
/** The app icon's mark at 64pt wide, as in ios/…/SplashMark.imageset. */
const BARS = [64, 44, 26];

/**
 * The launch screen, continued in JS: the same mark in the same place on the
 * same colour as LaunchScreen.storyboard, held until the schedule has loaded
 * and then faded out, so opening the app reads as one motion rather than
 * storyboard → blank → "Loading schedule" → app.
 *
 * Follows the system appearance, as the storyboard does (it can't read the
 * app's own theme setting), so the hand-off itself never changes colour.
 */
export default function LaunchOverlay({ ready }: { ready: boolean }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const [gone, setGone] = useState(false);
  const scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (!ready) return;
    if (reducedMotion) {
      setGone(true);
      return;
    }
    Animated.timing(opacity, { toValue: 0, duration: 220, delay: 60, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setGone(true);
    });
  }, [ready, reducedMotion, opacity]);

  if (gone) return null;

  const ink = scheme === 'dark' ? '#FFFFFF' : '#0A0A0A';
  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: BACKGROUND[scheme], opacity }]}
    >
      <View style={styles.mark}>
        {BARS.map((width, i) => (
          <View key={i} style={{ width, height: 14, borderRadius: 7, backgroundColor: ink }} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  // 64 × 68: three 14pt bars, 27pt apart (13pt gaps), left-aligned.
  mark: { width: 64, height: 68, justifyContent: 'space-between', alignItems: 'flex-start' },
});
