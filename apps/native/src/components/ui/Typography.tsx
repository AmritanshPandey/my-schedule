import type { ReactNode } from 'react';
import { Text } from './Text';

/**
 * Native port of components/ui/Typography.tsx — same raw class strings and the
 * same component wrappers (every one renders a Text; there are no heading
 * elements to pick between on native, so `as` is gone).
 */
interface TextProps {
  children: ReactNode;
  className?: string;
}

export const typography = {
  pageTitle: 'text-display font-semibold leading-tight tracking-[-0.3px] text-neutral-950 dark:text-white',
  sectionTitle: 'text-headline font-semibold leading-tight tracking-[-0.3px] text-neutral-950 dark:text-white',
  sheetTitle: 'text-lead font-semibold text-neutral-950 dark:text-white',
  subsectionTitle: 'text-subtitle font-semibold text-neutral-950 dark:text-white',
  eyebrow: 'text-label font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400',
  body: 'text-bodylg font-medium leading-relaxed text-neutral-600 dark:text-neutral-400',
  caption: 'text-caption font-medium text-neutral-600 dark:text-neutral-400',
} as const;

export function PageTitle({ children, className = '' }: TextProps) {
  return <Text accessibilityRole="header" className={`${typography.pageTitle} ${className}`}>{children}</Text>;
}

export function SectionTitle({ children, className = '' }: TextProps) {
  return <Text accessibilityRole="header" className={`${typography.sectionTitle} ${className}`}>{children}</Text>;
}

export function SheetTitle({ children, className = '' }: TextProps) {
  return <Text accessibilityRole="header" className={`${typography.sheetTitle} ${className}`}>{children}</Text>;
}

export function SubsectionTitle({ children, className = '' }: TextProps) {
  return <Text accessibilityRole="header" className={`${typography.subsectionTitle} ${className}`}>{children}</Text>;
}

export function Eyebrow({ children, className = '' }: TextProps) {
  return <Text className={`${typography.eyebrow} ${className}`}>{children}</Text>;
}

export function BodyText({ children, className = '' }: TextProps) {
  return <Text className={`${typography.body} ${className}`}>{children}</Text>;
}

export function Caption({ children, className = '' }: TextProps) {
  return <Text className={`${typography.caption} ${className}`}>{children}</Text>;
}
