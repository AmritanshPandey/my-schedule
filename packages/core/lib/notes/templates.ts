/**
 * Note templates — pure data, shared by web and native. `iconName` is a Tabler
 * icon name; lib/notes/templates.ts (web) and apps/native resolve it to their
 * own icon components.
 */
export type NoteTemplateIconName =
  | "note"
  | "calendar-event"
  | "repeat"
  | "salad"
  | "activity"
  | "target-arrow"
  | "moon"
  | "brain";

export interface NoteTemplate {
  id: string;
  label: string;
  description: string;
  /** Tabler icon name — each app resolves it against its own icon package. */
  iconName: NoteTemplateIconName;
  title?: string;
  tags?: string[];
  /** Seed markdown body. Empty for the blank note. */
  body: string;
}

export const NOTE_TEMPLATE_DEFS: NoteTemplate[] = [
  {
    id: "blank",
    label: "Blank note",
    description: "Start from scratch",
    iconName: "note",
    body: "",
  },
  {
    id: "daily-capture",
    label: "Daily capture",
    description: "Priorities, captures, decisions, and follow-ups",
    iconName: "calendar-event",
    title: "Daily Capture",
    tags: ["daily"],
    body: [
      "### Priorities",
      "- [ ] ",
      "",
      "### Captures",
      "- ",
      "",
      "### Decisions",
      "- ",
      "",
      "### Follow-ups",
      "- [ ] ",
    ].join("\n"),
  },
  {
    id: "habit-system",
    label: "Habit system",
    description: "Cue, routine, reward, and weekly tracking",
    iconName: "repeat",
    title: "Habit System",
    tags: ["habits", "system"],
    body: [
      "**Identity:** I am the kind of person who ",
      "**Keystone habit:** ",
      "",
      "### Habit loop",
      "| Habit | Cue | Routine | Reward | Friction to remove |",
      "| --- | --- | --- | --- | --- |",
      "|  |  |  |  |  |",
      "|  |  |  |  |  |",
      "",
      "### Weekly tracker",
      "| Habit | Mon | Tue | Wed | Thu | Fri | Sat | Sun |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "|  |  |  |  |  |  |  |  |",
      "|  |  |  |  |  |  |  |  |",
      "",
      "### Make it obvious",
      "- [ ] ",
      "### Make it easy",
      "- [ ] ",
      "### Make it satisfying",
      "- [ ] ",
    ].join("\n"),
  },
  {
    id: "diet-plan",
    label: "Diet plan",
    description: "Meals, calories, macros, and prep",
    iconName: "salad",
    title: "Diet Plan",
    tags: ["diet", "health"],
    body: [
      "**Goal:** ",
      "**Daily calories:** ",
      "**Protein target:** ",
      "",
      "### Meal plan",
      "| Meal | Food | Calories | Protein | Prep notes |",
      "| --- | --- | --- | --- | --- |",
      "| Breakfast |  |  |  |  |",
      "| Lunch |  |  |  |  |",
      "| Snack |  |  |  |  |",
      "| Dinner |  |  |  |  |",
      "",
      "### Grocery list",
      "- [ ] ",
      "- [ ] ",
      "- [ ] ",
      "",
      "### Rules that make this easy",
      "- ",
    ].join("\n"),
  },
  {
    id: "daily-operating-system",
    label: "Daily OS",
    description: "Plan the day around energy and habits",
    iconName: "activity",
    title: "Daily OS",
    tags: ["daily", "habits"],
    body: [
      "### Non-negotiables",
      "- [ ] Move",
      "- [ ] Eat to plan",
      "- [ ] Deep work",
      "- [ ] Sleep routine",
      "",
      "### Energy map",
      "| Time | Energy | Best use | Notes |",
      "| --- | --- | --- | --- |",
      "| Morning |  |  |  |",
      "| Afternoon |  |  |  |",
      "| Evening |  |  |  |",
      "",
      "### Today I will make progress by",
      "- ",
    ].join("\n"),
  },
  {
    id: "goal-breakdown",
    label: "Goal breakdown",
    description: "Turn a goal into systems and milestones",
    iconName: "target-arrow",
    title: "Goal Breakdown",
    tags: ["goals", "system"],
    body: [
      "**Goal:** ",
      "**Why it matters:** ",
      "**Deadline:** ",
      "",
      "### System design",
      "| Outcome | Daily input | Weekly review metric | Current blocker |",
      "| --- | --- | --- | --- |",
      "|  |  |  |  |",
      "",
      "### Milestones",
      "| Milestone | Date | Done when |",
      "| --- | --- | --- |",
      "|  |  |  |",
      "|  |  |  |",
      "",
      "### Next actions",
      "- [ ] ",
      "- [ ] ",
      "- [ ] ",
    ].join("\n"),
  },
  {
    id: "sleep-recovery",
    label: "Sleep and recovery",
    description: "Track sleep quality, routines, and recovery",
    iconName: "moon",
    title: "Sleep and Recovery",
    tags: ["sleep", "recovery"],
    body: [
      "**Target bedtime:** ",
      "**Wake time:** ",
      "",
      "### Wind-down routine",
      "- [ ] Screens off",
      "- [ ] Prepare tomorrow",
      "- [ ] Light stretch or breathwork",
      "",
      "### Recovery log",
      "| Date | Sleep hours | Quality | Training | Stress | Notes |",
      "| --- | --- | --- | --- | --- | --- |",
      "|  |  |  |  |  |  |",
      "|  |  |  |  |  |  |",
      "",
      "### What improves tomorrow",
      "- ",
    ].join("\n"),
  },
  {
    id: "mindset-reset",
    label: "Mindset reset",
    description: "Clear friction and choose the next response",
    iconName: "brain",
    title: "Mindset Reset",
    tags: ["mindset", "reflection"],
    body: [
      "### What happened",
      "- ",
      "",
      "### Pattern check",
      "| Trigger | Thought | Feeling | Default action | Better response |",
      "| --- | --- | --- | --- | --- |",
      "|  |  |  |  |  |",
      "",
      "### Next small action",
      "- [ ] ",
    ].join("\n"),
  },
];
