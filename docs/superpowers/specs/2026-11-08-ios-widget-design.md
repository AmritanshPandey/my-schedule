# iOS home-screen and Lock Screen widget: build plan

Status: proposed, not started. Owner decisions needed are marked **Decide**.

## Why

PlanR's first design principle is "execution over planning theater". The most
executed moment of the day is "what do I do next?", and today that answer is
three taps away (unlock, open PlanR, read the Overview). A widget puts the
Overview's **Next up** card on the home screen and Lock Screen, where it is
seen dozens of times a day without opening the app.

## What v1 shows

The widget reuses the Overview's own answer (`selectNextUp` in
`packages/core/lib/overview.ts`), so the widget and the app never disagree.

| Family | iOS | Content |
|---|---|---|
| `systemSmall` | 16+ | Next up title, its time ("7:00 AM" / "Now · ends 7:45"), day progress ("2 of 5") |
| `systemMedium` | 16+ | Next up + the next two open tasks with times, progress bar, streak |
| `accessoryRectangular` | 16+ (Lock Screen) | Next up title and time, "2 of 5 done" |
| `accessoryInline` | 16+ (Lock Screen, above the clock) | "Next · Strength workout 7:00" |
| `accessoryCircular` | 16+ (Lock Screen) | Progress ring, done / total |

States, mirroring `NextUp`: `task`, `day-done` ("Day complete"), `empty`
("Plan your day"), plus `signed-out / no data` ("Open PlanR").

Tapping deep-links into the app: the task's detail (`planr://task/<id>?date=<iso>`),
or Today for the other states. **Not in v1:** buttons on the widget (see Phase 2).

## Architecture

The schedule lives in MMKV inside the app and all the scheduling logic is
TypeScript in `@planr/core`. The widget extension is a separate process that
can't run JS, so **the app computes, the widget only draws**:

```
useScheduleDB (MMKV) ──► useWidgetSnapshot (JS hook)
                            │  selectWidgetSnapshot(schedule, now)  ← @planr/core, pure, tested
                            ▼
                   PlanRWidgetBridge.setSnapshot(json)              ← ~40-line Swift native module
                            │  UserDefaults(suiteName: App Group)
                            │  WidgetCenter.shared.reloadAllTimelines()
                            ▼
                   PlanRWidget extension (SwiftUI + WidgetKit)      ← reads JSON, renders, no logic
```

### 1. `selectWidgetSnapshot` in `packages/core/lib/widgetSnapshot.ts`

Pure function, same rules as the Overview:

```ts
interface WidgetSnapshot {
  version: 1;
  generatedAt: string;          // ISO, for staleness
  days: WidgetDay[];            // today and tomorrow, so midnight rolls over without the app
}
interface WidgetDay {
  dateISO: string;
  state: "task" | "day-done" | "empty";
  done: number; total: number;
  streak: number;
  items: {                      // open tasks in Today's order, first = Next up, max 4
    id: string; title: string; planTitle?: string;
    startMinutes?: number; endMinutes?: number;   // absent = anytime
    accent?: string;            // category colour token
  }[];
}
```

`selectNextUp` isn't clock-aware (a task stays "next" until it's done or
acknowledged as missed), so the snapshot only changes when data changes or the
day turns. "Now · ends 7:45" vs "7:00 AM" is purely presentational and the
widget derives it from `startMinutes`/`endMinutes` per timeline entry.

Unit tests in `tests/widgetSnapshot.test.mjs`: empty day, day done, multi-slot
task (first open slot), anytime tasks, missed tasks excluded, the 4-item cap,
tomorrow's day.

### 2. Native bridge: `apps/native/ios/PlanRNative/PlanRWidgetBridge.swift`

A small Turbo/legacy native module with one method, `setSnapshot(json: String)`:
write to `UserDefaults(suiteName: "group.<bundle id>")`, then
`WidgetCenter.shared.reloadAllTimelines()`, plus `clear()` for sign-out. No
third-party package: the available ones (`react-native-shared-group-preferences`,
`react-native-widget-extension`) add more surface than the 40 lines they save.

