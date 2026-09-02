"use client";

import type { MetricEntry } from "@/lib/useScheduleDB";
import type { AccentColor } from "@/lib/colorSystem";
import { formatDateShort } from "@/lib/dateUtils";

const STROKE: Record<AccentColor, string> = {
  red:     "#ef4444",
  orange:  "#f97316",
  amber:   "#f59e0b",
  yellow:  "#eab308",
  lime:    "#84cc16",
  green:   "#22c55e",
  emerald: "#10b981",
  teal:    "#14b8a6",
  cyan:    "#06b6d4",
  sky:     "#0ea5e9",
  blue:    "#3b82f6",
  indigo:  "#6366f1",
  violet:  "#8b5cf6",
  purple:  "#a855f7",
  fuchsia: "#d946ef",
  pink:    "#ec4899",
  rose:    "#f43f5e",
};

const AREA: Record<AccentColor, string> = {
  red:     "rgba(239,68,68,0.12)",
  orange:  "rgba(249,115,22,0.12)",
  amber:   "rgba(245,158,11,0.12)",
  yellow:  "rgba(234,179,8,0.12)",
  lime:    "rgba(132,204,22,0.12)",
  green:   "rgba(34,197,94,0.12)",
  emerald: "rgba(16,185,129,0.12)",
  teal:    "rgba(20,184,166,0.12)",
  cyan:    "rgba(6,182,212,0.12)",
  sky:     "rgba(14,165,233,0.12)",
  blue:    "rgba(59,130,246,0.12)",
  indigo:  "rgba(99,102,241,0.12)",
  violet:  "rgba(139,92,246,0.12)",
  purple:  "rgba(168,85,247,0.12)",
  fuchsia: "rgba(217,70,239,0.12)",
  pink:    "rgba(236,72,153,0.12)",
  rose:    "rgba(244,63,94,0.12)",
};

interface ProgressChartProps {
  entries: MetricEntry[]; // already sorted by date asc
  color: AccentColor;
  metric: { name: string; unit: string };
  goalValue?: number;
  /**
   * Where the tracker started. Given alongside `goalValue`, the flat goal rule
   * becomes a sloped **target line** from start to goal, so the chart answers
   * "am I ahead or behind?" rather than only "how far is the goal?".
   *
   * Also lets the chart render before anything is logged: a start and a goal
   * describe the whole journey on their own, which is exactly the state a new
   * tracker is in. Omit it and this component behaves exactly as it always has.
   */
  startingValue?: number;
  /**
   * Drop the chart's own border and background so it can sit inside a card
   * that already provides the surface. DESIGN.md forbids nested cards — and in
   * dark mode this container's neutral-900 is the card's own colour, so the
   * chart simply disappeared into it.
   */
  bare?: boolean;
}

const W = 400;
const H = 180;
const PAD = { top: 14, right: 14, bottom: 32, left: 44 };
const chartW = W - PAD.left - PAD.right;
const chartH = H - PAD.top - PAD.bottom;

const fmtDate = formatDateShort;

