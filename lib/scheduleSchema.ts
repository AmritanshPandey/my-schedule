import { z } from "zod";
import type { Schedule } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/scheduleConstants";

const isoDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Expected a real calendar date");
const isoDateTime = z.string().datetime({ offset: true });
const nonEmptyId = z.string().min(1);
const accentColor = z.enum([
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan",
  "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]);
const dayKey = z.enum(DAYS as [string, ...string[]]);

const metaField = z.object({ label: z.string(), value: z.string() }).passthrough();
const scheduleEntry = z.object({
  id: nonEmptyId,
  task: z.string(),
  time: z.string().optional(),
  info: z.string().optional(),
  note: z.string().optional(),
  meta: z.array(metaField).optional(),
  date: isoDate.optional(),
  duration: z.string().optional(),
  timeMinutes: z.number().finite().nonnegative().optional(),
  notes: z.string().optional(),
  deadline: isoDate.optional(),
  deadlineScope: z.enum(["day", "week", "month"]).optional(),
}).passthrough();

const taskSlot = z.object({ startTime: z.string(), endTime: z.string() }).passthrough();
const taskException = z.object({
  skipped: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  // Additive per-date note; see TaskException.note in lib/useScheduleDB.ts for
  // why it is not the same field as `description`.
  note: z.string().optional(),
}).passthrough();
const recurrence = z.discriminatedUnion("type", [
  z.object({ type: z.literal("weekly"), interval: z.number().int().positive(), anchorISO: isoDate }).passthrough(),
  z.object({ type: z.literal("once"), dateISO: isoDate }).passthrough(),
]);
const completionEvent = z.object({
  id: nonEmptyId,
  taskId: nonEmptyId,
  completedAt: isoDateTime,
  completionType: z.enum(["task", "subtask", "missed", "slot"]),
  subtaskId: z.string().optional(),
  slotIndex: z.number().int().nonnegative().optional(),
}).passthrough();

export const TaskSchema = z.object({
  id: nonEmptyId,
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  planId: z.string(),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  slots: z.array(taskSlot).min(1).optional(),
  completed: z.boolean().optional(),
  completedAt: isoDateTime.optional(),
  completedSubtaskIds: z.array(z.string()).optional(),
  completedSlotIndices: z.array(z.number().int().nonnegative()).optional(),
  missed: z.boolean().optional(),
  missedAt: isoDateTime.optional(),
  completionHistory: z.array(completionEvent).optional(),
  streakEnabled: z.boolean().optional(),
  sortOrder: z.number().finite().optional(),
  subtasks: z.array(scheduleEntry).optional(),
  stepBufferMinutes: z.number().finite().positive().max(60).optional(),
  taskType: z.enum(["task", "session", "commitment"]).optional(),
  exceptions: z.record(z.string(), taskException).optional(),
  recurrence: recurrence.optional(),
  activeFrom: isoDate.optional(),
  activeUntil: isoDate.optional(),
}).passthrough();

const planMetricGoal = z.object({
  id: nonEmptyId,
  metric: z.string(),
  target: z.number().finite(),
  direction: z.enum(["below", "above"]),
  unit: z.string(),
  startDate: isoDate,
  deadline: isoDate.optional(),
}).passthrough();

export const PlanSchema = z.object({
  id: nonEmptyId,
  title: z.string(),
  description: z.string().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  category: z.enum(["fitness", "learning", "work", "health", "routine"]),
  emoji: z.string(),
  color: accentColor,
  items: z.array(scheduleEntry),
  metaFields: z.array(z.string()).optional(),
  summary: z.array(z.object({ label: z.string(), metaKey: z.string(), unit: z.string(), colorClass: z.string().optional() }).passthrough()).optional(),
  goals: z.array(planMetricGoal).optional(),
  metric: z.object({ name: z.string(), unit: z.string() }).optional(),
  coachMessages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    type: z.literal("confirmation").optional(),
    suggestedMilestones: z.array(z.object({ title: z.string(), description: z.string(), targetDate: isoDate.optional() }).passthrough()).optional(),
  }).passthrough()).optional(),
  // Optional link to a first-class Goal (Schedule.goals). Absent on every
  // existing Plan — never required.
  goalId: z.string().optional(),
}).passthrough();

export const GoalStatusSchema = z.enum(["active", "completed", "paused", "archived"]);

export const GoalSchema = z.object({
  id: nonEmptyId,
  title: z.string(),
  description: z.string().optional(),
  status: GoalStatusSchema,
  startDate: isoDate.optional(),
  targetDate: isoDate.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  schemaVersion: z.number().finite().nonnegative(),
}).passthrough();

