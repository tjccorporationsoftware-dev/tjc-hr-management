import { expect, test } from "@playwright/test";
import { login, UAT, waitForPageReady } from "./helpers";

test.describe("UAT Manager Scope", () => {
  test("Manager A can see only team A and does not see team B", async ({ page }) => {
    await login(page, UAT.managerA);
    await page.goto("/manager/team");
    await waitForPageReady(page);

    await expect(page.getByText("UAT Employee A1").first()).toBeVisible();
    await expect(page.getByText("UAT Employee A2").first()).toBeVisible();
    await expect(page.getByText("UAT Employee B1").first()).toHaveCount(0);
  });

  test("Manager B can see only team B and does not see team A", async ({ page }) => {
    await login(page, UAT.managerB);
    await page.goto("/manager/team");
    await waitForPageReady(page);

    await expect(page.getByText("UAT Employee B1").first()).toBeVisible();
    await expect(page.getByText("UAT Employee A1").first()).toHaveCount(0);
    await expect(page.getByText("UAT Employee A2").first()).toHaveCount(0);
  });
});
