import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayKey = typeof DAYS[number];

function makeTask(day: DayKey, index: number, title: string, startTime: string, endTime: string, planId: string) {
  return {
    id: `${day}-${index}`,
    title,
    description: `${title} seeded by Playwright`,
    startTime,
    endTime,
    icon: planId === "cardio" ? "run" : planId === "study" ? "book" : "star",
    color: planId === "cardio" ? "orange" : planId === "study" ? "emerald" : "pink",
    planId,
    taskType: planId === "routine" ? "session" : "task",
    completed: false,
    completedSubtaskIds: [],
    subtasks: planId === "routine"
      ? [
          { id: `${day}-routine-a`, task: "Stretch" },
          { id: `${day}-routine-b`, task: "Journal" },
        ]
      : undefined,
  };
}

function seedSchedule() {
  const activities = Object.fromEntries(
    DAYS.map((day) => [
      day,
      [
        makeTask(day, 1, "Morning Run", "06:00 AM", "06:45 AM", "cardio"),
        makeTask(day, 2, "Morning Routine", "07:00 AM", "07:30 AM", "routine"),
        makeTask(day, 3, "GMAT", "07:30 AM", "11:00 AM", "study"),
      ],
    ]),
  );
  const createdAt = "2026-06-01T09:00:00.000Z";
  const makeMilestone = (id: string, planId: string, title: string, status: "active" | "completed", sortOrder: number) => ({
    id,
    planId,
    title,
    startDate: "2026-06-01",
    plannedDurationDays: 14,
    plannedEndDate: "2026-06-15",
    actualCompletedDate: status === "completed" ? "2026-06-14" : undefined,
    status,
    linkedActivities: [`monday-${sortOrder + 1}`],
    linkedTrackers: [],
    createdAt,
    updatedAt: createdAt,
    sortOrder,
  });

  return {
    plans: [
      {
        id: "cardio",
        title: "Cardio",
        description: "Running and conditioning",
        category: "fitness",
        emoji: "run",
        color: "orange",
        items: [{ id: "cardio-warmup", task: "Warm up" }, { id: "cardio-run", task: "Run" }],
        metaFields: [],
        summary: [],
        goals: [],
      },
      {
        id: "routine",
        title: "Routine",
        description: "Morning routine",
        category: "routine",
        emoji: "star",
        color: "pink",
        items: [],
        metaFields: [],
        summary: [],
        goals: [],
      },
      {
        id: "study",
        title: "Study",
        description: "Study blocks",
        category: "learning",
        emoji: "book",
        color: "emerald",
        items: [{ id: "study-review", task: "Review" }, { id: "study-practice", task: "Practice" }],
        metaFields: [],
        summary: [],
        goals: [],
      },
    ],
    activities,
    progressTrackers: [
      {
        id: "run-distance",
        planId: "cardio",
        title: "Run Distance",
        type: "number",
        unit: "km",
        goalDirection: "increase_good",
        goalValue: 10,
      },
      {
        id: "study-hours",
        planId: "study",
        title: "Study Hours",
        type: "number",
        unit: "h",
        goalDirection: "increase_good",
        goalValue: 4,
      },
    ],
    metricEntries: [
      { id: "run-distance-prev", planId: "cardio", trackerId: "run-distance", value: 4, date: "2026-06-25" },
      { id: "run-distance-now", planId: "cardio", trackerId: "run-distance", value: 6, date: "2026-06-26" },
      { id: "study-hours-prev", planId: "study", trackerId: "study-hours", value: 2, date: "2026-06-25" },
      { id: "study-hours-now", planId: "study", trackerId: "study-hours", value: 3, date: "2026-06-26" },
    ],
    milestones: [
      makeMilestone("cardio-base", "cardio", "Build aerobic base", "completed", 0),
      makeMilestone("cardio-10k", "cardio", "Comfortable 10K", "active", 1),
      makeMilestone("study-foundation", "study", "Foundation review", "completed", 2),
      makeMilestone("study-practice", "study", "Practice set rhythm", "active", 3),
    ],
    rituals: [
      {
        id: "ritual-water",
        title: "Hydrate",
        time: "08:00",
        duration: 5,
        repeatDays: [...DAYS],
        color: "sky",
      },
    ],
    strategies: [],
    ritualCompletions: [],
    notes: [
      {
        id: "note-seed",
        title: "Skin and Dental Care",
        body: "- [ ] Sunscreen\n- [ ] Floss",
        createdAt: "2026-06-26T09:00:00.000Z",
        updatedAt: "2026-06-26T09:00:00.000Z",
        tags: ["Skin", "Dental"],
      },
    ],
    preferences: { dayStartTime: "05:00" },
  };
}

async function writeGuestSchedule(page: Page) {
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
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, seedSchedule());
}

