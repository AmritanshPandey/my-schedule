import {
  IconBarbell,
  IconBed,
  IconBook,
  IconBrain,
  IconBriefcase,
  IconCar,
  IconCode,
  IconRun,
  IconSchool,
  IconStar,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

interface SectionIconEntry {
  name: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

// Exactly the 10 categories from the design spec — in design order
export const SECTION_ICONS: SectionIconEntry[] = [
  { name: "run",       label: "Cardio",   icon: IconRun },
  { name: "school",    label: "Study",    icon: IconSchool },
  { name: "book",      label: "Reading",  icon: IconBook },
  { name: "sleep",     label: "Sleep",    icon: IconBed },
  { name: "star",      label: "Routine",  icon: IconStar },
  { name: "briefcase", label: "Work",     icon: IconBriefcase },
  { name: "car",       label: "Commute",  icon: IconCar },
  { name: "brain",     label: "Project",  icon: IconBrain },
  { name: "barbell",   label: "Workout",  icon: IconBarbell },
  { name: "code",      label: "Coding",   icon: IconCode },
];

interface IconPickerStyle {
  tint: string;
  text: string;
  solid: string;
}

// Exact hex values from design spec
export const ICON_PICKER_STYLES: Record<string, IconPickerStyle> = {
  run:       { tint: "bg-[#FEF3C6] dark:bg-[#E17100]/15", text: "text-[#E17100] dark:text-[#FEF3C6]", solid: "bg-[#E17100] text-white" },
  school:    { tint: "bg-[#FFE4E6] dark:bg-[#EC003F]/15", text: "text-[#EC003F] dark:text-[#FFE4E6]", solid: "bg-[#EC003F] text-white" },
  book:      { tint: "bg-[#DBEAFE] dark:bg-[#155DFC]/15", text: "text-[#155DFC] dark:text-[#DBEAFE]", solid: "bg-[#155DFC] text-white" },
  sleep:     { tint: "bg-[#D0FAE5] dark:bg-[#009966]/15", text: "text-[#009966] dark:text-[#D0FAE5]", solid: "bg-[#009966] text-white" },
  star:      { tint: "bg-[#FFEDD4] dark:bg-[#F54900]/15", text: "text-[#F54900] dark:text-[#FFEDD4]", solid: "bg-[#F54900] text-white" },
  briefcase: { tint: "bg-[#CEFAFE] dark:bg-[#0092B8]/15", text: "text-[#0092B8] dark:text-[#CEFAFE]", solid: "bg-[#0092B8] text-white" },
  car:       { tint: "bg-[#ECFCCA] dark:bg-[#5EA500]/15", text: "text-[#5EA500] dark:text-[#ECFCCA]", solid: "bg-[#5EA500] text-white" },
  brain:     { tint: "bg-[#FAE8FF] dark:bg-[#C800DE]/15", text: "text-[#C800DE] dark:text-[#FAE8FF]", solid: "bg-[#C800DE] text-white" },
  barbell:   { tint: "bg-[#FCE7F3] dark:bg-[#E60076]/15", text: "text-[#E60076] dark:text-[#FCE7F3]", solid: "bg-[#E60076] text-white" },
  code:      { tint: "bg-[#E0E7FF] dark:bg-[#4F39F6]/15", text: "text-[#4F39F6] dark:text-[#E0E7FF]", solid: "bg-[#4F39F6] text-white" },
};

const FALLBACK_PICKER_STYLE: IconPickerStyle = ICON_PICKER_STYLES.briefcase;

export function getIconPickerStyle(name: string): IconPickerStyle {
  return ICON_PICKER_STYLES[name] ?? FALLBACK_PICKER_STYLE;
}
