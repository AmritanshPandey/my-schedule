#!/usr/bin/env python3
"""Draw a strategic group map as an SVG.

Input JSON:
{
  "title": "...",
  "x_axis": {"label": "Price level", "low": "Low", "high": "Premium"},
  "y_axis": {"label": "Depth of service", "low": "Self-serve", "high": "Done for you"},
  "competitors": [{"name": "A", "x": 2, "y": 7, "size": 40, "group": "Specialists", "source": "S3"}, ...],
  "open_positions": [{"x": 8, "y": 3, "label": "Premium self-serve?"}],
  "us": "Our company"   (optional: name of our own entry, drawn highlighted)
}
x and y are 0-10. size is relative (revenue or share); omit for equal sizes.

Usage:
    python strategic_groups.py strategic-groups.json -o strategic-groups.svg
Standard library only.
"""
import argparse
import json
import math
from xml.sax.saxutils import escape

COLORS = ["#38bdf8", "#a78bfa", "#4ade80", "#f472b6", "#fbbf24", "#94a3b8"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("-o", "--out", default="strategic-groups.svg")
    a = ap.parse_args()
    s = json.load(open(a.file))
    comps = s["competitors"]
    W, H, P = 760, 620, 80
    pw, ph = W - 2 * P, H - 2 * P
    X = lambda v: P + float(v) / 10 * pw
    Y = lambda v: P + ph - float(v) / 10 * ph
    smax = max([c.get("size", 1) for c in comps] + [1])
    groups = []
    for c in comps:
        g = c.get("group", "Other")
        if g not in groups:
            groups.append(g)
    col = {g: COLORS[i % len(COLORS)] for i, g in enumerate(groups)}
    xa, ya = s["x_axis"], s["y_axis"]
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="Inter, Arial, sans-serif">',
         f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
         f'<text x="{P}" y="36" font-size="18" font-weight="700" fill="#0f172a">{escape(s.get("title", "Strategic group map"))}</text>',
         f'<rect x="{P}" y="{P}" width="{pw}" height="{ph}" fill="#f8fafc" stroke="#cbd5e1"/>',
         f'<line x1="{P+pw/2}" y1="{P}" x2="{P+pw/2}" y2="{P+ph}" stroke="#e2e8f0"/>',
         f'<line x1="{P}" y1="{P+ph/2}" x2="{P+pw}" y2="{P+ph/2}" stroke="#e2e8f0"/>',
         f'<text x="{P+pw/2}" y="{H-28}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#334155">{escape(xa["label"])} →</text>',
         f'<text x="{P}" y="{H-48}" font-size="10.5" fill="#64748b">{escape(xa.get("low",""))}</text>',
         f'<text x="{P+pw}" y="{H-48}" text-anchor="end" font-size="10.5" fill="#64748b">{escape(xa.get("high",""))}</text>',
         f'<text x="28" y="{P+ph/2}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#334155" transform="rotate(-90 28 {P+ph/2})">{escape(ya["label"])} →</text>',
         f'<text x="{P+8}" y="{P+ph-8}" font-size="10.5" fill="#64748b">{escape(ya.get("low",""))}</text>',
         f'<text x="{P+8}" y="{P+16}" font-size="10.5" fill="#64748b">{escape(ya.get("high",""))}</text>']
    for op in s.get("open_positions", []):
        cx, cy = X(op["x"]), Y(op["y"])
        o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="34" fill="none" stroke="#ea580c" stroke-width="2" stroke-dasharray="6 5"/>')
        o.append(f'<text x="{cx:.1f}" y="{cy+50:.1f}" text-anchor="middle" font-size="11" font-weight="700" fill="#ea580c">{escape(op.get("label","Open position"))}</text>')
    for c in sorted(comps, key=lambda c: -c.get("size", 1)):
        r = 8 + 22 * math.sqrt(c.get("size", 1) / smax)
        cx, cy = X(c["x"]), Y(c["y"])
        us = c["name"] == s.get("us")
        fill = "#0f172a" if us else col[c.get("group", "Other")]
        o.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{fill}" fill-opacity="{0.9 if us else 0.55}" stroke="{fill}"/>')
        o.append(f'<text x="{cx:.1f}" y="{cy+r+13:.1f}" text-anchor="middle" font-size="11" font-weight="{700 if us else 500}" fill="#0f172a">{escape(c["name"])}{" ["+escape(c["source"])+"]" if c.get("source") else ""}</text>')
    lx = P
    us_group = next((c.get("group") for c in comps if c["name"] == s.get("us")), None)
    for g in groups:
        if g == us_group and sum(1 for c in comps if c.get("group") == g) == 1:
            continue
        o.append(f'<circle cx="{lx+6}" cy="{P-14}" r="6" fill="{col[g]}" fill-opacity=".7"/>')
        o.append(f'<text x="{lx+16}" y="{P-10}" font-size="11" fill="#334155">{escape(g)}</text>')
        lx += 30 + 6.5 * len(g)
    o.append("</svg>")
    open(a.out, "w").write("\n".join(o))
    unsourced = [c["name"] for c in comps if not c.get("source")]
    print(f"Wrote {a.out}: {len(comps)} competitors in {len(groups)} groups, {len(s.get('open_positions', []))} open positions.")
    if unsourced:
        print(f"WARNING: positions without a source ID: {', '.join(unsourced)} (label them [HYPOTHESIS] in the write-up)")


if __name__ == "__main__":
    main()
