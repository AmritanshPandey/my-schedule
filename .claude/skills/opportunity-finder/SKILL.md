---
name: opportunity-finder
description: >
  Finds and tests business opportunities by looking at one business through five
  lenses (Customer, Offer, Capabilities & Assets, Market, Strategic Choice) using 21
  proven methods such as Jobs-to-be-Done, ODI opportunity scoring, Value Proposition and
  Business Model Canvas, VRIO, Five Forces, Blue Ocean, Ansoff, Three Horizons and an
  Opportunity Solution Tree, then synthesizes where the lenses agree into a one-page
  Business Opportunity Map with an Explore / Validate / Pause / Reject call. Use this
  skill when the user asks "where should we grow", "find opportunities for my business",
  "what should we build next", "is there an opportunity in X", "which customer problem is
  worth solving", "how can we use our data or expertise", "productize our service",
  "new revenue streams", "why now", or wants any of these frameworks applied. Evidence is
  labeled, so ideas are never passed off as findings. Part of the Opportunity
  Discovery pack; validated opportunities hand off to strategy-sprint.
---

> **Opportunity Discovery pack.** `opportunity-finder` (this skill). Upstream: `user-research`, `market-research`. Downstream: `opportunity-sizing` → `strategy-sprint` → `prd-writer`. Challenge with the `strategy-red-team` sub-agent.

# Opportunity Finder

AI makes ideas cheap. Opportunities are still rare. An idea becomes an opportunity when five things line up:

1. **A problem or outcome that matters** to a specific customer
2. **Customers who will act**, not just agree it would be nice
3. **A change that makes it timely** (why now, not five years ago)
4. **A credible way to create and capture value**
5. **An advantage this business can actually use**

This skill looks at one business through several lenses and keeps only what more than one lens supports. You run the methods, keep evidence honest, and build the map. You do not pick the direction for the user.

## Ground rules

- **Label every material claim** (`references/evidence-rules.md`): `[FACT S#]`, `[ESTIMATE S#]`, `[INFERENCE]`, `[HYPOTHESIS]`, `[UNKNOWN]`. Scores you make up without customer data are `[HYPOTHESIS]`, never findings.
- **No invented customers, quotes, survey results, competitor facts or market numbers.** Write `[UNKNOWN]` and say what evidence would fill it.
- **Ideas are welcome, but kept separate.** Brainstormed options live in "Candidate opportunities", never in "Evidence".
- **Read-only default.** No contacting customers, buying data or publishing without explicit approval. Write files only to `opportunity-output/`.

## Step 1 — Business profile (once)

If `opportunity-output/business-profile.md` exists, read it and continue. Otherwise fill `assets/templates/business-profile.md` with the user, then save it to `opportunity-output/`. Ask only for what is missing, and no more than five questions at a time:

- what the business sells, to whom, and how it makes money
- customers and segments, with any research, tickets, reviews or usage data available
- capabilities, assets, data and expertise
- the market and main competitors
- goals, constraints (money, people, time) and anything off-limits

Start the source ledger (`assets/templates/source-ledger.csv`). Every piece of evidence the user shares gets an ID.

## Step 2 — Pick a route

Ask where the user is starting, or infer it, then propose the route from `references/routes.md`:

| Starting point | Typical route (5–7 methods) |
|---|---|
| **"Customers have a problem"** | JTBD → ODI → Demand-Side Forces → Value Proposition → Why Now → Opportunity Solution Tree → Decision Tree |
| **"We have a capability or asset"** | VRIO → Core Competence → Asset Recombination → Productization → Value Proposition → Ansoff → Decision Tree |
| **"The market is shifting"** | Why Now → PESTLE → Five Forces → Strategic Groups → Blue Ocean → Three Horizons → Decision Tree |
| **"We have an idea to test"** | JTBD → Demand-Side Forces → Business Model Canvas → VRIO → Five Forces → Decision Tree |
| **Full scan** | One or two methods per lens, then synthesis |

Show the route as a short list with one line on why each method is in it. Proceed when the user agrees, or adjusts it.

## Step 3 — Run the methods

For each method in the route:

1. Load its playbook from `references/methods/<method>.md` (one at a time).
2. Use the business profile and earlier outputs; ask only for what is missing.
3. Write the output to `opportunity-output/NN-<method>.md`. Each output ends with **"Signals for the map"**: 1–3 candidate opportunities it supports or weakens, each with its strength (strong / moderate / weak) and evidence label.
4. Run the script if the method has one (table below).

Keep a running list of **candidate opportunities** in `opportunity-output/candidates.md`: a short name, one-line description, and which methods mention it.

## Step 4 — Synthesize the Business Opportunity Map

Follow `references/synthesis.md`:

1. Merge duplicate candidates and keep 3–8 distinct ones.
2. Fill the convergence matrix (`assets/templates/convergence.json`): for each candidate, the strongest signal from each lens (−2 to +2) and its evidence level.
3. Run `scripts/convergence.py`. It weights scores by evidence strength, shows which candidates have support from 3 or more lenses, and writes the map as markdown and as a visual HTML page.
4. Check the five conditions above for the top 3: problem, customers who act, why now, value capture, advantage.
5. Size the top candidates before any decision: use `opportunity-sizing` (or `market-research` for market-level size). Unsized candidates stay at Explore.

