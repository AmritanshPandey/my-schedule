import {
  IconRun,
  IconSchool,
  IconBook,
  IconMoonStars,
  IconStar,
  IconBriefcase,
  IconCar,
  IconBrain,
  IconBarbell,
  IconCode,
} from '@tabler/icons-react-native';

/**
 * Native subset of the web's SECTION_ICONS registry (components/SectionIcons.tsx)
 * — just the keys `packages/core/lib/colorSystem.ts`'s `colorFromIcon`/
 * `categoryFromIcon` already know how to color/categorize, so a plan's stored
 * `emoji` (really an icon key, not a literal emoji) picks a real icon here.
 */
export const ICON_MAP: Record<string, typeof IconStar> = {
  run: IconRun,
  school: IconSchool,
  book: IconBook,
  sleep: IconMoonStars,
  star: IconStar,
  briefcase: IconBriefcase,
  car: IconCar,
  brain: IconBrain,
  barbell: IconBarbell,
  code: IconCode,
};

export const PLAN_ICON_KEYS = Object.keys(ICON_MAP);
