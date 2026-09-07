import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { request } from "@playwright/test";

import { TOKEN_STORE_PATH, UAT } from "./helpers";

/**
 * ล็อกอินครั้งเดียวต่อบัญชี แล้วเก็บ token ลงไฟล์
 * ==============================================
 * เดิมแต่ละเทสต์ล็อกอินเอง ทำให้ชนสองลิมิตของ backend:
 *   POST /auth/login       limit 10 / 60 วินาที  (key = IP + email)
 *   POST /auth/2fa/verify  limit 10 / 300 วินาที (key = IP เท่านั้น)
 * ชุด smoke มี 22 เทสต์ จึงโดน 429 กลางทางเสมอ
 *
 * แคชใน module ไม่พอ เพราะ Playwright รีสตาร์ท worker เมื่อมีเทสต์ล้ม
 * ทำให้ตัวแปรใน module หายแล้วกลับไปล็อกอินใหม่ กลายเป็นวงจรยิ่งล้มยิ่งยิง
 * เก็บลงไฟล์จึงอยู่รอดข้าม worker และใช้ล็อกอินรวมเพียงจำนวนบัญชีต่อการรันหนึ่งครั้ง
 */

const API_BASE_URL =
  process.env.E2E_API_BASE_URL ?? "http://localhost:4000/api";

type LoginPayload = {
  requiresTwoFactor?: boolean;
  accessToken?: string;
  twoFactorToken?: string;
  debugTwoFactorCode?: string;
  data?: LoginPayload;
};

function unwrap(payload: LoginPayload | null): LoginPayload {
  if (payload?.data) return payload.data;
  return payload ?? {};
}

export default async function globalSetup() {
  const emails = Array.from(
    new Set([
      UAT.admin,
      UAT.hr,
      UAT.payroll,
      UAT.executive,
      UAT.managerA,
      UAT.managerB,
      UAT.employeeA1,
    ]),
  );

  const context = await request.newContext();
  const tokens: Record<string, string> = {};

  for (const email of emails) {
    const response = await context.post(`${API_BASE_URL}/auth/login`, {
      data: { email, password: UAT.password },
    });

    if (!response.ok()) {
      console.warn(
        `[e2e setup] ล็อกอิน ${email} ไม่สำเร็จ (${response.status()}) — เทสต์ที่ใช้บัญชีนี้จะล้ม`,
      );
      continue;
    }

    let body = unwrap((await response.json().catch(() => null)) as LoginPayload);

    if (body.requiresTwoFactor) {
      if (!body.twoFactorToken || !body.debugTwoFactorCode) {
        console.warn(
          `[e2e setup] ${email} ต้องใช้ 2FA แต่ไม่มี debugTwoFactorCode — ตั้ง TWO_FACTOR_DEV_SHOW_CODE=true ที่ backend`,
        );
        continue;
      }

      const verify = await context.post(`${API_BASE_URL}/auth/2fa/verify`, {
        data: {
          twoFactorToken: body.twoFactorToken,
          code: body.debugTwoFactorCode,
        },
      });

      if (!verify.ok()) {
        console.warn(
          `[e2e setup] ยืนยัน 2FA ของ ${email} ไม่สำเร็จ (${verify.status()})`,
        );
        continue;
      }

      body = unwrap((await verify.json().catch(() => null)) as LoginPayload);
    }

    if (body.accessToken) {
      tokens[email] = body.accessToken;
    }
  }

  await context.dispose();

  mkdirSync(dirname(TOKEN_STORE_PATH), { recursive: true });
  writeFileSync(TOKEN_STORE_PATH, JSON.stringify(tokens, null, 2), "utf8");

  console.log(
    `[e2e setup] เตรียม token แล้ว ${Object.keys(tokens).length}/${emails.length} บัญชี`,
  );
}
