import { mkdirSync } from "fs";
import { join } from "path";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * ตัวช่วยกลางของชุดทดสอบ "ใช้งานจริงตั้งแต่ต้นจนจบ"
 * -----------------------------------------------------------------------------
 * ชุดนี้ขับผ่านหน้าจอจริงทั้งหมด ไม่ยิง API ตรง เพื่อพิสูจน์ว่าใช้งานได้จริง
 * แยกจาก e2e เดิมที่อ้างบัญชี seed ชุดอื่นซึ่งไม่มีในฐานข้อมูลแล้ว
 */

export const SUPERADMIN = {
  email: "superadmin@tjc.local",
  password: "Admin@123456",
};

/** รหัสผ่านของบัญชีที่จะสร้างระหว่างทดสอบ */
export const TEST_PASSWORD = "Tjc@2026Pass";

export const SHOT_DIR = join(process.cwd(), "e2e-artifacts");

/** ไฟล์เก็บ session ที่ auth.setup.ts ล็อกอินไว้ให้ทุกเฟสใช้ร่วมกัน */
export const STATE_SUPERADMIN = "e2e/.auth/superadmin.json";

/**
 * ผู้ดูแลบริษัท (SYSTEM_ADMIN + HR_ADMIN, scope ระดับสาขา)
 * เฟสตั้งค่าระบบขึ้นไปใช้บัญชีนี้ เพราะเป็นคนที่ใช้งานจริงในบริษัท
 * และได้ทดสอบการผูกสิทธิ์ไปในตัวว่าเข้าถึงหน้าที่ควรเข้าได้จริง
 */
export const COMPANY_ADMIN = {
  email: "waraporn@tjc.co.th",
  password: TEST_PASSWORD,
};

export const STATE_COMPANY_ADMIN = "e2e/.auth/company-admin.json";

/**
 * บัญชีเงินเดือน (PAYROLL_ACCOUNTING + MANAGER, scope ระดับบริษัท)
 * เฟสค่าตอบแทน ภาษี และการจ่ายเงินเดือนใช้บัญชีนี้
 * เพราะเป็นคนที่ทำงานนี้จริง และได้ตรวจการผูกสิทธิ์ไปในตัว
 */
export const PAYROLL_USER = {
  email: "piya@tjc.co.th",
  password: TEST_PASSWORD,
};

export const STATE_PAYROLL = "e2e/.auth/payroll.json";

/**
 * พนักงานทั่วไป (EMPLOYEE, scope ระดับสาขา) ใช้ทดสอบ ESS
 * ตั้งค่าวิธีลงเวลาไว้แบบ "ประจำออฟฟิศ" คือเว็บ + บังคับอยู่ในพื้นที่
 * จึงต้องจำลองพิกัด GPS ให้อยู่ในรัศมีของสำนักงานใหญ่ตอนลงเวลา
 */
export const EMPLOYEE_USER = {
  email: "kamon@tjc.co.th",
  password: TEST_PASSWORD,
};

export const STATE_EMPLOYEE = "e2e/.auth/employee.json";

/** พิกัดสำนักงานใหญ่ที่ตั้งไว้ในเฟส 2d (รัศมี 150 เมตร) */
export const HQ_GEOLOCATION = { latitude: 13.7563, longitude: 100.5018 };

export function shot(name: string) {
  mkdirSync(SHOT_DIR, { recursive: true });
  return join(SHOT_DIR, `${name}.png`);
}

/**
 * ล็อกอินผ่านฟอร์มจริง รวมหน้ายืนยัน 2FA
 *
 * รหัส 2FA อ่านจากกล่อง "Dev 2FA Code" ที่หน้าเว็บแสดงเองในโหมด development
 * จึงยังถือว่าเดินผ่าน UI ทั้งเส้น ไม่ได้ไปดึงจาก response
 */