### 3. `apps/native/src/lib/useWidgetSnapshot.ts`

Modelled on `useReminders.ts`: recompute on every schedule change (debounced
~800 ms), on `AppState` → `active`, and clear on sign-out. Mounted next to
`useReminders` in `IOSScheduleApp`. iOS only (`Platform.OS === 'ios'`).

### 4. Widget extension target `PlanRWidget`

- Xcode: File ▸ New ▸ Target ▸ Widget Extension, deployment target **iOS 16**
  (Lock Screen families). The app stays on 15.1; the widget simply isn't
  offered below 16.
- `TimelineProvider`: decode the snapshot; build entries for **now**, each
  remaining task start/end boundary today (so "Now · ends…" flips on time),
  and **midnight** (switches to `days[1]`). Policy `.atEnd`. If the snapshot is
  older than a day, show "Open PlanR to update".
- Views follow `DESIGN.md`: Nunito (bundle the font in the extension), ink
  primary text, green only for the progress fill and a live streak (One Signal
  Rule), sentence case, Dark Mode, `containerBackground` on iOS 17, Dynamic
  Type up to accessibility sizes, VoiceOver labels ("Next up, Strength
  workout, 7 AM, 2 of 5 done").
- `widgetURL` / `Link` for deep links.

### 5. Deep links

The app has no URL scheme yet. Add `planr` to `CFBundleURLTypes`, handle it in
`AppDelegate` → RN `Linking`, and route `planr://task/<id>?date=` to
`openEditSheet`/task detail and `planr://today` to tab 0 in `IOSScheduleApp`.

## Setup prerequisites (**Decide**)

1. **Bundle ID and team.** The project still uses
   `org.reactjs.native.example.PlanRNative`, while the simulator also has a
   `com.amritansh.planr` build. App Groups need the final bundle ID and an
   Apple Developer team. Pick one (suggested: `com.amritansh.planr`, group
   `group.com.amritansh.planr`).
2. **Families for v1.** The table above (recommended), or home screen only.
3. **Interactivity now or later.** Recommended later (Phase 2).

## Phases

| Phase | Scope | Size |
|---|---|---|
| 0 | Bundle ID, team, App Group capability on app + extension | ½ day, needs your Apple account |
| 1 | `selectWidgetSnapshot` + tests | ½ day |
| 2 | Bridge + `useWidgetSnapshot` + extension with Small/Medium + deep links | 1½–2 days |
| 3 | Lock Screen families, Dark Mode, Dynamic Type, VoiceOver pass | ½–1 day |
| 4 (later) | **Interactive "Mark done"** (iOS 17 `AppIntent` button). The intent can't run JS, so it appends to a completion queue in the App Group and updates the snapshot optimistically; the app drains the queue into `setSchedule` on next launch/foreground (and cloud sync follows). Needs care with sync conflicts. | 1–2 days |
| 5 (later) | **Live Activity** for the task in progress (ActivityKit, Dynamic Island), from the same snapshot | 1–2 days |

Android (Glance) and the PWA are out of scope: the web platform has no
home-screen widget API on iOS.

## How we'll verify

- `npm test` (new snapshot tests), both typechecks.
- Simulator: add each family; complete a task in the app and see the widget
  update within seconds; edit a time; sign out (widget shows "Open PlanR");
  set the simulator clock past a task start (label flips to "Now"); past
  midnight (tomorrow's day shows without opening the app).
- Light/Dark, largest Dynamic Type, VoiceOver read-out.

## Risks

- **Stale data** if the app is never opened: mitigated by tomorrow in the
  snapshot and the "Open PlanR" stale state; WidgetKit refresh budgets mean we
  can't poll.
- **Signing** blocks everything until Phase 0 is done on a real Apple account.
- **Privacy:** task titles are written to the App Group container (local to
  the device, same protection class as the app). Cleared on sign-out.
