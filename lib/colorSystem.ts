export type AccentColor =
  | "red" | "orange" | "amber" | "yellow" | "lime"
  | "green" | "emerald" | "teal" | "cyan" | "sky"
  | "blue" | "indigo" | "violet" | "purple" | "fuchsia"
  | "pink" | "rose";

export const VALID_COLORS: AccentColor[] = [
  "red", "orange", "amber", "yellow", "lime",
  "green", "emerald", "teal", "cyan", "sky",
  "blue", "indigo", "violet", "purple", "fuchsia",
  "pink", "rose",
];

// Remap old limited color names that may be stored in data
const LEGACY_COLOR_MAP: Record<string, AccentColor> = {
  sky: "sky",
  lime: "lime",
};

const ICON_COLOR_MAP: Record<string, AccentColor> = {
  run:       "amber",
  school:    "pink",
  book:      "blue",
  sleep:     "teal",
  star:      "amber",
  briefcase: "cyan",
  car:       "cyan",
  brain:     "violet",
  barbell:   "orange",
  code:      "indigo",
};

export function colorFromIcon(icon: string): AccentColor {
  return ICON_COLOR_MAP[icon] ?? "cyan";
}

// Tailwind 500-level hex — used for inline styles (SVG charts, time text, inset bar)
const CATEGORY_HEX: Record<AccentColor, string> = {
  red:     "#EF4444",
  orange:  "#F97316",
  amber:   "#F59E0B",
  yellow:  "#EAB308",
  lime:    "#84CC16",
  green:   "#22C55E",
  emerald: "#10B981",
  teal:    "#14B8A6",
  cyan:    "#06B6D4",
  sky:     "#0EA5E9",
  blue:    "#3B82F6",
  indigo:  "#6366F1",
  violet:  "#8B5CF6",
  purple:  "#A855F7",
  fuchsia: "#D946EF",
  pink:    "#EC4899",
  rose:    "#F43F5E",
};

export function categoryHex(color: string): string {
  return CATEGORY_HEX[color as AccentColor] ?? CATEGORY_HEX.cyan;
}

export function resolveAccentColor(color: string | undefined, icon: string): AccentColor {
  if (color && LEGACY_COLOR_MAP[color]) return LEGACY_COLOR_MAP[color];
  if (color && VALID_COLORS.includes(color as AccentColor)) return color as AccentColor;
  return colorFromIcon(icon);
}

// ── Task card / timeline block styles ─────────────────────────────────────────
// light: color-100 fill → clear pastel card
// dark:  color-950 fill → deep dark card
// These must be hardcoded strings so Tailwind JIT includes the classes.

