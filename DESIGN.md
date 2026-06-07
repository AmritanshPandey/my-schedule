---
name: PlanR
description: Mission Control for personal execution — plan, then actually do it.
colors:
  momentum-green: "#00A63E"
  momentum-green-accent: "#2FD46E"
  streak-green: "#00C950"
  green-pressed: "#008236"
  ink: "#0A0A0A"
  ink-soft: "#171717"
  surface-light: "#FAFAFA"
  surface-dark: "#0A0A0A"
  card-dark: "#171717"
  muted: "#737373"
  cat-cardio: "#FF6900"
  cat-skin: "#5EA500"
  cat-eng: "#155DFC"
  cat-design: "#E17100"
  cat-pink: "#EC003F"
  cat-purple: "#AD46FF"
  cat-cyan: "#00A6F4"
  status-danger: "#FB2C36"
  status-warn: "#E17100"
  status-info: "#155DFC"
typography:
  display:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.1
  title:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
    textColor: "#FFFFFF"
  button-cta:
    backgroundColor: "{colors.momentum-green}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  button-cta-hover:
    backgroundColor: "{colors.green-pressed}"
    textColor: "#FFFFFF"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  card:
    backgroundColor: "{colors.card-dark}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  input:
    backgroundColor: "{colors.card-dark}"
    textColor: "#FFFFFF"
    rounded: "{rounded.xl}"
    padding: "14px"
---

# Design System: PlanR

## 1. Overview

**Creative North Star: "Mission Control"**

PlanR is a dark-first command surface for people running their own execution OS. Every
screen is an instrument panel: the day's tasks, the week's bars, the streak, the trend —
all live readouts, with the next action never more than one tap away. The system is calm
under its energy. Motivation is real and earned (you executed; the streak proves it), not
manufactured with confetti. Color is a signal, not decoration. The interface is
native-fast: it renders instantly from local data, responds to every press, and never
makes you wait.

The aesthetic is **precise and native-fast** — crisp hairline borders, near-flat cards,
instant feedback, restraint over flourish. Surfaces are quiet so the content (your
progress) carries the energy. It draws from instrument panels and well-built native iOS
apps, not from marketing dashboards.

This system explicitly rejects four things, carried from PRODUCT.md: the **gamified,
childish habit app** (no mascots, confetti spam, or badge-spam); the **cluttered
enterprise PM tool** (no Jira-dense gray panel overload); the **generic AI-SaaS template**
(no purple gradients, tracked uppercase eyebrows on every section, hero-metric clichés);
and the **sterile corporate calendar** (no lifeless Outlook grid).

**Key Characteristics:**
- Dark-mode-first; both themes are first-class, never an afterthought.
- One confident accent (Momentum Green) on a disciplined neutral base.
- Near-flat, border-defined surfaces — depth from hairlines and tonal layering, not shadow.
- Single typeface (Nunito) carrying the whole hierarchy through weight and scale.
- Motion is feedback, not choreography: fast, purposeful, reduced-motion-safe.

## 2. Colors

A disciplined neutral system carrying one confident green accent, with a tightly-scoped
set of category and status hues for data.

