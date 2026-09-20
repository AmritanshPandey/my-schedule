# PlanR — native app

Bare React Native CLI project, iOS first. Lives inside the PlanR monorepo
alongside the Next.js web app (`apps/web`, once that move happens) and the
shared domain logic (`packages/core`, once extracted) — see the plan for the
full picture.

## Setup

```sh
npm install
cd ios
bundle install        # once
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install
```

CocoaPods needs a UTF-8 locale or `pod install` crashes with a Unicode
normalization error — this shell doesn't set one by default, so export it
explicitly rather than assuming `pod install` alone will work.

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
