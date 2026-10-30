# Synthesis: the Business Opportunity Map

The map is the point of the whole exercise. It shows where several lenses point the same way, and how sure we are.

## 1. Consolidate candidates

From `opportunity-output/candidates.md`:

- Merge duplicates and near-duplicates (the same customer job served a different way is one candidate with two solution options).
- Write each candidate as: **who** (segment), **what problem or outcome**, **how we would serve it**. One line.
- Keep 3–8 candidates. If there are more, keep the ones with at least one moderate or strong signal and park the rest as "not yet supported".
- Always keep a **"do more of what we do today"** candidate as the baseline.

## 2. Fill the convergence matrix

For each candidate and each lens, take the strongest relevant signal from that lens's method outputs:

| Score | Meaning |
|---|---|
| +2 | Strongly supports |
| +1 | Supports |
| 0 | Neutral or not examined |
| −1 | Weakens |
| −2 | Strongly argues against |

Each cell also gets an **evidence level** (strong / moderate / weak / assumed from `evidence-rules.md`) and a short note citing the method file and source IDs. Write it in `convergence.json` (template in `assets/templates/`). Leave a lens at 0 with evidence "none" if it was not examined. Do not guess.

## 3. Run the script

```
python scripts/convergence.py opportunity-output/convergence.json -o opportunity-output/
```

The script:

- weights each score by evidence (strong 1.0, moderate 0.7, weak 0.4, assumed 0.15);
- counts **supporting lenses** (weighted score ≥ +0.5) and **blocking lenses** (≤ −1.0, for example −2 with moderate evidence or −1 with strong evidence);
- ranks candidates by weighted total, and flags any candidate whose rank depends mostly on assumed signals;
- checks the five opportunity conditions where the JSON records them;
- writes `opportunity-map.md` and `opportunity-map.html` (a one-page visual heatmap).

## 4. Read the map

Look for:

- **Convergence:** supported by 3+ lenses, no blocking lens. These are the real candidates.
- **Promising but thin:** high scores mostly from assumed or weak evidence. These go to Explore, with an evidence plan.
- **One-lens wonders:** strong in one lens only (often a trend or a capability with no customer). Name the missing lens.
- **Blocked:** any lens at −2 with strong evidence. Name it; strengths elsewhere do not cancel it without a stated reason.

## 5. The five conditions

For the top 3 candidates, write one line each with labels:

| Condition | Question | Typical source method |
|---|---|---|
| Problem | Is the job or outcome important and poorly served? | jtbd-map, odi-opportunity-map |
| Customers act | Will they switch and pay? | demand-side-forces, value-proposition-canvas |
| Why now | What changed? | why-now-shift, pestle-opportunity-map |
| Value capture | Is there a business model that works? | business-model-canvas, offer-ladder |
| Advantage | Why us? | vrio-map, core-competence-map |

A candidate missing any condition cannot be Validate; at best Explore or Pause.

## 6. Size before deciding

Use `opportunity-sizing` (driver tree, low / base / high) for the top candidates. Record the base case and the biggest swing driver in the map. Unsized candidates stay at Explore.

## 7. Write the map

Use `assets/templates/opportunity-map.md` (the script fills most of it). The final map has:

1. The question and the business in two lines
2. Top opportunity spaces (up to 3), each with the five conditions, size range, decision and next step
3. The convergence heatmap
4. Promising but thin candidates and what evidence would move them
5. Rejected or paused candidates and why
6. Key assumptions to test, in order
7. Sources used

Keep it to one page plus the heatmap. Detail lives in the method files.
