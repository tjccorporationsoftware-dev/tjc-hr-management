/**
 * ส่งออกรายชื่อผู้ใช้งาน (พนักงานที่ยังทำงานและมีบัญชี) เป็น Excel ให้ HR แจกรหัสเข้าระบบ
 *
 * คอลัมน์รหัสผ่านเริ่มต้นแสดงเฉพาะคนที่ยังไม่เคยเปลี่ยนรหัส (mustChangePassword)
 * ค่าที่ใส่มาจาก INITIAL_PASSWORD เพราะระบบเก็บเป็น hash อ่านกลับไม่ได้
 *
 * ใช้:  INITIAL_PASSWORD=... OUT=path/to/file.xlsx node scripts/export-user-list.js
 * ไฟล์ที่ได้มีข้อมูลลูกค้า — ห้ามเก็บไว้ในโฟลเดอร์โปรเจกต์ที่ติดตามด้วย git
 */
require('dotenv').config({ quiet: true });
const ExcelJS = require('exceljs');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const initialPassword = process.env.INITIAL_PASSWORD || '';
const outPath = process.env.OUT;

if (!outPath) {
  console.error('ต้องส่ง OUT=path/to/file.xlsx');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] },
      userId: { not: null },
    },
    select: {
      employeeCode: true,
      title: true,
      firstName: true,
      lastName: true,
      displayName: true,
      position: true,
      phone: true,
      branch: { select: { nameTh: true } },
      department: { select: { nameTh: true } },
      user: {
        select: {
          email: true,
          mustChangePassword: true,
          roles: { select: { role: { select: { code: true } } } },
        },
      },
    },
    orderBy: [
      { branch: { code: 'asc' } },
      { department: { code: 'asc' } },
      { employeeCode: 'asc' },
    ],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ผู้ใช้งาน');
  ws.columns = [
    { header: 'ลำดับ', key: 'no', width: 7 },
    { header: 'รหัสพนักงาน (ใช้เข้าสู่ระบบ)', key: 'code', width: 26 },
    { header: 'ชื่อ-นามสกุล', key: 'name', width: 32 },
    { header: 'สาขา', key: 'branch', width: 16 },
    { header: 'แผนก', key: 'dept', width: 24 },
    { header: 'ตำแหน่ง', key: 'position', width: 26 },
    { header: 'เบอร์โทร', key: 'phone', width: 14 },
    { header: 'รหัสผ่านเริ่มต้น', key: 'password', width: 18 },
    { header: 'บทบาท', key: 'roles', width: 26 },
    { header: 'อีเมลในระบบ', key: 'email', width: 30 },
  ];

  rows.forEach((r, i) => {
    ws.addRow({
      no: i + 1,
      code: r.employeeCode,
      name:
        r.displayName ||
        [r.title, r.firstName, r.lastName].filter(Boolean).join(' '),
      branch: r.branch?.nameTh || '',
      dept: r.department?.nameTh || '',
      position: r.position || '',
      phone: r.phone || '',
      password: r.user.mustChangePassword
        ? initialPassword || '(ยังไม่เปลี่ยน)'
        : '(เปลี่ยนแล้ว)',
      roles: r.user.roles.map((x) => x.role.code).join(', '),
      email: r.user.email,
    });
  });

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCE6F1' },
  };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'J1' };
  // รหัสพนักงาน/เบอร์โทรเป็นข้อความ กัน Excel ตัดศูนย์นำหน้า
  ws.eachRow((row) => {
    row.getCell('code').numFmt = '@';
    row.getCell('phone').numFmt = '@';
  });

  const info = wb.addWorksheet('วิธีใช้');
  info.getColumn(1).width = 90;
  [
    'วิธีเข้าสู่ระบบ (เว็บ hr.tjc.co.th และแอปมือถือ)',
    '1. ช่องแรกกรอก "รหัสพนักงาน" ของตัวเอง (ไม่ใช่อีเมล)',
    `2. รหัสผ่านเริ่มต้นตามคอลัมน์ในชีต "ผู้ใช้งาน"${initialPassword ? ' (T ตัวใหญ่ ที่เหลือตัวเล็ก)' : ''}`,
    '3. เข้าครั้งแรกระบบจะบังคับตั้งรหัสผ่านใหม่ — ยาวอย่างน้อย 12 ตัว มีตัวเล็ก ตัวใหญ่ ตัวเลข และอักขระพิเศษ',
    '4. ใส่รหัสผิดติดกันหลายครั้งบัญชีจะถูกล็อกชั่วคราว รอสักครู่แล้วลองใหม่',
    '',
    `ไฟล์นี้จัดทำ ${new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })} — เก็บเป็นความลับ ลบทิ้งเมื่อแจกรหัสครบแล้ว`,
  ].forEach((t) => info.addRow([t]));
  info.getRow(1).font = { bold: true, size: 13 };

  await wb.xlsx.writeFile(outPath);
  console.log(`ส่งออก ${rows.length} คน -> ${outPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
