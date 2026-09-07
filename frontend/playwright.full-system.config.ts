import { defineConfig, devices } from "@playwright/test";

/**
 * config เฉพาะชุด "ทดสอบใช้งานจริงตั้งแต่ต้นจนจบ"
 * -----------------------------------------------------------------------------
 * แยกจาก playwright.config.ts เดิมเพราะ
 *   - frontend dev รันที่พอร์ต 3002 ไม่ใช่ 3000
 *   - หลายหน้าโหลดช้า (/organization ยิง API 16 จุด) ต้องใช้ timeout ยาวกว่าเดิม
 *   - ชุดนี้ล็อกอินผ่าน UI ครั้งเดียวใน setup แล้วใช้ session ต่อทุกเทส
 *     ไม่งั้นจะชนลิมิต POST /auth/login (10 ครั้ง/60 วินาที ต่อ IP+อีเมล)
 *   - ไม่ใช้ globalSetup เดิมที่ล็อกอินบัญชี seed ชุดเก่าซึ่งไม่มีในฐานข้อมูลแล้ว
 */

/*
 * เบราว์เซอร์ที่ใช้รัน
 *
 * ค่าเริ่มต้นเป็น Microsoft Edge เพราะเวลารันแบบ --headed แล้วนั่งดูสด
 * Edge เป็นตัวที่มีอยู่แล้วในเครื่อง Windows ไม่ต้องโหลด Chromium ของ Playwright
 * และหน้าต่างที่เปิดขึ้นมาก็เป็นเบราว์เซอร์ที่ผู้ใช้จริงใช้กัน
 *
 * ตั้ง E2E_CHANNEL=chromium เมื่อรันบนเครื่องที่ไม่มี Edge เช่น CI บน Linux
 * (Playwright ใช้ Chromium ที่ตัวเองโหลดมาเมื่อไม่ได้ระบุ channel)
 */
const browserChannel = process.env.E2E_CHANNEL ?? "msedge";

/*
 * รันแบบเปิดหน้าต่างให้ดูสด = ขยายเต็มจอ
 *
 * ค่าเริ่มต้นของ devices["Desktop Chrome"] คือ viewport 1280x720 ตายตัว
 * หน้าต่างจึงเล็กกว่าจอจริงมาก หลายหน้าในระบบนี้เป็นตารางกว้าง
 * ต้องเลื่อนดูเองกว่าจะเห็นว่าเทสไปกดอะไร
 *
 * ตอนรัน headless ยังคง 1280x720 ไว้เหมือนเดิม เพราะขนาดคงที่
 * ทำให้ screenshot ที่เก็บไว้เทียบกันได้ระหว่างรอบ
 */
const headed = process.argv.includes("--headed") || Boolean(process.env.PWDEBUG);

const displayUse = headed
  ? {
      viewport: null,
      // launchOptions ระดับ project ทับของระดับบนทั้งก้อน ต้องใส่ slowMo มาด้วย
      launchOptions: {
        slowMo: Number(process.env.E2E_SLOW_MO ?? 0),
        args: ["--start-maximized"],
      },
    }
  : {};
export default defineConfig({
  testDir: "./e2e/full-system",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3002",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    /*
     * ตั้ง E2E_SLOW_MO เป็นมิลลิวินาที เวลาต้องการรันแบบเปิดหน้าต่าง (--headed)
     * แล้วนั่งดูว่าระบบกรอกอะไรลงช่องไหน ปกติเร็วจนตามองไม่ทัน
     */
    launchOptions: {
      slowMo: Number(process.env.E2E_SLOW_MO ?? 0),
      ...(headed ? { args: ["--start-maximized"] } : {}),
    },
    ...(headed ? { viewport: null } : {}),
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel === "chromium" ? {} : { channel: browserChannel }),
        ...displayUse,
      },
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel === "chromium" ? {} : { channel: browserChannel }),
        ...displayUse,
        storageState: "e2e/.auth/superadmin.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
