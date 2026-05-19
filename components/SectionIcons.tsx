import {
  IconBarbell,
  IconBed,
  IconBike,
  IconBolt,
  IconBook,
  IconBrain,
  IconBriefcase,
  IconCamera,
  IconCar,
  IconChefHat,
  IconCode,
  IconCoin,
  IconDna,
  IconDroplet,
  IconFlame,
  IconHeart,
  IconLanguage,
  IconLeaf,
  IconMoodSmile,
  IconMountain,
  IconMusic,
  IconPalette,
  IconPencil,
  IconPill,
  IconPlane,
  IconRun,
  IconSchool,
  IconStar,
  IconUsers,
  IconYoga,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

interface SectionIconEntry {
  name: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

export const SECTION_ICONS: SectionIconEntry[] = [
  // Original 10
  { name: "run",       label: "Cardio",    icon: IconRun },
  { name: "school",    label: "Study",     icon: IconSchool },
  { name: "book",      label: "Reading",   icon: IconBook },
  { name: "sleep",     label: "Sleep",     icon: IconBed },
  { name: "star",      label: "Routine",   icon: IconStar },
  { name: "briefcase", label: "Work",      icon: IconBriefcase },
  { name: "car",       label: "Commute",   icon: IconCar },
  { name: "brain",     label: "Project",   icon: IconBrain },
  { name: "barbell",   label: "Workout",   icon: IconBarbell },
  { name: "code",      label: "Coding",    icon: IconCode },
  // Extended
  { name: "heart",     label: "Health",    icon: IconHeart },
  { name: "music",     label: "Music",     icon: IconMusic },
  { name: "palette",   label: "Art",       icon: IconPalette },
  { name: "plane",     label: "Travel",    icon: IconPlane },
  { name: "chefhat",   label: "Cooking",   icon: IconChefHat },
  { name: "coin",      label: "Finance",   icon: IconCoin },
  { name: "camera",    label: "Photos",    icon: IconCamera },
  { name: "users",     label: "Social",    icon: IconUsers },
  { name: "leaf",      label: "Nature",    icon: IconLeaf },
  { name: "pencil",    label: "Writing",   icon: IconPencil },
  { name: "yoga",      label: "Yoga",      icon: IconYoga },
  { name: "bike",      label: "Cycling",   icon: IconBike },
  { name: "mountain",  label: "Hiking",    icon: IconMountain },
  { name: "droplet",   label: "Hydration", icon: IconDroplet },
  { name: "moodsmile", label: "Mindset",   icon: IconMoodSmile },
  { name: "flame",     label: "Streak",    icon: IconFlame },
  { name: "language",  label: "Language",  icon: IconLanguage },
  { name: "pill",      label: "Wellness",  icon: IconPill },
  { name: "bolt",      label: "Energy",    icon: IconBolt },
  { name: "dna",       label: "Science",   icon: IconDna },
];

interface IconPickerStyle {
  tint: string;
  text: string;
  solid: string;
}

export const ICON_PICKER_STYLES: Record<string, IconPickerStyle> = {
  // Original 10
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
  // Extended
  heart:     { tint: "bg-[#FFE4E6] dark:bg-[#F43F5E]/15", text: "text-[#F43F5E] dark:text-[#FFE4E6]", solid: "bg-[#F43F5E] text-white" },
  music:     { tint: "bg-[#CCFBF1] dark:bg-[#0D9488]/15", text: "text-[#0D9488] dark:text-[#CCFBF1]", solid: "bg-[#0D9488] text-white" },
  palette:   { tint: "bg-[#FEF3C7] dark:bg-[#D97706]/15", text: "text-[#D97706] dark:text-[#FEF3C7]", solid: "bg-[#D97706] text-white" },
  plane:     { tint: "bg-[#E0F2FE] dark:bg-[#0284C7]/15", text: "text-[#0284C7] dark:text-[#E0F2FE]", solid: "bg-[#0284C7] text-white" },
  chefhat:   { tint: "bg-[#FFEDD5] dark:bg-[#C2410C]/15", text: "text-[#C2410C] dark:text-[#FFEDD5]", solid: "bg-[#C2410C] text-white" },
  coin:      { tint: "bg-[#FEF9C3] dark:bg-[#B45309]/15", text: "text-[#B45309] dark:text-[#FEF9C3]", solid: "bg-[#B45309] text-white" },
  camera:    { tint: "bg-[#EDE9FE] dark:bg-[#4338CA]/15", text: "text-[#4338CA] dark:text-[#EDE9FE]", solid: "bg-[#4338CA] text-white" },
  users:     { tint: "bg-[#F3E8FF] dark:bg-[#9333EA]/15", text: "text-[#9333EA] dark:text-[#F3E8FF]", solid: "bg-[#9333EA] text-white" },
  leaf:      { tint: "bg-[#DCFCE7] dark:bg-[#15803D]/15", text: "text-[#15803D] dark:text-[#DCFCE7]", solid: "bg-[#15803D] text-white" },
  pencil:    { tint: "bg-[#CFFAFE] dark:bg-[#0891B2]/15", text: "text-[#0891B2] dark:text-[#CFFAFE]", solid: "bg-[#0891B2] text-white" },
  yoga:      { tint: "bg-[#FDF2F8] dark:bg-[#BE185D]/15", text: "text-[#BE185D] dark:text-[#FDF2F8]", solid: "bg-[#BE185D] text-white" },
  bike:      { tint: "bg-[#ECFCCB] dark:bg-[#65A30D]/15", text: "text-[#65A30D] dark:text-[#ECFCCB]", solid: "bg-[#65A30D] text-white" },
  mountain:  { tint: "bg-[#FEF3C7] dark:bg-[#92400E]/15", text: "text-[#92400E] dark:text-[#FEF3C7]", solid: "bg-[#92400E] text-white" },
  droplet:   { tint: "bg-[#DBEAFE] dark:bg-[#1D4ED8]/15", text: "text-[#1D4ED8] dark:text-[#DBEAFE]", solid: "bg-[#1D4ED8] text-white" },
  moodsmile: { tint: "bg-[#FEF9C3] dark:bg-[#A16207]/15", text: "text-[#A16207] dark:text-[#FEF9C3]", solid: "bg-[#A16207] text-white" },
  flame:     { tint: "bg-[#FFF7ED] dark:bg-[#EA580C]/15", text: "text-[#EA580C] dark:text-[#FFF7ED]", solid: "bg-[#EA580C] text-white" },
  language:  { tint: "bg-[#EDE9FE] dark:bg-[#6D28D9]/15", text: "text-[#6D28D9] dark:text-[#EDE9FE]", solid: "bg-[#6D28D9] text-white" },
  pill:      { tint: "bg-[#F0FDF4] dark:bg-[#166534]/15", text: "text-[#166534] dark:text-[#F0FDF4]", solid: "bg-[#166534] text-white" },
  bolt:      { tint: "bg-[#FFFBEB] dark:bg-[#D97706]/15", text: "text-[#D97706] dark:text-[#FFFBEB]", solid: "bg-[#D97706] text-white" },
  dna:       { tint: "bg-[#FDF4FF] dark:bg-[#A21CAF]/15", text: "text-[#A21CAF] dark:text-[#FDF4FF]", solid: "bg-[#A21CAF] text-white" },
};

const FALLBACK_PICKER_STYLE: IconPickerStyle = ICON_PICKER_STYLES.briefcase;

export function getIconPickerStyle(name: string): IconPickerStyle {
  return ICON_PICKER_STYLES[name] ?? FALLBACK_PICKER_STYLE;
}
