/**
 * Example plan templates — ready-made plans with tasks and milestones
 * that users can apply in one tap to get started quickly.
 */

import type { Plan, Task, Milestone, Schedule, DayKey, PlanCategory } from "./useScheduleDB";
import type { AccentColor } from "./colorSystem";
import { colorFromIcon } from "./colorSystem";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { recalculateRoadmapTimeline } from "@/lib/roadmapDates";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TemplateTask {
  title: string;
  description?: string;
  startTime: string; // "09:00 AM"
  endTime: string;
  days: DayKey[];
}

export interface TemplateMilestone {
  title: string;
  offsetDays: number; // days from today
}

export interface Template {
  id: string;
  title: string;
  description: string;
  emoji: string;
  category: PlanCategory;
  color: AccentColor;
  durationDays: number;
  tasks: TemplateTask[];
  subtasks: Array<{ title: string; duration?: string }>;
  milestones: TemplateMilestone[];
}

// ── Tiny uid ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function addDays(base: Date, n: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

const ALL_DAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

// ── Template definitions ──────────────────────────────────────────────────────

export const TEMPLATES: Template[] = [
  {
    id: "morning-fitness",
    title: "Morning Fitness",
    description: "Build a consistent workout habit with daily morning sessions and progressive milestones.",
    emoji: "barbell",
    category: "fitness",
    color: "pink",
    durationDays: 90,
    tasks: [
      {
        title: "Morning Workout",
        description: "Full-body strength & cardio session",
        startTime: "06:00 AM",
        endTime: "07:00 AM",
        days: ALL_DAYS,
      },
      {
        title: "Cool-down Stretch",
        startTime: "07:00 AM",
        endTime: "07:15 AM",
        days: ALL_DAYS,
      },
    ],
    subtasks: [
      { title: "Push-ups — 3 sets", duration: "5m" },
      { title: "Pull-ups — 3 sets", duration: "5m" },
      { title: "Squats — 3 sets", duration: "5m" },
      { title: "Plank hold", duration: "2m" },
    ],
    milestones: [
      { title: "First week complete", offsetDays: 7 },
      { title: "30-day streak", offsetDays: 30 },
      { title: "Halfway mark — 45 days", offsetDays: 45 },
      { title: "90-day program complete 🏆", offsetDays: 90 },
    ],
  },
  {
    id: "study-plan",
    title: "Study Plan",
    description: "Structured daily study sessions with review cycles to retain what you learn.",
    emoji: "book",
    category: "learning",
    color: "blue",
    durationDays: 60,
    tasks: [
      {
        title: "Deep Study Session",
        description: "Focused, distraction-free study block",
        startTime: "09:00 AM",
        endTime: "11:00 AM",
        days: WEEKDAYS,
      },
      {
        title: "Evening Review",
        description: "Consolidate and summarise the day's material",
        startTime: "08:00 PM",
        endTime: "08:30 PM",
        days: WEEKDAYS,
      },
    ],
    subtasks: [
      { title: "Read chapter", duration: "40m" },
      { title: "Solve exercises", duration: "30m" },
      { title: "Write summary notes", duration: "10m" },
    ],
    milestones: [
      { title: "First week done", offsetDays: 7 },
      { title: "First module complete", offsetDays: 21 },
      { title: "Halfway through", offsetDays: 30 },
      { title: "Study plan complete 🎓", offsetDays: 60 },
    ],
  },
  {
    id: "coding-project",
    title: "Coding Project",
    description: "Ship a project in 30 days with focused deep work blocks and daily review.",
    emoji: "code",
    category: "work",
    color: "violet",
    durationDays: 30,
    tasks: [
      {
        title: "Deep Work Block",
        description: "No meetings, no distractions — just shipping",
        startTime: "09:00 AM",
        endTime: "12:00 PM",
        days: WEEKDAYS,
      },
      {
        title: "Code Review & Planning",
        description: "Review progress, plan tomorrow",
        startTime: "04:00 PM",
        endTime: "05:00 PM",
        days: WEEKDAYS,
      },
    ],
    subtasks: [
      { title: "Build new features", duration: "90m" },
      { title: "Fix bugs", duration: "30m" },
      { title: "Write tests", duration: "20m" },
      { title: "Update docs", duration: "10m" },
    ],
    milestones: [
      { title: "Project setup done", offsetDays: 3 },
      { title: "Core features complete", offsetDays: 14 },
      { title: "Beta ready", offsetDays: 21 },
      { title: "Launch 🚀", offsetDays: 30 },
    ],
  },
  {
    id: "daily-wellness",
    title: "Daily Wellness",
    description: "Start and end each day with intention — meditation, movement and journaling.",
    emoji: "star",
    category: "health",
    color: "amber",
    durationDays: 30,
    tasks: [
      {
        title: "Morning Meditation",
        description: "Breathing, gratitude, intention setting",
        startTime: "07:00 AM",
        endTime: "07:20 AM",
        days: ALL_DAYS,
      },
      {
        title: "Evening Walk",
        startTime: "06:30 PM",
        endTime: "07:00 PM",
        days: ALL_DAYS,
      },
    ],
    subtasks: [
      { title: "Breathing exercises", duration: "5m" },
      { title: "Gratitude journaling", duration: "5m" },
      { title: "Mindfulness check-in", duration: "5m" },
      { title: "Intention for the day", duration: "5m" },
    ],
    milestones: [
      { title: "7-day streak 🔥", offsetDays: 7 },
      { title: "21-day habit locked in", offsetDays: 21 },
      { title: "30-day wellness complete ✨", offsetDays: 30 },
    ],
  },
  {
    id: "run-training",
    title: "Run Training",
    description: "Progressive running plan to build endurance from couch to consistent runner.",
    emoji: "run",
    category: "fitness",
    color: "amber",
    durationDays: 60,
    tasks: [
      {
        title: "Morning Run",
        description: "Easy pace — focus on consistency not speed",
        startTime: "06:30 AM",
        endTime: "07:15 AM",
        days: ["monday", "wednesday", "friday", "sunday"],
      },
      {
        title: "Recovery Walk",
        startTime: "07:00 PM",
        endTime: "07:30 PM",
        days: ["tuesday", "thursday", "saturday"],
      },
    ],
    subtasks: [
      { title: "Warm-up walk", duration: "5m" },
      { title: "Run interval", duration: "30m" },
      { title: "Cool-down walk", duration: "5m" },
      { title: "Stretching", duration: "5m" },
    ],
    milestones: [
      { title: "First 5K run completed", offsetDays: 14 },
      { title: "Running 3× a week consistently", offsetDays: 21 },
      { title: "10K without stopping", offsetDays: 45 },
      { title: "60-day program complete 🏅", offsetDays: 60 },
    ],
  },
  {
    id: "work-routine",
    title: "Work Routine",
    description: "Structure your workday to maximise focus and end each day with clear progress.",
    emoji: "briefcase",
    category: "work",
    color: "cyan",
    durationDays: 30,
    tasks: [
      {
        title: "Morning Planning",
        description: "Set top 3 priorities for the day",
        startTime: "09:00 AM",
        endTime: "09:30 AM",
        days: WEEKDAYS,
      },
      {
        title: "Focus Work",
        startTime: "09:30 AM",
        endTime: "12:00 PM",
        days: WEEKDAYS,
      },
      {
        title: "End-of-day Review",
        description: "What got done, what moves to tomorrow",
        startTime: "05:30 PM",
        endTime: "06:00 PM",
        days: WEEKDAYS,
      },
    ],
    subtasks: [
      { title: "Top priority task", duration: "90m" },
      { title: "Emails & messages", duration: "20m" },
      { title: "Team standup", duration: "15m" },
    ],
    milestones: [
      { title: "First week of structured days", offsetDays: 7 },
      { title: "2-week habit forming", offsetDays: 14 },
      { title: "Productive month complete", offsetDays: 30 },
    ],
  },
];