export function timelineCardStyles(color: string) {
  const token = VALID_COLORS.includes(color as AccentColor) ? (color as AccentColor) : "cyan";
  const styles: Record<AccentColor, {
    cardBg: string;
    blockBorder: string;
    accentBar: string;
    title: string;
    planLabel: string;
    time: string;
    dot: string;
    iconBg: string;
    iconText: string;
    durationBadge: string;
  }> = {
    red: {
      cardBg:        "bg-red-100 dark:bg-red-950",
      blockBorder:   "border border-red-200/70 dark:border-red-800/40",
      accentBar:     "border-l-[3px] border-l-red-500 dark:border-l-red-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-red-700/80 dark:text-red-300/80",
      time:          "text-red-700 dark:text-red-400",
      dot:           "bg-red-500",
      iconBg:        "bg-red-500",
      iconText:      "text-white",
      durationBadge: "bg-red-200/70 text-red-700 dark:bg-red-400/20 dark:text-red-300",
    },
    orange: {
      cardBg:        "bg-orange-100 dark:bg-orange-950",
      blockBorder:   "border border-orange-200/70 dark:border-orange-800/40",
      accentBar:     "border-l-[3px] border-l-orange-500 dark:border-l-orange-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-orange-700/80 dark:text-orange-300/80",
      time:          "text-orange-700 dark:text-orange-400",
      dot:           "bg-orange-500",
      iconBg:        "bg-orange-500",
      iconText:      "text-white",
      durationBadge: "bg-orange-200/70 text-orange-700 dark:bg-orange-400/20 dark:text-orange-300",
    },
    amber: {
      cardBg:        "bg-amber-100 dark:bg-amber-950",
      blockBorder:   "border border-amber-200/70 dark:border-amber-800/40",
      accentBar:     "border-l-[3px] border-l-amber-500 dark:border-l-amber-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-amber-700/80 dark:text-amber-300/80",
      time:          "text-amber-700 dark:text-amber-400",
      dot:           "bg-amber-500",
      iconBg:        "bg-amber-500",
      iconText:      "text-white",
      durationBadge: "bg-amber-200/70 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300",
    },
    yellow: {
      cardBg:        "bg-yellow-100 dark:bg-yellow-950",
      blockBorder:   "border border-yellow-200/70 dark:border-yellow-800/40",
      accentBar:     "border-l-[3px] border-l-yellow-500 dark:border-l-yellow-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-yellow-700/80 dark:text-yellow-300/80",
      time:          "text-yellow-700 dark:text-yellow-400",
      dot:           "bg-yellow-500",
      iconBg:        "bg-yellow-500",
      iconText:      "text-white",
      durationBadge: "bg-yellow-200/70 text-yellow-700 dark:bg-yellow-400/20 dark:text-yellow-300",
    },
    lime: {
      cardBg:        "bg-lime-100 dark:bg-lime-950",
      blockBorder:   "border border-lime-200/70 dark:border-lime-800/40",
      accentBar:     "border-l-[3px] border-l-lime-500 dark:border-l-lime-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-lime-700/80 dark:text-lime-300/80",
      time:          "text-lime-700 dark:text-lime-400",
      dot:           "bg-lime-500",
      iconBg:        "bg-lime-500",
      iconText:      "text-white",
      durationBadge: "bg-lime-200/70 text-lime-700 dark:bg-lime-400/20 dark:text-lime-300",
    },
    green: {
      cardBg:        "bg-green-100 dark:bg-green-950",
      blockBorder:   "border border-green-200/70 dark:border-green-800/40",
      accentBar:     "border-l-[3px] border-l-green-500 dark:border-l-green-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-green-700/80 dark:text-green-300/80",
      time:          "text-green-700 dark:text-green-400",
      dot:           "bg-green-500",
      iconBg:        "bg-green-500",
      iconText:      "text-white",
      durationBadge: "bg-green-200/70 text-green-700 dark:bg-green-400/20 dark:text-green-300",
    },
    emerald: {
      cardBg:        "bg-emerald-100 dark:bg-emerald-950",
      blockBorder:   "border border-emerald-200/70 dark:border-emerald-800/40",
      accentBar:     "border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-emerald-700/80 dark:text-emerald-300/80",
      time:          "text-emerald-700 dark:text-emerald-400",
      dot:           "bg-emerald-500",
      iconBg:        "bg-emerald-500",
      iconText:      "text-white",
      durationBadge: "bg-emerald-200/70 text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300",
    },
    teal: {
      cardBg:        "bg-teal-100 dark:bg-teal-950",
      blockBorder:   "border border-teal-200/70 dark:border-teal-800/40",
      accentBar:     "border-l-[3px] border-l-teal-500 dark:border-l-teal-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-teal-700/80 dark:text-teal-300/80",
      time:          "text-teal-700 dark:text-teal-400",
      dot:           "bg-teal-500",
      iconBg:        "bg-teal-500",
      iconText:      "text-white",
      durationBadge: "bg-teal-200/70 text-teal-700 dark:bg-teal-400/20 dark:text-teal-300",
    },
    cyan: {
      cardBg:        "bg-cyan-100 dark:bg-cyan-950",
      blockBorder:   "border border-cyan-200/70 dark:border-cyan-800/40",
      accentBar:     "border-l-[3px] border-l-cyan-500 dark:border-l-cyan-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-cyan-700/80 dark:text-cyan-300/80",
      time:          "text-cyan-700 dark:text-cyan-400",
      dot:           "bg-cyan-500",
      iconBg:        "bg-cyan-500",
      iconText:      "text-white",
      durationBadge: "bg-cyan-200/70 text-cyan-700 dark:bg-cyan-400/20 dark:text-cyan-300",
    },
    sky: {
      cardBg:        "bg-sky-100 dark:bg-sky-950",
      blockBorder:   "border border-sky-200/70 dark:border-sky-800/40",
      accentBar:     "border-l-[3px] border-l-sky-500 dark:border-l-sky-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-sky-700/80 dark:text-sky-300/80",
      time:          "text-sky-700 dark:text-sky-400",
      dot:           "bg-sky-500",
      iconBg:        "bg-sky-500",
      iconText:      "text-white",
      durationBadge: "bg-sky-200/70 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300",
    },
    blue: {
      cardBg:        "bg-blue-100 dark:bg-blue-950",
      blockBorder:   "border border-blue-200/70 dark:border-blue-800/40",
      accentBar:     "border-l-[3px] border-l-blue-500 dark:border-l-blue-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-blue-700/80 dark:text-blue-300/80",
      time:          "text-blue-700 dark:text-blue-400",
      dot:           "bg-blue-500",
      iconBg:        "bg-blue-500",
      iconText:      "text-white",
      durationBadge: "bg-blue-200/70 text-blue-700 dark:bg-blue-400/20 dark:text-blue-300",
    },
    indigo: {
      cardBg:        "bg-indigo-100 dark:bg-indigo-950",
      blockBorder:   "border border-indigo-200/70 dark:border-indigo-800/40",
      accentBar:     "border-l-[3px] border-l-indigo-500 dark:border-l-indigo-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-indigo-700/80 dark:text-indigo-300/80",
      time:          "text-indigo-700 dark:text-indigo-400",
      dot:           "bg-indigo-500",
      iconBg:        "bg-indigo-500",
      iconText:      "text-white",
      durationBadge: "bg-indigo-200/70 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-300",
    },
    violet: {
      cardBg:        "bg-violet-100 dark:bg-violet-950",
      blockBorder:   "border border-violet-200/70 dark:border-violet-800/40",
      accentBar:     "border-l-[3px] border-l-violet-500 dark:border-l-violet-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-violet-700/80 dark:text-violet-300/80",
      time:          "text-violet-700 dark:text-violet-400",
      dot:           "bg-violet-500",
      iconBg:        "bg-violet-500",
      iconText:      "text-white",
      durationBadge: "bg-violet-200/70 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300",
    },
    purple: {
      cardBg:        "bg-purple-100 dark:bg-purple-950",
      blockBorder:   "border border-purple-200/70 dark:border-purple-800/40",
      accentBar:     "border-l-[3px] border-l-purple-500 dark:border-l-purple-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-purple-700/80 dark:text-purple-300/80",
      time:          "text-purple-700 dark:text-purple-400",
      dot:           "bg-purple-500",
      iconBg:        "bg-purple-500",
      iconText:      "text-white",
      durationBadge: "bg-purple-200/70 text-purple-700 dark:bg-purple-400/20 dark:text-purple-300",
    },
    fuchsia: {
      cardBg:        "bg-fuchsia-100 dark:bg-fuchsia-950",
      blockBorder:   "border border-fuchsia-200/70 dark:border-fuchsia-800/40",
      accentBar:     "border-l-[3px] border-l-fuchsia-500 dark:border-l-fuchsia-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-fuchsia-700/80 dark:text-fuchsia-300/80",
      time:          "text-fuchsia-700 dark:text-fuchsia-400",
      dot:           "bg-fuchsia-500",
      iconBg:        "bg-fuchsia-500",
      iconText:      "text-white",
      durationBadge: "bg-fuchsia-200/70 text-fuchsia-700 dark:bg-fuchsia-400/20 dark:text-fuchsia-300",
    },
    pink: {
      cardBg:        "bg-pink-100 dark:bg-pink-950",
      blockBorder:   "border border-pink-200/70 dark:border-pink-800/40",
      accentBar:     "border-l-[3px] border-l-pink-500 dark:border-l-pink-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-pink-700/80 dark:text-pink-300/80",
      time:          "text-pink-700 dark:text-pink-400",
      dot:           "bg-pink-500",
      iconBg:        "bg-pink-500",
      iconText:      "text-white",
      durationBadge: "bg-pink-200/70 text-pink-700 dark:bg-pink-400/20 dark:text-pink-300",
    },
    rose: {
      cardBg:        "bg-rose-100 dark:bg-rose-950",
      blockBorder:   "border border-rose-200/70 dark:border-rose-800/40",
      accentBar:     "border-l-[3px] border-l-rose-500 dark:border-l-rose-400",
      title:         "text-neutral-900 dark:text-white",
      planLabel:     "text-rose-700/80 dark:text-rose-300/80",
      time:          "text-rose-700 dark:text-rose-400",
      dot:           "bg-rose-500",
      iconBg:        "bg-rose-500",
      iconText:      "text-white",
      durationBadge: "bg-rose-200/70 text-rose-700 dark:bg-rose-400/20 dark:text-rose-300",
    },
  };

  return styles[token];
}

