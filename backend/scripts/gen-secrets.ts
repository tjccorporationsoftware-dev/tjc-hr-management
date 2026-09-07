/*
 * สุ่มค่าลับสำหรับ backend/.env บนเซิร์ฟเวอร์จริง
 *
 *   npm run gen:secrets
 *
 * พิมพ์ออกหน้าจออย่างเดียว **ไม่เขียนทับไฟล์ไหนทั้งนั้น** เพราะการเขียนทับ .env
 * ที่ใช้งานอยู่เท่ากับเตะผู้ใช้ทุกคนออกจากระบบทันที (โทเคนเก่าใช้ไม่ได้แล้ว)
 * ให้คัดลอกไปวางเอง แล้วรัน `npm run check:prod` ตรวจอีกที
 *
 * ใช้ randomBytes ของ Node ซึ่งเป็น CSPRNG — ห้ามเปลี่ยนไปใช้ Math.random()
 */

import { randomBytes } from "crypto";

/** base64url ไม่มี + / = จึงวางใน .env ได้โดยไม่ต้องใส่เครื่องหมายคำพูด */
function secret(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

const values = [
  {
    key: "JWT_ACCESS_SECRET",
    note: "เปลี่ยนแล้วผู้ใช้ทุกคนหลุดจากระบบ",
    value: secret(48),
  },
  {
    key: "JWT_REFRESH_SECRET",
    note: "ต้องคนละค่ากับ ACCESS เสมอ",
    value: secret(48),
  },
  {
    key: "MONITORING_METRICS_TOKEN",
    note: "ต้องยาว ≥32 ตัว ไม่งั้นเปิด /api/monitoring/metrics ไม่ได้",
    value: secret(36),
  },
  {
    key: "ATTENDANCE_DEVICE_PUSH_TOKEN",
    note: "ต้องวางใน .env ระดับ repo ด้วย (device-proxy อ่าน) ยังไม่ใช้เครื่องสแกนก็ปล่อยว่าง",
    value: secret(32),
  },
  {
    key: "SEED_ADMIN_PASSWORD",
    note: "ใช้ครั้งเดียวตอน seed ฐานข้อมูลเปล่า",
    value: secret(18),
  },
  {
    key: "POSTGRES_PASSWORD",
    note: "ต้องตรงกับที่ใส่ใน DATABASE_URL",
    value: secret(24),
  },
];

console.log("");
console.log("ค่าลับสำหรับเซิร์ฟเวอร์จริง — คัดลอกไปวางใน backend/.env");
console.log("(ค่าใหม่ทุกครั้งที่รัน อย่ารันซ้ำแล้ววางแค่บางบรรทัด)");
console.log("");

for (const item of values) {
  console.log(`# ${item.note}`);
  console.log(`${item.key}=${item.value}`);
  console.log("");
}

console.log("POSTGRES_PASSWORD ต้องวางใน .env ที่ระดับ repo ด้วย");
console.log("เพราะ docker-compose.prod.yml อ่านค่านั้นตอนสร้างฐานข้อมูล");
console.log("");