export const ScheduleEventSchema = z.object({
  id: nonEmptyId,
  type: z.enum([
    "GOAL_CREATED", "GOAL_UPDATED", "GOAL_COMPLETED", "GOAL_ARCHIVED", "GOAL_DELETED",
    "AI_PROPOSAL_CREATED", "AI_PROPOSAL_ACCEPTED", "AI_PROPOSAL_REJECTED", "AI_PROPOSAL_FAILED",
  ]),
  entityId: nonEmptyId,
  timestamp: isoDateTime,
  data: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const ProgressTrackerSchema = z.object({
  id: nonEmptyId,
  planId: nonEmptyId,
  title: z.string(),
  type: z.literal("number"),
  unit: z.string().optional(),
  goalDirection: z.enum(["increase_good", "decrease_good"]).optional(),
  goalValue: z.number().finite().optional(),
  startingValue: z.number().finite().optional(),
  dailyTarget: z.number().finite().optional(),
}).passthrough();

export const MetricEntrySchema = z.object({
  id: nonEmptyId,
  planId: nonEmptyId,
  trackerId: nonEmptyId,
  value: z.number().finite(),
  date: isoDate,
}).passthrough();

export const MilestoneSchema = z.object({
  id: nonEmptyId,
  planId: nonEmptyId,
  title: z.string(),
  description: z.string().optional(),
  startDate: isoDate,
  plannedDurationDays: z.number().int().positive(),
  plannedEndDate: isoDate,
  actualCompletedDate: isoDate.optional(),
  status: z.enum(["upcoming", "active", "completed", "delayed"]),
  linkedActivities: z.array(nonEmptyId),
  linkedTrackers: z.array(nonEmptyId),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  targetDate: isoDate.optional(),
  estimatedDays: z.number().int().positive().optional(),
  linkedTrackerId: nonEmptyId.optional(),
  completionStatus: z.enum(["pending", "completed"]).optional(),
  completedDate: isoDate.optional(),
  notes: z.string().optional(),
  sortOrder: z.number().finite(),
}).passthrough();

const ritualTrackingType = z.enum(["checkbox", "quantity", "duration", "count", "checklist", "times"]);
const ritualStep = z.object({ id: nonEmptyId, label: z.string() }).passthrough();
const ritualRecurrence = z.object({
  kind: z.enum(["daily", "weekdays", "weekends", "custom", "interval"]),
  days: z.array(dayKey).optional(),
  intervalDays: z.number().finite().int().min(2).optional(),
  anchorDate: isoDate.optional(),
}).passthrough();

export const RitualSchema = z.object({
  id: nonEmptyId,
  title: z.string(),
  time: z.string(),
  duration: z.number().finite().nonnegative().optional(),
  repeatDays: z.array(dayKey).optional(),
  color: z.enum(["rose", "sky", "violet", "amber", "emerald", "fuchsia", "orange", "cyan", "indigo", "teal"]).optional(),
  notes: z.string().optional(),
  sortOrder: z.number().finite().optional(),
  trackingType: ritualTrackingType.optional(),
  target: z.number().finite().optional(),
  unit: z.string().optional(),
  quickAmounts: z.array(z.number().finite()).optional(),
  steps: z.array(ritualStep).optional(),
  recurrence: ritualRecurrence.optional(),
  anyTime: z.boolean().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
}).passthrough();

export const RitualCompletionSchema = z.object({
  ritualId: nonEmptyId,
  date: isoDate,
  id: nonEmptyId.optional(),
  timestamp: isoDateTime.optional(),
  value: z.number().finite().optional(),
  stepId: nonEmptyId.optional(),
  note: z.string().optional(),
}).passthrough();

export const NoteSchema = z.object({
  id: nonEmptyId,
  title: z.string(),
  body: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  pinned: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  linkedTaskIds: z.array(nonEmptyId).optional(),
  linkedPlanIds: z.array(nonEmptyId).optional(),
}).passthrough();

const preferences = z.object({
  dayStartTime: z.string().optional(),
  dayEndMinutes: z.number().int().finite().optional(),
  dayEndAuto: z.boolean().optional(),
  startDate: isoDate.optional(),
  lastRolloverISO: isoDate.optional(),
  acknowledgedMisses: z.array(z.string()).optional(),
  sleepHours: z.number().finite().optional(),
}).passthrough();

export const ScheduleSchema = z.object({
  goals: z.array(GoalSchema),
  plans: z.array(PlanSchema),
  categories: z.array(z.object({ id: nonEmptyId, title: z.string(), icon: z.string(), color: accentColor, sortOrder: z.number().finite().optional(), kind: z.enum(["active", "rest", "sleep"]).optional() }).passthrough()),
  activities: z.object(Object.fromEntries(DAYS.map((day) => [day, z.array(TaskSchema)])) as Record<string, z.ZodType>).passthrough(),
  progressTrackers: z.array(ProgressTrackerSchema),
  metricEntries: z.array(MetricEntrySchema),
  milestones: z.array(MilestoneSchema),
  rituals: z.array(RitualSchema),
  ritualCompletions: z.array(RitualCompletionSchema),
  notes: z.array(NoteSchema),
  events: z.array(ScheduleEventSchema),
  preferences,
  // Per-entity change/deletion bookkeeping for the cloud merge (see
  // lib/stampSchedule.ts). Values are epoch seconds. Declared rather than left
  // to passthrough so a malformed map is rejected here instead of confusing
  // the merge.
  syncMeta: z.object({
    updated: z.record(z.string(), z.number().finite()).optional(),
    deleted: z.record(z.string(), z.number().finite()).optional(),
  }).passthrough().optional(),
}).passthrough();

export function validateSchedule(value: unknown): { success: true; data: Schedule } | { success: false; error: z.ZodError } {
  const result = ScheduleSchema.safeParse(value);
  return result.success
    ? { success: true, data: result.data as unknown as Schedule }
    : { success: false, error: result.error };
}

export function schedulePayloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
