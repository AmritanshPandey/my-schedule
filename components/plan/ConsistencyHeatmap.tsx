"use client";

import { useRef, useState, useEffect, useMemo, useCallback, memo } from "react";
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

// ── Constants ─────────────────────────────────────────────────────────────────

/** Tailwind classes per intensity level 0–4. */
const INTENSITY_BG = [
  "bg-neutral-100 dark:bg-white/[0.05]",        // 0 – no activity
  "bg-green-100 dark:bg-green-900/50",           // 1 – faint
  "bg-green-200 dark:bg-green-800/60",           // 2 – light
  "bg-green-400 dark:bg-green-600",              // 3 – medium
  "bg-green-500 dark:bg-green-400",              // 4 – high
] as const;

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ── Sub-components ────────────────────────────────────────────────────────────

/** Range pill selector */
interface RangePillsProps {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
}
const RangePills = memo(function RangePills({ value, onChange }: RangePillsProps) {
  return (
    <div className="flex gap-1.5">
      {RANGE_OPTIONS.map((r) => {
        const active = r === value;
        return (
          <motion.button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                : "border border-neutral-200 bg-transparent text-neutral-500 hover:text-neutral-800 dark:border-white/10 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {r}
          </motion.button>
        );
      })}
    </div>
  );
});

/** Animated streak pill */
interface StreakPillProps {
  streak: number;
}
const StreakPill = memo(function StreakPill({ streak }: StreakPillProps) {
  return (
    <AnimatePresence mode="popLayout">
      {streak > 0 && (
        <motion.span
          key={streak}
          initial={{ opacity: 0, scale: 0.65 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.65 }}
          transition={{ type: "spring", stiffness: 450, damping: 24 }}
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 shrink-0"
        >
          <IconFlame size={11} strokeWidth={2} />
          {streak} Day{streak !== 1 ? "s" : ""}
        </motion.span>
      )}
    </AnimatePresence>
  );
});

/** Five-swatch legend */
const HeatmapLegend = memo(function HeatmapLegend({ cellHeight }: { cellHeight: number }) {
  const size = Math.max(8, Math.min(11, cellHeight));
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <span className="text-[9px] font-medium text-neutral-400 dark:text-neutral-600">Less</span>
      {INTENSITY_BG.map((cls, i) => (
        <div
          key={i}
          className={`rounded-[3px] shrink-0 ${cls}`}
          style={{ width: size, height: size }}
        />
      ))}
      <span className="text-[9px] font-medium text-neutral-400 dark:text-neutral-600">More</span>
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

function ConsistencyHeatmapInner({ cells }: ConsistencyHeatmapProps) {
  const [range, setRange] = useState<RangeKey>("90D");
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container on mount and resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleRangeChange = useCallback((r: RangeKey) => setRange(r), []);

  // ── Derived values (all memoised) ──────────────────────────────────────────

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const filteredCells = useMemo(
    () => filterCellsByRange(cells, range),
    [cells, range]
  );

  const weeks = useMemo(
    () => groupDaysIntoWeeks(filteredCells),
    [filteredCells]
  );

  const mode = useMemo(() => resolveHeatmapMode(weeks.length), [weeks.length]);
  const cfg = MODE_CONFIG[mode];

  const intensityMap = useMemo(
    () => normalizeIntensity(filteredCells),
    [filteredCells]
  );

  const cellWidth = useMemo(
    () => calculateCellSize(containerWidth, weeks.length, mode),
    [containerWidth, weeks.length, mode]
  );

  const cellHeight = Math.round(cellWidth * cfg.cellAspect);

  const monthLabels = useMemo(
    () => resolveMonthLabels(weeks, mode),
    [weeks, mode]
  );

  const streak = useMemo(
    () => computeStreakFromCells(filteredCells),
    [filteredCells]
  );

  const isDense = mode === "dense";
  const ready = containerWidth > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full select-none">
      {/* ── Header: range pills + streak ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <RangePills value={range} onChange={handleRangeChange} />
        <StreakPill streak={streak} />
      </div>

      {/* ── Grid container ────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`px-4 pb-3 ${
          isDense ? "overflow-x-auto" : "overflow-hidden"
        }`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={range}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            // inline-flex so the grid doesn't stretch in dense/overflow mode
            className="inline-flex"
            style={{ gap: cfg.gap }}
          >
            {ready ? (
              <>
                {/* Day-of-week label column */}
                <div
                  className="flex flex-col shrink-0"
                  style={{
                    gap: cfg.gap,
                    width: DAY_LABEL_COL,
                    marginRight: DAY_LABEL_GAP,
                    marginTop: 20, // matches month-label row (height:18 + marginBottom:2)
                  }}
                >
                  {DAY_NAMES.map((name, i) => {
                    const showLabel = cfg.labelDays.includes(i);
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-end"
                        style={{ height: cellHeight }}
                      >
                        {showLabel && (
                          <span className="text-[9px] font-medium leading-none text-neutral-400 dark:text-neutral-600">
                            {name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Week columns */}
                <div className="flex flex-col">
                  {/* Month label row */}
                  <div
                    className="flex"
                    style={{ gap: cfg.gap, height: 18, marginBottom: 2 }}
                  >
                    {weeks.map((_, wi) => (
                      <div
                        key={wi}
                        className="shrink-0 flex items-start"
                        style={{ width: cellWidth }}
                      >
                        {monthLabels[wi] && (
                          <span className="text-[9px] font-semibold leading-none text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                            {monthLabels[wi]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Cell grid */}
                  <div className="flex" style={{ gap: cfg.gap }}>
                    {weeks.map((week, wi) => (
                      <div
                        key={wi}
                        className="flex flex-col shrink-0"
                        style={{ gap: cfg.gap }}
                      >
                        {week.map((cell, di) => {
                          const isOutside = cell.isOutsidePlan;
                          const isFuture = cell.isFuture;
                          const isToday = cell.date === today;
                          const level = isOutside || isFuture
                            ? 0
                            : (intensityMap.get(cell.date) ?? 0);

                          return (
                            <motion.div
                              key={`${wi}-${di}`}
                              // Tooltip anchor — future: add onPointerEnter handler here
                              data-date={cell.date || undefined}
                              data-count={!isOutside && !isFuture ? cell.count : undefined}
                              initial={{ opacity: 0, scale: 0.55 }}
                              animate={{
                                opacity: isOutside ? 0 : isFuture ? 0.3 : 1,
                                scale: 1,
                              }}
                              transition={{
                                duration: 0.22,
                                delay: wi * 0.005,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className={`shrink-0 transition-colors duration-300 ${
                                INTENSITY_BG[level]
                              } ${
                                isToday
                                  ? "ring-1 ring-offset-0 ring-neutral-500/50 dark:ring-neutral-400/40"
                                  : ""
                              }`}
                              style={{
                                width: cellWidth,
                                height: cellHeight,
                                borderRadius: Math.max(
                                  2,
                                  Math.round(cellWidth * 0.28)
                                ),
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
              // Placeholder while container width is being measured
              <div style={{ height: 7 * 12 + 6 * cfg.gap + 20 }} className="w-full" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-4">
        <HeatmapLegend cellHeight={cellHeight} />
      </div>
    </div>
  );
}

export default memo(ConsistencyHeatmapInner);
