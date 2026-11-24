/**
 * Category-specific task fields — what a Study task asks for versus a Cooking
 * one. Pure, no React.
 *
 * A task's fields come from its category's `fieldKind`, which is suggested
 * from the category's name or icon (`inferFieldKind`) and can be changed in
 * the category sheet. The ten templates are fixed; every field is optional and
 * a blank one is simply not shown. Values live on `Task.details`, keyed by the
 * field's `key`.
 *
 * Lists (ingredients, shopping items, packing list, chores checklist,
 * exercises) are the task's checklist (subtasks), renamed per kind
 * (`listLabel`), with per-item `quantity` / `cost` where the kind uses them.
 *
 * Two fields act beyond display:
 *  - durations (`role: "duration"`) set the task's time block in the form
 *    (`detailsDurationMinutes`);
 *  - a Finance task's amount logs to a chosen tracker on each day it's
 *    completed (`reconcileFinanceEntries`).
 */
import type { MetricEntry, Schedule, Task, TaskCategory, TaskDetails, TaskFieldKind } from "./scheduleTypes";
import { DAYS } from "./scheduleConstants";
import { localISODate } from "./dateUtils";

export type TaskFieldType = "text" | "longtext" | "number" | "minutes" | "date" | "select" | "money" | "percent" | "tracker";

export interface TaskFieldDef {
  key: string;
  label: string;
  type: TaskFieldType;
  placeholder?: string;
  options?: readonly string[];
  /** Part of the task's planned length: the form sums these into the end time. */
  role?: "duration";
}

export interface TaskFieldTemplate {
  kind: TaskFieldKind;
  label: string;
  /** What the checklist is called for this kind. */
  listLabel: string;
  /** One entry of it, for "Add ingredient". */
  itemLabel: string;
  /** Extra per-item figures the checklist shows. */
  itemFields: ReadonlyArray<"quantity" | "cost">;
  fields: readonly TaskFieldDef[];
}

export const TASK_FIELD_TEMPLATES: Record<TaskFieldKind, TaskFieldTemplate> = {
  fitness: {
    kind: "fitness",
    label: "Fitness",
    listLabel: "Exercises",
    itemLabel: "exercise",
    itemFields: [],
    fields: [{ key: "duration", label: "Duration", type: "minutes", role: "duration" }],
  },
  study: {
    kind: "study",
    label: "Study",
    listLabel: "Checklist",
    itemLabel: "item",
    itemFields: [],
    fields: [
      { key: "subject", label: "Subject", type: "text", placeholder: "Physics" },
      { key: "topic", label: "Topic", type: "text", placeholder: "Thermodynamics" },
      { key: "resources", label: "Resources", type: "longtext", placeholder: "Chapter 4, lecture notes" },
      { key: "studyMinutes", label: "Study duration", type: "minutes", role: "duration" },
      { key: "difficulty", label: "Difficulty", type: "select", options: ["Easy", "Medium", "Hard"] },
    ],
  },
  work: {
    kind: "work",
    label: "Work",
    listLabel: "Checklist",
    itemLabel: "item",
    itemFields: [],
    fields: [
      { key: "project", label: "Project", type: "text" },
      { key: "deliverable", label: "Deliverable", type: "text" },
      { key: "stakeholders", label: "Stakeholders", type: "text", placeholder: "Priya, design team" },
      { key: "meeting", label: "Meeting", type: "text", placeholder: "Link or room" },
      { key: "deadline", label: "Deadline", type: "date" },
    ],
  },
  cooking: {
    kind: "cooking",
    label: "Cooking",
    listLabel: "Ingredients",
    itemLabel: "ingredient",
    itemFields: ["quantity"],
    fields: [
      { key: "recipe", label: "Recipe", type: "text", placeholder: "Name or link" },
      { key: "servings", label: "Servings", type: "number" },
      { key: "prepMinutes", label: "Prep time", type: "minutes", role: "duration" },
      { key: "cookMinutes", label: "Cook time", type: "minutes", role: "duration" },
    ],
  },
  chores: {
    kind: "chores",
    label: "Chores",
    listLabel: "Checklist",
    itemLabel: "item",
    itemFields: [],
    fields: [
      { key: "area", label: "Area", type: "text", placeholder: "Kitchen" },
      { key: "frequency", label: "Frequency", type: "select", options: ["Daily", "Weekly", "Monthly"] },
      { key: "estimatedMinutes", label: "Estimated duration", type: "minutes", role: "duration" },
    ],
  },
  finance: {
    kind: "finance",
    label: "Finance",
    listLabel: "Checklist",
    itemLabel: "item",
    itemFields: [],
    fields: [
      { key: "amount", label: "Amount", type: "money" },
      { key: "account", label: "Account", type: "text" },
      { key: "transactionType", label: "Transaction type", type: "select", options: ["Expense", "Income", "Transfer", "Saving"] },
      { key: "recurrence", label: "Recurrence", type: "select", options: ["Once", "Weekly", "Monthly", "Yearly"] },
      { key: "trackerId", label: "Log amount to", type: "tracker" },
    ],
  },
  shopping: {
    kind: "shopping",
    label: "Shopping",
    listLabel: "Items",
    itemLabel: "item",
    itemFields: ["quantity", "cost"],
    fields: [
      { key: "store", label: "Store", type: "text" },
      { key: "estimatedCost", label: "Estimated cost", type: "money" },
    ],
  },
  travel: {
    kind: "travel",
    label: "Travel",
    listLabel: "Packing list",
    itemLabel: "item",
    itemFields: [],
    fields: [
      { key: "location", label: "Location", type: "text" },
      { key: "bookings", label: "Bookings", type: "longtext", placeholder: "Flight, hotel, references" },
      { key: "itinerary", label: "Itinerary", type: "longtext" },
    ],
  },
  wellness: {
    kind: "wellness",
    label: "Wellness",
    listLabel: "Checklist",
    itemLabel: "item",
    itemFields: [],
    fields: [
      { key: "activity", label: "Activity", type: "text", placeholder: "Meditation" },
      { key: "duration", label: "Duration", type: "minutes", role: "duration" },
      { key: "intensity", label: "Intensity", type: "select", options: ["Low", "Medium", "High"] },
      { key: "mood", label: "Mood", type: "select", options: ["Low", "Okay", "Good", "Great"] },
    ],
  },
  creative: {
    kind: "creative",
    label: "Creative",
    listLabel: "Checklist",
    itemLabel: "item",
    itemFields: [],
    fields: [
      { key: "medium", label: "Medium", type: "text", placeholder: "Watercolour" },
      { key: "reference", label: "Reference", type: "text", placeholder: "Link or note" },
      { key: "deliverable", label: "Deliverable", type: "text" },
      { key: "progress", label: "Progress", type: "percent" },
    ],
  },
};

