"use client";

import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconFlame } from "@tabler/icons-react";
import type { DayCell } from "@/lib/roadmapEngine";
import {
  type RangeKey,
  RANGE_OPTIONS,
  MODE_CONFIG,
  DAY_LABEL_COL,
  DAY_LABEL_GAP,
} from "@/lib/heatmapMode";
import {
  filterCellsByRange,
  groupDaysIntoWeeks,
  normalizeIntensity,
  calculateCellSize,
  resolveMonthLabels,
  resolveHeatmapMode,
  computeStreakFromCells,
} from "@/lib/heatmapUtils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConsistencyHeatmapProps {
  cells: DayCell[];
}

interface TooltipState {
  date: string;
  count: number;
  x: number;
  y: number;
}

// ── Color system — 6 levels (0 = ghost, 5 = peak) ─────────────────────────────
// Light: near-invisible empty → rich emerald peak
// Dark:  subtler base, luminous peak (creates glow feel)

const CELL_LIGHT = [
  "#f1f5f4",   // 0 ghost
  "#d1fae5",   // 1 trace   — emerald-100
  "#a7f3d0",   // 2 low     — emerald-200
  "#6ee7b7",   // 3 medium  — emerald-300
  "#10b981",   // 4 high    — emerald-500
  "#059669",   // 5 peak    — emerald-600
] as const;

const CELL_DARK = [
  "rgba(255,255,255,0.045)",  // 0 ghost
  "rgba(6,78,59,0.55)",       // 1 trace   — emerald-950 blend
  "rgba(6,78,59,0.85)",       // 2 low     — emerald-900
  "rgba(4,120,87,0.80)",      // 3 medium  — emerald-700
  "rgba(16,185,129,0.85)",    // 4 high    — emerald-500
  "rgba(52,211,153,0.95)",    // 5 peak    — emerald-400
] as const;

// Today ring — stands out on any cell level
const TODAY_RING = "ring-1 ring-emerald-500/70 dark:ring-emerald-400/80 ring-offset-[1.5px] ring-offset-white dark:ring-offset-neutral-900";

const CELL_RADIUS = 3;
const MONTH_ROW_H  = 14; // px
const MONTH_ROW_MB = 2;  // px
const DAY_COL_MT   = MONTH_ROW_H + MONTH_ROW_MB;

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function isDarkMode() {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
}

function cellColor(level: number): string {
  const colors = isDarkMode() ? CELL_DARK : CELL_LIGHT;
  return colors[Math.min(level, colors.length - 1)];
}

// ── Sub-components ────────────────────────────────────────────────────────────

