import { expect, test, type Page } from "@playwright/test";

import { STATE_EMPLOYEE, shot } from "./_shared";

/**
 * เฟส 5a — หน้า ESS ของพนักงาน
 * -----------------------------------------------------------------------------
 * เดินด้วยบัญชีพนักงานทั่วไป (EMPLOYEE, ขอบเขตระดับสาขา)
 * เพื่อพิสูจน์ว่าคนที่สิทธิ์น้อยที่สุดยังใช้งานส่วนของตัวเองได้ครบ
 * และไม่หลุดไปเห็นข้อมูลของคนอื่น
 */

type EssPage = { href: string; heading: RegExp };

const ESS_PAGES: EssPage[] = [
  { href: "/ess", heading: /พนักงาน|Self-Service/ },
  { href: "/ess/my-profile", heading: /ข้อมูล/ },
  { href: "/ess/check-in", heading: /ลงเวลา/ },
  { href: "/ess/my-attendance", heading: /ประวัติ|ลงเวลา/ },
  { href: "/ess/requests", heading: /คำขอ/ },
  { href: "/ess/requests/leave", heading: /ลา/ },
  { href: "/ess/requests/overtime", heading: /OT|ล่วงเวลา/ },
  { href: "/ess/requests/time-adjust", heading: /แก้เวลา|นอกสถานที่/ },
  { href: "/ess/requests/documents", heading: /เอกสาร/ },
  { href: "/ess/salary-slip", heading: /สลิป|เงินเดือน/ },
];

async function expectPageHealthy(page: Page, target: EssPage) {
  const failedRequests: string[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto(target.href);
  await page.waitForLoadState("domcontentloaded");

  await expect(page).toHaveURL(new RegExp(target.href.replace(/\//g, "\\/")));
  await expect(page.getByText(target.heading).first()).toBeVisible({
    timeout: 60_000,
  });

  await page.waitForTimeout(8_000);

  await expect(page.locator("body")).not.toContainText("Unauthorized");
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.getByText(/ไม่มีสิทธิ์เข้าถึงหน้านี้/)).toHaveCount(0);

  if (failedRequests.length > 0) {
    throw new Error(
      `${target.href} ยิง API แล้วพัง: ${failedRequests.join(" , ")}`,
    );
  }

  await page.screenshot({
    path: shot(`p5a-${target.href.replace(/\//g, "-").slice(1)}`),
    fullPage: true,
  });
}

test.describe("เฟส 5a · หน้า ESS", () => {
  test.use({ storageState: STATE_EMPLOYEE });

  for (const target of ESS_PAGES) {
    test(`พนักงานเปิด ${target.href} ได้และไม่ขึ้นข้อผิดพลาด`, async ({
      page,
    }) => {
      await expectPageHealthy(page, target);
    });
  }

  test("พนักงานต้องเห็นเฉพาะข้อมูลของตัวเอง ไม่หลุดไปหน้าจัดการ", async ({
    page,
  }) => {
    /*
     * หน้าเหล่านี้เป็นของ HR/ผู้ดูแล พนักงานทั่วไปต้องเข้าไม่ได้
     * ถ้าเข้าได้แปลว่าเห็นข้อมูลเงินเดือนและประวัติของคนทั้งบริษัท
     */
    for (const href of ["/employees", "/payroll/compensation", "/users"]) {
      await page.goto(href);
      await page.waitForLoadState("domcontentloaded");
      await expect(
        page.getByText(/ไม่มีสิทธิ์เข้าถึงหน้านี้/).first(),
      ).toBeVisible({ timeout: 30_000 });
    }

    await page.screenshot({ path: shot("p5a-denied"), fullPage: true });
  });
});
