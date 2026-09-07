/*
 * ไล่ตรวจความถูกต้องของระบบการลาทั้งหมด — อ่านอย่างเดียว ไม่เขียนอะไรเลย
 *
 *   node scripts/audit-leave-system.js
 *
 * ตรวจว่ากฎที่ตั้งไว้ในหน้านโยบาย ให้ผลตรงกับข้อมูลจริงในฐานข้อมูลหรือไม่
 * เน้นจุดที่ "ตั้งค่าไว้อย่าง แต่ระบบทำอีกอย่าง" ซึ่งเป็นบั๊กที่เงียบที่สุด
 * เพราะไม่มี error ให้เห็น มีแต่ตัวเลขที่ผิดอยู่เฉย ๆ
 */

require('dotenv').config();

const { PrismaClient } = require('../dist/generated/prisma/client');

const prisma = new PrismaClient();

/** ตระกูลรหัสของสิทธิลาตามกฎหมาย — ต้องตรงกับ statutory-leave.util.ts */
const STATUTORY = [
  'SICK',
  'STERILIZATION',
  'PERSONAL',
  'BUSINESS',
  'MILITARY',
  'MATERNITY',
  'PATERNITY',
];

function isStatutory(leaveType) {
  return [leaveType.code, leaveType.referenceCode]
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase())
    .some((value) =>
      STATUTORY.some((code) => value === code || value.startsWith(`${code}_`)),
    );
}

const findings = [];

function report(severity, area, message, detail) {
  findings.push({ area, detail, message, severity });
}

