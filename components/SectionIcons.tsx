import {
  IconBriefcase,
  IconLeaf,
  IconBook,
  IconBarbell,
  IconCode,
  IconHeart,
  IconMusic,
  IconPencil,
  IconShoppingCart,
  IconPlane,
  IconCoffee,
  IconBrain,
  IconBuildingBank,
  IconCamera,
  IconDeviceGamepad2,
  IconHome,
  IconRun,
  IconSchool,
  IconStar,
  IconTools,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

interface SectionIconEntry {
  name: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

export const SECTION_ICONS: SectionIconEntry[] = [
  { name: "briefcase",    label: "Work",      icon: IconBriefcase },
  { name: "leaf",         label: "Personal",  icon: IconLeaf },
  { name: "book",         label: "Study",     icon: IconBook },
  { name: "barbell",      label: "Gym",       icon: IconBarbell },
  { name: "code",         label: "Dev",       icon: IconCode },
  { name: "heart",        label: "Health",    icon: IconHeart },
  { name: "music",        label: "Music",     icon: IconMusic },
  { name: "pencil",       label: "Writing",   icon: IconPencil },
  { name: "shopping",     label: "Shopping",  icon: IconShoppingCart },
  { name: "travel",       label: "Travel",    icon: IconPlane },
  { name: "coffee",       label: "Breaks",    icon: IconCoffee },
  { name: "brain",        label: "Focus",     icon: IconBrain },
  { name: "finance",      label: "Finance",   icon: IconBuildingBank },
  { name: "camera",       label: "Creative",  icon: IconCamera },
  { name: "gaming",       label: "Gaming",    icon: IconDeviceGamepad2 },
  { name: "home",         label: "Home",      icon: IconHome },
  { name: "run",          label: "Cardio",    icon: IconRun },
  { name: "school",       label: "School",    icon: IconSchool },
  { name: "star",         label: "Goals",     icon: IconStar },
  { name: "tools",        label: "Chores",    icon: IconTools },
];

// Per-icon unique colors for the picker UI — each category gets its own distinct hue.
// These are used only in icon picker buttons; timeline card colors use AccentColor tokens.
interface IconPickerStyle {
  tint: string;
  text: string;
  solid: string;
}

const FALLBACK_PICKER_STYLE: IconPickerStyle = {
  tint:  "bg-neutral-100 dark:bg-neutral-500/15",
  text:  "text-neutral-600 dark:text-neutral-400",
  solid: "bg-neutral-500 text-white",
};

export const ICON_PICKER_STYLES: Record<string, IconPickerStyle> = {
  briefcase: { tint: "bg-blue-100 dark:bg-blue-500/15",     text: "text-blue-600 dark:text-blue-400",     solid: "bg-blue-500 text-white" },
  leaf:      { tint: "bg-rose-100 dark:bg-rose-500/15",     text: "text-rose-600 dark:text-rose-400",     solid: "bg-rose-500 text-white" },
  book:      { tint: "bg-violet-100 dark:bg-violet-500/15", text: "text-violet-600 dark:text-violet-400", solid: "bg-violet-500 text-white" },
  barbell:   { tint: "bg-emerald-100 dark:bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", solid: "bg-emerald-500 text-white" },
  code:      { tint: "bg-indigo-100 dark:bg-indigo-500/15", text: "text-indigo-600 dark:text-indigo-400", solid: "bg-indigo-500 text-white" },
  heart:     { tint: "bg-pink-100 dark:bg-pink-500/15",     text: "text-pink-600 dark:text-pink-400",     solid: "bg-pink-500 text-white" },
  music:     { tint: "bg-purple-100 dark:bg-purple-500/15", text: "text-purple-600 dark:text-purple-400", solid: "bg-purple-500 text-white" },
  pencil:    { tint: "bg-teal-100 dark:bg-teal-500/15",     text: "text-teal-600 dark:text-teal-400",     solid: "bg-teal-500 text-white" },
  shopping:  { tint: "bg-amber-100 dark:bg-amber-500/15",   text: "text-amber-600 dark:text-amber-400",   solid: "bg-amber-500 text-white" },
  travel:    { tint: "bg-sky-100 dark:bg-sky-500/15",       text: "text-sky-600 dark:text-sky-400",       solid: "bg-sky-500 text-white" },
  coffee:    { tint: "bg-orange-100 dark:bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", solid: "bg-orange-500 text-white" },
  brain:     { tint: "bg-fuchsia-100 dark:bg-fuchsia-500/15", text: "text-fuchsia-600 dark:text-fuchsia-400", solid: "bg-fuchsia-500 text-white" },
  finance:   { tint: "bg-yellow-100 dark:bg-yellow-500/15", text: "text-yellow-700 dark:text-yellow-400", solid: "bg-yellow-500 text-white" },
  camera:    { tint: "bg-cyan-100 dark:bg-cyan-500/15",     text: "text-cyan-600 dark:text-cyan-400",     solid: "bg-cyan-500 text-white" },
  gaming:    { tint: "bg-green-100 dark:bg-green-500/15",   text: "text-green-600 dark:text-green-400",   solid: "bg-green-500 text-white" },
  home:      { tint: "bg-lime-100 dark:bg-lime-500/15",     text: "text-lime-700 dark:text-lime-400",     solid: "bg-lime-500 text-white" },
  run:       { tint: "bg-red-100 dark:bg-red-500/15",       text: "text-red-600 dark:text-red-400",       solid: "bg-red-500 text-white" },
  school:    { tint: "bg-slate-100 dark:bg-slate-500/15",   text: "text-slate-600 dark:text-slate-400",   solid: "bg-slate-500 text-white" },
  star:      { tint: "bg-yellow-100 dark:bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400", solid: "bg-yellow-400 text-neutral-900" },
  tools:     { tint: "bg-stone-100 dark:bg-stone-500/15",   text: "text-stone-600 dark:text-stone-400",   solid: "bg-stone-500 text-white" },
};

export function getIconPickerStyle(name: string): IconPickerStyle {
  return ICON_PICKER_STYLES[name] ?? FALLBACK_PICKER_STYLE;
}
