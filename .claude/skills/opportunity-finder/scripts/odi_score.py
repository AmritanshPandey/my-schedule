#!/usr/bin/env python3
"""Outcome-Driven Innovation opportunity scores from survey data.

Input: a CSV with one row per respondent per outcome:
    respondent_id, segment, outcome, importance, satisfaction

Scores:
  --scale 10 (default): importance and satisfaction are 1-10 ratings; the
      score for each is the mean rating.
  --scale 5: ratings are 1-5; the score is the share of respondents rating
      4 or 5 ("top-two-box") x 10, the usual ODI convention.

Opportunity = importance + max(importance - satisfaction, 0)

Bands: >15 strongly underserved, 12-15 underserved, 10-12 appropriately
served, <10 over-served. Segments with fewer than --min-n respondents
(default 30) are flagged as directional.

Usage:
    python odi_score.py survey.csv [--scale 5|10] [--min-n 30] [--segment all]
Standard library only.
"""
import argparse
import csv
import sys
from collections import defaultdict


def band(o):
    if o > 15:
        return "strongly underserved"
    if o >= 12:
        return "underserved"
    if o >= 10:
        return "appropriately served"
    return "over-served"


def score(vals, scale):
    if not vals:
        return 0.0
    if scale == 5:
        return 10 * sum(1 for v in vals if v >= 4) / len(vals)
    return sum(vals) / len(vals)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("--scale", type=int, choices=(5, 10), default=10)
    ap.add_argument("--min-n", type=int, default=30)
    ap.add_argument("--segment", default=None, help="only this segment (default: all segments plus total)")
    a = ap.parse_args()

    data = defaultdict(lambda: defaultdict(lambda: {"imp": [], "sat": [], "ids": set()}))
    bad = 0
    with open(a.file, newline="") as fh:
        for r in csv.DictReader(fh):
            try:
                imp, sat = float(r["importance"]), float(r["satisfaction"])
            except (KeyError, ValueError):
                bad += 1
                continue
            lo, hi = (1, 5) if a.scale == 5 else (1, 10)
            if not (lo <= imp <= hi and lo <= sat <= hi):
                bad += 1
                continue
            seg = (r.get("segment") or "all").strip() or "all"
            out = r["outcome"].strip()
            for s in ({seg, "TOTAL"} if not a.segment else ({seg} if seg == a.segment else set())):
                d = data[s][out]
                d["imp"].append(imp)
                d["sat"].append(sat)
                d["ids"].add(r.get("respondent_id", ""))

    if not data:
        print("No valid rows found.")
        sys.exit(2)

    segs = sorted(data, key=lambda s: (s == "TOTAL", s))
    print(f"Scale 1-{a.scale} ({'top-two-box x 10' if a.scale == 5 else 'mean rating'}) · opportunity = imp + max(imp - sat, 0)")
    if bad:
        print(f"Skipped {bad} invalid rows (missing or out-of-range ratings).")
    flagged = []
    for s in segs:
        rows = []
        for out, d in data[s].items():
            imp, sat = score(d["imp"], a.scale), score(d["sat"], a.scale)
            opp = imp + max(imp - sat, 0)
            rows.append((opp, out, imp, sat, len(d["ids"]) or len(d["imp"])))
        rows.sort(reverse=True)
        n_seg = max(r[4] for r in rows)
        note = "" if n_seg >= a.min_n else f"  [DIRECTIONAL: n={n_seg} < {a.min_n}]"
        if note:
            flagged.append(s)
        print(f"\n== Segment: {s} (n up to {n_seg}){note} ==")
        print(f"  {'Outcome':<52} {'Imp':>5} {'Sat':>5} {'Opp':>6}  n    Band")
        for opp, out, imp, sat, n in rows:
            print(f"  {out[:52]:<52} {imp:5.1f} {sat:5.1f} {opp:6.1f}  {n:<4} {band(opp)}")
        top = [r for r in rows if r[0] >= 12]
        if top:
            print(f"  Top underserved: {top[0][1]} ({top[0][0]:.1f})")

    # biggest segment differences
    real = [s for s in segs if s != "TOTAL"]
    if len(real) > 1:
        print("\n== Largest differences between segments ==")
        outs = set().union(*(data[s].keys() for s in real))
        diffs = []
        for out in outs:
            vals = []
            for s in real:
                if out in data[s]:
                    d = data[s][out]
                    imp, sat = score(d["imp"], a.scale), score(d["sat"], a.scale)
                    vals.append((imp + max(imp - sat, 0), s))
            if len(vals) > 1:
                hi, lo = max(vals), min(vals)
                diffs.append((hi[0] - lo[0], out, hi, lo))
        for dif, out, hi, lo in sorted(diffs, reverse=True)[:5]:
            print(f"  {out[:50]:<50} {hi[1]} {hi[0]:.1f} vs {lo[1]} {lo[0]:.1f} (gap {dif:.1f})")

    print()
    if flagged:
        print(f"RESULT: scored; directional only for: {', '.join(flagged)}. Label these as [ESTIMATE] with the sample size.")
    else:
        print("RESULT: scored. Cite the survey's source ID when using these numbers.")


if __name__ == "__main__":
    main()
