/**
 * Routine templates — presets only, no per-category behavior. Every template
 * just prefills a plain `Ritual` (trackingType/target/unit/steps/icon/color/
 * recurrence); the same generic model and UI handle all of them. This is the
 * entirety of "specialized use case support" (skincare/water/nutrition/
 * exercise/etc.) — there is no other per-category code anywhere.
 */
import type { Ritual, RitualRecurrence, RitualStep } from "./useScheduleDB";
import { uid } from "./id";

export type RoutineTemplateKey =
  | "custom"
  | "water"
  | "food"
  | "exercise"
  | "skincare"
  | "supplements"
  | "reading"
  | "meditation";

export interface RoutineTemplate {
  key: RoutineTemplateKey;
  label: string;
  /** Icon registry key — components/SectionIcons.tsx. */
  icon: string;
  color: Ritual["color"];
  defaults: Partial<Omit<Ritual, "id">>;
}

const DAILY: RitualRecurrence = { kind: "daily" };

function steps(...labels: string[]): RitualStep[] {
  return labels.map((label) => ({ id: uid(), label }));
}

export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    key: "custom",
    label: "Custom",
    icon: "star",
    color: "sky",
    defaults: {},
  },
  {
    key: "water",
    label: "Water",
    icon: "droplet",
    color: "sky",
    defaults: {
      title: "Drink Water",
      trackingType: "quantity",
      unit: "ml",
      target: 2500,
      quickAmounts: [250, 500, 750],
      anyTime: true,
      recurrence: DAILY,
    },
  },
  {
    key: "food",
    label: "Food",
    icon: "chefhat",
    color: "amber",
    defaults: {
      title: "Track Calories",
      trackingType: "quantity",
      unit: "kcal",
      target: 2000,
      quickAmounts: [100, 250, 500],
      anyTime: true,
      recurrence: DAILY,
    },
  },
  {
    key: "exercise",
    label: "Exercise",
    icon: "barbell",
    color: "rose",
    defaults: {
      title: "Exercise",
      trackingType: "duration",
      unit: "min",
      target: 30,
      quickAmounts: [15, 30, 60],
      time: "07:00",
      recurrence: DAILY,
    },
  },
  {
    key: "skincare",
    label: "Skincare",
    icon: "droplet",
    color: "fuchsia",
    defaults: {
      title: "Skincare Routine",
      trackingType: "checklist",
      steps: steps("Cleanser", "Toner", "Moisturizer", "Sunscreen"),
      time: "08:00",
      recurrence: DAILY,
    },
  },
  {
    key: "supplements",
    label: "Supplements",
    icon: "pill",
    color: "emerald",
    defaults: {
      title: "Supplements",
      trackingType: "checklist",
      steps: steps("Vitamin D", "Omega-3"),
      time: "08:00",
      recurrence: DAILY,
    },
  },
  {
    key: "reading",
    label: "Reading",
    icon: "book",
    color: "indigo",
    defaults: {
      title: "Reading",
      trackingType: "duration",
      unit: "min",
      target: 30,
      quickAmounts: [10, 20, 30],
      anyTime: true,
      recurrence: DAILY,
    },
  },
  {
    key: "meditation",
    label: "Meditation",
    icon: "brain",
    color: "violet",
    defaults: {
      title: "Meditation",
      trackingType: "duration",
      unit: "min",
      target: 10,
      quickAmounts: [5, 10, 20],
      time: "07:00",
      recurrence: DAILY,
    },
  },
];

export function findRoutineTemplate(key: RoutineTemplateKey): RoutineTemplate | undefined {
  return ROUTINE_TEMPLATES.find((t) => t.key === key);
}
