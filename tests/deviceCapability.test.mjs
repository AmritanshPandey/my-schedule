/**
 * Coverage for lib/ai/deviceCapability.ts — where the on-device model may load.
 *
 * The property that matters most: no iOS browser, tab or home-screen PWA, ever
 * gets a "supported" verdict. Loading ~850 MB of weights there doesn't fail
 * gracefully — WebKit kills the tab — so a regression here is a crash, not a
 * degraded feature. Desktop must stay supported, or the AI quietly disappears
 * for the people it's built for.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { assessOnDeviceLLM, isIOSSignals, MIN_DEVICE_MEMORY_GB, OnDeviceModelUnavailableError } =
  await import("../lib/ai/deviceCapability.ts");

const DESKTOP_CHROME = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
  deviceMemory: 8,
  standalone: false,
  coarsePointer: false,
  shortEdge: 900,
};

const IPHONE_SAFARI = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
  standalone: false,
  coarsePointer: true,
  shortEdge: 393,
};

test("desktop browsers can run the on-device model", () => {
  assert.deepEqual(assessOnDeviceLLM(DESKTOP_CHROME), { supported: true });
});

test("an installed desktop PWA is still a desktop — mouse, big screen, plenty of memory", () => {
  assert.equal(assessOnDeviceLLM({ ...DESKTOP_CHROME, standalone: true }).supported, true);
});

test("iPhone Safari is blocked", () => {
  const verdict = assessOnDeviceLLM(IPHONE_SAFARI);
  assert.equal(verdict.supported, false);
  assert.equal(verdict.reason, "ios-web");
  assert.match(verdict.message, /crash/i, "the message should say why, not just 'unavailable'");
});

test("the iPhone home-screen PWA is blocked", () => {
  const verdict = assessOnDeviceLLM({ ...IPHONE_SAFARI, standalone: true });
  assert.equal(verdict.supported, false);
  assert.equal(verdict.reason, "ios-web");
});

test("iPadOS, which reports a desktop Mac user agent, is still recognised as iOS", () => {
  const iPad = { ...DESKTOP_CHROME, maxTouchPoints: 5, coarsePointer: true, shortEdge: 820 };
  assert.equal(isIOSSignals(iPad), true);
  assert.equal(assessOnDeviceLLM(iPad).reason, "ios-web");
});

test("Android phones are blocked, in the browser or installed", () => {
  const android = {
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
    platform: "Linux armv8l",
    maxTouchPoints: 5,
    deviceMemory: 8,
    standalone: true,
    coarsePointer: true,
    shortEdge: 412,
  };
  assert.equal(assessOnDeviceLLM(android).reason, "mobile-web");
  assert.equal(assessOnDeviceLLM({ ...android, standalone: false }).reason, "mobile-web");
});

test("a phone-sized touch screen is blocked even if its user agent claims desktop", () => {
  const requestDesktopSite = { ...DESKTOP_CHROME, platform: "Linux x86_64", coarsePointer: true, shortEdge: 390 };
  assert.equal(assessOnDeviceLLM(requestDesktopSite).reason, "mobile-web");
});

test("low reported memory blocks the model; unreported memory does not", () => {
  assert.equal(
    assessOnDeviceLLM({ ...DESKTOP_CHROME, deviceMemory: MIN_DEVICE_MEMORY_GB - 2 }).reason,
    "low-memory",
  );
  // Firefox and Safari don't expose deviceMemory — absence isn't evidence.
  assert.equal(assessOnDeviceLLM({ ...DESKTOP_CHROME, deviceMemory: undefined }).supported, true);
});

test("no browser at all is reported as unsupported, not as a crash", () => {
  assert.equal(assessOnDeviceLLM(null).supported, false);
});

test("the thrown error carries the user-facing reason", () => {
  const err = new OnDeviceModelUnavailableError(assessOnDeviceLLM(IPHONE_SAFARI));
  assert.equal(err.name, "OnDeviceModelUnavailableError");
  assert.equal(err.reason, "ios-web");
  assert.match(err.message, /desktop and iOS apps/);
});