function fmtVal(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function ProgressChart({ entries, color, metric, goalValue, startingValue, bare = false }: ProgressChartProps) {
  const stroke = STROKE[color] ?? STROKE.cyan;
  const area = AREA[color] ?? AREA.cyan;

  // A start and a goal describe the journey with nothing logged yet, so the
  // chart still has something true to say. Without either, an empty tracker
  // has no axis worth drawing.
  const hasTargetLine = startingValue !== undefined && goalValue !== undefined;
  if (entries.length === 0 && !hasTargetLine) return null;

  const values = entries.map((e) => e.value);
  const bounds = [
    ...values,
    ...(goalValue !== undefined ? [goalValue] : []),
    ...(startingValue !== undefined ? [startingValue] : []),
  ];
  const rawMin = Math.min(...bounds);
  const rawMax = Math.max(...bounds);
  const padding = rawMax === rawMin ? Math.max(rawMax * 0.1, 1) : 0;
  const minVal = rawMin - padding;
  const maxVal = rawMax + padding;
  const valRange = maxVal - minVal || 1;

  const pts = entries.map((e, i) => {
    const x = PAD.left + (entries.length > 1 ? (i / (entries.length - 1)) * chartW : chartW / 2);
    const y = PAD.top + chartH - ((e.value - minVal) / valRange) * chartH;
    return { x, y, e };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const baseY = PAD.top + chartH;
  const areaPath =
    pts.length > 0
      ? linePath + ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} L ${pts[0].x.toFixed(1)} ${baseY} Z`
      : "";
  const toY = (v: number) => PAD.top + chartH - ((v - minVal) / valRange) * chartH;

  // Y-axis: 3 labels (min, mid, max)
  const yLabels = [rawMin, (rawMin + rawMax) / 2, rawMax];
  const xStep = Math.max(1, Math.ceil(entries.length / 4));
  const xLabelIndices = new Set<number>();
  xLabelIndices.add(0);
  xLabelIndices.add(entries.length - 1);
  for (let i = xStep; i < entries.length - 1; i += xStep) xLabelIndices.add(i);

  return (
    <div
      className={
        bare
          ? "overflow-hidden"
          : "overflow-hidden rounded-xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label={`${metric.name} chart`}
      >
        {/* Horizontal grid lines */}
        {yLabels.map((v, i) => {
          const y = PAD.top + chartH - ((v - minVal) / valRange) * chartH;
          return (
            <line
              key={i}
              x1={PAD.left}
              y1={y.toFixed(1)}
              x2={W - PAD.right}
              y2={y.toFixed(1)}
              stroke="currentColor"
              strokeOpacity={0.07}
              strokeWidth={1}
              className="text-neutral-900 dark:text-white"
            />
          );
        })}

        {/* Y-axis labels */}
        {yLabels.map((v, i) => {
          const y = PAD.top + chartH - ((v - minVal) / valRange) * chartH;
          return (
            <text
              key={i}
              x={PAD.left - 6}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.4}
              className="text-neutral-900 dark:text-white"
            >
              {fmtVal(v)}
            </text>
          );
        })}

        {/* Area fill */}
        {pts.length > 0 && <path d={areaPath} fill={area} />}

        {/* Line */}
        {pts.length > 0 && (
          <path
            d={linePath}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Target line: start → goal, so the gap to the line is the answer. */}
        {hasTargetLine && (() => {
          const y0 = toY(startingValue!);
          const y1 = toY(goalValue!);
          return (
            <g>
              <line
                x1={PAD.left} y1={y0.toFixed(1)}
                x2={W - PAD.right} y2={y1.toFixed(1)}
                stroke={stroke} strokeWidth={1.5}
                strokeDasharray="4 3" strokeOpacity={0.55}
              />
              <text
                x={PAD.left + 2} y={y0 - 4}
                textAnchor="start" fontSize={8}
                fill={stroke} fillOpacity={0.65}
              >Start</text>
              <text
                x={W - PAD.right - 2} y={y1 - 4}
                textAnchor="end" fontSize={8}
                fill={stroke} fillOpacity={0.65}
              >Goal</text>
            </g>
          );
        })()}

        {/* Flat goal rule — only when there is no start to slope from. */}
        {!hasTargetLine && goalValue !== undefined && (() => {
          const gy = PAD.top + chartH - ((goalValue - minVal) / valRange) * chartH;
          return (
            <g>
              <line
                x1={PAD.left} y1={gy.toFixed(1)}
                x2={W - PAD.right} y2={gy.toFixed(1)}
                stroke={stroke} strokeWidth={1.5}
                strokeDasharray="4 3" strokeOpacity={0.55}
              />
              <text
                x={W - PAD.right - 2} y={gy - 4}
                textAnchor="end" fontSize={8}
                fill={stroke} fillOpacity={0.65}
              >Goal</text>
            </g>
          );
        })()}

        {/* Dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={stroke} />
        ))}

        {/* X-axis labels */}
        {pts.map((p, i) => {
          if (!xLabelIndices.has(i)) return null;
          return (
            <text
              key={i}
              x={p.x}
              y={H - 6}
              textAnchor="middle"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.4}
              className="text-neutral-900 dark:text-white"
            >
              {fmtDate(p.e.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
