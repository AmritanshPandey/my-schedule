/**
 * Two tabs of one browser, editing the same account.
 *
 * This is the coverage gap that let the bug ship. The unit suites all model two
 * *devices*, which have independent localStorage — so nothing exercised the case
 * where two replicas share one storage origin, and that is exactly where the
 * cloud compare-and-swap has no purchase: Tab A's push advanced the shared base
 * revision on Tab B's behalf, and `writeDB`'s unconditional `put()` erased the
 * other tab's work on disk before the network was even involved.
 *
 * Both pages here live in ONE browser context on purpose. A second context
 * would get its own IndexedDB and localStorage and would quietly pass whatever
 * the code did.
 */
import { expect, test, type Page } from "@playwright/test";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/** The weekday bucket for today, so seeded tasks are actually completable. */
function todayBucket(): string {
  return DAYS[(new Date().getDay() + 6) % 7];
}

function seed() {
  const activities = Object.fromEntries(DAYS.map((d) => [d, [] as unknown[]]));
  const task = (id: string, title: string, startTime: string, endTime: string) => ({
    id, title, startTime, endTime, planId: "p1", completed: false,
  });
  activities[todayBucket()] = [
    task("t-alpha", "Alpha", "07:00 AM", "08:00 AM"),
    task("t-beta", "Beta", "09:00 AM", "10:00 AM"),
  ];
  return {
    goals: [],
    plans: [{ id: "p1", title: "Fitness", category: "fitness", emoji: "🏋️", color: "violet", items: [] }],
    categories: [],
    activities,
    progressTrackers: [], metricEntries: [], milestones: [], rituals: [],
    ritualCompletions: [], notes: [], events: [],
    preferences: { dayStartTime: "05:00" },
  };
}

async function seedGuest(page: Page) {
  await suppressFirstRun(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async (schedule) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("daily-planner", 10);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("schedule")) db.createObjectStore("schedule");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("schedule", "readwrite");
        tx.objectStore("schedule").put(schedule, "guest:data");
        // Clear the revision marker so both tabs start from a known state.
        tx.objectStore("schedule").delete("guest:data:localRev");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
    localStorage.setItem("planr_lastUpdated:guest", String(Date.now()));
  }, seed());
}

/** Read the stored record's completion state, keyed by task id. */
async function storedCompletions(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(async (bucket) => {
    const record = await new Promise<Record<string, unknown> | undefined>((resolve) => {
      const request = indexedDB.open("daily-planner", 10);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("schedule", "readonly");
        const get = tx.objectStore("schedule").get("guest:data");
        get.onsuccess = () => { const v = get.result; db.close(); resolve(v); };
      };
    });
    const activities = (record?.activities ?? {}) as Record<string, Array<{ id: string; completed?: boolean }>>;
    return Object.fromEntries((activities[bucket] ?? []).map((t) => [t.id, !!t.completed]));
  }, todayBucket());
}

/**
 * Suppress the first-run overlays before the app boots.
 *
 * The AI notice mounts on a 2s timer with a full-screen backdrop, so a
 * post-load "click Dismiss" races it and the backdrop then swallows every
 * click in the test. Setting the flags the app itself checks is deterministic.
 */
const FIRST_RUN_FLAGS: Record<string, string> = {
  planr_ai_default_notice_v2: "true",
  "planr-getting-started-dismissed": "true",
  "planr-signin-prompt-dismissed": "true",
  "planr-missed-hint-seen": "true",
  // The coach tour checks for exactly "1" (lib/onboarding/useCoachTour.ts), one
  // key per TourId. Its scrim carries a full-screen "Skip tour" button, so a
  // tour left running swallows every click in the test.
  "planr-tour-today": "1",
  "planr-tour-plans": "1",
  "planr-tour-routine": "1",
};

async function suppressFirstRun(page: Page) {
  await page.addInitScript((flags) => {
    for (const [k, v] of Object.entries(flags)) {
      try { localStorage.setItem(k, v); } catch { /* private mode */ }
    }
  }, FIRST_RUN_FLAGS);
}

/**
 * The mobile project sends an iPhone user agent, so the app boots the iOS
 * shell (components/ios/IOSScheduleApp.tsx): it lands on its dashboard, and
 * each task row's toggle is a "Mark done" / "Mark not done" button beside the
 * card rather than a toggle inside it. Desktop keeps the week-grid cards.
 */
const IOS_TOGGLE = /^Mark (not )?done$/;

/** Get to where today's tasks are listed. */
async function showTodayTasks(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Today" }).click();
}

