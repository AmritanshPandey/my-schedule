import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import type { MetricEntry } from '@planr/core/lib/scheduleTypes';
import type { AccentColor } from '@planr/core/lib/colorSystem';
import { formatDateShort } from '@planr/core/lib/dateUtils';

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
  startingValue?: number;
  bare?: boolean;
  /** The tracker's planned path through its milestones' figures — see the web chart. */
  plannedPath?: ReadonlyArray<{ date: string; value: number; milestoneId?: string }>;
}

function dayNum(iso: string): number {
  return Math.round(new Date(`${iso}T00:00:00`).getTime() / 86_400_000);
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

/**
 * Native port of components/ProgressChart.tsx — the same SVG line/area chart
 * (axis labels, start→goal target line or flat goal rule, dots, date ticks),
 * drawn with react-native-svg from the same coordinate math.
 */
export default function ProgressChart({ entries, color, metric, goalValue, startingValue, bare = false, plannedPath }: ProgressChartProps) {
  const { colorScheme } = useColorScheme();
  const ink = colorScheme === 'dark' ? '#FFFFFF' : '#171717';
  const stroke = STROKE[color] ?? STROKE.cyan;
  const area = AREA[color] ?? AREA.cyan;

  // A start and a goal describe the journey with nothing logged yet, so the
  // chart still has something true to say. Without either, an empty tracker
  // has no axis worth drawing.
  const path = plannedPath && plannedPath.length > 1 ? plannedPath : null;
  const hasTargetLine = !path && startingValue !== undefined && goalValue !== undefined;
  if (entries.length === 0 && !hasTargetLine && !path) return null;

  const values = entries.map((e) => e.value);
  const bounds = [
    ...values,
    ...(path ? path.map((p) => p.value) : []),
    ...(goalValue !== undefined ? [goalValue] : []),
    ...(startingValue !== undefined ? [startingValue] : []),
  ];
  const rawMin = Math.min(...bounds);
  const rawMax = Math.max(...bounds);
  const padding = rawMax === rawMin ? Math.max(rawMax * 0.1, 1) : 0;
  const minVal = rawMin - padding;
  const maxVal = rawMax + padding;
  const valRange = maxVal - minVal || 1;

  // With a planned path the x-axis is time, spanning both the plan and the log.
  const dayNums = path ? [...entries.map((e) => dayNum(e.date)), ...path.map((p) => dayNum(p.date))] : [];
  const firstDay = path ? Math.min(...dayNums) : 0;
  const daySpan = path ? Math.max(...dayNums) - firstDay || 1 : 1;
  const toX = (iso: string) => PAD.left + ((dayNum(iso) - firstDay) / daySpan) * chartW;
  const domain = path ? [...entries.map((e) => e.date), ...path.map((p) => p.date)].sort() : [];

  const pts = entries.map((e, i) => {
    const x = path ? toX(e.date) : PAD.left + (entries.length > 1 ? (i / (entries.length - 1)) * chartW : chartW / 2);
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
    <View
      accessibilityLabel={`${metric.name} chart`}
      className={bare ? 'overflow-hidden' : 'overflow-hidden rounded-xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900'}
      style={{ width: '100%', aspectRatio: W / H }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {yLabels.map((v, i) => {
          const y = PAD.top + chartH - ((v - minVal) / valRange) * chartH;
          return <Line key={`g${i}`} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={ink} strokeOpacity={0.07} strokeWidth={1} />;
        })}

        {yLabels.map((v, i) => {
          const y = PAD.top + chartH - ((v - minVal) / valRange) * chartH;
          return (
            <SvgText key={`y${i}`} x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={9} fill={ink} fillOpacity={0.4}>
              {fmtVal(v)}
            </SvgText>
          );
        })}

        {pts.length > 0 && <Path d={areaPath} fill={area} />}
        {pts.length > 0 && <Path d={linePath} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

        {hasTargetLine &&
          (() => {
            const y0 = toY(startingValue!);
            const y1 = toY(goalValue!);
            return (
              <G>
                <Line x1={PAD.left} y1={y0} x2={W - PAD.right} y2={y1} stroke={stroke} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.55} />
                <SvgText x={PAD.left + 2} y={y0 - 4} textAnchor="start" fontSize={8} fill={stroke} fillOpacity={0.65}>
                  Start
                </SvgText>
                <SvgText x={W - PAD.right - 2} y={y1 - 4} textAnchor="end" fontSize={8} fill={stroke} fillOpacity={0.65}>
                  Goal
                </SvgText>
              </G>
            );
          })()}

        {path && (
          <G>
            <Path
              d={path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.date).toFixed(1)} ${toY(p.value).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
            />
            {path.map((p, i) =>
              p.milestoneId ? (
                <Rect
                  key={`cp${i}`}
                  x={toX(p.date) - 3}
                  y={toY(p.value) - 3}
                  width={6}
                  height={6}
                  rotation={45}
                  originX={toX(p.date)}
                  originY={toY(p.value)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.5}
                  strokeOpacity={0.8}
                />
              ) : null,
            )}
            <SvgText x={W - PAD.right - 2} y={toY(path[path.length - 1].value) - 6} textAnchor="end" fontSize={8} fill={stroke} fillOpacity={0.65}>
              Plan
            </SvgText>
          </G>
        )}

        {!hasTargetLine &&
          !path &&
          goalValue !== undefined &&
          (() => {
            const gy = PAD.top + chartH - ((goalValue - minVal) / valRange) * chartH;
            return (
              <G>
                <Line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke={stroke} strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.55} />
                <SvgText x={W - PAD.right - 2} y={gy - 4} textAnchor="end" fontSize={8} fill={stroke} fillOpacity={0.65}>
                  Goal
                </SvgText>
              </G>
            );
          })()}

        {pts.map((p, i) => (
          <Circle key={`d${i}`} cx={p.x} cy={p.y} r={3.5} fill={stroke} />
        ))}

        {path &&
          [domain[0], domain[domain.length - 1]].map((d, i) => (
            <SvgText key={`xd${i}`} x={toX(d)} y={H - 6} textAnchor={i === 0 ? 'start' : 'end'} fontSize={9} fill={ink} fillOpacity={0.4}>
              {fmtDate(d)}
            </SvgText>
          ))}

        {!path && pts.map((p, i) => {
          if (!xLabelIndices.has(i)) return null;
          return (
            <SvgText key={`x${i}`} x={p.x} y={H - 6} textAnchor="middle" fontSize={9} fill={ink} fillOpacity={0.4}>
              {fmtDate(p.e.date)}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