export const TASK_FIELD_KINDS = Object.keys(TASK_FIELD_TEMPLATES) as TaskFieldKind[];

const KIND_BY_ICON: Record<string, TaskFieldKind> = {
  run: "fitness", barbell: "fitness", bike: "fitness", mountain: "fitness",
  school: "study", book: "study", language: "study", dna: "study",
  briefcase: "work", brain: "work", code: "work",
  chefhat: "cooking",
  coin: "finance",
  plane: "travel",
  yoga: "wellness", pill: "wellness", heart: "wellness", moodsmile: "wellness",
  palette: "creative", music: "creative", camera: "creative", pencil: "creative",
};

// Most specific first: "Grocery run" is shopping, not a run.
const KIND_BY_WORD: Array<[RegExp, TaskFieldKind]> = [
  [/shop|grocer|buy|store/i, "shopping"],
  [/cook|meal|recipe|kitchen|bake|food prep/i, "cooking"],
  [/financ|money|budget|bill|pay|invest|saving/i, "finance"],
  [/travel|trip|flight|vacation|holiday/i, "travel"],
  [/chore|clean|laundry|house|tidy|errand/i, "chores"],
  [/study|class|lecture|exam|homework|learn|course|reading|revision/i, "study"],
  [/\bwork\b|meeting|project|client|office|\bjob\b/i, "work"],
  [/wellness|meditat|yoga|mindful|therapy|self.?care|health/i, "wellness"],
  [/creative|\bart\b|draw|paint|music|writ|design|photo|craft/i, "creative"],
  [/workout|gym|run|cardio|fitness|training|lift|strength|cycl|swim|hik/i, "fitness"],
];

/** The kind a category's name or icon suggests, or null when nothing fits. */
export function inferFieldKind(category: Pick<TaskCategory, "title" | "icon">): TaskFieldKind | null {
  for (const [pattern, kind] of KIND_BY_WORD) if (pattern.test(category.title)) return kind;
  return KIND_BY_ICON[category.icon] ?? null;
}

/** The kind a category's tasks use: its own choice, else what its name suggests. "none" = no fields. */
export function categoryFieldKind(category: Pick<TaskCategory, "title" | "icon" | "fieldKind"> | null | undefined): TaskFieldKind | null {
  if (!category) return null;
  if (category.fieldKind === "none") return null;
  return category.fieldKind ?? inferFieldKind(category);
}

/** The template for a task, through its category. */
export function taskFieldTemplate(
  task: Pick<Task, "categoryId">,
  categories: readonly TaskCategory[] | undefined,
): TaskFieldTemplate | null {
  const category = task.categoryId ? (categories ?? []).find((c) => c.id === task.categoryId) : undefined;
  const kind = categoryFieldKind(category);
  return kind ? TASK_FIELD_TEMPLATES[kind] : null;
}

/** The filled-in fields of a template, in template order. */
export function filledFields(template: TaskFieldTemplate, details: TaskDetails | undefined): Array<{ def: TaskFieldDef; value: string | number }> {
  if (!details) return [];
  return template.fields.flatMap((def) => {
    const value = details[def.key];
    if (value === undefined || value === "") return [];
    return [{ def, value }];
  });
}