async function dismissInstallPrompt(page: Page) {
  await page.getByRole("button", { name: "Dismiss" }).click({ timeout: 2_000 }).catch(() => {});
  await page.getByRole("button", { name: "Maybe later" }).click({ timeout: 2_000 }).catch(() => {});
}

async function openSeededApp(page: Page, path = "/", readyText = "Morning Run") {
  await writeGuestSchedule(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await dismissInstallPrompt(page);
  await expect(page.locator("body")).toContainText(readyText, { timeout: 20_000 });
}

function collectRuntimeErrors(page: Page, testInfo: TestInfo) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("Failed to load resource: net::ERR_CONNECTION_REFUSED")) return;
    errors.push(`console.error: ${text}`);
  });
  return async () => {
    if (errors.length > 0) {
      await testInfo.attach("runtime-errors", {
        body: errors.join("\n"),
        contentType: "text/plain",
      });
    }
    expect(errors).toEqual([]);
  };
}

async function expectNoDocumentOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    bodyTextLength: document.body.innerText.trim().length,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.bodyTextLength).toBeGreaterThan(20);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

async function expectVisibleControlsInsideViewport(page: Page, scope?: Locator) {
  const root = scope ?? page.locator("body");
  const offenders = await root.evaluate((container) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    return Array.from(container.querySelectorAll("button, [role='button'], input, textarea, select"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (style.visibility === "hidden" || style.display === "none") return false;
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (rect.bottom <= 0 || rect.top >= viewportHeight) return false;
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: (element.textContent ?? "").trim().slice(0, 80),
          aria: element.getAttribute("aria-label"),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      });
  });
  expect(offenders).toEqual([]);
}

async function expectNoBannedVisualEffects(page: Page) {
  const offenders = await page.evaluate(() => {
    const bannedClass = /(^|\s)(shadow-|bg-gradient|backdrop-blur)/;
    const bannedStyle = /(box-shadow|linear-gradient|conic-gradient|backdrop-filter)/i;
    return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        // Purposeful glass/elevation on floating chrome (nav bars, sticky
        // headers, modal panels) is a sanctioned exception, marked with
        // data-glass. The guard still catches decorative glass/shadow slop
        // everywhere else.
        if (element.closest("[data-glass]")) return false;
        const className = element.getAttribute("class") ?? "";
        const style = element.getAttribute("style") ?? "";
        return bannedClass.test(className) || bannedStyle.test(style);
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").trim().slice(0, 80),
        className: element.getAttribute("class") ?? "",
        style: element.getAttribute("style") ?? "",
      }));
  });
  expect(offenders).toEqual([]);
}

async function exerciseTaskSheetInputs(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("button", { name: "Add task" }).click();
  } else {
    await page.getByText("New Task").first().click();
  }

  const title = page.getByLabel("Task title");
  await expect(title).toBeVisible();
  await title.fill("Playwright text input check");

  const note = page.getByLabel("Task note");
  await note.fill("Line one");
  await note.press("Enter");
  await note.type("Line two");
  await expect(note).toHaveValue("Line one\nLine two");

  await page.getByRole("button", { name: "One-off" }).click();
  await page.getByLabel("One-off task date").fill("2026-06-26");

  await page.getByRole("button", { name: /Add Subtask|Add Step/ }).click();
  await page.getByLabel("Subtask name").first().fill("Prepare input states");
  await page.getByLabel("Subtask duration").first().fill("10m");
  await page.getByLabel("Subtask info").first().fill("No overflow on mobile");
  await page.getByLabel("Subtask deadline date").first().fill("2026-06-27");

  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page, isMobile ? undefined : page.getByRole("dialog").last());
  await expectNoBannedVisualEffects(page);

  if (!isMobile) {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  } else {
    await page.getByRole("button", { name: "Close" }).click();
    await expect(title).toBeHidden();
  }
}

async function expectOverviewDashboard(page: Page, isMobile: boolean) {
  const dashboard = page.getByTestId("overview-dashboard");
  await expect(dashboard).toBeVisible();
  await expect(page.getByTestId("overview-today-card")).toContainText("Morning Run");
  await expect(page.getByTestId("overview-week-card")).toContainText("This Week");
  await expect(page.getByTestId("overview-progress-card")).toContainText("Weekly Progress");
  await expect(page.getByTestId("overview-tracking-card")).toContainText("Run Distance");
  await expect(page.getByTestId("overview-plan-card")).toContainText("Cardio");
  await expect(page.getByTestId("overview-routine-card")).toContainText("Hydrate");

  if (isMobile) {
    await expect(page.getByText("Current Task")).toHaveCount(0);
    const todayBox = await page.getByTestId("overview-today-card").boundingBox();
    const weekBox = await page.getByTestId("overview-week-card").boundingBox();
    expect(todayBox).not.toBeNull();
    expect(weekBox).not.toBeNull();
    expect(todayBox!.y).toBeLessThan(weekBox!.y);
  }

  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);
}

