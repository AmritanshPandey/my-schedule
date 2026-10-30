#!/usr/bin/env python3
"""Build the Business Opportunity Map from a convergence matrix.

Each candidate opportunity gets, per lens, a score from -2 to +2 and an
evidence level (strong, moderate, weak, assumed, none). Scores are weighted
by evidence so that assumed signals cannot outvote real ones:

    strong 1.0 · moderate 0.7 · weak 0.4 · assumed 0.15 · none 0

Outputs (to the folder given with -o):
    opportunity-map.md    ranked map with conditions, flags and next steps
    opportunity-map.html  one-page visual heatmap (self-contained)

Usage:
    python convergence.py convergence.json -o opportunity-output/
Standard library only.
"""
import argparse
import html
import json
import os
import sys

W = {"strong": 1.0, "moderate": 0.7, "weak": 0.4, "assumed": 0.15, "none": 0.0}
CONDITIONS = ["problem", "customers_act", "why_now", "value_capture", "advantage"]
COND_LABEL = {"problem": "Problem", "customers_act": "Customers act", "why_now": "Why now",
              "value_capture": "Value capture", "advantage": "Advantage"}


def analyse(spec, problems):
    lenses = spec["lenses"]
    out = []
    for c in spec["candidates"]:
        cells = c.get("cells", {})
        wsum, raw_assumed, raw_real, sup, blk, missing = 0.0, 0.0, 0.0, [], [], []
        for l in lenses:
            cell = cells.get(l, {"score": 0, "evidence": "none"})
            sc = float(cell.get("score", 0))
            ev = str(cell.get("evidence", "none")).lower()
            if ev not in W:
                problems.append(f"{c['name']} / {l}: unknown evidence level '{ev}'")
                ev = "none"
            if not -2 <= sc <= 2:
                problems.append(f"{c['name']} / {l}: score {sc} outside -2..+2")
            if sc != 0 and ev == "none":
                problems.append(f"{c['name']} / {l}: non-zero score with evidence 'none'")
            ws = sc * W[ev]
            wsum += ws
            if ev == "assumed":
                raw_assumed += abs(ws)
            else:
                raw_real += abs(ws)
            if ws >= 0.5:
                sup.append(l)
            if ws <= -1.0:
                blk.append(l)
            if ev == "none":
                missing.append(l)
        conds = c.get("conditions", {})
        cond_fail = [k for k in CONDITIONS if str(conds.get(k, "unknown")).lower() in ("fail", "unknown")]
        thin = raw_assumed > raw_real
        if blk:
            status = "Blocked"
        elif len(sup) >= 3 and not thin:
            status = "Converging"
        elif len(sup) >= 2 and thin:
            status = "Promising but thin"
        elif len(sup) == 1:
            status = "One-lens"
        else:
            status = "Weak"
        out.append(dict(c=c, score=wsum, sup=sup, blk=blk, missing=missing, thin=thin, status=status,
                        conds=conds, cond_fail=cond_fail))
    out.sort(key=lambda r: -r["score"])
    return out


def suggest(r):
    if r["blk"]:
        return "Pause or Reject unless the blocking lens can be answered: " + ", ".join(r["blk"])
    if r["status"] == "Converging" and not r["cond_fail"]:
        return "Run the Decision Tree; Validate is possible"
    if r["status"] == "Converging":
        return "Close condition gaps first: " + ", ".join(COND_LABEL[k] for k in r["cond_fail"])
    if r["status"] == "Promising but thin":
        return "Explore: replace assumed signals with evidence (interview guide, data pull)"
    if r["status"] == "One-lens":
        return "Explore: examine missing lenses: " + ", ".join(r["missing"][:3])
    return "Park"


