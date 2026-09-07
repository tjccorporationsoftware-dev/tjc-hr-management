/**
 * ส่งอัปเดต OTA ไปยังเครื่องที่ติดตั้งแอปแล้ว
 *
 * ใช้:  npm run update -- "ข้อความบอกว่าแก้อะไร"
 *
 * ## ทำไมต้องมีสคริปต์นี้แทนการเรียก eas update ตรง ๆ
 *
 * `eas update` แพ็กบันเดิลด้วยตัวแปรสภาพแวดล้อมที่มีอยู่ตอนนั้น ซึ่งถ้าไม่ตั้ง
 * อะไรเลยมันจะหยิบไฟล์ `.env` ในเครื่องนักพัฒนามาใช้ — ไฟล์นั้นชี้ไป
 * `http://localhost:4000/api` ผลคืออัปเดตที่ส่งออกไปจะพาแอปในมือพนักงานทุก
 * เครื่องไปต่อ localhost ของตัวเอง แล้วใช้งานไม่ได้ทั้งบริษัท
 *
 * สคริปต์นี้อ่านค่าจากโปรไฟล์บิลด์ใน `eas.json` มาใช้แทน ทำให้อัปเดตวิ่งไปที่
 * เดียวกับไฟล์ที่พนักงานติดตั้งไว้เสมอ ไม่ต้องจำว่าต้องตั้งตัวแปรอะไรบ้าง
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* โปรไฟล์ที่ใช้บิลด์ไฟล์แจกพนักงาน — อัปเดตต้องใช้ค่าชุดเดียวกับมัน */
const PROFILE = 'field';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const message = process.argv.slice(2).join(' ').trim();
if (!message) {
  console.error('ต้องใส่ข้อความบอกว่าอัปเดตนี้แก้อะไร');
  console.error('เช่น  npm run update -- "แก้แป้นพิมพ์ทับช่องรหัสผ่าน"');
  process.exit(1);
}

const easJson = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
const profile = easJson.build?.[PROFILE];
if (!profile) {
  console.error(`ไม่พบโปรไฟล์ "${PROFILE}" ใน eas.json`);
  process.exit(1);
}

const { channel, env = {} } = profile;
if (!channel) {
  console.error(`โปรไฟล์ "${PROFILE}" ไม่ได้ระบุ channel จึงไม่รู้ว่าจะส่งไปที่ไหน`);
  process.exit(1);
}

console.log(`ส่งอัปเดตเข้า channel: ${channel}`);
console.log(`แอปจะต่อ API ที่: ${env.EXPO_PUBLIC_API_BASE_URL ?? '(ไม่ได้ระบุ)'}`);
console.log('');

const result = spawnSync(
  'npx',
  ['eas-cli', 'update', '--branch', channel, '--message', message],
  {
    cwd: root,
    /* ค่าจาก eas.json ต้องทับของที่ติดมาจากเชลล์และจาก .env เสมอ */
    env: { ...process.env, ...env },
    shell: true,
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
