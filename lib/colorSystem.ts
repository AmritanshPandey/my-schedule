export type AccentColor = "blue" | "emerald" | "violet" | "pink" | "amber" | "cyan";

const VALID_COLORS: AccentColor[] = ["blue", "emerald", "violet", "pink", "amber", "cyan"];

const LEGACY_COLOR_MAP: Record<string, AccentColor> = {
  sky: "blue",
  lime: "emerald",
};

const ICON_COLOR_MAP: Record<string, AccentColor> = {
  run:       "amber",
  school:    "pink",
  book:      "blue",
  sleep:     "emerald",
  star:      "amber",
  briefcase: "cyan",
  car:       "cyan",
  brain:     "violet",
  barbell:   "pink",
  code:      "violet",
};

export function colorFromIcon(icon: string): AccentColor {
  return ICON_COLOR_MAP[icon] ?? "cyan";
}

export function resolveAccentColor(color: string | undefined, icon: string): AccentColor {
  if (color && LEGACY_COLOR_MAP[color]) {
    return LEGACY_COLOR_MAP[color];
  }
  if (color && VALID_COLORS.includes(color as AccentColor)) {
    return color as AccentColor;
  }
  return colorFromIcon(icon);
}

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
    blue: {
      cardBg: "bg-blue-50/90 dark:bg-blue-950/45",
      blockBorder: "border border-blue-200/60 dark:border-blue-700/30",
      accentBar: "border-l-[3px] border-l-blue-500 dark:border-l-blue-400",
      title: "text-neutral-900 dark:text-white",
      planLabel: "text-blue-700/75 dark:text-blue-300/75",
      time: "text-neutral-500 dark:text-neutral-400",
      dot: "bg-blue-500",
      iconBg: "bg-blue-500",
      iconText: "text-white",
      durationBadge: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    },
    violet: {
      cardBg: "bg-violet-50/90 dark:bg-violet-950/45",
      blockBorder: "border border-violet-200/60 dark:border-violet-700/30",
      accentBar: "border-l-[3px] border-l-violet-500 dark:border-l-violet-400",
      title: "text-neutral-900 dark:text-white",
      planLabel: "text-violet-700/75 dark:text-violet-300/75",
      time: "text-neutral-500 dark:text-neutral-400",
      dot: "bg-violet-500",
      iconBg: "bg-violet-500",
      iconText: "text-white",
      durationBadge: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    },
    pink: {
      cardBg: "bg-pink-50/90 dark:bg-pink-950/45",
      blockBorder: "border border-pink-200/60 dark:border-pink-700/30",
      accentBar: "border-l-[3px] border-l-pink-500 dark:border-l-pink-400",
      title: "text-neutral-900 dark:text-white",
      planLabel: "text-pink-700/75 dark:text-pink-300/75",
      time: "text-neutral-500 dark:text-neutral-400",
      dot: "bg-pink-500",
      iconBg: "bg-pink-500",
      iconText: "text-white",
      durationBadge: "bg-pink-100 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300",
    },
    amber: {
      cardBg: "bg-amber-50/90 dark:bg-amber-950/45",
      blockBorder: "border border-amber-200/60 dark:border-amber-700/30",
      accentBar: "border-l-[3px] border-l-amber-500 dark:border-l-amber-400",
      title: "text-neutral-900 dark:text-white",
      planLabel: "text-amber-700/75 dark:text-amber-300/75",
      time: "text-neutral-500 dark:text-neutral-400",
      dot: "bg-amber-500",
      iconBg: "bg-amber-500",
      iconText: "text-white",
      durationBadge: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    },
    emerald: {
      cardBg: "bg-green-50/90 dark:bg-green-950/45",
      blockBorder: "border border-green-200/60 dark:border-green-700/30",
      accentBar: "border-l-[3px] border-l-green-500 dark:border-l-green-400",
      title: "text-neutral-900 dark:text-white",
      planLabel: "text-green-700/75 dark:text-green-300/75",
      time: "text-neutral-500 dark:text-neutral-400",
      dot: "bg-green-500",
      iconBg: "bg-green-500",
      iconText: "text-white",
      durationBadge: "bg-green-100 text-green-700 dark:bg-green-400/15 dark:text-green-300",
    },
    cyan: {
      cardBg: "bg-cyan-50/90 dark:bg-cyan-950/45",
      blockBorder: "border border-cyan-200/60 dark:border-cyan-700/30",
      accentBar: "border-l-[3px] border-l-cyan-500 dark:border-l-cyan-400",
      title: "text-neutral-900 dark:text-white",
      planLabel: "text-cyan-700/75 dark:text-cyan-300/75",
      time: "text-neutral-500 dark:text-neutral-400",
      dot: "bg-cyan-500",
      iconBg: "bg-cyan-500",
      iconText: "text-white",
      durationBadge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
    },
  };

  return styles[token];
}

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
    blue: {
      text: "text-blue-600 dark:text-blue-400",
      tint: "bg-blue-500/10 dark:bg-blue-500/15",
      tintHover: "hover:bg-blue-500/15 dark:hover:bg-blue-500/20",
      border: "border-blue-500/25 dark:border-blue-400/35",
      leftBorder: "border-l-blue-500 dark:border-l-blue-400",
      dot: "bg-blue-500 dark:bg-blue-400",
      icon: "text-blue-600 dark:text-blue-400",
      iconBorder: "border-blue-500/25 dark:border-blue-400/35",
      iconSolid: "bg-blue-500 text-white",
      cardAccent: "border-t-[3px] border-t-blue-500 dark:border-t-blue-400",
      action: "hover:text-blue-600 dark:hover:text-blue-400",
      badge: "bg-blue-500/10 text-blue-600 border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-400/35",
      glowRing: "ring-2 ring-blue-400/70 shadow-[0_0_0_1px_rgba(59,130,246,0.5),0_4px_16px_-2px_rgba(59,130,246,0.45)]",
    },
    emerald: {
      text: "text-green-600 dark:text-green-400",
      tint: "bg-green-500/10 dark:bg-green-500/15",
      tintHover: "hover:bg-green-500/15 dark:hover:bg-green-500/20",
      border: "border-green-500/25 dark:border-green-400/35",
      leftBorder: "border-l-green-500 dark:border-l-green-400",
      dot: "bg-green-500 dark:bg-green-400",
      icon: "text-green-600 dark:text-green-400",
      iconBorder: "border-green-500/25 dark:border-green-400/35",
      iconSolid: "bg-green-500 text-white",
      cardAccent: "border-t-[3px] border-t-green-500 dark:border-t-green-400",
      action: "hover:text-green-600 dark:hover:text-green-400",
      badge: "bg-green-500/10 text-green-600 border-green-500/25 dark:bg-green-500/15 dark:text-green-400 dark:border-green-400/35",
      glowRing: "ring-2 ring-green-400/70 shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_4px_16px_-2px_rgba(16,185,129,0.45)]",
    },
    violet: {
      text: "text-violet-600 dark:text-violet-400",
      tint: "bg-violet-500/10 dark:bg-violet-500/15",
      tintHover: "hover:bg-violet-500/15 dark:hover:bg-violet-500/20",
      border: "border-violet-500/25 dark:border-violet-400/35",
      leftBorder: "border-l-violet-500 dark:border-l-violet-400",
      dot: "bg-violet-500 dark:bg-violet-400",
      icon: "text-violet-600 dark:text-violet-400",
      iconBorder: "border-violet-500/25 dark:border-violet-400/35",
      iconSolid: "bg-violet-500 text-white",
      cardAccent: "border-t-[3px] border-t-violet-500 dark:border-t-violet-400",
      action: "hover:text-violet-600 dark:hover:text-violet-400",
      badge: "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-400/35",
      glowRing: "ring-2 ring-violet-400/70 shadow-[0_0_0_1px_rgba(139,92,246,0.5),0_4px_16px_-2px_rgba(139,92,246,0.45)]",
    },
    pink: {
      text: "text-pink-600 dark:text-pink-400",
      tint: "bg-pink-500/10 dark:bg-pink-500/15",
      tintHover: "hover:bg-pink-500/15 dark:hover:bg-pink-500/20",
      border: "border-pink-500/25 dark:border-pink-400/35",
      leftBorder: "border-l-pink-500 dark:border-l-pink-400",
      dot: "bg-pink-500 dark:bg-pink-400",
      icon: "text-pink-600 dark:text-pink-400",
      iconBorder: "border-pink-500/25 dark:border-pink-400/35",
      iconSolid: "bg-pink-500 text-white",
      cardAccent: "border-t-[3px] border-t-pink-500 dark:border-t-pink-400",
      action: "hover:text-pink-600 dark:hover:text-pink-400",
      badge: "bg-pink-500/10 text-pink-600 border-pink-500/25 dark:bg-pink-500/15 dark:text-pink-400 dark:border-pink-400/35",
      glowRing: "ring-2 ring-pink-400/70 shadow-[0_0_0_1px_rgba(236,72,153,0.5),0_4px_16px_-2px_rgba(236,72,153,0.45)]",
    },
    amber: {
      text: "text-amber-600 dark:text-amber-400",
      tint: "bg-amber-500/10 dark:bg-amber-500/15",
      tintHover: "hover:bg-amber-500/15 dark:hover:bg-amber-500/20",
      border: "border-amber-500/25 dark:border-amber-400/35",
      leftBorder: "border-l-amber-500 dark:border-l-amber-400",
      dot: "bg-amber-500 dark:bg-amber-400",
      icon: "text-amber-600 dark:text-amber-400",
      iconBorder: "border-amber-500/25 dark:border-amber-400/35",
      iconSolid: "bg-amber-500 text-white",
      cardAccent: "border-t-[3px] border-t-amber-500 dark:border-t-amber-400",
      action: "hover:text-amber-600 dark:hover:text-amber-400",
      badge: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35",
      glowRing: "ring-2 ring-amber-400/70 shadow-[0_0_0_1px_rgba(245,158,11,0.5),0_4px_16px_-2px_rgba(245,158,11,0.45)]",
    },
    cyan: {
      text: "text-cyan-600 dark:text-cyan-400",
      tint: "bg-cyan-500/10 dark:bg-cyan-500/15",
      tintHover: "hover:bg-cyan-500/15 dark:hover:bg-cyan-500/20",
      border: "border-cyan-500/25 dark:border-cyan-400/35",
      leftBorder: "border-l-cyan-500 dark:border-l-cyan-400",
      dot: "bg-cyan-500 dark:bg-cyan-400",
      icon: "text-cyan-600 dark:text-cyan-400",
      iconBorder: "border-cyan-500/25 dark:border-cyan-400/35",
      iconSolid: "bg-cyan-500 text-white",
      cardAccent: "border-t-[3px] border-t-cyan-500 dark:border-t-cyan-400",
      action: "hover:text-cyan-600 dark:hover:text-cyan-400",
      badge: "bg-cyan-500/10 text-cyan-600 border-cyan-500/25 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-400/35",
      glowRing: "ring-2 ring-cyan-400/70 shadow-[0_0_0_1px_rgba(6,182,212,0.5),0_4px_16px_-2px_rgba(6,182,212,0.45)]",
    },
  };

  return styles[token];
}