def write_md(spec, res, path):
    lenses = spec["lenses"]
    L = [f"# Business Opportunity Map", "",
         f"**Question:** {spec.get('question', '')}", f"**Business:** {spec.get('business', '')}",
         f"**As of:** {spec.get('as_of', '')}", "",
         "Scores are weighted by evidence (strong 1.0, moderate 0.7, weak 0.4, assumed 0.15). "
         "Supporting lens = weighted score ≥ +0.5; blocking lens = ≤ −1.0.", "",
         "## Ranking", "",
         "| # | Candidate | Weighted score | Supporting lenses | Blocking | Status | Suggested next step |",
         "|---|---|---|---|---|---|---|"]
    for i, r in enumerate(res, 1):
        L.append(f"| {i} | **{r['c']['name']}** | {r['score']:+.2f} | {len(r['sup'])} ({', '.join(r['sup']) or '-'}) | "
                 f"{', '.join(r['blk']) or '-'} | {r['status']}{' ⚠ mostly assumed' if r['thin'] else ''} | {suggest(r)} |")
    L += ["", "## Convergence matrix", "", "| Candidate | " + " | ".join(lenses) + " |", "|---|" + "---|" * len(lenses)]
    for r in res:
        cells = r["c"].get("cells", {})
        row = []
        for l in lenses:
            cell = cells.get(l, {"score": 0, "evidence": "none"})
            row.append(f"{int(cell.get('score', 0)):+d} ({cell.get('evidence', 'none')})")
        L.append(f"| {r['c']['name']} | " + " | ".join(row) + " |")
    L += ["", "## Five conditions (top 3)", "", "| Candidate | " + " | ".join(COND_LABEL[k] for k in CONDITIONS) + " | Size |",
          "|---|" + "---|" * (len(CONDITIONS) + 1)]
    for r in res[:3]:
        L.append(f"| {r['c']['name']} | " + " | ".join(str(r["conds"].get(k, "unknown")) for k in CONDITIONS)
                 + f" | {r['c'].get('size', 'not sized')} |")
    L += ["", "## Candidate notes", ""]
    for r in res:
        c = r["c"]
        L.append(f"### {c['name']}")
        L.append(c.get("description", ""))
        for l in lenses:
            cell = c.get("cells", {}).get(l)
            if cell and cell.get("note"):
                L.append(f"- **{l}:** {cell['note']}")
        if c.get("next"):
            L.append(f"- **Next:** {c['next']}")
        L.append("")
    if spec.get("assumptions"):
        L += ["## Key assumptions to test (in order)", ""] + [f"{i}. {a}" for i, a in enumerate(spec["assumptions"], 1)] + [""]
    open(path, "w").write("\n".join(L))


def color(ws):
    if ws >= 1.2:
        return "#059669", "#fff"
    if ws >= 0.5:
        return "#6ee7b7", "#064e3b"
    if ws > -0.5:
        return "#f1f5f9", "#475569"
    if ws > -1.2:
        return "#fca5a5", "#7f1d1d"
    return "#dc2626", "#fff"


