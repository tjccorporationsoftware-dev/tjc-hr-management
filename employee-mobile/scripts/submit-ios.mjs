/**
 * ส่งไฟล์ที่บิลด์แล้วขึ้น TestFlight
 *
 * ใช้:  npm run submit:ios              (เลือกบิลด์จากรายการ)
 *       npm run submit:ios -- <buildId> (ระบุบิลด์ตรง ๆ)
 *
 * ## ทำไมต้องมีสคริปต์นี้แทนการเรียก eas submit ตรง ๆ
 *
 * `eas submit` **ไม่อ่านค่า env จากโปรไฟล์บิลด์ใน eas.json** ต่างจาก
 * `eas build` มันจึงไปหยิบไฟล์ `.env` ในเครื่องนักพัฒนามาใช้แทน ซึ่งตั้ง
 * `EXPO_PUBLIC_APP_ENV=development` ผลคือ `app.config.ts` คำนวณ bundle ID
 * ออกมาเป็น `com.tjc.employeemobile.development` แล้วไปตั้งค่าให้แอปผิดตัว
 * บน App Store Connect ทั้งที่ไฟล์ที่กำลังจะส่งเป็นของ production
 *
 *   เห็นอาการได้จากบรรทัด
 *   "Looking up credentials configuration for com.tjc.employeemobile.development..."
 *
 * เกิดมาแล้วสองครั้ง (ครั้งหลัง 8 ก.ย. 2569) สคริปต์นี้บังคับค่าจากโปรไฟล์
 * ให้เสมอ จะได้ไม่ต้องจำว่าต้องตั้งตัวแปรอะไรก่อนสั่ง
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* โปรไฟล์ที่ใช้บิลด์ไฟล์สำหรับ TestFlight */
const PROFILE = 'testflight';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const easJson = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
const profile = easJson.build?.[PROFILE];

if (!profile) {
  console.error(`ไม่พบโปรไฟล์ "${PROFILE}" ใน eas.json`);
  process.exit(1);
}

const env = profile.env ?? {};
if (env.EXPO_PUBLIC_APP_ENV !== 'production') {
  console.error(
    `โปรไฟล์ "${PROFILE}" ตั้ง EXPO_PUBLIC_APP_ENV เป็น ` +
      `"${env.EXPO_PUBLIC_APP_ENV}" ซึ่งจะทำให้ bundle ID ไม่ใช่ตัวจริง`,
  );
  process.exit(1);
}

const buildId = process.argv[2];
const args = ['eas-cli', 'submit', '--platform', 'ios', '--profile', PROFILE];
if (buildId) args.push('--id', buildId);

console.log(`ส่งขึ้น TestFlight ด้วยโปรไฟล์: ${PROFILE}`);
console.log(`bundle ID จะเป็นของ: ${env.EXPO_PUBLIC_APP_ENV}`);
console.log('');

const result = spawnSync('npx', args, {
  cwd: root,
  /* ค่าจาก eas.json ต้องทับของที่ติดมาจากเชลล์และจาก .env เสมอ */
  env: { ...process.env, ...env },
  shell: true,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
