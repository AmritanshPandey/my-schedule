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
  icon: ComponentType<{ size?: number; className?: string }>;
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