def write_html(spec, res, path):
    lenses = spec["lenses"]
    e = html.escape
    rows = []
    for i, r in enumerate(res, 1):
        tds = []
        for l in lenses:
            cell = r["c"].get("cells", {}).get(l, {"score": 0, "evidence": "none"})
            ev = str(cell.get("evidence", "none")).lower()
            ws = float(cell.get("score", 0)) * W.get(ev, 0)
            bg, fg = color(ws)
            tip = e(cell.get("note", ""))
            tds.append(f'<td style="background:{bg};color:{fg}" title="{tip}"><b>{int(cell.get("score",0)):+d}</b><small>{e(ev)}</small></td>')
        st = r["status"]
        stc = {"Converging": "#059669", "Promising but thin": "#d97706", "One-lens": "#64748b", "Blocked": "#dc2626", "Weak": "#94a3b8"}[st]
        conds = "".join(
            f'<span class="cd {str(r["conds"].get(k,"unknown")).lower()}">{COND_LABEL[k]}</span>' for k in CONDITIONS)
        rows.append(f'<tr><th><span class="rk">{i}</span>{e(r["c"]["name"])}<small>{e(r["c"].get("description",""))}</small><div class="cds">{conds}</div></th>'
                    + "".join(tds) + f'<td class="sc">{r["score"]:+.2f}</td><td><span class="st" style="background:{stc}">{e(st)}</span><small>{e(suggest(r))}</small></td></tr>')
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Business Opportunity Map</title><style>
body{{font-family:Inter,system-ui,Arial,sans-serif;margin:0;background:#f8fafc;color:#0f172a;padding:28px 16px}}
.w{{max-width:1180px;margin:0 auto}} h1{{margin:0;font-size:26px}} .q{{color:#475569;margin:6px 0 2px}} .m{{color:#64748b;font-size:13px}}
.tbl{{overflow-x:auto;margin-top:18px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}}
table{{border-collapse:collapse;width:100%;min-width:820px}} th,td{{padding:10px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:13px;vertical-align:middle}}
thead th{{background:#0f172a;color:#fff;font-size:12px;letter-spacing:.04em}} tbody th{{text-align:left;width:300px;font-weight:700}}
tbody th small,td small{{display:block;font-weight:400;color:#64748b;font-size:11px;margin-top:3px}} td[title] small{{color:inherit;opacity:.85}} td b{{font-size:15px}}
.rk{{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#0f172a;color:#fff;font-size:11px;margin-right:6px}}
.sc{{font-weight:800;font-size:15px}} .st{{color:#fff;border-radius:12px;padding:3px 9px;font-size:11px;font-weight:700;white-space:nowrap}}
.cds{{margin-top:6px;display:flex;flex-wrap:wrap;gap:4px}} .cd{{font-size:10px;border-radius:8px;padding:2px 6px;background:#f1f5f9;color:#475569}}
.cd.pass{{background:#d1fae5;color:#065f46}} .cd.weak{{background:#fef3c7;color:#92400e}} .cd.fail{{background:#fee2e2;color:#991b1b}}
.lg{{margin-top:12px;font-size:12px;color:#475569;display:flex;flex-wrap:wrap;gap:14px}} .lg i{{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:4px}}
</style></head><body><div class="w">
<h1>Business Opportunity Map</h1><p class="q"><b>Question:</b> {e(spec.get('question',''))}</p>
<p class="m">{e(spec.get('business',''))} · as of {e(spec.get('as_of',''))} · cells show lens score (−2..+2) and evidence level; hover a cell for the note</p>
<div class="tbl"><table><thead><tr><th>Candidate</th>{''.join(f'<th>{e(l)}</th>' for l in lenses)}<th>Weighted</th><th>Status · next step</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>
<div class="lg"><span><i style="background:#059669"></i>strong support</span><span><i style="background:#6ee7b7"></i>support</span><span><i style="background:#f1f5f9;border:1px solid #cbd5e1"></i>neutral / not examined</span><span><i style="background:#fca5a5"></i>weakens</span><span><i style="background:#dc2626"></i>blocks</span><span>Condition chips: green pass · amber weak · red fail · grey unknown</span></div>
</div></body></html>"""
    open(path, "w").write(doc)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file")
    ap.add_argument("-o", "--out", default=".")
    a = ap.parse_args()
    spec = json.load(open(a.file))
    problems = []
    res = analyse(spec, problems)
    os.makedirs(a.out, exist_ok=True)
    write_md(spec, res, os.path.join(a.out, "opportunity-map.md"))
    write_html(spec, res, os.path.join(a.out, "opportunity-map.html"))
    print(f"{'#':<3}{'Candidate':<44}{'Score':>7}  Support  Status")
    for i, r in enumerate(res, 1):
        print(f"{i:<3}{r['c']['name'][:43]:<44}{r['score']:+7.2f}  {len(r['sup'])}/{len(spec['lenses'])}      {r['status']}{' (mostly assumed)' if r['thin'] else ''}")
    print(f"\nWrote {os.path.join(a.out, 'opportunity-map.md')} and opportunity-map.html")
    if not any("today" in r["c"]["name"].lower() or "baseline" in r["c"]["name"].lower() for r in res):
        problems.append("no baseline candidate (for example 'Do more of what we do today')")
    if problems:
        print("\nWARNINGS:")
        for p in problems:
            print(f"  - {p}")
        sys.exit(1)


if __name__ == "__main__":
    main()