/** Total planned minutes from the template's duration fields, or null when none is set. */
export function detailsDurationMinutes(template: TaskFieldTemplate, details: TaskDetails | undefined): number | null {
  let total = 0;
  let any = false;
  for (const def of template.fields) {
    if (def.role !== "duration") continue;
    const value = details?.[def.key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      total += value;
      any = true;
    }
  }
  return any ? total : null;
}

/** Display text for one field value ("45m", "₹1,200" style left to the caller's locale). */
export function formatFieldValue(def: TaskFieldDef, value: string | number, trackerTitle?: (id: string) => string | undefined): string {
  if (def.type === "minutes" && typeof value === "number") {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
  }
  if (def.type === "money" && typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (def.type === "percent" && typeof value === "number") return `${Math.round(value)}%`;
  if (def.type === "date" && typeof value === "string") {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (def.type === "tracker" && typeof value === "string") return trackerTitle?.(value) ?? "Tracker";
  return String(value);
}

/** Keep only well-formed detail values: strings trimmed and non-empty, finite numbers. */
export function normalizeTaskDetails(raw: unknown): TaskDetails | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: TaskDetails = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

// ── Finance: log the amount on each completed day ────────────────────────────

export const FINANCE_ENTRY_PREFIX = "fin~";
/** Matches the cloud copy's completion-history horizon (lib/cloudSync.ts). */
const HISTORY_DAYS = 89;

function financeEntryId(taskId: string, dateISO: string): string {
  return `${FINANCE_ENTRY_PREFIX}${taskId}~${dateISO}`;
}

/**
 * Make the Finance tracker entries match the Finance tasks' completions: one
 * entry (`fin~taskId~date`) of the task's amount on its chosen tracker for each
 * day the task was completed, none for a day it was un-completed. Entries
 * already there keep their value, so changing the amount later doesn't
 * rewrite history. Returns the same schedule when nothing needs to change.
 *
 * Only recent entries of Finance tasks that still log are ever removed: the
 * cloud copy keeps 90 days of completion history, so a fresh device can't
 * tell an old completion from none, and a deleted task's spending stays
 * logged.
 */
export function reconcileFinanceEntries(schedule: Schedule, now: Date = new Date()): Schedule {
  const categories = schedule.categories ?? [];
  const trackers = new Map((schedule.progressTrackers ?? []).map((t) => [t.id, t]));
  const desired = new Map<string, MetricEntry>();
  const logging = new Set<string>();

  for (const day of DAYS) {
    for (const task of schedule.activities?.[day] ?? []) {
      const template = taskFieldTemplate(task, categories);
      if (template?.kind !== "finance") continue;
      const amount = task.details?.amount;
      const trackerId = task.details?.trackerId;
      if (typeof amount !== "number" || !Number.isFinite(amount) || typeof trackerId !== "string") continue;
      const tracker = trackers.get(trackerId);
      if (!tracker) continue;
      logging.add(task.id);
      for (const event of task.completionHistory ?? []) {
        if (event.completionType !== "task") continue;
        const dateISO = localISODate(new Date(event.completedAt));
        const id = financeEntryId(task.id, dateISO);
        if (!desired.has(id)) desired.set(id, { id, planId: tracker.planId, trackerId, value: amount, date: dateISO });
      }
    }
  }

  const entries = schedule.metricEntries ?? [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - HISTORY_DAYS);
  const cutoffISO = localISODate(cutoff);
  const kept = entries.filter((e) => {
    if (!e.id.startsWith(FINANCE_ENTRY_PREFIX) || desired.has(e.id)) return true;
    const taskId = e.id.slice(FINANCE_ENTRY_PREFIX.length).split("~")[0];
    return !logging.has(taskId) || e.date < cutoffISO;
  });
  const have = new Set(kept.map((e) => e.id));
  const added = [...desired.values()].filter((e) => !have.has(e.id));
  if (added.length === 0 && kept.length === entries.length) return schedule;
  return { ...schedule, metricEntries: [...kept, ...added] };
}

const NUMERIC_TYPES = new Set<TaskFieldType>(["number", "minutes", "money", "percent"]);

/** A task's stored details as the form's raw strings. */
export function detailsToFormValues(details: TaskDetails | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(details ?? {}).map(([key, value]) => [key, String(value)]));
}

/**
 * The form's typed strings as stored details, keeping only the template's own
 * fields (switching category drops the old kind's values) and only filled,
 * valid ones. Undefined when nothing is filled.
 */
export function formValuesToDetails(template: TaskFieldTemplate | null, values: Record<string, string>): TaskDetails | undefined {
  if (!template) return undefined;
  const out: TaskDetails = {};
  for (const def of template.fields) {
    const raw = values[def.key]?.trim();
    if (!raw) continue;
    if (NUMERIC_TYPES.has(def.type)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) out[def.key] = def.type === "percent" ? Math.min(100, n) : n;
    } else {
      out[def.key] = raw;
    }
  }
  return Object.keys(out).length ? out : undefined;
}
