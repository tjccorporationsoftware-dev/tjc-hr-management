import { expect, test } from "@playwright/test";

import { expectToast, shot } from "./_shared";

/**
 * เฟส 1c — พนักงานชุดตั้งต้น
 * -----------------------------------------------------------------------------
 * ลำดับที่ระบบบังคับจริง: องค์กร → พนักงาน → บัญชีผู้ใช้
 * เพราะการสร้างบัญชีผู้ใช้ต้องผูกกับพนักงานเสมอ ("กรุณาเลือกพนักงานที่ต้องการผูกบัญชี")
 * เฟสนี้จึงสร้างพนักงานให้ครบสายบังคับบัญชาก่อน แล้วเฟสถัดไปค่อยผูกบัญชี
 *
 * ช่องบังคับมีแค่ บริษัท / ชื่อ+นามสกุล / วันที่เริ่มงาน ที่เหลือกรอกเพื่อให้
 * ข้อมูลสมจริงพอจะคำนวณเงินเดือนและภาษีได้ในเฟสหลัง
 */

const START_DATE = "2026-01-05";

type NewEmployee = {
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  employeeType: string;
  branch: string;
  /** หัวหน้างานโดยตรง อ้างด้วยชื่อที่แสดงใน dropdown */
  supervisor?: string;
};

/*
 * สายบังคับบัญชาจริงข้ามแผนกได้ ตามที่ backend อนุญาต (บังคับแค่บริษัท+สาขาเดียวกัน)
 * กรรมการผู้จัดการอยู่ฝ่ายบุคคล แต่เป็นหัวหน้าของผู้จัดการทุกฝ่าย
 * ธนาอยู่คนละสาขา จึงผูกกับใครในสำนักงานใหญ่ไม่ได้ ซึ่งถูกตามกติกาสาขา
 * และได้ทดสอบทางสำรองของสายอนุมัติ (ไม่มีหัวหน้า → ตกไปที่ HR) ไปในตัว
 */
const EMPLOYEES: NewEmployee[] = [
  {
    firstName: "สมชาย",
    lastName: "ผู้บริหาร",
    department: "ฝ่ายทรัพยากรบุคคล",
    position: "กรรมการผู้จัดการ",
    employeeType: "พนักงานประจำ (รายเดือน)",
    branch: "สำนักงานใหญ่",
  },
  {
    firstName: "วราภรณ์",
    lastName: "บุคคลดี",
    department: "ฝ่ายทรัพยากรบุคคล",
    position: "ผู้จัดการฝ่าย",
    employeeType: "พนักงานประจำ (รายเดือน)",
    branch: "สำนักงานใหญ่",
    supervisor: "สมชาย",
  },
  {
    firstName: "ปิยะ",
    lastName: "บัญชีแม่น",
    department: "ฝ่ายบัญชีและการเงิน",
    position: "ผู้จัดการฝ่าย",
    employeeType: "พนักงานประจำ (รายเดือน)",
    branch: "สำนักงานใหญ่",
    // ข้ามแผนก: หัวหน้าฝ่ายบัญชีขึ้นตรงกับกรรมการผู้จัดการซึ่งอยู่ฝ่ายบุคคล
    supervisor: "สมชาย",
  },
  {
    firstName: "กมล",
    lastName: "เงินสด",
    department: "ฝ่ายบัญชีและการเงิน",
    position: "เจ้าหน้าที่อาวุโส",
    employeeType: "พนักงานประจำ (รายเดือน)",
    branch: "สำนักงานใหญ่",
    supervisor: "ปิยะ",
  },
  {
    firstName: "อรุณี",
    lastName: "ตั้งใจงาน",
    department: "ฝ่ายเทคโนโลยีสารสนเทศ",
    position: "ผู้จัดการฝ่าย",
    employeeType: "พนักงานประจำ (รายเดือน)",
    branch: "สำนักงานใหญ่",
    supervisor: "สมชาย",
  },
  {
    firstName: "ชัยวัฒน์",
    lastName: "โค้ดดี",
    department: "ฝ่ายเทคโนโลยีสารสนเทศ",
    position: "เจ้าหน้าที่",
    employeeType: "พนักงานทดลองงาน",
    branch: "สำนักงานใหญ่",
    supervisor: "อรุณี",
  },
  {
    firstName: "ธนา",
    lastName: "ขยันคลัง",
    department: "ฝ่ายปฏิบัติการคลังสินค้า",
    position: "พนักงานปฏิบัติการ",
    employeeType: "พนักงานรายวัน",
    branch: "คลังสินค้าบางนา",
  },
];

/** โมดัลคือกล่องนอกสุดที่มีปุ่มบันทึกพนักงานอยู่ข้างใน */
function employeeModal(page: import("@playwright/test").Page) {
  return page
    .locator("div")
    .filter({
      has: page.getByRole("button", { name: "บันทึกพนักงาน", exact: true }),
    })
    .first();
}

/**
 * เลือก option จาก label ของฟิลด์
 * โครงของ FormSelect คือ <label><span>ชื่อฟิลด์</span><select>...</select></label>
 * ตัว select จึงเป็น "ลูก" ของ label ไม่ใช่ following sibling
 */
