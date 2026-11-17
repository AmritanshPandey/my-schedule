import type { DayKey, Goal, Plan, PlanAdjustment, RunPlanInputs, Schedule, Session, SessionTask } from "./scheduleTypes";
import { uid } from "./id";
import { formatPace, logsFor, plannedDistanceM } from "./sessions";

/**
 * The "Run a 5K" template: turns a runner's current level and target into
 * dated sessions, week by week. Deterministic rules, no AI:
 *
 * - weekly volume grows no more than ~10% a week; every 4th week is easier;
 * - each week has one long run (last run day), one quality run (second run
 *   day: intervals in the first half of the plan, tempo in the second) and
 *   easy runs on the other days;
 * - the final week tapers and ends with the target run.
 *
 * Accepted PlanAdjustments are applied as inputs, so a rebuild is just running
 * the generator again and replacing future sessions nobody has touched.
 */

export const RUN_5K_TEMPLATE_ID = "run-5k";

const DAY_INDEX: Record<DayKey, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const MIN_EASY_KM = 1.5;
const WARMUP_M = 1000;
const INTERVAL_M = 400;
const INTERVAL_REST_SEC = 90;

const floor05 = (km: number) => Math.floor(km * 2 + 1e-9) / 2;
const round05 = (km: number) => Math.round(km * 2) / 2;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** The range a plan can be built from; outside it a generated run could be zero length or zero pace. */
const MIN_CURRENT_KM = 0.5;
const EASY_PACE_RANGE = [180, 900] as const; // 3:00 to 15:00 per km
const TARGET_PACE_RANGE = [150, 900] as const; // 2:30 to 15:00 per km

/**
 * Error copy, or null when a sound plan can be built. Everything the generator
 * relies on is checked here, so it never writes a row the schedule schema
 * would reject (a rejected row blocks every save after it).
 */
export function validateRunInputs(inputs: RunPlanInputs, todayISO: string): string | null {
  if (!Number.isFinite(inputs.currentDistanceKm) || inputs.currentDistanceKm <= 0) return "Enter how far you can run now.";
  if (inputs.currentDistanceKm < MIN_CURRENT_KM) return "Start from at least 0.5 km.";
  if (!Number.isFinite(inputs.easyPaceSecPerKm) || inputs.easyPaceSecPerKm <= 0) return "Enter your easy pace.";
  if (inputs.easyPaceSecPerKm < EASY_PACE_RANGE[0] || inputs.easyPaceSecPerKm > EASY_PACE_RANGE[1]) {
    return "Enter an easy pace between 3:00 and 15:00 per km.";
  }
  if (
    inputs.targetPaceSecPerKm !== undefined &&
    !(inputs.targetPaceSecPerKm >= TARGET_PACE_RANGE[0] && inputs.targetPaceSecPerKm <= TARGET_PACE_RANGE[1])
  ) {
    return "Enter a target pace between 2:30 and 15:00 per km.";
  }
  if (!Number.isFinite(inputs.targetDistanceKm) || inputs.targetDistanceKm < inputs.currentDistanceKm) {
    return "Your target should be at least your current distance.";
  }
  if (!Number.isInteger(inputs.weeks) || inputs.weeks < 4 || inputs.weeks > 16) return "Choose 4 to 16 weeks.";
  // The longest run may grow about 10% a week; a target past that can't be reached safely.
  if (inputs.targetDistanceKm > inputs.currentDistanceKm * Math.pow(1.1, inputs.weeks - 1) + 1) {
    return `That's a big jump for ${inputs.weeks} weeks. Add weeks or lower the target.`;
  }
  const days = new Set(inputs.runDays);
  if (days.size < 3 || days.size > 5) return "Pick 3 to 5 run days.";
  if (!inputs.startISO || inputs.startISO < todayISO) return "Start today or later.";
  return null;
}

type Quality = { kind: "intervals"; reps: number } | { kind: "tempo"; km: number };

interface WeekSpec {
  final: boolean;
  longKm: number;
  easyKm: number;
  quality: Quality | null;
  qualityPace: number;
}

function qualityKm(q: Quality): number {
  return (WARMUP_M * 2) / 1000 + (q.kind === "intervals" ? (q.reps * INTERVAL_M) / 1000 : q.km);
}

