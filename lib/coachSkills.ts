import type { PlanCategory } from "./useScheduleDB";

export type CoachSkill =
  | "running" | "fitness" | "diet" | "gmat_prep"
  | "study" | "work" | "health" | "habit";

export const SKILL_LABELS: Record<CoachSkill, string> = {
  running:   "Running",
  fitness:   "Fitness",
  diet:      "Nutrition",
  gmat_prep: "GMAT Prep",
  study:     "Study",
  work:      "Career",
  health:    "Health",
  habit:     "Habit Building",
};

const SKILL_PROMPTS: Record<CoachSkill, string> = {
  running: `RUNNING COACHING EXPERTISE:
You have deep knowledge of distance running training. Apply these principles:
- Periodization: base building → build → peak → taper phases for race plans
- 80/20 rule: ~80% easy aerobic effort, ~20% at threshold or faster
- Long run is the cornerstone; increase weekly mileage by no more than 10%/week
- Key workouts: tempo runs, track intervals, progression runs, recovery runs
- Common injuries: shin splints, IT band syndrome, plantar fasciitis — ask about history
Ask the user: current weekly mileage, goal race/distance, target finish time, longest recent run, injury history.`,

  fitness: `FITNESS COACHING EXPERTISE:
You have deep knowledge of strength training and body composition. Apply:
- Progressive overload drives adaptation — add volume or load each week
- Compound lifts first: squat, deadlift, bench, row, overhead press
- Common splits: full-body 3×/week, upper/lower 4×/week, PPL 6×/week
- Recovery: 48–72hr between sessions for the same muscle group
- Protein target: 0.7–1g per lb bodyweight per day
Ask the user: training background, primary goal (strength/hypertrophy/fat loss), available equipment, days per week.`,

  diet: `NUTRITION COACHING EXPERTISE:
You have deep knowledge of evidence-based nutrition. Apply:
- Caloric balance is primary: deficit to lose fat, surplus to build muscle
- Protein first: 0.7–1g/lb bodyweight preserves muscle during a deficit
- Meal timing is secondary to total daily intake — don't overcomplicate it
- Sustainable > optimal: adherence beats the perfect plan every time
- Practical tools: TDEE calculation, food tracking app, meal prep for consistency
Ask the user: current eating habits, dietary restrictions, specific goal and timeline, how much structure they want.`,

  gmat_prep: `GMAT PREP EXPERTISE:
You have deep knowledge of GMAT preparation strategy. Apply:
- Diagnose first: take a full official practice test before planning anything
- Three phases: Foundation (concepts) → Practice (question sets) → Strategy (timing, guessing)
- Quant: DS (data sufficiency) is about logical sufficiency, not calculation — learn the traps
- Verbal: CR (argument structure), RC (active reading strategy), SC (grammar + intended meaning)
- Official materials are gold standard: Official Guide, GMATPrep software, GMAT Focus Edition
Ask the user: target score, current/baseline score, target schools, weekly study hours, weakest section.`,

  study: `STUDY & LEARNING EXPERTISE:
You have deep knowledge of evidence-based learning methodology. Apply:
- Spaced repetition beats massed practice for long-term retention
- Active recall beats re-reading: flashcards, practice problems, self-testing
- Interleaving topics improves transfer — don't block-study one subject for days
- 90-minute deep work blocks work better than fragmented sessions
- Progress = practice test scores, not hours logged
Ask the user: what is being learned, any exam/deadline date, current knowledge level, study environment.`,

  work: `CAREER & PRODUCTIVITY EXPERTISE:
You have deep knowledge of professional development and workplace effectiveness. Apply:
- Define success concretely before planning — outcome-first thinking
- Deep work: schedule 2–4hr uninterrupted blocks for high-leverage tasks
- Weekly reviews: assess progress, reprioritize, clear backlog
- Skill compounding: invest in skills that grow over years (20% rule)
- Relationships matter: track key contacts and follow-ups intentionally
Ask the user: specific career goal, timeline, current role/level, biggest bottleneck right now.`,

  health: `HEALTH & WELLNESS EXPERTISE:
You have deep knowledge of lifestyle health improvement. Apply:
- Sleep is foundational: 7–9hr underpins all other health goals
- Stress management: chronic cortisol undermines body composition and cognition
- Movement consistency > intensity: daily walks outperform sporadic hard sessions
- Hydration and basic nutrition are prerequisites, not optimizations
- Track leading indicators (habits), not just lagging ones (weight, energy)
Ask the user: main health concern, current sleep quality, stress level, what they have tried before.`,

  habit: `HABIT BUILDING EXPERTISE:
You have deep knowledge of behavior change and habit formation. Apply:
- Habit stacking: attach new behavior to an existing anchor (after X, I do Y)
- Start small: 2-minute version eliminates resistance and builds identity
- Environment design: change context before relying on willpower
- Simple streak tracking creates accountability without complexity
- Identity framing: "I am a person who…" is more durable than "I want to…"
Ask the user: what specific behavior to build, current daily anchors, past failures, main obstacle.`,
};

export function detectCoachSkill(plan: { title: string; category: PlanCategory }): CoachSkill | null {
  const t = plan.title.toLowerCase();
  switch (plan.category) {
    case "fitness":
      return /run|marathon|5k|10k|half\b|jog|trail/.test(t) ? "running" : "fitness";
    case "health":
      return /diet|nutrition|weight|eat|calor|fast|cut|bulk|food|meal/.test(t) ? "diet" : "health";
    case "learning":
      return /gmat|gre|sat|lsat|mcat|exam|test|certif/.test(t) ? "gmat_prep" : "study";
    case "work":
      return "work";
    case "routine":
      return "habit";
    default:
      return null;
  }
}

export function getCoachSkillPrompt(plan: { title: string; category: PlanCategory }): string | null {
  const skill = detectCoachSkill(plan);
  return skill ? SKILL_PROMPTS[skill] : null;
}
