import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { IconArrowRight, IconX } from '@tabler/icons-react-native';
import type { CoachMarkStep } from '@planr/core/lib/onboarding/tours';
import { measureTourTarget, type TargetRect } from '../../lib/onboarding/tourTargets';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { haptic } from '../../lib/haptics';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export type { CoachMarkStep };

/**
 * Native port of components/onboarding/CoachMarks.tsx — a short, skippable,
 * spotlight-driven tour over real UI already on screen. `target` is a
 * <TourTarget id> registered anywhere in the tree, measured fresh on every
 * step change (the web's `data-tour` querySelector).
 *
 * The dim layer is one SVG path — the full screen with the target's rounded
 * rect cut out (even-odd fill) — the native equivalent of the web's
 * oversized box-shadow cutout. The callout sits below the target by default,
 * flips above when there's more room there, and clamps to the screen.
 */
interface CoachMarksProps {
  open: boolean;
  steps: CoachMarkStep[];
  onFinish: () => void;
}

const SPOTLIGHT_PADDING = 8;
const SPOTLIGHT_RADIUS = 16;
const CALLOUT_GAP = 12;
const CALLOUT_MAX_WIDTH = 320;
const VIEWPORT_MARGIN = 16;
// Used until the callout's real height is laid out (same estimate as the web).
const CALLOUT_EST_HEIGHT = 220;
const DIM = 'rgba(10,10,10,0.72)';

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return [
    `M${x + rr} ${y}`,
    `H${x + w - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w} ${y + rr}`,
    `V${y + h - rr}`,
    `A${rr} ${rr} 0 0 1 ${x + w - rr} ${y + h}`,
    `H${x + rr}`,
    `A${rr} ${rr} 0 0 1 ${x} ${y + h - rr}`,
    `V${y + rr}`,
    `A${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    'Z',
  ].join(' ');
}

export default function CoachMarks({ open, steps, onFinish }: CoachMarksProps) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  // Which step index the current `rect` belongs to — the callout waits for
  // its own step's measurement so it never flashes at the previous target.
  const [measuredIndex, setMeasuredIndex] = useState(-1);
  const [calloutHeight, setCalloutHeight] = useState(CALLOUT_EST_HEIGHT);
  const { width: viewportW, height: viewportH } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  // A fast double tap on Next must not double-advance (or overshoot past the
  // last step, silently dropping the tour) — locked until the index commits.
  const advanceLockRef = useRef(false);

  const step = steps[index];

  useEffect(() => {
    if (open) setIndex(0);
    advanceLockRef.current = false;
  }, [open]);

  useEffect(() => {
    advanceLockRef.current = false;
  }, [index]);

  useEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    void measureTourTarget(step.target).then((r) => {
      if (cancelled) return;
      setRect(r);
      setMeasuredIndex(index);
    });
    return () => {
      cancelled = true;
    };
  }, [open, step, index, viewportW, viewportH]);

  const finish = useCallback(() => {
    haptic('light');
    onFinish();
  }, [onFinish]);

  if (!open || !step) return null;

  const isLast = index === steps.length - 1;

  function advance() {
    if (advanceLockRef.current) return;
    advanceLockRef.current = true;
    haptic('light');
    if (isLast) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  const ready = measuredIndex === index;
  const spot = ready && rect
    ? {
        top: rect.y - SPOTLIGHT_PADDING,
        left: rect.x - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  const calloutWidth = Math.min(CALLOUT_MAX_WIDTH, viewportW - VIEWPORT_MARGIN * 2);
  let calloutTop: number;
  if (spot) {
    const spaceBelow = viewportH - (spot.top + spot.height);
    const spaceAbove = spot.top;
    const placeAbove = spaceAbove > spaceBelow;
    calloutTop = placeAbove ? spot.top - CALLOUT_GAP - calloutHeight : spot.top + spot.height + CALLOUT_GAP;
  } else {
    calloutTop = viewportH / 2 - calloutHeight / 2;
  }
  calloutTop = Math.min(Math.max(VIEWPORT_MARGIN, calloutTop), viewportH - calloutHeight - VIEWPORT_MARGIN);
  const idealLeft = spot ? spot.left + spot.width / 2 - calloutWidth / 2 : viewportW / 2 - calloutWidth / 2;
  const calloutLeft = Math.min(Math.max(VIEWPORT_MARGIN, idealLeft), viewportW - calloutWidth - VIEWPORT_MARGIN);

  const dimPath = spot
    ? `M0 0H${viewportW}V${viewportH}H0Z ${roundedRectPath(spot.left, spot.top, spot.width, spot.height, SPOTLIGHT_RADIUS)}`
    : `M0 0H${viewportW}V${viewportH}H0Z`;

  return (
    <Modal
      visible
      transparent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={finish}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Dimmed backdrop with a spotlight cutout */}
        <Svg width={viewportW} height={viewportH} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={dimPath} fill={DIM} fillRule="evenodd" />
        </Svg>

        {/* Backdrop dismiss target */}
        <Pressable accessibilityRole="button" accessibilityLabel="Skip tour" onPress={finish} style={StyleSheet.absoluteFill} />

        {/* Callout */}
        {ready && (
          <View
            accessibilityViewIsModal
            accessibilityLabel={step.title}
            onLayout={(e) => setCalloutHeight(e.nativeEvent.layout.height)}
            className="absolute rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.08] dark:bg-neutral-900"
            style={{ top: calloutTop, left: calloutLeft, width: calloutWidth }}
          >
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
                {index + 1} of {steps.length}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip tour"
                onPress={finish}
                hitSlop={10}
                className="h-6 w-6 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.06]"
              >
                <Icon icon={IconX} size={13} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
              </Pressable>
            </View>
            <Text accessibilityRole="header" className="text-[15px] font-bold text-neutral-900 dark:text-white">
              {step.title}
            </Text>
            <Text className="mt-1 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{step.body}</Text>
            <View className="mt-4 flex-row items-center justify-between">
              <Pressable accessibilityRole="button" onPress={finish} hitSlop={12} className="min-h-[44px] justify-center pr-4">
                <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Skip</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={advance}
                className="min-h-[44px] flex-row items-center gap-1 rounded-full bg-neutral-900 px-4 active:scale-[0.97] dark:bg-white"
              >
                <Text className="text-[13px] font-bold text-white dark:text-neutral-900">{isLast ? 'Got it' : 'Next'}</Text>
                {!isLast && <Icon icon={IconArrowRight} size={14} strokeWidth={2.4} className="text-white dark:text-neutral-900" />}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
