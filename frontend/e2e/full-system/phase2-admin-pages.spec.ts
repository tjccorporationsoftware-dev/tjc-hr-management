import { expect, test, type Page } from "@playwright/test";

import { STATE_COMPANY_ADMIN, STATE_SUPERADMIN, shot } from "./_shared";

/**
 * เฟส 2 — หน้าผู้ดูแลระบบ
 * -----------------------------------------------------------------------------
 * รอบนี้ตรวจ "เข้าถึงได้และไม่พัง" ของทุกหน้าก่อน แล้วค่อยลงลึกทีละหน้า
 * เพราะถ้าหน้าใดเปิดไม่ได้เลย การไปตั้งค่าต่อก็ไม่มีความหมาย
 *
 * หน้าเหล่านี้แบ่งเป็นสองชั้นตาม route-permissions.ts
 *   - หน้าของบริษัท     ผู้ดูแลบริษัทเข้าได้
 *   - หน้า platformOnly ต้องเป็น scope GLOBAL เท่านั้น
 *                       (ความปลอดภัย / monitoring / audit / ถังขยะ)
 * จึงต้องเดินด้วยคนละบัญชี และต้องพิสูจน์ด้วยว่าฝั่งที่ไม่ควรเข้าได้ถูกกันจริง
 */

type AdminPage = { href: string; heading: RegExp };

const COMPANY_PAGES: AdminPage[] = [
  { href: "/users", heading: /ผู้ใช้/ },
  { href: "/roles", heading: /โรล|Role/ },
  { href: "/settings/work-policies", heading: /นโยบาย/ },
  { href: "/settings/system", heading: /ตั้งค่าระบบ|System/ },
  { href: "/settings/system/holiday-calendar", heading: /วันหยุด/ },
  { href: "/settings/system/attendance-devices", heading: /เครื่องสแกน|จุดลงเวลา/ },
  { href: "/settings/system/attendance-methods", heading: /วิธีลงเวลา/ },
  { href: "/settings/system/document-templates", heading: /แม่แบบเอกสาร|เอกสาร/ },
  { href: "/settings/approval-workflow", heading: /สายอนุมัติ|อนุมัติ/ },
];

const PLATFORM_PAGES: AdminPage[] = [
  { href: "/settings/security", heading: /ความปลอดภัย|Security/ },
  { href: "/settings/monitoring", heading: /Monitoring|สถานะระบบ/ },
  { href: "/settings/audit", heading: /Audit|ประวัติการใช้งาน/ },
  { href: "/settings/trash", heading: /ถังขยะ/ },
];

async function expectPageHealthy(page: Page, target: AdminPage) {
  const failedRequests: string[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.url()}`);
    }
  });

  await page.goto(target.href);
  await page.waitForLoadState("domcontentloaded");

  // ต้องไม่ถูกเด้งออกเพราะสิทธิ์ไม่พอ
  await expect(page).toHaveURL(new RegExp(target.href.replace(/\//g, "\\/")));
  await expect(page.getByText(target.heading).first()).toBeVisible({
    timeout: 60_000,
  });

  // ให้เวลาโหลดข้อมูลจนครบก่อนสรุปผล
  await page.waitForTimeout(8_000);

  await expect(page.locator("body")).not.toContainText("Unauthorized");
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.getByText(/กำลังโหลด/)).toHaveCount(0);

  if (failedRequests.length > 0) {
    throw new Error(
      `${target.href} ยิง API แล้วพัง: ${failedRequests.join(" , ")}`,
    );
  }

  await page.screenshot({
    path: shot(`p2-${target.href.replace(/\//g, "-").slice(1)}`),
    fullPage: true,
  });
}

test.describe("เฟส 2 · หน้าตั้งค่าของบริษัท", () => {
  test.use({ storageState: STATE_COMPANY_ADMIN });

  for (const target of COMPANY_PAGES) {
    test(`ผู้ดูแลบริษัทเปิด ${target.href} ได้และไม่ขึ้นข้อผิดพลาด`, async ({
      page,
    }) => {
      await expectPageHealthy(page, target);
    });
  }

  test("หน้าเฉพาะแพลตฟอร์มต้องกันผู้ดูแลบริษัทออก", async ({ page }) => {
    for (const target of PLATFORM_PAGES) {
      await page.goto(target.href);
      await page.waitForLoadState("domcontentloaded");
      await expect(
        page.getByText(/ไม่มีสิทธิ์เข้าถึงหน้านี้/).first(),
      ).toBeVisible({ timeout: 30_000 });
    }
    await page.screenshot({ path: shot("p2-platform-denied"), fullPage: true });
  });
});

test.describe("เฟส 2 · หน้าเฉพาะผู้ดูแลแพลตฟอร์ม", () => {
  test.use({ storageState: STATE_SUPERADMIN });

  for (const target of PLATFORM_PAGES) {
    test(`ผู้ดูแลแพลตฟอร์มเปิด ${target.href} ได้และไม่ขึ้นข้อผิดพลาด`, async ({
      page,
    }) => {
      await expectPageHealthy(page, target);
    });
  }
});
