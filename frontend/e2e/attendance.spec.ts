import { expect, test } from "@playwright/test";
import { login, UAT, waitForPageReady } from "./helpers";

test.describe("UAT Attendance UI Smoke", () => {
  test("HR can open attendance page and see UAT calculated data", async ({ page }) => {
    await login(page, UAT.hr);
    await page.goto("/attendance");
    await waitForPageReady(page);

    await expect(page.getByText(/Attendance|เวลาเข้าออกงาน|การลงเวลา/i).first()).toBeVisible();

    const searchBox = page.getByPlaceholder(/ค้นหา|Search/i).first();
    if (await searchBox.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await searchBox.fill("UAT-A1");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1_000);
    }

    await expect(page.getByText("UAT Employee A1").first()).toBeVisible();
    await expect(page.getByText(/230|25|20|35/).first()).toBeVisible();
  });
});