/**
 * The completion toggle for `title`.
 *
 * A task renders in more than one place (week grid block and list row), so
 * `.first()` on a bare aria-label is not stable — scope to the task first. On
 * the iOS shell, the innermost element holding both the title and a toggle is
 * that task's timeline row.
 */
function toggleFor(page: Page, title: string, isMobile: boolean) {
  if (isMobile) {
    return page
      .locator("div")
      .filter({ has: page.getByText(title, { exact: true }) })
      .filter({ has: page.getByRole("button", { name: IOS_TOGGLE }) })
      .last()
      .getByRole("button", { name: IOS_TOGGLE });
  }
  return page
    .locator('[role="button"]')
    .filter({ hasText: title })
    .getByRole("button", { name: /completed/i })
    .first();
}

/** Assert a toggle shows `done`, in whichever shell's vocabulary it speaks. */
async function expectDone(toggle: ReturnType<typeof toggleFor>, done: boolean, isMobile: boolean, timeout: number) {
  if (isMobile) {
    await expect(toggle).toHaveAttribute("aria-pressed", String(done), { timeout });
  } else {
    await expect(toggle).toHaveAttribute("aria-label", done ? /^completed/i : /not completed/i, { timeout });
  }
}

/** Click a task's toggle and confirm the UI actually registered it. */
async function complete(page: Page, title: string, isMobile: boolean) {
  const toggle = toggleFor(page, title, isMobile);
  await expectDone(toggle, false, isMobile, 10_000);
  await toggle.click();
  await expectDone(toggle, true, isMobile, 5_000);
}

async function dismissOverlays(page: Page) {
  // Belt and braces: the flags above should mean none of these ever appear.
  for (const name of ["Skip tour", "Dismiss", "Got it"]) {
    await page.getByRole("button", { name }).click({ timeout: 750 }).catch(() => {});
  }
}

test("two tabs editing different tasks keep both edits", async ({ browser, isMobile }) => {
  const context = await browser.newContext();
  const tabA = await context.newPage();
  await seedGuest(tabA);

  const tabB = await context.newPage();
  await suppressFirstRun(tabB);

  await tabA.goto("/", { waitUntil: "domcontentloaded" });
  await tabB.goto("/", { waitUntil: "domcontentloaded" });
  await dismissOverlays(tabA);
  await dismissOverlays(tabB);
  await showTodayTasks(tabA, isMobile);
  await showTodayTasks(tabB, isMobile);

  // Both tabs must be showing the seeded data before either edits, or this
  // tests nothing: the whole point is that each holds its own stale copy.
  await expect(tabA.getByText("Alpha").first()).toBeVisible({ timeout: 15_000 });
  await expect(tabB.getByText("Beta").first()).toBeVisible({ timeout: 15_000 });

  await complete(tabA, "Alpha", isMobile);
  await tabA.waitForTimeout(1_200); // clear the 500ms write debounce

  // Tab B still holds its pre-edit tree here — this is the write that used to
  // erase Tab A's work.
  await complete(tabB, "Beta", isMobile);
  await tabB.waitForTimeout(1_500);

  const stored = await storedCompletions(tabA);
  expect(stored["t-alpha"], "the first tab's completion was erased").toBe(true);
  expect(stored["t-beta"], "the second tab's completion was erased").toBe(true);

  // And it must still be true after a reload, not just in memory.
  await tabA.reload({ waitUntil: "domcontentloaded" });
  await dismissOverlays(tabA);
  const afterReload = await storedCompletions(tabA);
  expect(afterReload["t-alpha"]).toBe(true);
  expect(afterReload["t-beta"]).toBe(true);

  await context.close();
});

test("an idle tab catches up without a reload", async ({ browser, isMobile }) => {
  const context = await browser.newContext();
  const tabA = await context.newPage();
  await seedGuest(tabA);

  const tabB = await context.newPage();
  await suppressFirstRun(tabB);
  await tabA.goto("/", { waitUntil: "domcontentloaded" });
  await tabB.goto("/", { waitUntil: "domcontentloaded" });
  await dismissOverlays(tabA);
  await dismissOverlays(tabB);
  await showTodayTasks(tabA, isMobile);
  await showTodayTasks(tabB, isMobile);

  const alphaInB = toggleFor(tabB, "Alpha", isMobile);
  await expectDone(alphaInB, false, isMobile, 15_000);

  await complete(tabA, "Alpha", isMobile);

  // Tab B is never touched or reloaded; the cross-tab channel has to reach it.
  await expectDone(alphaInB, true, isMobile, 10_000);

  await context.close();
});