/** One spec per logical week 1..weeks, the volume chain applied in order. */
function weekSpecs(inputs: RunPlanInputs): WeekSpec[] {
  const W = inputs.weeks;
  const n = new Set(inputs.runDays).size;
  const C = inputs.currentDistanceKm;
  const T = inputs.targetDistanceKm;
  const E = inputs.easyPaceSecPerKm;
  const qualityWeeks = W - 1;
  const intervalWeeks = Math.ceil(qualityWeeks / 2);
  const tempoWeeks = qualityWeeks - intervalWeeks;
  const paceStart = E - 15;
  const paceEnd = inputs.targetPaceSecPerKm != null ? Math.min(inputs.targetPaceSecPerKm, paceStart) : E - 20;

  const specs: WeekSpec[] = [];
  let lastBuild = 0;
  for (let w = 1; w <= W; w++) {
    const prev = specs[w - 2];
    const prevTotal = prev ? weekTotal(prev, n) : 0;
    if (w === W) {
      const budget = 0.7 * prevTotal;
      const easyKm = Math.max(MIN_EASY_KM, floor05((budget - T) / Math.max(1, n - 1)));
      specs.push({ final: true, longKm: 0, easyKm, quality: null, qualityPace: 0 });
      continue;
    }
    if (w % 4 === 0 && prev) {
      let longKm = Math.max(MIN_EASY_KM, floor05(prev.longKm * 0.8));
      const q = prev.quality;
      const rest = 0.8 * prevTotal - longKm - (q ? qualityKm(q) : 0);
      const easyKm = Math.max(MIN_EASY_KM, floor05(rest / Math.max(1, n - 2)));
      longKm = Math.max(longKm, easyKm);
      specs.push({ final: false, longKm, easyKm, quality: q, qualityPace: prev.qualityPace });
      continue;
    }
    const quality: Quality =
      w <= intervalWeeks
        ? { kind: "intervals", reps: Math.round(4 + (4 * (w - 1)) / Math.max(1, intervalWeeks - 1)) }
        : { kind: "tempo", km: round05(1.5 + (1.5 * (w - intervalWeeks - 1)) / Math.max(1, tempoWeeks - 1)) };
    const qualityPace = Math.round(paceStart + ((paceEnd - paceStart) * (w - 1)) / Math.max(1, W - 2));
    let longKm = round05(C + ((T + 1 - C) * (w - 1)) / Math.max(1, W - 2));
    const budget = w === 1 ? floor05(C * n * 0.9) : floor05(lastBuild * 1.1);
    const easyKm = Math.max(MIN_EASY_KM, floor05((budget - longKm - qualityKm(quality)) / Math.max(1, n - 2)));
    if (w > 1) {
      const over = longKm + qualityKm(quality) + easyKm * (n - 2) - (lastBuild * 1.1 + 0.5);
      if (over > 0) longKm = Math.max(MIN_EASY_KM, floor05(longKm - over));
    }
    // The long run is never shorter than the week's easy runs.
    longKm = Math.max(longKm, easyKm);
    const spec = { final: false, longKm, easyKm, quality, qualityPace };
    specs.push(spec);
    lastBuild = weekTotal(spec, n);
  }
  return specs;
}

function weekTotal(spec: WeekSpec, n: number): number {
  if (spec.final) return spec.easyKm * (n - 1);
  return spec.longKm + (spec.quality ? qualityKm(spec.quality) : 0) + spec.easyKm * (n - 2);
}

/**
 * Accepted suggestions, one per plan week: if two devices each accepted their
 * own copy before syncing, only the first counts, so a week is never repeated twice.
 */