async function main() {
  const [employees, leaveTypes, policies, balances, requests] =
    await Promise.all([
      prisma.employee.findMany({
        include: { employeeType: true, profile: true },
        where: { deletedAt: null },
      }),
      prisma.leaveType.findMany({ where: { deletedAt: null } }),
      prisma.leavePolicy.findMany({ include: { quotaTiers: true } }),
      prisma.leaveBalance.findMany({
        include: { employee: true, leaveType: true },
      }),
      prisma.leaveRequest.findMany({
        include: { leaveType: true, employee: true },
      }),
    ]);

  const activeEmployees = employees.filter(
    (item) => !['RESIGNED', 'TERMINATED', 'INACTIVE'].includes(item.status),
  );

  console.log('ข้อมูลที่ตรวจ');
  console.log('  พนักงานทั้งหมด      ', employees.length, '· ยังทำงานอยู่', activeEmployees.length);
  console.log('  ประเภทการลา         ', leaveTypes.length);
  console.log('  นโยบาย              ', policies.length);
  console.log('  ยอดวันลา            ', balances.length);
  console.log('  ใบลา                ', requests.length);
  console.log('');

  const typeById = new Map(leaveTypes.map((item) => [item.id, item]));
  const employeeById = new Map(employees.map((item) => [item.id, item]));

  /* ── 1. เพศ ─────────────────────────────────────────────────────────────
   * genderEligibility ถูกตรวจตอน "ยื่นใบลา" เท่านั้น ไม่ได้ตรวจตอน "สร้างโควตา"
   * ผลคือผู้ชายได้โควตาลาคลอดขึ้นมาในระบบ ซึ่งทำให้ยอดรวมทั้งบริษัทเพี้ยน
   * และ HR ที่เปิดดูจะเห็นตัวเลขที่ใช้จริงไม่ได้
   */
  for (const balance of balances) {
    const leaveType = typeById.get(balance.leaveTypeId);
    const employee = employeeById.get(balance.employeeId);
    if (!leaveType || !employee) continue;
    if (leaveType.genderEligibility === 'ALL') continue;

    const gender = employee.profile?.gender ?? null;
    if (gender && gender !== leaveType.genderEligibility) {
      report(
        'BUG',
        'เพศ',
        `${employee.employeeCode} ได้โควตา "${leaveType.nameTh}" ทั้งที่ประเภทนี้จำกัดเฉพาะ${leaveType.genderEligibility === 'FEMALE' ? 'หญิง' : 'ชาย'}`,
        `พนักงานเพศ ${gender} · โควตา ${balance.entitlementDays} วัน`,
      );
    }
  }

  /* ── 2. โควตาที่ตั้งไว้ vs ยอดที่สร้างจริง ────────────────────────────── */
  const policyKey = (leaveTypeId, employeeTypeId) =>
    `${leaveTypeId}:${employeeTypeId ?? 'ALL'}`;
  const policyMap = new Map();
  for (const policy of policies) {
    policyMap.set(policyKey(policy.leaveTypeId, policy.employeeTypeId), policy);
  }

  for (const balance of balances) {
    const employee = employeeById.get(balance.employeeId);
    const leaveType = typeById.get(balance.leaveTypeId);
    if (!employee || !leaveType) continue;

    const policy =
      policyMap.get(policyKey(balance.leaveTypeId, employee.employeeTypeId)) ??
      policyMap.get(policyKey(balance.leaveTypeId, null));

    if (!policy) {
      report(
        'WARN',
        'นโยบาย',
        `${employee.employeeCode} มียอด "${leaveType.nameTh}" แต่หานโยบายที่ใช้กับประเภทพนักงานนี้ไม่เจอ`,
        `ประเภทพนักงาน ${employee.employeeType?.nameTh ?? 'ไม่ระบุ'}`,
      );
    }
  }

  /* ── 3. สิทธิลาตามกฎหมายต้องไม่ถูกกั้นด้วยการบรรจุ ──────────────────── */
  for (const leaveType of leaveTypes) {
    if (leaveType.requireProbationPassed && isStatutory(leaveType)) {
      report(
        'WARN',
        'กฎหมาย',
        `"${leaveType.nameTh}" เปิด "ต้องผ่านการบรรจุก่อน" ไว้ทั้งที่เป็นสิทธิตามกฎหมาย`,
        'ระบบจะไม่บังคับตามค่านี้ (มีเพดานล่างกันไว้) แต่ควรปิดในหน้าตั้งค่าให้ตรงกัน',
      );
    }
  }

  /* ── 4. ยอดคงเหลือติดลบ / ใช้เกินสิทธิ์ ─────────────────────────────── */
  for (const balance of balances) {
    const employee = employeeById.get(balance.employeeId);
    const leaveType = typeById.get(balance.leaveTypeId);
    if (!employee || !leaveType) continue;

    const total =
      Number(balance.entitlementDays) +
      Number(balance.carriedForwardDays) +
      Number(balance.adjustedDays);
    const remaining =
      total - Number(balance.usedDays) - Number(balance.pendingDays);

    if (remaining < 0) {
      report(
        leaveType.enforceQuotaLimit ? 'BUG' : 'INFO',
        'โควตา',
        `${employee.employeeCode} "${leaveType.nameTh}" คงเหลือติดลบ ${remaining}`,
        `สิทธิ์รวม ${total} · ใช้ไป ${balance.usedDays} · รออนุมัติ ${balance.pendingDays}` +
          (leaveType.enforceQuotaLimit ? ' · ตั้ง "ห้ามลาเกินโควตา" ไว้' : ''),
      );
    }
  }

  /* ── 5. ยอดใช้ไป/รออนุมัติ ต้องตรงกับใบลาจริง ──────────────────────── */
  const usedFromRequests = new Map();
  const pendingFromRequests = new Map();

  for (const request of requests) {
    const leaveType = typeById.get(request.leaveTypeId);
    if (!leaveType?.deductQuota) continue;

    const year = new Date(request.startDate).getFullYear();
    const key = `${request.employeeId}:${request.leaveTypeId}:${year}`;
    const days = Number(request.totalDays ?? 0);

    if (request.status === 'APPROVED') {
      usedFromRequests.set(key, (usedFromRequests.get(key) ?? 0) + days);
    } else if (['SUBMITTED', 'PENDING', 'IN_PROGRESS'].includes(request.status)) {
      pendingFromRequests.set(key, (pendingFromRequests.get(key) ?? 0) + days);
    }
  }

  for (const balance of balances) {
    const leaveType = typeById.get(balance.leaveTypeId);
    const employee = employeeById.get(balance.employeeId);
    if (!leaveType?.deductQuota || !employee) continue;

    const key = `${balance.employeeId}:${balance.leaveTypeId}:${balance.year}`;
    const expectedUsed = usedFromRequests.get(key) ?? 0;
    const expectedPending = pendingFromRequests.get(key) ?? 0;

    if (Math.abs(Number(balance.usedDays) - expectedUsed) > 0.001) {
      report(
        'BUG',
        'ยอดสะสม',
        `${employee.employeeCode} "${leaveType.nameTh}" ยอดใช้ไปไม่ตรงกับใบลาจริง`,
        `ในยอดคงเหลือ ${balance.usedDays} · รวมจากใบลาที่อนุมัติ ${expectedUsed}`,
      );
    }

    if (Math.abs(Number(balance.pendingDays) - expectedPending) > 0.001) {
      report(
        'BUG',
        'ยอดสะสม',
        `${employee.employeeCode} "${leaveType.nameTh}" ยอดรออนุมัติไม่ตรงกับใบลาจริง`,
        `ในยอดคงเหลือ ${balance.pendingDays} · รวมจากใบลาที่รออยู่ ${expectedPending}`,
      );
    }
  }

  /* ── 6. ค่าตั้งที่ขัดกันเอง ───────────────────────────────────────────── */
  for (const leaveType of leaveTypes) {
    if (leaveType.allowHourly && !leaveType.allowHalfDay) {
      report(
        'WARN',
        'ตั้งค่า',
        `"${leaveType.nameTh}" เปิดลารายชั่วโมง แต่ปิดลาครึ่งวัน`,
        'ลาชั่วโมงได้แต่ลาครึ่งวันไม่ได้ ขัดกันเองในสายตาผู้ใช้',
      );
    }

    if (!leaveType.allowBackdated && Number(leaveType.maxBackdatedDays ?? 0) > 0) {
      report(
        'WARN',
        'ตั้งค่า',
        `"${leaveType.nameTh}" ปิดลาย้อนหลัง แต่ยังตั้งจำนวนวันย้อนหลังไว้ ${leaveType.maxBackdatedDays}`,
        'ค่าที่ตั้งไว้จะไม่ถูกใช้เลย',
      );
    }

    if (leaveType.deductQuota === false && leaveType.enforceQuotaLimit) {
      report(
        'WARN',
        'ตั้งค่า',
        `"${leaveType.nameTh}" ไม่ตัดโควตา แต่ตั้ง "ห้ามลาเกินโควตา" ไว้`,
        'ไม่มีอะไรให้เกิน เพราะไม่ได้ตัดโควตาตั้งแต่แรก',
      );
    }
  }

  /* ── 7. พนักงานที่ยังไม่มียอดวันลาเลย ─────────────────────────────────── */
  const year = new Date().getFullYear();
  const haveBalance = new Set(
    balances.filter((item) => item.year === year).map((item) => item.employeeId),
  );
  const missing = activeEmployees.filter((item) => !haveBalance.has(item.id));

  if (missing.length > 0) {
    report(
      'WARN',
      'ยอดวันลา',
      `พนักงานที่ยังทำงานอยู่ ${missing.length} คน ยังไม่มียอดวันลาปี ${year}`,
      missing.map((item) => item.employeeCode).join(', '),
    );
  }

  /* ── สรุป ─────────────────────────────────────────────────────────────── */
  const order = { BUG: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const counts = findings.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1;
    return acc;
  }, {});

  console.log('ผลตรวจ:', 'บั๊ก', counts.BUG ?? 0, '· ควรดู', counts.WARN ?? 0, '· แจ้งให้ทราบ', counts.INFO ?? 0);
  console.log('');

  if (findings.length === 0) {
    console.log('ไม่พบปัญหา');
    return;
  }

  let lastArea = '';
  for (const item of findings) {
    const head = `[${item.severity}] ${item.area}`;
    if (head !== lastArea) {
      console.log(head);
      lastArea = head;
    }
    console.log('   ', item.message);
    if (item.detail) console.log('       ', item.detail);
  }
}

main()
  .catch((error) => {
    console.error('ล้มเหลว:', error.message.split('\n').slice(0, 6).join('\n'));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
