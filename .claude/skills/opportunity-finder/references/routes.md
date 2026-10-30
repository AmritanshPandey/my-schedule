# Routes

Pick the route from where the user is starting. Use 5–7 methods; more adds noise, not insight. Every route ends with synthesis and the Decision Tree.

## Lenses and their question

| Lens | Question | Methods |
|---|---|---|
| Customer | What progress are customers trying to make? | jtbd-map, odi-opportunity-map, customer-journey-map, demand-side-forces |
| Offer | How could the business create and capture value? | value-proposition-canvas, business-model-canvas, offer-ladder, productization-matrix |
| Capabilities & Assets | What can the business use that others may not have? | vrio-map, value-chain-opportunity-map, core-competence-map, asset-recombination-matrix |
| Market | Where is external change creating open space? | why-now-shift, pestle-opportunity-map, five-forces-map, strategic-group-map, blue-ocean-canvas |
| Strategic Choice | Which opportunity deserves attention first? | ansoff-growth-matrix, three-horizons-map, opportunity-solution-tree, opportunity-decision-tree |

A good route touches at least **three lenses**. One lens alone can only produce a one-sided view.

## Routes

### 1. "Customers have a problem" (customer-led)
jtbd-map → odi-opportunity-map → demand-side-forces → value-proposition-canvas → why-now-shift → opportunity-solution-tree → **synthesis** → opportunity-decision-tree

Add customer-journey-map when the problem sits inside an existing experience (onboarding, support, renewal).

### 2. "We have a capability or asset" (inside-out)
vrio-map → core-competence-map → asset-recombination-matrix → productization-matrix → jtbd-map (for the target customer) → ansoff-growth-matrix → **synthesis** → opportunity-decision-tree

Inside-out routes must include at least one Customer lens method. A capability without a customer job is not an opportunity.

### 3. "The market is shifting" (outside-in)
why-now-shift → pestle-opportunity-map → five-forces-map → strategic-group-map → blue-ocean-canvas → three-horizons-map → **synthesis** → opportunity-decision-tree

Add demand-side-forces before the decision to check customers will move, not just that the market is changing.

### 4. "We have an idea to test" (idea-led)
jtbd-map → demand-side-forces → business-model-canvas → vrio-map → five-forces-map → **synthesis** → opportunity-decision-tree

Place the idea honestly: if JTBD shows it is a solution looking for a job, say so early.

### 5. Service business / expertise (productize)
productization-matrix → offer-ladder → value-proposition-canvas → demand-side-forces → business-model-canvas → **synthesis** → opportunity-decision-tree

### 6. Portfolio and growth planning
three-horizons-map → ansoff-growth-matrix → value-chain-opportunity-map → why-now-shift → **synthesis** → opportunity-decision-tree per candidate

### 7. Full scan
One or two methods per lens, chosen by available evidence: jtbd-map, odi-opportunity-map, value-proposition-canvas, vrio-map, asset-recombination-matrix, why-now-shift, five-forces-map, ansoff-growth-matrix, then **synthesis** and the Decision Tree. Use it when the user wants a broad map and has time; warn that it takes longer.

## Choosing between methods in a lens

- **No customer data at all:** start with jtbd-map and produce an interview guide; skip odi-opportunity-map until there are scores.
- **Survey data available:** odi-opportunity-map with `odi_score.py` beats judgment-based ranking.
- **Crowded market:** strategic-group-map and blue-ocean-canvas.
- **Regulated or tech-driven market:** why-now-shift and pestle-opportunity-map.
- **Service company:** productization-matrix and offer-ladder.
- **Data-rich company:** asset-recombination-matrix and value-chain-opportunity-map.

## Handing off

- Validate → `strategy-sprint` (route: the matching fast route there, usually market entry, AI product bet or pricing).
- Needs sizing → `opportunity-sizing` (feature or offer value) or `market-research` (market level).
- Needs customer evidence → `assets/templates/interview-guide.md` then `user-research`.