## Step 5 — Challenge, then decide

- Run the **Opportunity Decision Tree** (`references/methods/opportunity-decision-tree.md`) on the top 1–3 candidates: demand, fit, advantage, feasibility → Explore / Validate / Pause / Reject.
- Before the call is final, challenge the leading candidate in a fresh context: the `strategy-red-team` sub-agent in Claude Code, or a new chat in claude.ai given only the map and evidence.

## Step 6 — Hand off

| Decision | Next step |
|---|---|
| **Validate** | Hand the opportunity, map and ledger to `strategy-sprint` (Problem Framer starts from the decision tree's "what would change the decision") |
| **Explore** | Build an interview guide from `assets/templates/interview-guide.md`, then `user-research` to synthesize what comes back |
| **Pause** | Record the trigger that would reopen it in the map |
| **Reject** | Record why, so the idea is not re-argued from scratch next quarter |

## Methods (load one at a time from `references/methods/`)

| Lens | Method | Answers |
|---|---|---|
| Customer | `jtbd-map` | What progress is the customer trying to make, and what triggers the search? |
| Customer | `odi-opportunity-map` | Which outcomes are important and poorly served? |
| Customer | `customer-journey-map` | Where does the experience break, and what does it cost? |
| Customer | `demand-side-forces` | Will customers actually switch: push, pull, habit, anxiety? |
| Offer | `value-proposition-canvas` | Does the offer relieve the pains that matter most? |
| Offer | `business-model-canvas` | How would this create, deliver and capture value, and where is it weakest? |
| Offer | `offer-ladder` | How does one capability become entry, core, premium and recurring offers? |
| Offer | `productization-matrix` | Which parts of expert work can become products? |
| Capabilities & Assets | `vrio-map` | Which resources are a real advantage? |
| Capabilities & Assets | `value-chain-opportunity-map` | Which activities create value we are not capturing? |
| Capabilities & Assets | `core-competence-map` | What are we genuinely distinctive at, and where else does it apply? |
| Capabilities & Assets | `asset-recombination-matrix` | What new value comes from combining assets we already have? |
| Market | `why-now-shift` | What changed (technology, AI, regulation, behavior) that opens this now? |
| Market | `pestle-opportunity-map` | Which external shifts create openings or threats for this business? |
| Market | `five-forces-map` | Is the space structurally attractive, and what limits profit? |
| Market | `strategic-group-map` | Where are competitors clustered, and where is open space? |
| Market | `blue-ocean-canvas` | What could we eliminate, reduce, raise or create to stand apart? |
| Strategic Choice | `ansoff-growth-matrix` | Which growth path (penetrate, develop product, develop market, diversify) and at what risk? |
| Strategic Choice | `three-horizons-map` | Is the portfolio balanced between today, next and future? |
| Strategic Choice | `opportunity-solution-tree` | Which solutions could move the outcome, and what should we test first? |
| Strategic Choice | `opportunity-decision-tree` | Explore, Validate, Pause or Reject? |

## Scripts (Python 3, standard library only)

| Script | Use it for | Example |
|---|---|---|
| `scripts/odi_score.py` | Opportunity scores from survey data, by segment, with sample sizes | `python scripts/odi_score.py assets/templates/odi-survey.csv` |
| `scripts/value_curve.py` | Blue Ocean strategy canvas as an SVG | `python scripts/value_curve.py assets/templates/value-curve.json -o opportunity-output/value-curve.svg` |
| `scripts/strategic_groups.py` | Strategic group map as an SVG | `python scripts/strategic_groups.py assets/templates/strategic-groups.json -o opportunity-output/strategic-groups.svg` |
| `scripts/convergence.py` | Convergence matrix → Business Opportunity Map (markdown + HTML) | `python scripts/convergence.py assets/templates/convergence.json -o opportunity-output/` |

## Templates (`assets/templates/`)

`business-profile.md`, `source-ledger.csv`, `odi-survey.csv`, `value-curve.json`, `strategic-groups.json`, `convergence.json`, `opportunity-map.md`, `interview-guide.md`.

A complete fictional run is in `examples/worked-example.md`. Test prompts are in `evals/evals.json`.

## Credits

The methods are established frameworks, rewritten here as working procedures: Jobs-to-be-Done (Clayton Christensen, Bob Moesta), Outcome-Driven Innovation (Tony Ulwick), Value Proposition and Business Model Canvas (Alexander Osterwalder, Strategyzer), VRIO (Jay Barney), Value Chain and Five Forces (Michael Porter), Core Competence (C.K. Prahalad and Gary Hamel), Blue Ocean Strategy (W. Chan Kim and Renée Mauborgne), Ansoff Matrix (Igor Ansoff), Three Horizons (Baghai, Coley and White, McKinsey), Opportunity Solution Tree (Teresa Torres), and the Forces of Progress (Bob Moesta, Chris Spiek).
