import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AccentColor } from '@planr/core/lib/colorSystem';
import { Text } from './Text';

/** Native port of components/ui/Badge.tsx. Container and text classes split (no inheritance). */
const ACCENT_CLASSES: Record<AccentColor, { box: string; text: string }> = {
  red: { box: 'bg-red-500/10 border-red-500/25 dark:bg-red-500/15 dark:border-red-400/35', text: 'text-red-600 dark:text-red-400' },
  orange: { box: 'bg-orange-500/10 border-orange-500/25 dark:bg-orange-500/15 dark:border-orange-400/35', text: 'text-orange-600 dark:text-orange-400' },
  amber: { box: 'bg-amber-500/10 border-amber-500/25 dark:bg-amber-500/15 dark:border-amber-400/35', text: 'text-amber-600 dark:text-amber-400' },
  yellow: { box: 'bg-yellow-500/10 border-yellow-500/25 dark:bg-yellow-500/15 dark:border-yellow-400/35', text: 'text-yellow-600 dark:text-yellow-400' },
  lime: { box: 'bg-lime-500/10 border-lime-500/25 dark:bg-lime-500/15 dark:border-lime-400/35', text: 'text-lime-600 dark:text-lime-400' },
  green: { box: 'bg-green-500/10 border-green-500/25 dark:bg-green-500/15 dark:border-green-400/35', text: 'text-green-600 dark:text-green-400' },
  emerald: { box: 'bg-emerald-500/10 border-emerald-500/25 dark:bg-emerald-500/15 dark:border-emerald-400/35', text: 'text-emerald-600 dark:text-emerald-400' },
  teal: { box: 'bg-teal-500/10 border-teal-500/25 dark:bg-teal-500/15 dark:border-teal-400/35', text: 'text-teal-600 dark:text-teal-400' },
  cyan: { box: 'bg-cyan-500/10 border-cyan-500/25 dark:bg-cyan-500/15 dark:border-cyan-400/35', text: 'text-cyan-600 dark:text-cyan-400' },
  sky: { box: 'bg-sky-500/10 border-sky-500/25 dark:bg-sky-500/15 dark:border-sky-400/35', text: 'text-sky-600 dark:text-sky-400' },
  blue: { box: 'bg-blue-500/10 border-blue-500/25 dark:bg-blue-500/15 dark:border-blue-400/35', text: 'text-blue-600 dark:text-blue-400' },
  indigo: { box: 'bg-indigo-500/10 border-indigo-500/25 dark:bg-indigo-500/15 dark:border-indigo-400/35', text: 'text-indigo-600 dark:text-indigo-400' },
  violet: { box: 'bg-violet-500/10 border-violet-500/25 dark:bg-violet-500/15 dark:border-violet-400/35', text: 'text-violet-600 dark:text-violet-400' },
  purple: { box: 'bg-purple-500/10 border-purple-500/25 dark:bg-purple-500/15 dark:border-purple-400/35', text: 'text-purple-600 dark:text-purple-400' },
  fuchsia: { box: 'bg-fuchsia-500/10 border-fuchsia-500/25 dark:bg-fuchsia-500/15 dark:border-fuchsia-400/35', text: 'text-fuchsia-600 dark:text-fuchsia-400' },
  pink: { box: 'bg-pink-500/10 border-pink-500/25 dark:bg-pink-500/15 dark:border-pink-400/35', text: 'text-pink-600 dark:text-pink-400' },
  rose: { box: 'bg-rose-500/10 border-rose-500/25 dark:bg-rose-500/15 dark:border-rose-400/35', text: 'text-rose-600 dark:text-rose-400' },
};

export function accentTextClass(color: AccentColor): string {
  return ACCENT_CLASSES[color].text;
}

export function AccentBadge({ color, icon, children, className = '' }: { color: AccentColor; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-full border px-2.5 py-0.5 ${ACCENT_CLASSES[color].box} ${className}`}>
      {icon}
      <Text className={`text-[11px] font-semibold ${ACCENT_CLASSES[color].text}`}>{children}</Text>
    </View>
  );
}

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <View className={`flex-row items-center self-start rounded-full border border-neutral-200 px-2.5 py-0.5 dark:border-white/[0.08] ${className}`}>
      <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{children}</Text>
    </View>
  );
}

export function DayPill({ label, active }: { label: string; active: boolean }) {
  return (
    <View
      className={`h-[22px] w-[22px] shrink-0 items-center justify-center rounded-pr-sm ${
        active ? 'bg-neutral-950 dark:bg-white' : ''
      }`}
    >
      <Text className={`text-[11px] font-bold ${active ? 'text-white dark:text-neutral-950' : 'text-neutral-500 dark:text-neutral-400'}`}>
        {label}
      </Text>
    </View>
  );
}

const BADGE_CYCLE: AccentColor[] = [
  'blue', 'emerald', 'violet', 'amber', 'pink', 'cyan',
  'red', 'orange', 'teal', 'sky', 'indigo', 'purple', 'fuchsia', 'rose', 'green', 'lime', 'yellow',
];

export function cycleAccentColor(index: number): AccentColor {
  return BADGE_CYCLE[index % BADGE_CYCLE.length];
}
