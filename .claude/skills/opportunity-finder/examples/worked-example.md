# Worked example: where should a clinic-scheduling company grow?

> **Fictional company, illustrative data.** Helio Health and every number here are invented to show how the skill works. The survey in `assets/templates/odi-survey.csv` is synthetic. The map, strategy canvas and group map in `sample-output/` were produced by the scripts from the templates.

## The ask

> "We sell scheduling software to clinics with 20–200 clinicians. Growth is slowing. Where should we go next?"

## Step 1: Business profile

Filled from `assets/templates/business-profile.md` in five questions. Evidence the user shared, entered in the ledger:

| ID | Source |
|---|---|
| S1 | 12 customer interviews (customer success notes) |
| S2 | Outcome survey, 80 clinics in two segments |
| S3, S4 | Competitor websites and pricing pages |
| S5 | Payer API rule announcement |
| S6 | Dental software market report |

## Step 2: Route

The user said "customers keep complaining about prior authorization", so the route is **customer-led**: jtbd-map → odi-opportunity-map → demand-side-forces → value-proposition-canvas → why-now-shift → strategic-group-map (added because the market looks crowded) → synthesis → opportunity-decision-tree. Team members also proposed two ideas (benchmark reports, dental expansion), so they were added as candidates to test, not as findings.

## Step 3: Methods (highlights)

**JTBD.** "When a procedure needs payer approval, I want to get a decision without chasing the portal, so I can keep the schedule full and avoid unpaid work." Trigger: a booking for a procedure on the payer's list. Workaround: staff re-type data into payer portals and call for status. `[FACT S1]` (9 of 12 interviews).

**ODI** (`odi_score.py` on 80 responses, both segments n ≥ 30):

```
Minimize time to get a payer decision        imp 9.0  sat 3.3  opp 14.7  underserved
Reduce the likelihood of a denied claim      imp 8.4  sat 4.5  opp 12.3  underserved
Minimize time spent re-entering patient data imp 7.2  sat 4.0  opp 10.4  appropriately served
```

Segment split: data re-entry is strongly underserved for smaller clinics (13.2) but not larger ones (7.2). One opportunity, two messages.

**Demand-side forces.** Push high (lost revenue on delays) `[FACT S1]`; pull medium; habit medium (staff know the portals); anxiety high (fear of wrong submissions) `[INFERENCE]`. The force to act on is anxiety: offer human review of the first 50 requests.

**Why now.** New payer API rules require electronic prior-auth endpoints `[FACT S5]`, and document-reading models are now reliable enough to pre-fill requests `[HYPOTHESIS]` (no eval yet). Window: about 18 months before suites bundle it `[INFERENCE]`.

**Strategic groups** (`strategic_groups.py`): suites sit at premium, highly automated; form tools at cheap, manual. "Affordable and automated" is empty. Demand check: the ODI score and interviews suggest customers want it; it is not empty for lack of demand.

## Step 4: Synthesis

`convergence.py` output (`sample-output/opportunity-map.md` and `.html`):

```
1  AI prior-authorization assistant           +5.20  4/5  Converging
2  Benchmarking reports from scheduling data  +1.85  1/5  One-lens
3  Do more of what we do today (baseline)     +1.00  2/5  Weak
4  Expand to dental groups                    -1.60  0/5  Blocked
```

- **AI prior-auth** converges across four lenses. Conditions: problem pass, why-now pass, advantage pass, customers-act weak, value capture weak.
- **Benchmarking** looks good only from the capabilities lens. Its customer and offer support is assumed. Next: 8 interviews using the guide, and check data rights.
- **Dental** is blocked by a strong market signal (entrenched dental suites).

`opportunity-sizing` then gave AI prior-auth a serviceable market range of $194M–$422M, with adoption as the swing driver.

## Step 5: Challenge and decide

The `strategy-red-team` sub-agent challenged the top candidate cold. Its strongest point: "Customers-act is weak. Interviews show pain, not willingness to pay." That was accepted, and a price test was added.

**Decision tree:** demand pass, fit pass, advantage pass, feasibility weak (no eval of extraction accuracy yet). Result: **Validate**, with two conditions: a 15-clinic price test and an accuracy eval with the threshold set in advance.

## Step 6: Hand off

- AI prior-auth goes to `strategy-sprint` with the decision question: "Build, partner or wait on AI prior-authorization by 15 Dec?" (that sprint is the Strategy pack's worked example).
- Benchmarking → Explore: an interview guide was generated.
- Dental → Reject, recorded with the reason and a reopen trigger: "a dental suite partnership offer".
