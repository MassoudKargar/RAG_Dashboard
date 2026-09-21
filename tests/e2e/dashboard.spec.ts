import { test, expect, Page } from "@playwright/test";

const runSelect = (label: "Primary run" | "Baseline run") => ({ exact: true });

async function selectOption(page: Page, selectLabel: string, value: string) {
  await page.getByLabel(selectLabel, { exact: true }).selectOption(value);
}

test.describe("RAG Benchmark Dashboard", () => {
  test("dashboard loads with title and demo badge", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "RAG Benchmark Dashboard" })).toBeVisible();
    await expect(page.locator("header").getByText("DEMO DATA")).toBeVisible();
  });

  test("metric cards render for the default comparison", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Exact@1 comparison")).toBeVisible();
    await expect(page.getByLabel("MRR comparison")).toBeVisible();
    await expect(page.getByLabel("Latency p95 comparison")).toBeVisible();
    await expect(page.getByLabel("Latency p99 comparison")).toBeVisible();
  });

  test("primary run can be selected", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "Primary run", "run-baseline");
    await expect(page.getByLabel("Primary run", { exact: true })).toHaveValue("run-baseline");
  });

  test("baseline run can be selected", async ({ page }) => {
    await page.goto("/");
    await selectOption(page, "Baseline run", "run-phase4");
    await expect(page.getByLabel("Baseline run", { exact: true })).toHaveValue("run-phase4");
  });

  test("same-run comparison is prevented (baseline auto-corrects to a different run)", async ({ page }) => {
    await page.goto("/");
    // Force baseline to equal primary.
    const primaryVal = await page.getByLabel("Primary run", { exact: true }).inputValue();
    await selectOption(page, "Baseline run", primaryVal);
    const primaryNow = await page.getByLabel("Primary run", { exact: true }).inputValue();
    const baselineNow = await page.getByLabel("Baseline run", { exact: true }).inputValue();
    expect(primaryNow).not.toBe(baselineNow);
    await expect(page.getByRole("button", { name: "Swap primary and baseline runs" })).toBeEnabled();
  });

  test("swap-runs button exchanges primary and baseline", async ({ page }) => {
    await page.goto("/");
    const beforeP = await page.getByLabel("Primary run", { exact: true }).inputValue();
    const beforeB = await page.getByLabel("Baseline run", { exact: true }).inputValue();
    await page.getByRole("button", { name: "Swap primary and baseline runs" }).click();
    await expect(page.getByLabel("Primary run", { exact: true })).toHaveValue(beforeB);
    await expect(page.getByLabel("Baseline run", { exact: true })).toHaveValue(beforeP);
  });

  test("quality improvement is classified correctly (Exact@1 up)", async ({ page }) => {
    await page.goto("/");
    // Default: primary=current (0.96), baseline=baseline (0.68) -> improvement.
    const card = page.getByLabel("Exact@1 comparison");
    await expect(card.getByRole("status")).toHaveText(/Improvement/);
    await expect(card.getByText("▲ Improvement")).toBeVisible();
    // Deltas: absolute +0.28 -> +28pp, relative +41.2%.
    const cardText = await card.innerText();
    expect(cardText).toContain("+28.0pp");
    expect(cardText).toContain("+41.2%");
  });

  test("latency reduction is classified correctly (p95 down after swap)", async ({ page }) => {
    await page.goto("/");
    // Default: current p95 241.8 vs baseline 176.7 -> regression (slower).
    const before = page.getByLabel("Latency p95 comparison");
    await expect(before.getByText("▲ Regression")).toBeVisible();
    // Swap: baseline becomes primary -> p95 176.7 vs 241.8 -> improvement (faster).
    await page.getByRole("button", { name: "Swap primary and baseline runs" }).click();
    const after = page.getByLabel("Latency p95 comparison");
    await expect(after.getByText("▼ Improvement")).toBeVisible();
  });

  test("deltas update when the baseline changes", async ({ page }) => {
    await page.goto("/");
    const before = await page.getByLabel("Exact@1 comparison").innerText();
    await selectOption(page, "Baseline run", "run-phase4");
    const after = await page.getByLabel("Exact@1 comparison").innerText();
    expect(before).not.toBe(after);
  });

  test("missing value shows Not available rather than zero", async ({ page }) => {
    await page.goto("/");
    // Every card in the summary renders even when a side is missing.
    await expect(page.getByLabel("Failed checks comparison")).toBeVisible();
    await expect(page.getByLabel("Tokens used comparison")).toBeVisible();
    // Tokens are absent from all sample runs -> must say Not available, not 0.
    const text = await page.getByLabel("Tokens used comparison").innerText();
    expect(text).toContain("Not available");
    expect(text).not.toContain("$0");
  });

  test("search filter narrows run history", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Search runs").fill("baseline");
    await expect(page.getByText("1 of 3 runs shown.")).toBeVisible();
    await page.getByLabel("Search runs").fill("zzz-none");
    await expect(page.getByText("No runs match the current filters.")).toBeVisible();
  });

  test("branch filter narrows run history", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Filter by branch").selectOption("feature/year-aware");
    await expect(page.getByText("1 of 3 runs shown.")).toBeVisible();
  });

  test("manual refresh keeps data and re-renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "RAG Benchmark Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.locator("header").getByText("DEMO DATA")).toBeVisible();
    await expect(page.getByLabel("Exact@1 comparison")).toBeVisible();
  });

  test("API failure shows error state and retry recovers", async ({ page }) => {
    await page.goto("/");
    // Break the API once.
    let broken = true;
    await page.route("**/api/runs", async (route) => {
      if (broken) await route.abort();
      else await route.continue();
    });
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(/failed/i);
    // Recover.
    broken = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByLabel("Exact@1 comparison")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("keyboard navigation reaches controls", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(focused).toBeTruthy();
    // Shift+Tab back to the refresh button and press Enter to trigger it.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("header").getByText("DEMO DATA")).toBeVisible();
  });

  test("history row actions select primary and baseline", async ({ page }) => {
    await page.goto("/");
    const row = page.getByRole("row", { name: /Baseline — pre-upgrade/i });
    await row.getByRole("button", { name: "Set as primary" }).click();
    await expect(page.getByLabel("Primary run", { exact: true })).toHaveValue("run-baseline");
  });

  test.describe("layout", () => {
    test("no horizontal overflow (mobile usable)", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "RAG Benchmark Dashboard" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow).toBe(false);
      await expect(page.getByLabel("Exact@1 comparison")).toBeVisible();
      await expect(page.getByRole("button", { name: "Swap primary and baseline runs" })).toBeVisible();
    });

    test("desktop layout renders all sections", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Comparison" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Run history" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Quality metrics" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Latency metrics (lower is better)" })).toBeVisible();
    });
  });
});