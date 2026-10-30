# ODI Opportunity Map

**Lens:** Customer · **Method 02 of 21** · **Output:** `opportunity-output/02-odi-opportunity-map.md`

**Question:** Which desired outcomes are important to customers and poorly served today?

## Why it matters

Importance alone points to crowded, well-served needs. The gap between importance and satisfaction is where customers are open to something better.

## Use when

- There is a list of customer outcomes and a way to rate them, ideally a survey.

## Needs

- Segment
- Desired outcomes (from JTBD or research)
- Importance and satisfaction ratings, ideally from a survey (`assets/templates/odi-survey.csv`)
- Business profile (`opportunity-output/business-profile.md`)

## Steps

1. Rewrite each want as a measurable outcome: "minimize the time it takes to ___", "reduce the likelihood of ___", "increase ___".
2. Rate importance and satisfaction separately, on 1–10. Use survey data if any exists. If not, ratings are `[HYPOTHESIS]` from named team members and the output says so.
3. Score each outcome: **opportunity = importance + max(importance − satisfaction, 0)**. The gap only counts when it is positive; an over-served outcome is not a negative opportunity. With survey data, run `scripts/odi_score.py`.
4. Classify: above 15 strongly underserved, 12–15 underserved, 10–12 appropriately served, under 10 over-served (a candidate for simplification or a cheaper offer).
5. Compare segments: an outcome can be underserved for one segment and fine for another.
6. Pick the top underserved outcome and say why current solutions fail it.

## Checks

- [ ] Outcomes are measurable, not restated wishes.
- [ ] Importance and satisfaction scored separately.
- [ ] The formula uses max(gap, 0).
- [ ] Sample size stated; under 30 per segment flagged as directional.
- [ ] Material claims labeled per `references/evidence-rules.md`

## Output

- Outcome table with importance, satisfaction, opportunity score, label
- Underserved and over-served lists
- Segment differences
- Top outcome to pursue and why it is underserved
- **Signals for the map:** 1–3 candidate opportunities this supports or weakens, each with strength (strong / moderate / weak / assumed) and source IDs

## Reading the signal

Strongly underserved outcomes backed by survey data are strong signals; judgment-based scores are weak.

## Script

`scripts/odi_score.py`. Paste its output; do not retype numbers.

*Method origin: Anthony Ulwick (Strategyn).*