const RangePills = memo(function RangePills({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {RANGE_OPTIONS.map((r) => {
        const active = r === value;
        return (
          <motion.button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            whileTap={{ scale: 0.85 }}
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
            }`}
          >
            {r}
          </motion.button>
        );
      })}
    </div>
  );
});

const StreakPill = memo(function StreakPill({ streak }: { streak: number }) {
  return (
    <AnimatePresence mode="popLayout">
      {streak > 0 && (
        <motion.span
          key={streak}
          initial={{ opacity: 0, scale: 0.65 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.65 }}
          transition={{ type: "spring", stiffness: 500, damping: 26 }}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-500 dark:bg-amber-400/10 dark:text-amber-400"
        >
          <IconFlame size={9} strokeWidth={2.5} />
          {streak}d
        </motion.span>
      )}
    </AnimatePresence>
  );
});

// Tiny legend — metadata only, not content
const HeatmapLegend = memo(function HeatmapLegend({ cellSize }: { cellSize: number }) {
  const s = Math.max(7, Math.min(10, cellSize - 3));
  const levels = [0, 1, 2, 3, 4, 5] as const;
  return (
    <div className="flex items-center justify-end gap-[3px] opacity-60">
      <span className="text-[8px] font-medium text-neutral-400 dark:text-neutral-600 mr-0.5">
        Less
      </span>
      {levels.map((l) => (
        <div
          key={l}
          className="shrink-0"
          style={{
            width: s,
            height: s,
            borderRadius: 2,
            backgroundColor: isDarkMode() ? CELL_DARK[l] : CELL_LIGHT[l],
          }}
        />
      ))}
      <span className="text-[8px] font-medium text-neutral-400 dark:text-neutral-600 ml-0.5">
        More
      </span>
    </div>
  );
});

// ── Tooltip ───────────────────────────────────────────────────────────────────

const CellTooltip = memo(function CellTooltip({ tooltip }: { tooltip: TooltipState | null }) {
  return (
    <AnimatePresence>
      {tooltip && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="pointer-events-none fixed z-50 rounded-[8px] border border-white/[0.08] bg-neutral-950 px-2.5 py-1.5 dark:bg-neutral-800"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          <p className="text-[11px] font-semibold leading-none text-white">
            {formatDate(tooltip.date)}
          </p>
          <p className="mt-0.5 text-[10px] leading-none text-neutral-400">
            {tooltip.count === 0 ? "No activity" : `${tooltip.count} entr${tooltip.count === 1 ? "y" : "ies"}`}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

function ConsistencyHeatmapInner({ cells }: ConsistencyHeatmapProps) {
  const [range, setRange]     = useState<RangeKey>("90D");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [, forceUpdate]       = useState(0); // for dark-mode color refresh

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((e) => setContainerWidth(e[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-render when OS/manual theme switches so inline colors update
  useEffect(() => {
    const obs = new MutationObserver(() => forceUpdate((n) => n + 1));
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const handleRangeChange = useCallback((r: RangeKey) => setRange(r), []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const filteredCells = useMemo(() => filterCellsByRange(cells, range), [cells, range]);
  const weeks         = useMemo(() => groupDaysIntoWeeks(filteredCells), [filteredCells]);
  const mode          = useMemo(() => resolveHeatmapMode(weeks.length), [weeks.length]);
  const cfg           = MODE_CONFIG[mode];
  const intensityMap  = useMemo(() => normalizeIntensity(filteredCells), [filteredCells]);
  const cellSize      = useMemo(() => calculateCellSize(containerWidth, weeks.length, mode), [containerWidth, weeks.length, mode]);
  const monthLabels   = useMemo(() => resolveMonthLabels(weeks, mode), [weeks, mode]);
  const streak        = useMemo(() => computeStreakFromCells(filteredCells), [filteredCells]);

  const isDense = mode === "dense";
  const ready   = containerWidth > 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCellEnter = useCallback((e: React.PointerEvent, cell: DayCell) => {
    if (!cell.date || cell.isOutsidePlan || cell.isFuture) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ date: cell.date, count: cell.count, x: rect.left + rect.width / 2, y: rect.top - 8 });
  }, []);

  const handleCellLeave = useCallback(() => setTooltip(null), []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full select-none">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-2.5">
        <RangePills value={range} onChange={handleRangeChange} />
        <StreakPill streak={streak} />
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`px-3 pb-1.5 ${isDense ? "overflow-x-auto" : "overflow-hidden"}`}
        style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={range}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="inline-flex"
            style={{ gap: cfg.gap }}
          >
            {ready ? (
              <>
                {/* Day-of-week labels */}
                <div
                  className="flex shrink-0 flex-col"
                  style={{ gap: cfg.gap, width: DAY_LABEL_COL, marginRight: DAY_LABEL_GAP, marginTop: DAY_COL_MT }}
                >
                  {DAY_NAMES.map((name, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-end"
                      style={{ height: cellSize }}
                    >
                      {cfg.labelDays.includes(i) && (
                        <span className="text-[8px] font-medium leading-none text-neutral-400/70 dark:text-neutral-600">
                          {name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Week columns */}
                <div className="flex flex-col">
                  {/* Month labels */}
                  <div
                    className="flex"
                    style={{ gap: cfg.gap, height: MONTH_ROW_H, marginBottom: MONTH_ROW_MB }}
                  >
                    {weeks.map((_, wi) => (
                      <div
                        key={wi}
                        className="flex shrink-0 items-end"
                        style={{ width: cellSize }}
                      >
                        {monthLabels[wi] && (
                          <span className="whitespace-nowrap text-[8px] font-semibold leading-none text-neutral-400/80 dark:text-neutral-600">
                            {monthLabels[wi]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Cells */}
                  <div className="flex" style={{ gap: cfg.gap }}>
                    {weeks.map((week, wi) => (
                      <div key={wi} className="flex shrink-0 flex-col" style={{ gap: cfg.gap }}>
                        {week.map((cell, di) => {
                          const skip    = cell.isOutsidePlan || cell.isFuture;
                          const isToday = cell.date === today;
                          const level   = skip ? 0 : (intensityMap.get(cell.date) ?? 0);
                          const bg      = cellColor(level);

                          return (
                            <motion.div
                              key={`${wi}-${di}`}
                              data-date={cell.date || undefined}
                              data-count={!skip ? cell.count : undefined}
                              // Entry: staggered wave left → right, top → bottom
                              initial={{ opacity: 0, scale: 0.4 }}
                              animate={{
                                opacity: cell.isOutsidePlan ? 0 : cell.isFuture ? 0.2 : 1,
                                scale: 1,
                              }}
                              whileHover={!skip ? {
                                scale: 1.35,
                                filter: "brightness(1.45)",
                                zIndex: 20,
                              } : undefined}
                              transition={{
                                opacity:  { duration: 0.18, delay: wi * 0.009 + di * 0.002, ease: [0.22, 1, 0.36, 1] },
                                scale:    { duration: 0.18, delay: wi * 0.009 + di * 0.002, ease: [0.22, 1, 0.36, 1] },
                                filter:   { duration: 0.08 },
                              }}
                              onPointerEnter={(e) => handleCellEnter(e, cell)}
                              onPointerLeave={handleCellLeave}
                              className={`shrink-0 ${isToday ? TODAY_RING : ""}`}
                              style={{
                                width: cellSize,
                                height: cellSize,
                                borderRadius: CELL_RADIUS,
                                backgroundColor: bg,
                                position: "relative",
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ height: 7 * 12 + 6 * cfg.gap + DAY_COL_MT, width: "100%" }} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="px-3 pb-2.5 pt-0.5">
        <HeatmapLegend cellSize={cellSize} />
      </div>

      <CellTooltip tooltip={tooltip} />
    </div>
  );
}

export default memo(ConsistencyHeatmapInner);
