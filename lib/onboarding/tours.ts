import type { CoachMarkStep } from "@/components/onboarding/CoachMarks";

/**
 * Central registry of every guided-tour id in the app — the single source of
 * truth Settings' "Replay guided tours" reads to reset all of them at once.
 * Kept deliberately short per page (2 steps): the job is fast orientation on
 * the one action that matters, not an exhaustive feature walkthrough.
 *
 * Overview isn't here — it already has its own dedicated "Getting started"
 * checklist card, and a second onboarding moment on the same page would be
 * ceremony, not help. Settings isn't here either — its rows are already
 * labeled plainly; a tour would explain the obvious.
 */
export const TOUR_IDS = ["today", "plans", "routine", "tracking"] as const;

export type TourId = (typeof TOUR_IDS)[number];

export const TOUR_STEPS: Record<TourId, CoachMarkStep[]> = {
  today: [
    {
      target: "today-timeline",
      title: "Your day, block by block",
      body: "Every task and commitment for today lands here in order. Tap a block to see the details or mark it done.",
    },
    {
      target: "new-item-button",
      title: "Add anything, anytime",
      body: "Create a task, plan, or habit from here — wherever you are in the app.",
    },
  ],
  plans: [
    {
      target: "plans-list",
      title: "Plans hold the structure",
      body: "Group related tasks, milestones, and trackers under one goal, so progress stays visible.",
    },
    {
      target: "new-item-button",
      title: "Start a new plan",
      body: "Build one from scratch, or describe a goal and let AI draft the tasks and milestones.",
    },
  ],
  routine: [
    {
      target: "routine-view",
      title: "Habits you repeat",
      body: "Routine is for the small things you do on a schedule — track them daily and watch the streak build.",
    },
    {
      target: "new-item-button",
      title: "Add a habit",
      body: "Set how often it repeats, and it'll show up right where it belongs.",
    },
  ],
  // Only one step: Tracking has no create action of its own — a tracker is made
  // on its plan — so there is no "new-item-button" to point at here.
  tracking: [
    {
      target: "tracking-view",
      title: "Log it the moment it happens",
      body: "Every metric you track, grouped by plan. Tap an amount to log it — the ring fills toward today's target.",
    },
  ],
};