export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
): Promise<{ usedTwoFactor: boolean }> {
  await page.goto("/login");
  await page.getByPlaceholder("demo0008@example.com").fill(email);
  await page.getByPlaceholder("กรอกรหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();

  /*
   * ต้องเผื่อเวลาให้พอ เพราะโหมด --headed + slowMo หน่วงทุก action
   * ถ้าตั้งสั้นไปจะสรุปผิดว่าไม่ต้องใช้ 2FA แล้วไปรอ URL เปลี่ยนจนหมดเวลา
   * โดยที่หน้าจอยังค้างอยู่ที่หน้ายืนยันรหัส
   */
  const twoFactorHeading = page.getByRole("heading", { name: "ยืนยัน 2FA" });
  const needsTwoFactor = await twoFactorHeading
    .waitFor({ state: "visible", timeout: 25_000 })
    .then(() => true)
    .catch(() => false);

  if (!needsTwoFactor) {
    // ถ้าไม่ไปหน้า 2FA และยังอยู่หน้าล็อกอิน แปลว่ามี error ให้ยกข้อความนั้นออกมา
    const failed = await page
      .waitForURL((url) => !url.pathname.startsWith("/login"), {
        // เผื่อเวลาให้ dev server compile หน้าปลายทางที่ยังไม่เคยเปิด
        timeout: 60_000,
      })
      .then(() => false)
      .catch(() => true);

    if (failed) {
      const reason = (
        await page.locator("[data-sonner-toast]").allInnerTexts()
      ).join(" | ");
      throw new Error(`ล็อกอินไม่สำเร็จ: ${reason || "ไม่มีข้อความแจ้งเตือน"}`);
    }

    return { usedTwoFactor: false };
  }

  const devCode = await page
    .locator("div", { hasText: /^Dev 2FA Code$/ })
    .locator("xpath=following-sibling::div[1]")
    .innerText();

  await page.getByPlaceholder("000000").fill(devCode.trim());
  await page.getByRole("button", { name: "ยืนยันและเข้าสู่ระบบ" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 60_000,
  });

  return { usedTwoFactor: true };
}

/**
 * รากของโมดัลที่เปิดอยู่บนสุด
 *
 * ทุกโมดัลในระบบนี้ครอบด้วย <div class="fixed inset-0 ..."> เสมอ
 * ต้องใช้ตัวนี้จำกัดขอบเขตทุกครั้ง ห้ามใช้วิธี "หา div ที่มีปุ่มบันทึกอยู่ข้างใน"
 *
 * เคสที่เคยพลาดหนัก: ใช้ div ที่มีปุ่มบันทึก ซึ่งได้ div ครอบทั้งหน้า
 * ทำให้ไปเลือก dropdown "พนักงาน" ของตัวกรองหน้าแทนของในโมดัล
 * ฐานเงินเดือนเลยถูกบันทึกใส่ผิดคนทั้งชุดโดยเทสยังผ่าน
 */
export function modalRoot(page: Page) {
  /*
   * ต้องเลือกเฉพาะ overlay ที่มีช่องกรอกอยู่ข้างในจริง
   * เพราะหน้าเว็บมี overlay แบบ fixed inset-0 อื่นปนอยู่ด้วย
   * (เช่น แถบเครื่องมือของ Next.js ตอน dev) ถ้าเอาตัวสุดท้ายเฉยๆ
   * จะได้ overlay ที่ว่างเปล่า แล้วหาช่องกรอกไม่เจอโดยไม่มีข้อความบอกสาเหตุ
   */
  return page
    .locator("div.fixed.inset-0")
    .filter({ has: page.locator("input, select, textarea") })
    .last();
}

/**
 * ช่องวันที่แบบไทย
 *
 * ThaiDateInput แสดงเป็น input[type=text] รูปแบบ วว/ดด/พ.ศ. ซึ่งแก้ค่าตรงไม่ได้
 * (onChange เป็น no-op) แต่มี input[type=date] ซ่อนอยู่ข้างในที่รับค่า ISO ปกติ
 * จึงต้องเจาะไปที่ตัวนั้นเสมอ ไม่งั้นค่าที่กรอกจะเงียบหายและได้วันปัจจุบันแทน
 */
export function thaiDateField(scope: Locator | Page, label: string) {
  return fieldByLabel(scope, label, "input[type='date']");
}

/**
 * ช่องกรอกที่อยู่ "ข้างใน" label
 *
 * ฟอร์มเกือบทุกหน้าในระบบนี้เขียนเป็น <label><span>ชื่อช่อง</span><input/></label>
 * ตัว input จึงเป็นลูกของ label ไม่ใช่ following sibling
 * และต้องจำกัดขอบเขต (scope) ไว้ที่โมดัลเสมอ ไม่งั้นจะไปโดนช่องของหน้าที่อยู่ข้างหลัง
 */
export function fieldByLabel(
  scope: Locator | Page,
  label: string | RegExp,
  control = "input",
) {
  const pattern = typeof label === "string" ? new RegExp(`^${label}`) : label;
  return scope
    .locator("label")
    .filter({ hasText: pattern })
    .locator(control)
    .first();
}

/** อ่านตัวเลือกทั้งหมดของ select จาก DOM (option ใน select ที่ปิดอยู่ไม่ visible) */
export async function selectOptionByText(select: Locator, text: string) {
  // แยกให้ชัดระหว่าง "หา select ไม่เจอ" กับ "เจอแต่ไม่มีตัวเลือกที่ต้องการ"
  if ((await select.count()) === 0) {
    throw new Error("หา dropdown ไม่เจอ — ตรวจ label หรือขอบเขต (scope) ที่ใช้");
  }

  const options = await select
    .locator("option")
    .evaluateAll((els) =>
      els.map((el) => ({
        value: (el as HTMLOptionElement).value,
        text: el.textContent?.trim() ?? "",
      })),
    );
  /*
   * ต้องลองจับแบบตรงตัวก่อนเสมอ
   * เคสที่เคยพลาด: เลือก "เจ้าหน้าที่" แล้วได้ "เจ้าหน้าที่อาวุโส"
   * เพราะตัวหลังอยู่บนกว่าในรายการและมีคำว่า "เจ้าหน้าที่" อยู่ข้างใน
   * พนักงานจึงถูกบันทึกผิดตำแหน่งโดยเทสยังผ่าน
   */
  const match =
    options.find((o) => o.text === text) ??
    options.find((o) => o.text.split(" - ")[0].trim() === text) ??
    options.find((o) => o.text.includes(text));
  if (!match) {
    throw new Error(
      `ไม่มีตัวเลือก "${text}" — มีให้เลือก: ${options.map((o) => o.text).join(" | ")}`,
    );
  }
  await select.selectOption(match.value);
  return match;
}

/** ออกจากระบบผ่านปุ่มบนแถบบน */
export async function logoutViaUi(page: Page) {
  await page.getByRole("button", { name: /ออกจากระบบ/ }).first().click();
  await page.waitForURL(/\/login/, { timeout: 20_000 });
}

/**
 * รอโมดัลแจ้งผลสำเร็จแล้วกดรับทราบ
 *
 * ระบบนี้แจ้งผลสำเร็จอยู่ 3 รูปแบบในหน้าต่างกัน
 *   1) toast มุมจอ (sonner)             ใช้มากที่สุด
 *   2) แถบข้อความในหน้า (notice)        หน้าปฏิทินวันหยุด
 *   3) โมดัลยืนยันที่ต้องกด "รับทราบ"    หน้าเริ่มงานพนักงานใหม่
 * เทสจึงต้องรับได้ทั้งสามแบบ ไม่งั้นจะล้มทั้งที่ระบบทำงานถูก
 */
export async function expectSuccessDialog(page: Page, pattern: RegExp) {
  /*
   * หัวข้อโมดัลไม่คงที่ บางงานขึ้น "ดำเนินการสำเร็จ"
   * บางงานขึ้นข้อความเฉพาะเรื่อง เช่น "ผ่านทดลองงานแล้ว"
   * จึงจับที่ปุ่ม "รับทราบ" ซึ่งมีเหมือนกันทุกแบบ
   */
  const acknowledge = page.getByRole("button", { name: "รับทราบ" });
  await expect(acknowledge).toBeVisible({ timeout: 30_000 });

  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  if (!pattern.test(body)) {
    throw new Error(`ข้อความในโมดัลไม่ตรงกับที่คาดไว้ ${pattern}`);
  }

  await acknowledge.click();
  await page.waitForTimeout(1500);
}

/**
 * รอ toast ที่มีข้อความตามที่คาด
 *
 * toast ของ sonner หายเองใน ~4 วินาที ถ้ารอเฉพาะข้อความที่คาดไว้
 * ตอนระบบขึ้น error จะกลายเป็น timeout 15 วินาทีโดยไม่รู้สาเหตุ
 * จึงดักทุก toast ที่โผล่มาก่อน แล้วค่อยเทียบข้อความ เพื่อให้เห็น error จริง
 */
export async function expectToast(
  page: Page,
  pattern: RegExp,
  timeoutMs = 20_000,
) {
  /*
   * ต้องเก็บข้อความ "ทันทีที่เห็น" ไม่ใช่รอแล้วค่อยอ่านซ้ำ
   * toast ของ sonner หายเองใน ~4 วินาที ถ้าเห็นแล้วไปอ่านทีหลัง
   * จะได้รายการว่างและรายงานผิดว่าไม่มี toast ขึ้นเลย
   */
  const toasts = page.locator("[data-sonner-toast]");
  const deadline = Date.now() + timeoutMs;
  const seen: string[] = [];

  while (Date.now() < deadline) {
    const texts = (await toasts.allInnerTexts()).map((t) =>
      t.replace(/\s+/g, " ").trim(),
    );
    for (const text of texts) {
      if (text && !seen.includes(text)) seen.push(text);
      if (pattern.test(text)) return;
    }
    await page.waitForTimeout(200);
  }

  throw new Error(
    `toast ที่ขึ้นคือ ${JSON.stringify(seen)} ซึ่งไม่ตรงกับที่คาดไว้ ${pattern}`,
  );
}
