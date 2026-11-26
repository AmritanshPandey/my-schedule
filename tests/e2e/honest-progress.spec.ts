/**
 * Checklist or Steps, with the clock moved to the next day.
 *
 * The unit suite proves the math; what only a browser shows is that a step
 * ticked today is still ticked after a real load, rollover and save, and that
 * a partly done day reads that way on screen.
 */
import { expect, test, type Page } from "@playwright/test";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
// A Tuesday and the day after.
const TUE = "2026-11-24T09:00:00";
const WED = "2026-11-25T09:00:00";

const items = (prefix: string, names: string[]) => names.map((task, i) => ({ id: `${prefix}${i + 1}`, task }));

function seed() {
  const activities = Object.fromEntries(DAYS.map((d) => [d, [] as unknown[]]));
  const portfolio = {
    id: "portfolio", title: "Portfolio", planId: "work", startTime: "07:00 AM", endTime: "08:00 AM",
    subtaskMode: "steps", subtasks: items("p", ["Case study one", "Case study two", "About page"]),
  };
  activities.tuesday = [
    portfolio,
    { id: "gym", title: "Gym", planId: "work", startTime: "08:00 AM", endTime: "08:45 AM", subtasks: items("g", ["Bench", "Squat", "Row", "Plank", "Stretch"]) },
  ];
  activities.wednesday = [portfolio];
  return {
    plans: [{ id: "work", title: "Work", category: "learning", emoji: "book", color: "emerald", items: [], metaFields: [], summary: [], goals: [] }],
    activities, progressTrackers: [], metricEntries: [], milestones: [], rituals: [], strategies: [], ritualCompletions: [], notes: [],
    preferences: { dayStartTime: "05:00", lastRolloverISO: "2026-11-24" },
  };
}

async function open(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(async (schedule) => {
    localStorage.setItem("planr_ai_default_notice_v2", "true");
    for (const id of ["today", "plans", "routine", "tracking"]) localStorage.setItem(`planr-tour-${id}`, "1");
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("daily-planner", 10);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("schedule")) request.result.createObjectStore("schedule");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("schedule", "readwrite");
        tx.objectStore("schedule").put(schedule, "guest:data");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, seed());
  await load(page);
}

async function load(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Dismiss" }).click({ timeout: 1_500 }).catch(() => {});
  await page.getByRole("button", { name: "Maybe later" }).click({ timeout: 1_500 }).catch(() => {});
  await expect(page.locator("body")).toContainText("Portfolio", { timeout: 20_000 });
}

const tab = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).first();

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 700;

/** Open a task's detail: the timeline row on the phone, the plan card's chip on desktop Overview. */
async function openDetail(page: Page, title: string) {
  if (isPhone(page)) {
    await tab(page, "Today").click();
    await page.getByText(title, { exact: true }).last().click();
  } else {
    await tab(page, "Overview").click();
    // Rows are in time order: Portfolio, then Gym.
    const chips = page.getByTestId("overview-dashboard").getByRole("button", { name: /^Open (subtasks|task details)/ });
    await chips.nth(title === "Portfolio" ? 0 : 1).click();
  }
  await expect(page.getByRole("button", { name: /subtask (not )?done$/ }).first()).toBeVisible();
}

const tick = (page: Page, text: string) =>
  page.getByRole("button", { name: new RegExp(text) }).getByRole("button", { name: /Mark subtask done/ }).click();

async function closeDetail(page: Page) {
  const close = page.getByRole("button", { name: "Close", exact: true }).first();
  if (await close.isVisible().catch(() => false)) await close.click();
  else await page.getByRole("button", { name: /back/i }).first().click();
}

/** Saves are debounced; wait for the tick to reach storage before moving the clock. */
async function saved(page: Page, taskId: string, expected: number) {
  await expect.poll(() => page.evaluate(async (id) => {
    return await new Promise<number>((resolve) => {
      const request = indexedDB.open("daily-planner", 10);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction("schedule").objectStore("schedule").get("guest:data");
        get.onsuccess = () => {
          const t = get.result.activities.tuesday.find((x: { id: string }) => x.id === id);
          db.close();
          resolve((t?.completedSubtaskIds ?? []).length);
        };
      };
    });
  }, taskId), { timeout: 10_000 }).toBe(expected);
}

test("a finished step stays done tomorrow, and a partly done day isn't a miss", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(TUE));
  await open(page);

  await openDetail(page, "Portfolio");
  await expect(page.locator("body")).toContainText("0 of 3 steps");
  await tick(page, "Case study one");
  await expect(page.locator("body")).toContainText("1 of 3 steps");
  await expect(page.getByTestId("finished-steps")).toContainText("Done (1)");
  await closeDetail(page);
  await saved(page, "portfolio", 1);

  await openDetail(page, "Gym");
  for (const name of ["Bench", "Squat", "Row", "Plank"]) await tick(page, name);
  await closeDetail(page);
  await saved(page, "gym", 4);

  // ── The next day ──
  await page.clock.setFixedTime(new Date(WED));
  await load(page);

  await openDetail(page, "Portfolio");
  await expect(page.locator("body"), "the step is still finished").toContainText("1 of 3 steps");
  await expect(page.getByTestId("finished-steps")).toContainText("Done (1)");
  await expect(page.getByRole("button", { name: /^Not completed, Mark task done/ }).first(), "today's block is open again").toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("detail.png") });
  await closeDetail(page);

  // Tuesday: one block done, one 80% → 90%, nothing missed.
  await tab(page, "Overview").click();
  const week = page.getByTestId(isPhone(page) ? "overview-week" : "overview-week-status");
  await expect(week).toContainText("90%");
  await expect(week).toContainText("On track");
  await expect(week).toContainText("1 partly done");
  await expect(page.getByTestId("overview-dashboard")).not.toContainText("Missed yesterday");
  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByTestId("completion-trend-card")).toContainText("1 partly done");
    await expect(page.getByTestId("completion-trend-card")).not.toContainText("missed this week");
  }
});

test("finishing the last step offers to end the task", async ({ page }) => {
  await page.clock.setFixedTime(new Date(TUE));
  await open(page);
  await openDetail(page, "Portfolio");
  for (const name of ["Case study one", "Case study two", "About page"]) await tick(page, name);
  await expect(page.getByTestId("finish-task")).toContainText("Every step is done");
  await page.getByRole("button", { name: "Finish this task" }).click();
  await expect(page.locator("body")).toContainText("Task finished");
});

test("the form says what a tick means, once there is something to tick", async ({ page }) => {
  await page.clock.setFixedTime(new Date(TUE));
  await open(page);
  await openDetail(page, "Gym");
  await page.getByRole("button", { name: "Edit task" }).click();
  const mode = page.getByTestId("subtask-mode");
  await expect(mode).toContainText("Starts fresh each time.");
  await mode.getByRole("radio", { name: "Steps" }).click();
  await expect(mode).toContainText("Finished steps stay done");
});