// ── General accent styles (badges, dots, borders, plan cards) ─────────────────

export function accentStyles(color: string) {
  const token = VALID_COLORS.includes(color as AccentColor) ? (color as AccentColor) : "cyan";
  const styles: Record<AccentColor, {
    text: string;
    tint: string;
    tintHover: string;
    border: string;
    leftBorder: string;
    dot: string;
    icon: string;
    iconBorder: string;
    iconSolid: string;
    cardAccent: string;
    action: string;
    badge: string;
    glowRing: string;
  }> = {
    red: {
      text:       "text-red-600 dark:text-red-400",
      tint:       "bg-red-500/10 dark:bg-red-500/15",
      tintHover:  "hover:bg-red-500/15 dark:hover:bg-red-500/20",
      border:     "border-red-500/25 dark:border-red-400/35",
      leftBorder: "border-l-red-500 dark:border-l-red-400",
      dot:        "bg-red-500 dark:bg-red-400",
      icon:       "text-red-600 dark:text-red-400",
      iconBorder: "border-red-500/25 dark:border-red-400/35",
      iconSolid:  "bg-red-500 text-white",
      cardAccent: "border-t-[3px] border-t-red-500 dark:border-t-red-400",
      action:     "hover:text-red-600 dark:hover:text-red-400",
      badge:      "bg-red-500/10 text-red-600 border-red-500/25 dark:bg-red-500/15 dark:text-red-400 dark:border-red-400/35",
      glowRing:   "ring-1 ring-red-400/45 shadow-[0_2px_10px_-3px_rgba(239,68,68,0.28)]",
    },
    orange: {
      text:       "text-orange-600 dark:text-orange-400",
      tint:       "bg-orange-500/10 dark:bg-orange-500/15",
      tintHover:  "hover:bg-orange-500/15 dark:hover:bg-orange-500/20",
      border:     "border-orange-500/25 dark:border-orange-400/35",
      leftBorder: "border-l-orange-500 dark:border-l-orange-400",
      dot:        "bg-orange-500 dark:bg-orange-400",
      icon:       "text-orange-600 dark:text-orange-400",
      iconBorder: "border-orange-500/25 dark:border-orange-400/35",
      iconSolid:  "bg-orange-500 text-white",
      cardAccent: "border-t-[3px] border-t-orange-500 dark:border-t-orange-400",
      action:     "hover:text-orange-600 dark:hover:text-orange-400",
      badge:      "bg-orange-500/10 text-orange-600 border-orange-500/25 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-400/35",
      glowRing:   "ring-1 ring-orange-400/45 shadow-[0_2px_10px_-3px_rgba(249,115,22,0.28)]",
    },
    amber: {
      text:       "text-amber-600 dark:text-amber-400",
      tint:       "bg-amber-500/10 dark:bg-amber-500/15",
      tintHover:  "hover:bg-amber-500/15 dark:hover:bg-amber-500/20",
      border:     "border-amber-500/25 dark:border-amber-400/35",
      leftBorder: "border-l-amber-500 dark:border-l-amber-400",
      dot:        "bg-amber-500 dark:bg-amber-400",
      icon:       "text-amber-600 dark:text-amber-400",
      iconBorder: "border-amber-500/25 dark:border-amber-400/35",
      iconSolid:  "bg-amber-500 text-white",
      cardAccent: "border-t-[3px] border-t-amber-500 dark:border-t-amber-400",
      action:     "hover:text-amber-600 dark:hover:text-amber-400",
      badge:      "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35",
      glowRing:   "ring-1 ring-amber-400/45 shadow-[0_2px_10px_-3px_rgba(245,158,11,0.28)]",
    },
    yellow: {
      text:       "text-yellow-600 dark:text-yellow-400",
      tint:       "bg-yellow-500/10 dark:bg-yellow-500/15",
      tintHover:  "hover:bg-yellow-500/15 dark:hover:bg-yellow-500/20",
      border:     "border-yellow-500/25 dark:border-yellow-400/35",
      leftBorder: "border-l-yellow-500 dark:border-l-yellow-400",
      dot:        "bg-yellow-500 dark:bg-yellow-400",
      icon:       "text-yellow-600 dark:text-yellow-400",
      iconBorder: "border-yellow-500/25 dark:border-yellow-400/35",
      iconSolid:  "bg-yellow-500 text-white",
      cardAccent: "border-t-[3px] border-t-yellow-500 dark:border-t-yellow-400",
      action:     "hover:text-yellow-600 dark:hover:text-yellow-400",
      badge:      "bg-yellow-500/10 text-yellow-600 border-yellow-500/25 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-400/35",
      glowRing:   "ring-1 ring-yellow-400/45 shadow-[0_2px_10px_-3px_rgba(234,179,8,0.28)]",
    },
    lime: {
      text:       "text-lime-600 dark:text-lime-400",
      tint:       "bg-lime-500/10 dark:bg-lime-500/15",
      tintHover:  "hover:bg-lime-500/15 dark:hover:bg-lime-500/20",
      border:     "border-lime-500/25 dark:border-lime-400/35",
      leftBorder: "border-l-lime-500 dark:border-l-lime-400",
      dot:        "bg-lime-500 dark:bg-lime-400",
      icon:       "text-lime-600 dark:text-lime-400",
      iconBorder: "border-lime-500/25 dark:border-lime-400/35",
      iconSolid:  "bg-lime-500 text-white",
      cardAccent: "border-t-[3px] border-t-lime-500 dark:border-t-lime-400",
      action:     "hover:text-lime-600 dark:hover:text-lime-400",
      badge:      "bg-lime-500/10 text-lime-600 border-lime-500/25 dark:bg-lime-500/15 dark:text-lime-400 dark:border-lime-400/35",
      glowRing:   "ring-1 ring-lime-400/45 shadow-[0_2px_10px_-3px_rgba(132,204,22,0.28)]",
    },
    green: {
      text:       "text-green-600 dark:text-green-400",
      tint:       "bg-green-500/10 dark:bg-green-500/15",
      tintHover:  "hover:bg-green-500/15 dark:hover:bg-green-500/20",
      border:     "border-green-500/25 dark:border-green-400/35",
      leftBorder: "border-l-green-500 dark:border-l-green-400",
      dot:        "bg-green-500 dark:bg-green-400",
      icon:       "text-green-600 dark:text-green-400",
      iconBorder: "border-green-500/25 dark:border-green-400/35",
      iconSolid:  "bg-green-500 text-white",
      cardAccent: "border-t-[3px] border-t-green-500 dark:border-t-green-400",
      action:     "hover:text-green-600 dark:hover:text-green-400",
      badge:      "bg-green-500/10 text-green-600 border-green-500/25 dark:bg-green-500/15 dark:text-green-400 dark:border-green-400/35",
      glowRing:   "ring-1 ring-green-400/45 shadow-[0_2px_10px_-3px_rgba(34,197,94,0.28)]",
    },
    emerald: {
      text:       "text-emerald-600 dark:text-emerald-400",
      tint:       "bg-emerald-500/10 dark:bg-emerald-500/15",
      tintHover:  "hover:bg-emerald-500/15 dark:hover:bg-emerald-500/20",
      border:     "border-emerald-500/25 dark:border-emerald-400/35",
      leftBorder: "border-l-emerald-500 dark:border-l-emerald-400",
      dot:        "bg-emerald-500 dark:bg-emerald-400",
      icon:       "text-emerald-600 dark:text-emerald-400",
      iconBorder: "border-emerald-500/25 dark:border-emerald-400/35",
      iconSolid:  "bg-emerald-500 text-white",
      cardAccent: "border-t-[3px] border-t-emerald-500 dark:border-t-emerald-400",
      action:     "hover:text-emerald-600 dark:hover:text-emerald-400",
      badge:      "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35",
      glowRing:   "ring-1 ring-emerald-400/45 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.28)]",
    },
    teal: {
      text:       "text-teal-600 dark:text-teal-400",
      tint:       "bg-teal-500/10 dark:bg-teal-500/15",
      tintHover:  "hover:bg-teal-500/15 dark:hover:bg-teal-500/20",
      border:     "border-teal-500/25 dark:border-teal-400/35",
      leftBorder: "border-l-teal-500 dark:border-l-teal-400",
      dot:        "bg-teal-500 dark:bg-teal-400",
      icon:       "text-teal-600 dark:text-teal-400",
      iconBorder: "border-teal-500/25 dark:border-teal-400/35",
      iconSolid:  "bg-teal-500 text-white",
      cardAccent: "border-t-[3px] border-t-teal-500 dark:border-t-teal-400",
      action:     "hover:text-teal-600 dark:hover:text-teal-400",
      badge:      "bg-teal-500/10 text-teal-600 border-teal-500/25 dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-400/35",
      glowRing:   "ring-1 ring-teal-400/45 shadow-[0_2px_10px_-3px_rgba(20,184,166,0.28)]",
    },
    cyan: {
      text:       "text-cyan-600 dark:text-cyan-400",
      tint:       "bg-cyan-500/10 dark:bg-cyan-500/15",
      tintHover:  "hover:bg-cyan-500/15 dark:hover:bg-cyan-500/20",
      border:     "border-cyan-500/25 dark:border-cyan-400/35",
      leftBorder: "border-l-cyan-500 dark:border-l-cyan-400",
      dot:        "bg-cyan-500 dark:bg-cyan-400",
      icon:       "text-cyan-600 dark:text-cyan-400",
      iconBorder: "border-cyan-500/25 dark:border-cyan-400/35",
      iconSolid:  "bg-cyan-500 text-white",
      cardAccent: "border-t-[3px] border-t-cyan-500 dark:border-t-cyan-400",
      action:     "hover:text-cyan-600 dark:hover:text-cyan-400",
      badge:      "bg-cyan-500/10 text-cyan-600 border-cyan-500/25 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-400/35",
      glowRing:   "ring-1 ring-cyan-400/45 shadow-[0_2px_10px_-3px_rgba(6,182,212,0.28)]",
    },
    sky: {
      text:       "text-sky-600 dark:text-sky-400",
      tint:       "bg-sky-500/10 dark:bg-sky-500/15",
      tintHover:  "hover:bg-sky-500/15 dark:hover:bg-sky-500/20",
      border:     "border-sky-500/25 dark:border-sky-400/35",
      leftBorder: "border-l-sky-500 dark:border-l-sky-400",
      dot:        "bg-sky-500 dark:bg-sky-400",
      icon:       "text-sky-600 dark:text-sky-400",
      iconBorder: "border-sky-500/25 dark:border-sky-400/35",
      iconSolid:  "bg-sky-500 text-white",
      cardAccent: "border-t-[3px] border-t-sky-500 dark:border-t-sky-400",
      action:     "hover:text-sky-600 dark:hover:text-sky-400",
      badge:      "bg-sky-500/10 text-sky-600 border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-400/35",
      glowRing:   "ring-1 ring-sky-400/45 shadow-[0_2px_10px_-3px_rgba(14,165,233,0.28)]",
    },
    blue: {
      text:       "text-blue-600 dark:text-blue-400",
      tint:       "bg-blue-500/10 dark:bg-blue-500/15",
      tintHover:  "hover:bg-blue-500/15 dark:hover:bg-blue-500/20",
      border:     "border-blue-500/25 dark:border-blue-400/35",
      leftBorder: "border-l-blue-500 dark:border-l-blue-400",
      dot:        "bg-blue-500 dark:bg-blue-400",
      icon:       "text-blue-600 dark:text-blue-400",
      iconBorder: "border-blue-500/25 dark:border-blue-400/35",
      iconSolid:  "bg-blue-500 text-white",
      cardAccent: "border-t-[3px] border-t-blue-500 dark:border-t-blue-400",
      action:     "hover:text-blue-600 dark:hover:text-blue-400",
      badge:      "bg-blue-500/10 text-blue-600 border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-400/35",
      glowRing:   "ring-1 ring-blue-400/45 shadow-[0_2px_10px_-3px_rgba(59,130,246,0.28)]",
    },
    indigo: {
      text:       "text-indigo-600 dark:text-indigo-400",
      tint:       "bg-indigo-500/10 dark:bg-indigo-500/15",
      tintHover:  "hover:bg-indigo-500/15 dark:hover:bg-indigo-500/20",
      border:     "border-indigo-500/25 dark:border-indigo-400/35",
      leftBorder: "border-l-indigo-500 dark:border-l-indigo-400",
      dot:        "bg-indigo-500 dark:bg-indigo-400",
      icon:       "text-indigo-600 dark:text-indigo-400",
      iconBorder: "border-indigo-500/25 dark:border-indigo-400/35",
      iconSolid:  "bg-indigo-500 text-white",
      cardAccent: "border-t-[3px] border-t-indigo-500 dark:border-t-indigo-400",
      action:     "hover:text-indigo-600 dark:hover:text-indigo-400",
      badge:      "bg-indigo-500/10 text-indigo-600 border-indigo-500/25 dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-400/35",
      glowRing:   "ring-1 ring-indigo-400/45 shadow-[0_2px_10px_-3px_rgba(99,102,241,0.28)]",
    },
    violet: {
      text:       "text-violet-600 dark:text-violet-400",
      tint:       "bg-violet-500/10 dark:bg-violet-500/15",
      tintHover:  "hover:bg-violet-500/15 dark:hover:bg-violet-500/20",
      border:     "border-violet-500/25 dark:border-violet-400/35",
      leftBorder: "border-l-violet-500 dark:border-l-violet-400",
      dot:        "bg-violet-500 dark:bg-violet-400",
      icon:       "text-violet-600 dark:text-violet-400",
      iconBorder: "border-violet-500/25 dark:border-violet-400/35",
      iconSolid:  "bg-violet-500 text-white",
      cardAccent: "border-t-[3px] border-t-violet-500 dark:border-t-violet-400",
      action:     "hover:text-violet-600 dark:hover:text-violet-400",
      badge:      "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-400/35",
      glowRing:   "ring-1 ring-violet-400/45 shadow-[0_2px_10px_-3px_rgba(139,92,246,0.28)]",
    },
    purple: {
      text:       "text-purple-600 dark:text-purple-400",
      tint:       "bg-purple-500/10 dark:bg-purple-500/15",
      tintHover:  "hover:bg-purple-500/15 dark:hover:bg-purple-500/20",
      border:     "border-purple-500/25 dark:border-purple-400/35",
      leftBorder: "border-l-purple-500 dark:border-l-purple-400",
      dot:        "bg-purple-500 dark:bg-purple-400",
      icon:       "text-purple-600 dark:text-purple-400",
      iconBorder: "border-purple-500/25 dark:border-purple-400/35",
      iconSolid:  "bg-purple-500 text-white",
      cardAccent: "border-t-[3px] border-t-purple-500 dark:border-t-purple-400",
      action:     "hover:text-purple-600 dark:hover:text-purple-400",
      badge:      "bg-purple-500/10 text-purple-600 border-purple-500/25 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-400/35",
      glowRing:   "ring-1 ring-purple-400/45 shadow-[0_2px_10px_-3px_rgba(168,85,247,0.28)]",
    },
    fuchsia: {
      text:       "text-fuchsia-600 dark:text-fuchsia-400",
      tint:       "bg-fuchsia-500/10 dark:bg-fuchsia-500/15",
      tintHover:  "hover:bg-fuchsia-500/15 dark:hover:bg-fuchsia-500/20",
      border:     "border-fuchsia-500/25 dark:border-fuchsia-400/35",
      leftBorder: "border-l-fuchsia-500 dark:border-l-fuchsia-400",
      dot:        "bg-fuchsia-500 dark:bg-fuchsia-400",
      icon:       "text-fuchsia-600 dark:text-fuchsia-400",
      iconBorder: "border-fuchsia-500/25 dark:border-fuchsia-400/35",
      iconSolid:  "bg-fuchsia-500 text-white",
      cardAccent: "border-t-[3px] border-t-fuchsia-500 dark:border-t-fuchsia-400",
      action:     "hover:text-fuchsia-600 dark:hover:text-fuchsia-400",
      badge:      "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/25 dark:bg-fuchsia-500/15 dark:text-fuchsia-400 dark:border-fuchsia-400/35",
      glowRing:   "ring-1 ring-fuchsia-400/45 shadow-[0_2px_10px_-3px_rgba(217,70,239,0.28)]",
    },
    pink: {
      text:       "text-pink-600 dark:text-pink-400",
      tint:       "bg-pink-500/10 dark:bg-pink-500/15",
      tintHover:  "hover:bg-pink-500/15 dark:hover:bg-pink-500/20",
      border:     "border-pink-500/25 dark:border-pink-400/35",
      leftBorder: "border-l-pink-500 dark:border-l-pink-400",
      dot:        "bg-pink-500 dark:bg-pink-400",
      icon:       "text-pink-600 dark:text-pink-400",
      iconBorder: "border-pink-500/25 dark:border-pink-400/35",
      iconSolid:  "bg-pink-500 text-white",
      cardAccent: "border-t-[3px] border-t-pink-500 dark:border-t-pink-400",
      action:     "hover:text-pink-600 dark:hover:text-pink-400",
      badge:      "bg-pink-500/10 text-pink-600 border-pink-500/25 dark:bg-pink-500/15 dark:text-pink-400 dark:border-pink-400/35",
      glowRing:   "ring-1 ring-pink-400/45 shadow-[0_2px_10px_-3px_rgba(236,72,153,0.28)]",
    },
    rose: {
      text:       "text-rose-600 dark:text-rose-400",
      tint:       "bg-rose-500/10 dark:bg-rose-500/15",
      tintHover:  "hover:bg-rose-500/15 dark:hover:bg-rose-500/20",
      border:     "border-rose-500/25 dark:border-rose-400/35",
      leftBorder: "border-l-rose-500 dark:border-l-rose-400",
      dot:        "bg-rose-500 dark:bg-rose-400",
      icon:       "text-rose-600 dark:text-rose-400",
      iconBorder: "border-rose-500/25 dark:border-rose-400/35",
      iconSolid:  "bg-rose-500 text-white",
      cardAccent: "border-t-[3px] border-t-rose-500 dark:border-t-rose-400",
      action:     "hover:text-rose-600 dark:hover:text-rose-400",
      badge:      "bg-rose-500/10 text-rose-600 border-rose-500/25 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-400/35",
      glowRing:   "ring-1 ring-rose-400/45 shadow-[0_2px_10px_-3px_rgba(244,63,94,0.28)]",
    },
  };

  return styles[token];
}