function acceptedOncePerWeek(adjustments: PlanAdjustment[]): PlanAdjustment[] {
  const seen = new Set<string>();
  return adjustments
    .filter((a) => a.decision === "accepted")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .filter((a) => {
      const key = `${a.planId}|${a.weekIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** The order logical weeks are run in, after accepted repeats and eases. */
function weekSequence(weeks: number, adjustments: PlanAdjustment[]): number[] {
  const seq = Array.from({ length: weeks }, (_, i) => i + 1);
  const accepted = acceptedOncePerWeek(adjustments)
    .filter((a) => a.kind === "repeat-week" || a.kind === "ease")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.weekIndex - b.weekIndex);
  for (const a of accepted) {
    const at = Math.min(Math.max(a.weekIndex, 2), seq.length);
    seq.splice(at - 1, 0, seq[at - 2]);
  }
  return seq;
}

function paceDeltaFrom(adjustments: PlanAdjustment[], position: number): number {
  return acceptedOncePerWeek(adjustments)
    .filter((a) => a.kind === "pace" && a.weekIndex <= position)
    .reduce((sum, a) => sum + (a.detail.paceDeltaSec ?? 0), 0);
}

function minutesFor(tasks: SessionTask[], easyPace: number): number {
  let sec = 0;
  for (const t of tasks) {
    if (t.kind !== "distance") continue;
    const reps = t.plan.repeats ?? 1;
    sec += ((t.plan.distanceM * reps) / 1000) * (t.plan.paceSecPerKm ?? easyPace);
    sec += Math.max(0, reps - 1) * (t.plan.restSec ?? 0);
  }
  return Math.ceil(sec / 60 / 5) * 5;
}

export function generateRunPlan(inputs: RunPlanInputs, adjustments: PlanAdjustment[], planId: string, nowISO: string): Session[] {
  const specs = weekSpecs(inputs);
  const seq = weekSequence(inputs.weeks, adjustments.filter((a) => a.planId === planId));
  const days = new Set(inputs.runDays.map((d) => DAY_INDEX[d]));
  const E = inputs.easyPaceSecPerKm;
  const inputsVersion = 1;
  const out: Session[] = [];

  seq.forEach((logical, i) => {
    const position = i + 1;
    const spec = specs[logical - 1];
    const windowStart = addDays(inputs.startISO, 7 * i);
    const dates: string[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(windowStart, d);
      if (days.has(weekdayOf(iso))) dates.push(iso);
    }
    const isLastPosition = position === seq.length;
    const delta = paceDeltaFrom(adjustments.filter((a) => a.planId === planId), position);
    dates.forEach((dateISO, slot) => {
      const lastSlot = slot === dates.length - 1;
      let routineKey: string;
      let title: string;
      let tasks: SessionTask[];
      const id = `${planId}-w${position}-s${slot}`;
      const easy = (km: number): SessionTask => ({ id: `${id}-easy`, kind: "distance", title: "Easy", plan: { distanceM: km * 1000 } });
      if (spec.final && isLastPosition && lastSlot) {
        routineKey = "race";
        title = "Target run";
        tasks = [{
          id: `${id}-race`, kind: "distance", title: "Target run",
          plan: { distanceM: inputs.targetDistanceKm * 1000, ...(inputs.targetPaceSecPerKm != null ? { paceSecPerKm: inputs.targetPaceSecPerKm } : {}) },
        }];
      } else if (!spec.final && lastSlot) {
        routineKey = "long";
        title = "Long run";
        tasks = [easy(spec.longKm)];
      } else if (!spec.final && slot === 1 && spec.quality) {
        const pace = spec.qualityPace + delta;
        const warm = (suffix: string): SessionTask => ({ id: `${id}-${suffix}`, kind: "distance", title: "Easy", plan: { distanceM: WARMUP_M } });
        if (spec.quality.kind === "intervals") {
          routineKey = "intervals";
          title = "Intervals";
          tasks = [warm("warm"), { id: `${id}-main`, kind: "distance", title: "Intervals", plan: { distanceM: INTERVAL_M, paceSecPerKm: pace, repeats: spec.quality.reps, restSec: INTERVAL_REST_SEC } }, warm("cool")];
        } else {
          routineKey = "tempo";
          title = "Tempo run";
          tasks = [warm("warm"), { id: `${id}-main`, kind: "distance", title: "Tempo", plan: { distanceM: spec.quality.km * 1000, paceSecPerKm: pace } }, warm("cool")];
        }
      } else {
        routineKey = "easy";
        title = "Easy run";
        tasks = [easy(spec.easyKm)];
      }
      out.push({
        id, planId, routineKey, title, dateISO,
        ...(inputs.startTime ? { startTime: inputs.startTime } : {}),
        estimatedMinutes: minutesFor(tasks, E),
        tasks,
        status: "planned",
        generated: { weekIndex: position, slot, inputsVersion },
        createdAt: nowISO,
        updatedAt: nowISO,
      });
    });
  });
  return out;
}

export function summarizeRunPlan(sessions: Session[]): { weeks: number; runsPerWeek: number; longRunFromKm: number; longRunToKm: number } {
  const weeks = new Set(sessions.map((s) => s.generated?.weekIndex ?? 0)).size;
  const longs = sessions.filter((s) => s.routineKey === "long").map((s) => plannedDistanceM(s) / 1000);
  return {
    weeks,
    runsPerWeek: weeks ? Math.round(sessions.length / weeks) : 0,
    longRunFromKm: longs[0] ?? 0,
    longRunToKm: longs.length ? Math.max(...longs) : 0,
  };
}

function lastDate(sessions: Session[]): string | undefined {
  return sessions.reduce<string | undefined>((max, s) => (!max || s.dateISO > max ? s.dateISO : max), undefined);
}

export function createRunPlan(
  schedule: Schedule,
  inputs: RunPlanInputs,
  opts: { createGoal: boolean; title?: string },
  nowISO: string,
): { schedule: Schedule; planId: string } {
  const planId = uid();
  const sessions = generateRunPlan(inputs, [], planId, nowISO);
  const endISO = lastDate(sessions);
  const T = inputs.targetDistanceKm;
  const goalTitle = inputs.targetPaceSecPerKm != null ? `Run ${T} km at ${formatPace(inputs.targetPaceSecPerKm)}` : `Run ${T} km`;
  const goal: Goal | null = opts.createGoal
    ? { id: uid(), title: goalTitle, status: "active", startDate: inputs.startISO, targetDate: endISO, createdAt: nowISO, updatedAt: nowISO, schemaVersion: 1 }
    : null;
  const plan: Plan = {
    id: planId,
    title: opts.title?.trim() || (T === 5 ? "Run a 5K" : `Run ${T} km`),
    description: `${inputs.weeks} weeks · ${new Set(inputs.runDays).size} runs a week`,
    startDate: inputs.startISO,
    endDate: endISO,
    category: "fitness",
    emoji: "run",
    color: "amber",
    items: [],
    ...(goal ? { goalId: goal.id } : {}),
    generator: { templateId: RUN_5K_TEMPLATE_ID, inputs, inputsVersion: 1 },
  };
  return {
    planId,
    schedule: {
      ...schedule,
      goals: goal ? [...schedule.goals, goal] : schedule.goals,
      plans: [...schedule.plans, plan],
      sessions: [...(schedule.sessions ?? []), ...sessions],
    },
  };
}

/**
 * Regenerate a generated plan from its inputs and accepted adjustments.
 * Only sessions dated after today that are still planned, unlogged and
 * never edited by hand are replaced; everything else is the user's history.
 */
export function rebuildRunPlan(schedule: Schedule, planId: string, todayISO: string, nowISO: string): Schedule {
  const plan = schedule.plans.find((p) => p.id === planId);
  if (!plan?.generator) return schedule;
  const all = schedule.sessions ?? [];
  const mine = all.filter((s) => s.planId === planId);
  // Today's runs are left as they are too: one may be under way, or done on another device not yet synced.
  const kept = mine.filter((s) => s.dateISO <= todayISO || s.status !== "planned" || !!s.editedAt || logsFor(schedule, s.id).length > 0);
  const keptIds = new Set(kept.map((s) => s.id));
  const version = plan.generator.inputsVersion;
  const fresh = generateRunPlan(plan.generator.inputs, schedule.planAdjustments ?? [], planId, nowISO)
    .filter((s) => s.dateISO > todayISO && !keptIds.has(s.id))
    .map((s) => ({ ...s, generated: { ...s.generated!, inputsVersion: version } }));
  const sessions = [...all.filter((s) => s.planId !== planId), ...kept, ...fresh];
  const endISO = lastDate([...kept, ...fresh]);
  return {
    ...schedule,
    sessions,
    plans: schedule.plans.map((p) => (p.id === planId && endISO ? { ...p, endDate: endISO } : p)),
  };
}

export function updateRunInputs(
  schedule: Schedule,
  planId: string,
  patch: Partial<Pick<RunPlanInputs, "runDays" | "startTime" | "targetPaceSecPerKm">>,
  todayISO: string,
  nowISO: string,
): Schedule {
  const plans = schedule.plans.map((p) => {
    if (p.id !== planId || !p.generator) return p;
    return { ...p, generator: { ...p.generator, inputs: { ...p.generator.inputs, ...patch }, inputsVersion: p.generator.inputsVersion + 1 } };
  });
  return rebuildRunPlan({ ...schedule, plans }, planId, todayISO, nowISO);
}