// ── Apply template ────────────────────────────────────────────────────────────

/**
 * Returns a Schedule updater that inserts a plan, its tasks (across the
 * specified days), and milestones from the given template.
 */
export function applyTemplate(template: Template): (prev: Schedule) => Schedule {
  const today = new Date();
  const todayISO = today.toISOString().split("T")[0];
  const planId = uid();

  const planItems: ScheduleEntry[] = template.subtasks.map((s) => ({
    id: uid(),
    task: s.title,
    duration: s.duration,
  }));

  const plan: Plan = {
    id: planId,
    title: template.title,
    description: template.description,
    startDate: todayISO,
    endDate: addDays(today, template.durationDays),
    category: template.category,
    emoji: template.emoji,
    color: colorFromIcon(template.emoji),
    items: planItems,
  };

  const milestones: Milestone[] = recalculateRoadmapTimeline(
    template.milestones.map((m, i) => {
      const previousOffset = i === 0 ? 0 : template.milestones[i - 1].offsetDays;
      const plannedDurationDays = Math.max(1, m.offsetDays - previousOffset);
      const now = new Date().toISOString();
      return {
        id: uid(),
        planId,
        title: m.title,
        startDate: todayISO,
        plannedDurationDays,
        plannedEndDate: todayISO,
        status: "upcoming",
        linkedActivities: [],
        linkedTrackers: [],
        createdAt: now,
        updatedAt: now,
        completionStatus: "pending",
        sortOrder: i,
      };
    }),
    todayISO
  );

  // Build tasks — each TemplateTask becomes one Task per specified day
  // (same structure as createTask in taskMutations, but inlined here to avoid
  // circular deps and to handle multi-task templates cleanly).
  const taskEntries: Array<{ day: DayKey; task: Task }> = [];
  for (const tpl of template.tasks) {
    const taskId = uid();
    for (const day of tpl.days) {
      taskEntries.push({
        day,
        task: {
          id: taskId,
          title: tpl.title,
          description: tpl.description,
          startTime: tpl.startTime,
          endTime: tpl.endTime,
          icon: template.emoji,
          color: colorFromIcon(template.emoji),
          planId,
        },
      });
    }
  }

  return (prev) => {
    const activities = { ...prev.activities };
    for (const { day, task } of taskEntries) {
      activities[day] = [...(activities[day] ?? []), task];
    }
    return {
      ...prev,
      plans: [...prev.plans, plan],
      activities,
      milestones: [...prev.milestones, ...milestones],
    };
  };
}
