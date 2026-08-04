/**
 * Inline trend line for a dense list row — not a full chart (see the tracker
 * detail chart in ReviewView for that). Static: no dots, no axis, no
 * animation, so there's no reduced-motion concern.
 *
 * Renders nothing below 2 points; a single value can't show a trend, and an
 * empty/flat SVG box would just be noise.
 *
 * Uses `currentColor` rather than hardcoded hex so the line always matches
 * whatever colored text sits next to it (and gets dark-mode variants for
 * free) — set color via the wrapping element's `className`.
 */
export default function Sparkline({
  values,
  className = "",
  width = 56,
  height = 26,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  // 1.5px vertical inset so a min/max point's stroke isn't clipped by the
  // viewBox edge.
  const inset = 1.5;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = inset + (1 - (v - min) / range) * (height - inset * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePoints = points.join(" ");
  const areaPoints = `0,${height} ${linePoints} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <polygon points={areaPoints} fill="currentColor" opacity={0.12} />
      <polyline
        points={linePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
