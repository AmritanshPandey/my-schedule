import {
  IconNote,
  IconUsers,
  IconSun,
  IconChecklist,
  IconBulb,
  type IconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export interface NoteTemplate {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
  /** Seed markdown body. Empty for the blank note. */
  body: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    label: "Blank note",
    description: "Start from scratch",
    icon: IconNote,
    body: "",
  },
  {
    id: "meeting",
    label: "Meeting",
    description: "Attendees, agenda, action items",
    icon: IconUsers,
    body: [
      "## Meeting",
      "",
      "**Attendees:** ",
      "**Date:** ",
      "",
      "### Agenda",
      "- ",
      "",
      "### Notes",
      "- ",
      "",
      "### Action items",
      "- [ ] ",
    ].join("\n"),
  },
  {
    id: "daily-log",
    label: "Daily log",
    description: "Priorities, notes, and wins",
    icon: IconSun,
    body: [
      "## Daily Log",
      "",
      "### Top priorities",
      "- [ ] ",
      "- [ ] ",
      "- [ ] ",
      "",
      "### Notes",
      "- ",
      "",
      "### Wins",
      "- ",
    ].join("\n"),
  },
  {
    id: "checklist",
    label: "Checklist",
    description: "A simple to-do list",
    icon: IconChecklist,
    body: ["## Checklist", "- [ ] ", "- [ ] ", "- [ ] "].join("\n"),
  },
  {
    id: "brain-dump",
    label: "Brain dump",
    description: "Get every thought down fast",
    icon: IconBulb,
    body: ["## Brain dump", "- "].join("\n"),
  },
];
