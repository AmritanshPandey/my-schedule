#!/usr/bin/env python3
"""Draw a Blue Ocean strategy canvas (value curves) as an SVG.

Input JSON:
{
  "title": "...",
  "factors": ["Price", "Setup effort", ...],
  "scale_max": 10,
  "curves": {"Industry average": [..], "Competitor A": [..], "Our new curve": [..]},
  "highlight": "Our new curve",
  "actions": {"Setup effort": "eliminate", "Price": "reduce", ...}   (optional)
}

Usage:
    python value_curve.py value-curve.json -o value-curve.svg
Standard library only.
"""
import argparse
import json
import sys
from xml.sax.saxutils import escape

PALETTE = ["#94a3b8", "#64748b", "#a78bfa", "#38bdf8", "#f472b6"]
HIGHLIGHT = "#ea580c"
ACTION_COLOR = {"eliminate": "#dc2626", "reduce": "#d97706", "raise": "#2563eb", "create": "#059669", "keep": "#64748b"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("-o", "--out", default="value-curve.svg")
    a = ap.parse_args()
    spec = json.load(open(a.file))
    factors = spec["factors"]
    curves = spec["curves"]
    smax = float(spec.get("scale_max", 10))
    hl = spec.get("highlight")
    actions = spec.get("actions", {})
    for name, vals in curves.items():
        if len(vals) != len(factors):
            print(f"Curve '{name}' has {len(vals)} values for {len(factors)} factors.")
            sys.exit(2)
    missing = [f for f in factors if actions and f not in actions]

    W, H = 900, 520
    L, R, T, B = 70, 30, 60, 150
    pw, ph = W - L - R, H - T - B
    step = pw / max(1, len(factors) - 1)
    X = lambda i: L + i * step
    Y = lambda v: T + ph - (float(v) / smax) * ph

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="Inter, Arial, sans-serif">',
         f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
         f'<text x="{L}" y="32" font-size="18" font-weight="700" fill="#0f172a">{escape(spec.get("title", "Strategy canvas"))}</text>']
    for k in range(0, int(smax) + 1, max(1, int(smax) // 5)):
        y = Y(k)
        o.append(f'<line x1="{L}" y1="{y:.1f}" x2="{W-R}" y2="{y:.1f}" stroke="#e2e8f0"/>')
        o.append(f'<text x="{L-10}" y="{y+4:.1f}" font-size="11" text-anchor="end" fill="#64748b">{k}</text>')
    o.append(f'<text x="18" y="{T+ph/2:.0f}" font-size="11" fill="#64748b" transform="rotate(-90 18 {T+ph/2:.0f})" text-anchor="middle">Offering level (low → high)</text>')
    for i, f in enumerate(factors):
        x = X(i)
        o.append(f'<line x1="{x:.1f}" y1="{T}" x2="{x:.1f}" y2="{T+ph}" stroke="#f1f5f9"/>')
        o.append(f'<text x="{x:.1f}" y="{T+ph+18}" font-size="11" fill="#0f172a" text-anchor="end" transform="rotate(-35 {x:.1f} {T+ph+18})">{escape(f)}</text>')
        act = actions.get(f)
        if act:
            o.append(f'<text x="{x:.1f}" y="{T-8}" font-size="9.5" font-weight="700" text-anchor="middle" fill="{ACTION_COLOR.get(act.lower(), "#64748b")}">{escape(act.upper())}</text>')
    ci = 0
    legend = []
    for name, vals in curves.items():
        is_hl = name == hl
        col = HIGHLIGHT if is_hl else PALETTE[ci % len(PALETTE)]
        if not is_hl:
            ci += 1
        pts = " ".join(f"{X(i):.1f},{Y(v):.1f}" for i, v in enumerate(vals))
        dash = "" if is_hl else 'stroke-dasharray="5 4"'
        width = 3.5 if is_hl else 2
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="{width}" {dash}/>')
        for i, v in enumerate(vals):
            o.append(f'<circle cx="{X(i):.1f}" cy="{Y(v):.1f}" r="{4.5 if is_hl else 3}" fill="{col}"/>')
        legend.append((name, col, is_hl))
    lx = L
    for name, col, is_hl in legend:
        o.append(f'<rect x="{lx}" y="{H-22}" width="14" height="4" fill="{col}"/>')
        o.append(f'<text x="{lx+20}" y="{H-17}" font-size="11.5" font-weight="{700 if is_hl else 400}" fill="#0f172a">{escape(name)}</text>')
        lx += 30 + 7.2 * len(name)
    o.append("</svg>")
    open(a.out, "w").write("\n".join(o))
    print(f"Wrote {a.out} ({len(factors)} factors, {len(curves)} curves).")
    if missing:
        print(f"WARNING: no eliminate/reduce/raise/create/keep action for: {', '.join(missing)}")
        sys.exit(1)
    if hl and hl in curves:
        base = [c for n, c in curves.items() if n != hl]
        if base:
            avg = [sum(c[i] for c in base) / len(base) for i in range(len(factors))]
            div = sum(abs(curves[hl][i] - avg[i]) for i in range(len(factors))) / len(factors)
            print(f"Divergence of '{hl}' from the others: average {div:.1f} points per factor "
                  f"({'clearly divergent' if div >= 2 else 'close to the pack: sharpen the curve'}).")


if __name__ == "__main__":
    main()
