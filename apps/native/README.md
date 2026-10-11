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
  (`react-native-notify-kit`), so they fire with the app closed.
- Backups export through the share sheet; restore from a backup by pasting
  its JSON.
- "Save to lock screen" (day wallpaper) shares the image on iOS; Android shows
  a message that it isn't supported yet.
- Android's back button closes detail pages, Settings and Notes.

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
