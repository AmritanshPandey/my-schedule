/**
 * Pure utility for detecting measurable goals inside milestone titles/descriptions.
 * No AI, no side effects — just regex + keyword heuristics.
 */

export interface MeasurableGoal {
  unit: string;
  goalValue: number;
  goalDirection: "increase_good" | "decrease_good";
}

// ── Unit normalization map ────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  kgs: "kg",
  kilograms: "kg",
  kilogram: "kg",
  lbs: "lbs",
  pounds: "lbs",
  pound: "lbs",
  km: "km",
  kilometers: "km",
  kilometer: "km",
  kms: "km",
  miles: "mi",
  mile: "mi",
  mi: "mi",
  min: "min",
  mins: "min",
  minutes: "min",
  minute: "min",
  hrs: "hr",
  hours: "hr",
  hour: "hr",
  hr: "hr",
  reps: "reps",
  rep: "reps",
  sets: "sets",
  set: "sets",
  steps: "steps",
  step: "steps",
  pages: "pages",
  page: "pages",
  books: "books",
  book: "books",
  percent: "%",
  "%": "%",
  x: "x",
  times: "x",
};

// ── Direction keyword lists ───────────────────────────────────────────────────

const DECREASE_KEYWORDS = [
  "lose", "lost", "drop", "cut", "lower", "reduce", "slim", "shed",
  "decrease", "lose weight", "weight loss", "fat loss", "burn",
];

const INCREASE_KEYWORDS = [
  "gain", "run", "lift", "reach", "build", "grow", "improve", "complete",
  "increase", "achieve", "hit", "add", "earn", "save", "read", "learn",
  "walk", "cycle", "bike", "swim", "finish", "do", "get",
];

// ── Pattern: number followed by unit (e.g. "5kg", "10 reps", "30 minutes") ──

const MEASURABLE_PATTERN =
  /(\d+(?:\.\d+)?)\s*(kgs?|kilograms?|lbs?|pounds?|kms?|kilometers?|miles?|mi|mins?|minutes?|hrs?|hours?|reps?|sets?|steps?|pages?|books?|%|x|times?)\b/i;

function normalizeUnit(raw: string): string {
  return UNIT_MAP[raw.toLowerCase()] ?? raw.toLowerCase();
}

function detectDirection(text: string): "decrease_good" | "increase_good" {
  const lower = text.toLowerCase();
  for (const kw of DECREASE_KEYWORDS) {
    if (lower.includes(kw)) return "decrease_good";
  }
  return "increase_good";
}

/**
 * Scans a milestone title + optional description for a measurable numeric goal.
 * Returns `null` when no pattern is found.
 *
 * Examples that resolve:
 *   "Lose 5kg by July"        → { unit:"kg", goalValue:5,  goalDirection:"decrease_good" }
 *   "Run 10km consistently"   → { unit:"km", goalValue:10, goalDirection:"increase_good" }
 *   "Complete 30 reps daily"  → { unit:"reps", goalValue:30, goalDirection:"increase_good" }
 */
export function detectMeasurableGoal(
  title: string,
  description?: string,
): MeasurableGoal | null {
  const text = `${title} ${description ?? ""}`.trim();
  const match = text.match(MEASURABLE_PATTERN);
  if (!match) return null;

  const goalValue = parseFloat(match[1]);
  const unit = normalizeUnit(match[2]);
  const goalDirection = detectDirection(text);

  return { unit, goalValue, goalDirection };
}
