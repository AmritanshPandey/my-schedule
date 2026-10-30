# Strategic Group Map

**Lens:** Market · **Method 16 of 21** · **Output:** `opportunity-output/16-strategic-group-map.md`

**Question:** Where are competitors clustered, and is there an open position customers would value?

## Why it matters

Competitors often crowd into the same corner. An empty corner is only an opportunity if customers want it.

## Use when

- Crowded markets; positioning decisions.

## Needs

- Competitor list with evidence on the dimensions customers use to choose
- Business profile (`opportunity-output/business-profile.md`)

## Steps

1. Choose two dimensions customers actually use to decide (for example, price level and depth of service), not internal categories.
2. Place competitors, sized by revenue or share where known. Use `scripts/strategic_groups.py` to draw the map.
3. Describe each group: typical customer, strategy, strengths.
4. Find open positions and test each: is it empty because nobody wants it, or because it is hard to serve?

## Checks

- [ ] Dimensions are customer decision criteria.
- [ ] Positions sourced.
- [ ] Empty spaces tested for demand.
- [ ] Material claims labeled per `references/evidence-rules.md`

## Output

- Strategic group map (SVG)
- Group profiles
- Open positions and demand test
- **Signals for the map:** 1–3 candidate opportunities this supports or weakens, each with strength (strong / moderate / weak / assumed) and source IDs

## Reading the signal

An open position with evidence of unmet demand is a strong market signal; an empty corner with no demand is neutral or negative.

## Script

`scripts/strategic_groups.py`. Paste its output; do not retype numbers.

*Method origin: Michael Hunt; Michael Porter.*
