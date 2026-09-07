import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  // ล็อกอินรวมครั้งเดียวต่อบัญชี แล้วเก็บ token ลงไฟล์
  // กันไม่ให้ชนลิมิต /auth/login (10/60s) และ /auth/2fa/verify (10/300s)
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  // บางหน้า (เช่น /organization ที่ยิง API 16 จุด และ /onboarding ที่ไล่ /employees
  // ทีละหน้าแบบ sequential) ใช้เวลาโหลดนานพอที่จะพลาด assertion เมื่อรันต่อกันยาว ๆ
  // ให้ retry 1 ครั้งเพื่อไม่ให้ความช้าแบบชั่วคราวรายงานเป็นของพัง
  retries: 1,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    // เปิดหน้าต่างเบราว์เซอร์จริงให้ดูสด ๆ ตอนเดโม/ตรวจงานด้วยตา
    //   DEMO_HEADED=1 DEMO_SLOWMO=400 npx playwright test ...
    headless: !process.env.DEMO_HEADED,
    launchOptions: {
      slowMo: Number(process.env.DEMO_SLOWMO ?? 0),
      args: process.env.DEMO_HEADED ? ["--start-maximized"] : [],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
