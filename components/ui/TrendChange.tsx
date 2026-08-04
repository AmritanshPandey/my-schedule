import { IconArrowDownRight, IconArrowUpRight } from "@tabler/icons-react";
import type { TrendDirection, TrendState } from "@/lib/trendUtils";

/**
 * Compact "↗ +1.5%" / "↘ -2.3%" for a dense row, colored by whether the
 * change is good — not just whether it went up. `state` already carries that
 * judgement (it's neutral/gray when the tracker has no goalDirection, since
 * we then have no basis to call a move good or bad).
 */
export default function TrendChange({
  direction,
  state,
  pct,
}: {
  direction: TrendDirection;
  state: TrendState;
  pct: number | null;
}) {
  if (direction === "neutral" || pct === null) return null;

  const Icon = direction === "up" ? IconArrowUpRight : IconArrowDownRight;
  const colorClass =
    state === "positive"
      ? "text-emerald-500 dark:text-emerald-400"
      : state === "negative"
      ? "text-rose-500 dark:text-rose-400"
      : "text-neutral-400 dark:text-neutral-500";

  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 text-[12px] font-bold tabular-nums ${colorClass}`}>
      <Icon size={13} strokeWidth={2.6} className="shrink-0" />
      {pct > 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}
