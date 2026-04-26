export type AccentColor = "blue" | "emerald" | "violet" | "pink" | "amber" | "cyan";

const VALID_COLORS: AccentColor[] = ["blue", "emerald", "violet", "pink", "amber", "cyan"];

const LEGACY_COLOR_MAP: Record<string, AccentColor> = {
  sky: "blue",
  lime: "emerald",
};

const ICON_COLOR_MAP: Record<string, AccentColor> = {
  briefcase: "blue",
  code: "blue",
  leaf: "pink",
  heart: "pink",
  barbell: "emerald",
  run: "emerald",
  school: "violet",
  book: "violet",
  brain: "violet",
  music: "violet",
  pencil: "violet",
  shopping: "amber",
  finance: "amber",
  coffee: "amber",
  travel: "blue",
  plane: "blue",
  camera: "blue",
  home: "cyan",
  star: "amber",
  tools: "cyan",
  gaming: "cyan",
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
    cardBorder: string;
    shadow: string;
    dot: string;
    iconBg: string;
    iconText: string;
    title: string;
    time: string;
    description: string;
  }> = {
    blue: {
      cardBg: "bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/25 dark:to-transparent",
      cardBorder: "border-blue-100/80 dark:border-blue-900/40 border-l-[3px] border-l-blue-500 dark:border-l-blue-400",
      shadow: "shadow-sm shadow-blue-100/60 dark:shadow-black/25",
      dot: "bg-blue-500",
      iconBg: "bg-blue-500 dark:bg-blue-500",
      iconText: "text-white",
      title: "text-neutral-900 dark:text-white",
      time: "text-neutral-500 dark:text-neutral-400",
      description: "text-neutral-500 dark:text-neutral-400",
    },
    violet: {
      cardBg: "bg-gradient-to-br from-violet-50/50 to-transparent dark:from-violet-950/25 dark:to-transparent",
      cardBorder: "border-violet-100/80 dark:border-violet-900/40 border-l-[3px] border-l-violet-500 dark:border-l-violet-400",
      shadow: "shadow-sm shadow-violet-100/60 dark:shadow-black/25",
      dot: "bg-violet-500",
      iconBg: "bg-violet-500 dark:bg-violet-500",
      iconText: "text-white",
      title: "text-neutral-900 dark:text-white",
      time: "text-neutral-500 dark:text-neutral-400",
      description: "text-neutral-500 dark:text-neutral-400",
    },
    pink: {
      cardBg: "bg-gradient-to-br from-pink-50/50 to-transparent dark:from-pink-950/25 dark:to-transparent",
      cardBorder: "border-pink-100/80 dark:border-pink-900/40 border-l-[3px] border-l-pink-500 dark:border-l-pink-400",
      shadow: "shadow-sm shadow-pink-100/60 dark:shadow-black/25",
      dot: "bg-pink-500",
      iconBg: "bg-pink-500 dark:bg-pink-500",
      iconText: "text-white",
      title: "text-neutral-900 dark:text-white",
      time: "text-neutral-500 dark:text-neutral-400",
      description: "text-neutral-500 dark:text-neutral-400",
    },
    amber: {
      cardBg: "bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/25 dark:to-transparent",
      cardBorder: "border-amber-100/80 dark:border-amber-900/40 border-l-[3px] border-l-amber-500 dark:border-l-amber-400",
      shadow: "shadow-sm shadow-amber-100/60 dark:shadow-black/25",
      dot: "bg-amber-500 dark:bg-amber-500",
      iconBg: "bg-amber-500 dark:bg-amber-500",
      iconText: "text-white",
      title: "text-neutral-900 dark:text-white",
      time: "text-neutral-500 dark:text-neutral-400",
      description: "text-neutral-500 dark:text-neutral-400",
    },
    emerald: {
      cardBg: "bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/25 dark:to-transparent",
      cardBorder: "border-emerald-100/80 dark:border-emerald-900/40 border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400",
      shadow: "shadow-sm shadow-emerald-100/60 dark:shadow-black/25",
      dot: "bg-emerald-500",
      iconBg: "bg-emerald-500 dark:bg-emerald-500",
      iconText: "text-white",
      title: "text-neutral-900 dark:text-white",
      time: "text-neutral-500 dark:text-neutral-400",
      description: "text-neutral-500 dark:text-neutral-400",
    },
    cyan: {
      cardBg: "bg-gradient-to-br from-cyan-50/50 to-transparent dark:from-cyan-950/25 dark:to-transparent",
      cardBorder: "border-cyan-100/80 dark:border-cyan-900/40 border-l-[3px] border-l-cyan-500 dark:border-l-cyan-400",
      shadow: "shadow-sm shadow-cyan-100/60 dark:shadow-black/25",
      dot: "bg-cyan-500",
      iconBg: "bg-cyan-500 dark:bg-cyan-500",
      iconText: "text-white",
      title: "text-neutral-900 dark:text-white",
      time: "text-neutral-500 dark:text-neutral-400",
      description: "text-neutral-500 dark:text-neutral-400",
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
    },
    emerald: {
      text: "text-emerald-600 dark:text-emerald-400",
      tint: "bg-emerald-500/10 dark:bg-emerald-500/15",
      tintHover: "hover:bg-emerald-500/15 dark:hover:bg-emerald-500/20",
      border: "border-emerald-500/25 dark:border-emerald-400/35",
      leftBorder: "border-l-emerald-500 dark:border-l-emerald-400",
      dot: "bg-emerald-500 dark:bg-emerald-400",
      icon: "text-emerald-600 dark:text-emerald-400",
      iconBorder: "border-emerald-500/25 dark:border-emerald-400/35",
      iconSolid: "bg-emerald-500 text-white",
      cardAccent: "border-t-[3px] border-t-emerald-500 dark:border-t-emerald-400",
      action: "hover:text-emerald-600 dark:hover:text-emerald-400",
      badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35",
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
    },
  };

  return styles[token];
}
