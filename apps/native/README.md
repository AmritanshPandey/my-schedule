# PlanR — native app

Bare React Native CLI project, iOS first. Lives inside the PlanR monorepo
alongside the Next.js web app and the shared domain logic in
`packages/core` (`@planr/core`), which both apps import — the web's `lib/*`
files re-export it.

## How it maps to the PWA

`src/components/ios/IOSScheduleApp.tsx` is the native port of the PWA's phone
shell (`components/ios/IOSScheduleApp.tsx`): the same tabs (Overview, Today,
Plans, Routine, Tracking, plus Settings and Notes), the same handlers and the
same `@planr/core` mutations. Every component under `src/components` is a
port of the web component at the same path, using the same Tailwind classes
through NativeWind.

Data goes through `src/lib/useScheduleDB.ts` (MMKV locally, merged with the
Firestore snapshot at `users/{uid}/data/snapshot` when signed in, with the
same daily backups and version history as the web).

Deliberate differences from the PWA:

- The on-device AI features are not part of the native app; Settings has no
  AI entry, as on the web with AI turned off.
- Reminders are local notifications scheduled with the OS
  (`react-native-notify-kit`), so they fire with the app closed. See
  [Reminders](#reminders).
- Backups export through the share sheet; restore from a backup by pasting
  its JSON.
- "Save to lock screen" (day wallpaper) shares the image on iOS; Android shows
  a message that it isn't supported yet.
- Android's back button closes detail pages, Settings and Notes.

## Reminders

`src/lib/reminders.ts` hands the OS the next 7 days of reminders. iOS keeps at
most 64 pending local notifications per app, so the app schedules at most 60
there. The reminders are re-armed on every schedule change and every time the
app returns to the foreground. Each reminder:

- plays a sound (the system sound; Android uses the `planr-reminders-sound`
  channel, which replaces the old silent `planr-reminders` channel);
- fires at its exact minute (on Android, an exact AlarmManager alarm that also
  fires in Doze);
- has a **Snooze 10 min** action that works with the app closed.

**Alarm mode** (Settings → Reminders, stored per device):

- Android: rings with the user's alarm tone, on repeat, until the reminder is
  snoozed or dismissed. It's scheduled as an alarm clock, which Doze never
  defers.
- iOS can't repeat a notification sound, so the toggle is labeled
  "Time-sensitive" instead. Reminders are then delivered time-sensitive, so
  they get through a Focus.

Device setup that affects delivery:

- **iOS: Time Sensitive.** In Xcode, select the PlanRNative target, open
  Signing & Capabilities, choose + Capability and add *Time Sensitive
  Notifications*. Without it, iOS delivers time-sensitive reminders as
  ordinary ones.
- **Android 12+: exact alarms.** Exact timing needs the "Alarms & reminders"
  access. Android 14 doesn't grant it up front, and without it reminders can
  arrive minutes late. If it's missing, Settings → Reminders shows an
  **Allow** shortcut. A **Fix** shortcut also appears when battery
  optimization is on, which some phones use to hold back alarms.

## Setup

```sh
npm install
cd ios
bundle install        # once
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install
```

Run `pod install` again after pulling changes that add a native module (the
reminders module, `react-native-notify-kit`, needs it).

CocoaPods needs a UTF-8 locale or `pod install` crashes with a Unicode
normalization error — this shell doesn't set one by default, so export it
explicitly rather than assuming `pod install` alone will work.

## Checks

```sh
npx tsc --noEmit -p tsconfig.json   # typecheck (includes the @planr/core files it imports)
npm test                            # Jest smoke test
npm run lint
```

## Running

```sh
npm start              # Metro, in its own terminal
npm run ios             # builds + installs + launches on a simulator
```

If `npx react-native run-ios` fails to *launch* an already-built app (it can,
depending on which simulator destination it resolves to), install and launch
directly instead:

```sh
xcrun simctl install "iPhone 17 Pro" ios/build/.../PlanRNative.app
xcrun simctl launch "iPhone 17 Pro" org.reactjs.native.example.PlanRNative
```

A simulator that's just been freshly booted can leave `simctl install`
hanging for a minute or two while its system services finish starting — a
`simctl shutdown` + `simctl boot` clears it if a command seems permanently
stuck rather than just slow.