async function selectByLabel(
  page: import("@playwright/test").Page,
  label: string,
  optionText: string,
) {
  const select = employeeModal(page)
    .locator("label")
    .filter({ hasText: new RegExp(`^${label}`) })
    .locator("select")
    .first();
  const options = await select
    .locator("option")
    .evaluateAll((els) =>
      els.map((el) => ({
        value: (el as HTMLOptionElement).value,
        text: el.textContent?.trim() ?? "",
      })),
    );
  const match = options.find((o) => o.text.includes(optionText));
  if (!match) {
    throw new Error(
      `ช่อง "${label}" ไม่มีตัวเลือก "${optionText}" — มีให้เลือก: ${options
        .map((o) => o.text)
        .join(" | ")}`,
    );
  }
  await select.selectOption(match.value);
}

test.describe("เฟส 1c · พนักงานชุดตั้งต้น", () => {
  test.describe.configure({ mode: "serial" });

  test("เพิ่มพนักงาน 7 คนครบทุกแผนก", async ({ page }) => {
    await page.goto("/employees");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("button", { name: "เพิ่มพนักงาน", exact: true }).first(),
    ).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(10_000);

    for (const emp of EMPLOYEES) {
      await page
        .getByRole("button", { name: "เพิ่มพนักงาน", exact: true })
        .first()
        .click();
      await page.waitForTimeout(1500);

      await page.getByPlaceholder("ชื่อ", { exact: true }).fill(emp.firstName);
      await page.getByPlaceholder("นามสกุล", { exact: true }).fill(emp.lastName);

      await selectByLabel(page, "บริษัท", "ทีเจซี");
      await selectByLabel(page, "สาขา", emp.branch);
      await selectByLabel(page, "แผนก", emp.department);
      await selectByLabel(page, "ตำแหน่ง", emp.position);
      await selectByLabel(page, "ประเภทการจ้างงาน", emp.employeeType);
      if (emp.supervisor) {
        await selectByLabel(page, "หัวหน้างานโดยตรง", emp.supervisor);
      }

      // วันที่เริ่มงานเป็นช่องบังคับ ใช้ input[type=date] ที่อยู่ถัดจาก label
      await employeeModal(page)
        .locator("label")
        .filter({ hasText: /^วันที่เริ่มงาน/ })
        .locator("input[type='date']")
        .first()
        .fill(START_DATE);

      await page
        .getByRole("button", { name: "บันทึกพนักงาน", exact: true })
        .click();
      await expectToast(page, /สำเร็จ/);

      await expect(
        page.getByText(`${emp.firstName} ${emp.lastName}`).first(),
      ).toBeVisible({ timeout: 30_000 });
    }

    await page.screenshot({ path: shot("p1c-01-employees"), fullPage: true });
  });

  test("เลือกหัวหน้างานข้ามแผนกได้ตามกติกาจริงของระบบ", async ({ page }) => {
    await page.goto("/employees");
    await page.waitForLoadState("domcontentloaded");
    await expect(
      page.getByRole("button", { name: "เพิ่มพนักงาน", exact: true }).first(),
    ).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(10_000);

    await page
      .getByRole("button", { name: "เพิ่มพนักงาน", exact: true })
      .first()
      .click();
    await page.waitForTimeout(1500);

    await selectByLabel(page, "บริษัท", "ทีเจซี");
    await selectByLabel(page, "สาขา", "สำนักงานใหญ่");
    await selectByLabel(page, "แผนก", "ฝ่ายบัญชีและการเงิน");

    const options = await employeeModal(page)
      .locator("label")
      .filter({ hasText: /^หัวหน้างานโดยตรง/ })
      .locator("select option")
      .evaluateAll((els) => els.map((el) => el.textContent?.trim() ?? ""));

    /*
     * backend บังคับแค่บริษัทและสาขาเดียวกัน (ensureValidSupervisor)
     * หน้าจอจึงต้องไม่ตัดคนต่างแผนกทิ้ง ไม่งั้นหัวหน้าฝ่ายจะผูกกับ
     * กรรมการผู้จัดการซึ่งอยู่คนละแผนกไม่ได้เลย
     */
    expect(options.join(" | ")).toContain("สมชาย");
    // ตัวเลือกต้องบอกแผนกด้วย เพราะตอนนี้มีคนข้ามแผนกปนอยู่ในรายการ
    expect(options.some((o) => o.includes("ฝ่ายทรัพยากรบุคคล"))).toBe(true);

    // คนแผนกเดียวกันต้องถูกจัดขึ้นก่อนเพื่อให้ยังหาง่าย
    const firstReal = options.filter((o) => o !== "ไม่ระบุหัวหน้างาน")[0] ?? "";
    expect(firstReal).toContain("ฝ่ายบัญชีและการเงิน");

    // คนละสาขาต้องไม่อยู่ในรายการ ตามกฎที่ backend บังคับ
    expect(options.join(" | ")).not.toContain("ธนา");
  });

  test("รายชื่อพนักงานค้นหาและกรองได้", async ({ page }) => {
    await page.goto("/employees");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(12_000);

    const search = page.getByPlaceholder("ชื่อ, รหัสพนักงาน, อีเมล, เบอร์โทร");
    await search.fill("ธนา");
    await page.waitForTimeout(3000);

    await expect(page.getByText("ธนา ขยันคลัง").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("สมชาย ผู้บริหาร")).toHaveCount(0);

    await search.fill("");
    await page.waitForTimeout(3000);
    await expect(page.getByText("สมชาย ผู้บริหาร").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.screenshot({ path: shot("p1c-02-employee-search"), fullPage: true });
  });
});
