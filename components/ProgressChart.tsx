"use client";

import type { MetricEntry } from "@/lib/useScheduleDB";
import type { AccentColor } from "@/lib/colorSystem";
import { formatDateShort } from "@/lib/dateUtils";

const STROKE: Record<AccentColor, string> = {
  blue:    "#3b82f6",
  emerald: "#22c55e",
  violet:  "#8b5cf6",
  pink:    "#ec4899",
  amber:   "#f59e0b",
  cyan:    "#06b6d4",
};

const AREA: Record<AccentColor, string> = {
  blue:    "rgba(59,130,246,0.12)",
  emerald: "rgba(34,197,94,0.12)",
  violet:  "rgba(139,92,246,0.12)",
  pink:    "rgba(236,72,153,0.12)",
  amber:   "rgba(245,158,11,0.12)",
  cyan:    "rgba(6,182,212,0.12)",
};

interface ProgressChartProps {
  entries: MetricEntry[]; // already sorted by date asc
  color: AccentColor;
  metric: { name: string; unit: string };
  goalValue?: number;
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

export default function ProgressChart({ entries, color, metric, goalValue }: ProgressChartProps) {
  const stroke = STROKE[color] ?? STROKE.cyan;
  const area = AREA[color] ?? AREA.cyan;

  if (entries.length === 0) return null;

  const values = entries.map((e) => e.value);
  const rawMin = Math.min(...values, ...(goalValue !== undefined ? [goalValue] : []));
  const rawMax = Math.max(...values, ...(goalValue !== undefined ? [goalValue] : []));
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
    linePath +
    ` L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} L ${pts[0].x.toFixed(1)} ${baseY} Z`;

  // Y-axis: 3 labels (min, mid, max)
  const yLabels = [rawMin, (rawMin + rawMax) / 2, rawMax];
  const xStep = Math.max(1, Math.ceil(entries.length / 4));
  const xLabelIndices = new Set<number>();
  xLabelIndices.add(0);
  xLabelIndices.add(entries.length - 1);
  for (let i = xStep; i < entries.length - 1; i += xStep) xLabelIndices.add(i);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
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
        <path d={areaPath} fill={area} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Goal line */}
        {goalValue !== undefined && (() => {
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
