import Svg, { Polygon, Polyline } from 'react-native-svg';
import { useColorScheme } from 'nativewind';

/**
 * Native port of components/ui/Sparkline.tsx: a static trend line for a dense
 * list row. SVG can't read a text colour class, so the tone picks the colour.
 * Renders nothing below 2 points.
 */
const TONES = {
  positive: { light: '#10B981', dark: '#34D399' },
  negative: { light: '#F43F5E', dark: '#FB7185' },
  neutral: { light: '#A3A3A3', dark: '#737373' },
} as const;

export type SparklineTone = keyof typeof TONES;

export default function Sparkline({
  values,
  tone = 'neutral',
  width = 56,
  height = 26,
}: {
  values: number[];
  tone?: SparklineTone;
  width?: number;
  height?: number;
}) {
  const { colorScheme } = useColorScheme();
  if (values.length < 2) return null;

  const color = TONES[tone][colorScheme === 'dark' ? 'dark' : 'light'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const inset = 1.5;
  const stepX = width / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(inset + (1 - (v - min) / range) * (height - inset * 2)).toFixed(1)}`)
    .join(' ');

  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polygon points={`0,${height} ${points} ${width},${height}`} fill={color} opacity={0.12} />
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