### Primary
- **Momentum Green** (#00A63E): The single brand accent. CTAs, success, completion checks,
  streak/progress signals. In dark mode it lightens to **Momentum Green Accent** (#2FD46E)
  for contrast against near-black surfaces. **Streak Green** (#00C950) is the brighter dot
  for live streak indicators; **Green Pressed** (#008236) is the pressed/active state.

### Secondary
- **Ink** (#0A0A0A) / **Ink Soft** (#171717): The *neutral* primary action color. The
  default UI button is ink, not green — green is reserved for affirmative/progress moments.
  Ink Soft also serves as the dark-mode card surface.

### Tertiary (data accents — scoped to timeline blocks & plan icons)
- **Cardio Orange** (#FF6900), **Skin/Health Lime** (#5EA500), **Engineering Blue**
  (#155DFC), **Design Amber** (#E17100), **Pink** (#EC003F), **Purple** (#AD46FF), **Cyan**
  (#00A6F4): Per-plan category accents. Used only to color-code plans and timeline blocks,
  never as general UI chrome.

### Neutral
- **Surface Light** (#FAFAFA): Light-theme body background.
- **Surface Dark** (#0A0A0A): Dark-theme body background (neutral-950).
- **Card Dark** (#171717): Dark-theme card/surface (neutral-900).
- **Muted** (#737373): Secondary text, labels, inactive icons (neutral-500). Hairline
  borders are `neutral-200/70` (light) and `white/[0.07]` (dark).

### Named Rules
**The One Signal Rule.** Momentum Green means progress: done, success, streak, the
next-step CTA. It never appears as decoration. If green isn't reporting forward motion, it
shouldn't be on screen.

**The Ink-First Rule.** The default action button is ink (#0A0A0A), not green. Green is
spent on the *affirmative* action (Create, Complete, Log). Two green buttons competing on
one screen is a bug.

## 3. Typography

**Display / Body / Label Font:** Nunito (with `ui-sans-serif, system-ui, sans-serif`)

**Character:** One warm, rounded humanist sans carries the entire system. Hierarchy comes
from weight (500 → 800) and scale, never from a second typeface. Nunito's rounded
terminals keep the dense, data-heavy screens feeling approachable rather than clinical —
the friendliness that offsets all the numbers.

### Hierarchy
- **Display** (800, 40px, line-height 1, -0.01em): The single big number on a card — the
  week's completion %, the streak count. One per card, maximum.
- **Headline** (800, 22px, 1.1): Page titles ("Overview"), large stat values.
- **Title** (700, 15px, 1.3): Card headers ("This Week", "Active Tracking"), task titles,
  list-row primary text.
- **Body** (500, 13px, 1.5): Supporting copy, descriptions, secondary row text. Cap long
  prose at 65–75ch.
- **Label** (700, 11px, 0.08em, UPPERCASE): Stat captions ("TASKS DONE"), section eyebrows.
  Reserved for short captions only — never a sentence.

### Named Rules
**The One Big Number Rule.** Display size is for a single headline metric per card. If two
numbers fight for Display weight, neither is the headline; demote one to Title.

**The Sentence-Case Rule.** Body and titles are sentence case. Uppercase is for Labels of
≤4 words only. No ALL-CAPS sentences, ever.

## 4. Elevation

Near-flat by doctrine. Depth is carried by **hairline borders and tonal layering**, not by
shadow. Cards are defined by a 1px border (`neutral-200/70` light, `white/[0.07]` dark)
over a surface one tonal step from the background — not by a drop shadow. Shadows exist
only for genuinely floating layers (nav bar, popovers/sheets), and even then they're
whisper-soft.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.04)`): Barely-there lift for resting
  cards. Often the border does the work and this is omitted.
- **Nav** (`box-shadow: 0 0 12px rgb(0 0 0 / 0.10)`): The floating bottom nav / app shell.
- **Popover** (`box-shadow: 0 8px 24px rgb(0 0 0 / 0.12)`): Bottom sheets, menus, anything
  that overlays content.

### Named Rules
**The Border-Before-Shadow Rule.** A resting surface is defined by its border and tone, not
a shadow. Reach for shadow only when an element genuinely floats above the page (nav,
sheet, popover). Stacked shadows on flat cards are forbidden.

## 5. Components

The feel across all components is **precise and native-fast**: crisp borders, near-flat
fills, instant `active:scale` feedback, restraint over flourish.

### Buttons
- **Shape:** Rounded — `rounded-xl`/`rounded-2xl` (16px) for standard buttons, `rounded-full`
  for primary CTAs and pill controls.
- **Primary (default UI):** Ink fill (#0A0A0A) / white text; in dark mode it inverts to
  white fill / ink text. Hover lightens to Ink Soft. Sizes: sm h-32px, md h-40px, lg h-48px.
- **CTA (affirmative):** Momentum Green fill (#00A63E) / white text, usually `rounded-full`.
  Reserved for Create / Complete / Log. Hover → Green Pressed (#008236).
- **Secondary / Ghost:** Transparent or hairline-bordered, muted text (#737373), subtle
  `neutral-100` / `white/[0.07]` hover wash.
- **Press:** `active:scale-[0.98]` on every button; `transition-all`. This tactile press is
  the signature, paired with haptics on mobile.

### Chips / Pills
- **Style:** `rounded-lg`/`rounded-full`, hairline border, `text-[12px] font-bold`, muted
  by default. Active state fills with ink (`bg-neutral-900 text-white`) — a small inversion,
  not a color shift.

### Cards / Containers
- **Corner Style:** `rounded-2xl` (16px).
- **Background:** White (light) / Card Dark #171717 (dark).
- **Shadow Strategy:** Border-defined; see Elevation. Resting cards usually carry no shadow.
- **Border:** 1px hairline — `neutral-200/70` light, `white/[0.07]` dark.
- **Internal Padding:** 16–20px (`px-5 py-4` is the house default).
- **Nesting:** Inner panels use a tonal wash (`neutral-50` / `white/[0.04]`), never a second
  bordered card. Nested cards are forbidden.

### Inputs / Fields
- **Style:** `rounded-2xl`, surface fill, `font-size: ≥16px` on mobile (prevents iOS zoom).
- **Focus:** Accent border shift (`border-emerald-500/70`), no heavy glow.
- **Affordance:** Monospace is used for structured paste/template input where alignment
  matters.

### Navigation
- **Style:** Floating bottom nav (mobile) with the Nav shadow; left sidebar (desktop).
  Active item uses ink/green; inactive is Muted. Tap targets ≥44px.

### Signature Component — Progress Readouts
The week-bars row, the consistency ring, and the execution-trend chart are the system's
signature. Bars/rings use a status ramp (green ≥70%, amber 40–69%, rose <40%) so a glance
reads as "on track / at risk / behind." These are the live instruments of Mission Control.

## 6. Do's and Don'ts

### Do:
- **Do** keep Momentum Green (#00A63E) for progress only — CTAs, completion, streaks, the
  next action. Let its rarity make it mean something (The One Signal Rule).
- **Do** make the default action button ink (#0A0A0A), spending green only on the
  affirmative action on a screen (The Ink-First Rule).
- **Do** define resting surfaces with 1px hairline borders and tonal layering; reach for
  shadow only when an element truly floats (The Border-Before-Shadow Rule).
- **Do** carry the whole type hierarchy with Nunito weight + scale; one Display number per
  card.
- **Do** give every button `active:scale-[0.98]` and pair it with haptics on mobile; keep
  tap targets ≥44px.
- **Do** ship every state in both light and dark, and give every animation a
  `prefers-reduced-motion` fallback.

### Don't:
- **Don't** build the gamified/childish habit-app look: no mascots, confetti spam, or
  badge-spam. Reward is the honest streak, not a cartoon.
- **Don't** drift toward a cluttered enterprise PM tool: no Jira-dense gray panel overload.
  Show what matters now.
- **Don't** use the generic AI-SaaS template: no purple gradients, no `background-clip:text`
  gradient text, no tracked uppercase eyebrow above every section, no hero-metric cliché.
- **Don't** ship a sterile corporate calendar grid with zero warmth.
- **Don't** put a `border-left`/`border-right` greater than 1px as a colored accent stripe
  on cards or rows. Use full hairline borders or a tonal wash instead.
- **Don't** nest a bordered card inside another bordered card; use a tonal inner panel.
- **Don't** stack drop shadows on flat resting cards, or use ALL-CAPS sentences.
