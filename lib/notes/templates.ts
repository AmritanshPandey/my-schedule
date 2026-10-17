import type { ComponentType } from "react";
import {
  IconActivity,
  IconBrain,
  IconCalendarEvent,
  IconMoon,
  IconNote,
  IconRepeat,
  IconSalad,
  IconTargetArrow,
  type IconProps,
} from "@tabler/icons-react";
import { NOTE_TEMPLATE_DEFS, type NoteTemplate as NoteTemplateDef, type NoteTemplateIconName } from "@planr/core/lib/notes/templates";

export * from "@planr/core/lib/notes/templates";

const ICONS: Record<NoteTemplateIconName, ComponentType<IconProps>> = {
  note: IconNote,
  "calendar-event": IconCalendarEvent,
  repeat: IconRepeat,
  salad: IconSalad,
  activity: IconActivity,
  "target-arrow": IconTargetArrow,
  moon: IconMoon,
  brain: IconBrain,
};

/** The shared template data with the web's icon component attached. */
export type NoteTemplate = NoteTemplateDef & { icon: ComponentType<IconProps> };

export const NOTE_TEMPLATES: NoteTemplate[] = NOTE_TEMPLATE_DEFS.map((t) => ({ ...t, icon: ICONS[t.iconName] }));