async function exerciseDesktopHighImpactRoutes(page: Page) {
  await page.getByRole("button", { name: "Plans" }).click();
  await expect(page.getByText("My Plans").first()).toBeVisible();
  await expectNoBannedVisualEffects(page);
  await page.getByRole("button", { name: /Cardio/ }).first().click();
  await expect(page.getByText("Planned Tasks").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);

  // Desktop plan detail exposes an Edit affordance that opens the edit sheet.
  await page.getByRole("button", { name: "Edit plan" }).click();
  const editSheet = page.getByRole("dialog").last();
  await expect(editSheet.getByText("Plan Details")).toBeVisible();
  await expect(editSheet.getByRole("button", { name: "Save Changes" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editSheet.getByText("Plan Details")).toBeHidden();

  await page.getByRole("button", { name: "Routine" }).click();
  await expect(page.getByText("Routine").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);

  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByText("Skin and Dental Care").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Settings").first()).toBeVisible();
  await expect(page.getByText("Appearance").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);
}

async function exerciseMobileHighImpactRoutes(page: Page) {
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Plans" }).click();
  await expect(page.getByText("Plans").first()).toBeVisible();
  await expectNoBannedVisualEffects(page);
  await page.getByRole("button", { name: /Cardio/ }).first().click();
  await expect(page.getByText("Planned Tasks").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Overview" }).click();
  await expect(page.getByText("Dashboard").first()).toBeVisible();
  await expectOverviewDashboard(page, true);

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Routine" }).click();
  await expect(page.getByText("Routine").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);

  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByText("Skin and Dental Care").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Settings").first()).toBeVisible();
  await expect(page.getByText("Appearance").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);
}

async function expectDesktopSchedule(page: Page) {
  await openSeededApp(page);
  await expect(page.getByText("Morning Run").first()).toBeVisible();
  await expect(page.getByText("GMAT").first()).toBeVisible();
  await expect(page.getByText("New Task").first()).toBeVisible();

  await exerciseTaskSheetInputs(page, false);
  await exerciseDesktopHighImpactRoutes(page);

  await page.getByText("Overview", { exact: true }).first().click();
  await expect(page.getByText("Overview").first()).toBeVisible();
  await expect(page.locator("body")).toContainText("Tasks Done");
  await expectOverviewDashboard(page, false);

  await expectNoDocumentOverflow(page);
  await expectNoBannedVisualEffects(page);
}

async function expectMobileSchedule(page: Page) {
  await openSeededApp(page, "/?mobileShell=1", "Dashboard");
  await expect(page.getByText("Dashboard").first()).toBeVisible();
  await expectOverviewDashboard(page, true);

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("Today").first()).toBeVisible();
  await expect(page.getByText("Morning Routine").first()).toBeVisible();

  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);
  await exerciseTaskSheetInputs(page, true);
  await exerciseMobileHighImpactRoutes(page);
}

test("renders seeded schedule in the configured viewport", async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = collectRuntimeErrors(page, testInfo);

  if (testInfo.project.name === "mobile-chromium") {
    await expectMobileSchedule(page);
  } else {
    await expectDesktopSchedule(page);
  }
  await assertNoRuntimeErrors();
});

test("exports a restorable JSON backup from Settings", async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = collectRuntimeErrors(page, testInfo);
  test.skip(testInfo.project.name === "mobile-chromium", "Backup export covered on desktop nav");

  await openSeededApp(page);
  await page.getByRole("button", { name: "Settings" }).click();

  // New Data-section affordances render and read consistently.
  await expect(page.getByText("Export backup").first()).toBeVisible();
  await expect(page.getByText("Restore from backup").first()).toBeVisible();
  await expect(page.getByText("Reminders").first()).toBeVisible();
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);

  // Exporting produces a dated PlanR backup whose payload round-trips the schedule.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^planr-backup-\d{4}-\d{2}-\d{2}\.json$/);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(parsed.app).toBe("PlanR");
  expect(parsed.format).toBeGreaterThanOrEqual(1);
  expect(parsed.schedule?.plans?.map((p: { id: string }) => p.id)).toContain("cardio");

  await assertNoRuntimeErrors();
});

test("shows the getting-started guide for a fresh user", async ({ page }, testInfo) => {
  const assertNoRuntimeErrors = collectRuntimeErrors(page, testInfo);

  // No seeded data + no dismissal flag → the onboarding guide should lead.
  const path = testInfo.project.name === "mobile-chromium" ? "/?mobileShell=1" : "/";
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await dismissInstallPrompt(page);

  await expect(page.locator("body")).toContainText("Make your day trackable", { timeout: 20_000 });
  await expect(page.getByText("Create your first plan").first()).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectVisibleControlsInsideViewport(page);
  await expectNoBannedVisualEffects(page);

  await assertNoRuntimeErrors();
});
