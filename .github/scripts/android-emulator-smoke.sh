#!/usr/bin/env bash
# Runs the PlanR release APK on the CI emulator (started by
# reactivecircus/android-emulator-runner): installs it, launches it, walks
# Overview → Today → Settings → Reminders, sends a test reminder, and saves
# screenshots, the notification-channel dump and logcat to emulator-out/.
# Fails if the app crashes or stops running.
set -uo pipefail

OUT=emulator-out
APK=apps/native/android/app/build/outputs/apk/release/app-release.apk
PKG=com.planrnative
mkdir -p "$OUT"

adb wait-for-device
# -g grants runtime permissions up front, including POST_NOTIFICATIONS.
adb install -r -g "$APK"
adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LOGCAT_PID=$!

shot() {
  adb exec-out screencap -p > "$OUT/$1.png"
  echo "screenshot: $1"
  # A small JPEG copy, base64 in the log, so the run can be reviewed
  # without downloading the artifact.
  if command -v convert > /dev/null; then
    echo "IMG $1 $(convert "$OUT/$1.png" -resize 360x -quality 60 jpg:- | base64 -w 0)"
  fi
}

# Center of the first node whose accessibility label or text is exactly $1.
find_node() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/ui.xml" > /dev/null 2>&1
  python3 - "$1" "$OUT/ui.xml" <<'PY'
import re, sys, xml.etree.ElementTree as ET
label, path = sys.argv[1], sys.argv[2]
for node in ET.parse(path).getroot().iter('node'):
    if label in (node.get('content-desc'), node.get('text')):
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
}

tap() {
  local at
  at=$(find_node "$1")
  if [ -z "$at" ]; then
    echo "not found: $1"
    return 1
  fi
  echo "tap: $1 at $at"
  # shellcheck disable=SC2086
  adb shell input tap $at
  sleep 2
}

# Swipe up until $1 is on screen (at most 10 swipes).
scroll_to() {
  for _ in $(seq 1 10); do
    [ -n "$(find_node "$1")" ] && return 0
    adb shell input swipe 540 1700 540 900 400
    sleep 1
  done
  echo "not found after scrolling: $1"
  return 1
}

skip_tour() {
  tap "Skip tour" > /dev/null 2>&1 && echo "skipped a tour" || true
}

adb shell am start -W -n "$PKG/.MainActivity"
sleep 25 # cold start of the release bundle under emulation
skip_tour
shot 01-launch

tap "Today" && skip_tour && shot 02-today
tap "Overview" && skip_tour

tap "Settings" && sleep 1 && shot 03-settings
if scroll_to "Reminders"; then
  shot 04-reminders-off
  tap "Reminders" # notifications are pre-granted, so this turns them on
  sleep 2
  scroll_to "Send test" || true
  shot 05-reminders-on
  tap "Send test" || true
  sleep 3
  adb shell cmd statusbar expand-notifications
  sleep 2
  shot 06-notification
  adb shell cmd statusbar collapse
fi

echo "::group::notification channels and posted notifications"
adb shell dumpsys notification --noredact | grep -i "planr" | head -80 | tee "$OUT/notifications.txt"
echo "::endgroup::"

sleep 2
kill "$LOGCAT_PID" 2> /dev/null || true

status=0
if grep -E "FATAL EXCEPTION|ReactNativeJS.*(Error|Exception)" "$OUT/logcat.txt" > "$OUT/errors.txt"; then
  echo "::group::errors in logcat"
  head -60 "$OUT/errors.txt"
  echo "::endgroup::"
fi
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  echo "::error::PlanR crashed — see the logcat artifact"
  status=1
fi
if [ -z "$(adb shell pidof "$PKG")" ]; then
  echo "::error::PlanR is no longer running"
  status=1
fi
exit $status
