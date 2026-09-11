/*
 * บันทึกใบคำขอที่พนักงานยื่นและ HR อนุมัติไปแล้วบนระบบจริง ให้ฐานข้อมูลนี้มีใบเดียวกัน
 * รองรับ "ลืมลงเวลา" (TIME_ADJUST) และ "ทำงานนอกสถานที่" (OFFSITE)
 *
 * สร้างร่างผ่าน service ให้ได้เลขที่ใบ/กติกาครบ แล้วตั้งสถานะอนุมัติตรง ๆ พร้อมผู้อนุมัติและเวลาจริง
 * (ข้ามขั้นแนบรูปที่ระบบบังคับ เพราะรูปอยู่กับใบบนระบบจริง — โน้ตในใบบอกไว้)
 *
 *   ลืมลงเวลา: ถ้ารอยแตะบัตรเวลานั้นมีอยู่แล้ว (ไฟล์ระบบเดิมใส่มา) ผูกเป็นรอยที่ใช้
 *              ถ้ายังไม่มี สร้างรอย source=TIME_ADJUST ให้
 *   นอกสถานที่: ใบอนุมัติครอบคลุมรอบลงเวลาที่อยู่ในช่วง จึงไม่โดนหักลืมสแกนรอบนั้น
 *
 * ทุกวันที่แตะจะถูก recalc ให้ตอนท้าย
 *
 * รูปแบบไฟล์ JSON (array):
 *   { "kind":"TIME_ADJUST", "code":"680047", "date":"2026-09-07", "times":["08:00","17:00"],
 *     "reason":"ลืมลงเวลา", "approver":"aruneeboonlert072@gmail.com", "approvedAt":"2026-09-08 10:04:39" }
 *   { "kind":"OFFSITE", "code":"690045", "date":"2026-09-04", "start":"08:00", "end":"17:00",
 *     "location":"บ้านพี่แอน", "reason":"...", "approver":"...", "approvedAt":"2026-09-04 08:00:42" }
 *   times ของลืมลงเวลา: เวลาก่อน 12:00 = เข้างาน (CHECK_IN) นอกนั้น = ออกงาน (CHECK_OUT)
 *
 *   node scripts/record-approved-requests.js <ไฟล์.json>            พรีวิว
 *   node scripts/record-approved-requests.js <ไฟล์.json> --apply
 */
require('reflect-metadata');
require('dotenv').config({ quiet: true });
const fs = require('fs');
const { execFileSync } = require('child_process');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module.js');
const { TimeAdjustRequestsService } = require('../dist/modules/time-adjust/time-adjust-requests.service.js');
const { OffsiteWorkService } = require('../dist/modules/offsite-work/offsite-work.service.js');
const { PrismaService } = require('../dist/database/prisma.service.js');

const SCOPE = { level: 'GLOBAL', companyId: null, branchId: null };
const ACTOR_USER_ID = process.env.IMPORT_ACTOR_ID || 'cmso9a51300sbtmesx37xlexo';
const NOTE = 'บันทึกตามใบที่อนุมัติบนระบบ hr.tjc.co.th (รูปหลักฐานอยู่ที่นั่น)';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('ต้องระบุไฟล์ JSON'); process.exit(1); }

/** เวลาไทย -> Date */
const th = (d, t) => new Date(`${d}T${t.length === 5 ? t + ':00' : t}+07:00`);
const parseApprovedAt = (s) => { const [d, t] = s.trim().split(/\s+/); return th(d, t); };
const fmt = (d) => d.toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' });

(async () => {
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const timeAdjust = app.get(TimeAdjustRequestsService);
  const offsite = app.get(OffsiteWorkService);
  const prisma = app.get(PrismaService);
  const user = { id: ACTOR_USER_ID, userId: ACTOR_USER_ID, scope: SCOPE };
  const touchedDates = new Set();

  for (const it of items) {
    const emp = await prisma.employee.findFirst({ where: { employeeCode: it.code, deletedAt: null }, select: { id: true, displayName: true } });
    const approver = await prisma.user.findFirst({ where: { email: it.approver, deletedAt: null }, select: { id: true, displayName: true } });
    if (!emp || !approver) { console.log(`ข้าม ${it.code} ${it.date} — ไม่พบพนักงานหรือผู้อนุมัติ`); continue; }
    const approvedAt = parseApprovedAt(it.approvedAt);
    const head = `${it.code} ${emp.displayName} · ${it.date}`;

    if (it.kind === 'TIME_ADJUST') {
      for (const time of it.times) {
        const type = time < '12:00' ? 'CHECK_IN' : 'CHECK_OUT';
        const when = th(it.date, time);
        const dup = await prisma.timeAdjustRequest.findFirst({ where: { employeeId: emp.id, requestedLogTime: when, targetLogType: type, deletedAt: null } });
        if (dup) { console.log(`${head} ${time} ลืมลงเวลา — มีอยู่แล้ว ${dup.requestNo} (${dup.status})`); continue; }
        const existingLog = await prisma.attendanceLog.findFirst({ where: { employeeId: emp.id, logTime: when, logType: type, deletedAt: null } });
        console.log(`${head} ${time} ลืมลงเวลา (${type}) · ${it.reason} · อนุมัติ ${approver.displayName} ${fmt(approvedAt)} · รอย${existingLog ? 'มีแล้ว' : 'จะสร้างใหม่'}`);
        if (!apply) continue;

        const draft = await timeAdjust.create(
          { employeeId: emp.id, adjustType: type === 'CHECK_IN' ? 'MISSING_CHECK_IN' : 'MISSING_CHECK_OUT', targetLogType: type, requestedLogTime: when.toISOString(), reason: it.reason, note: NOTE },
          user, SCOPE,
        );
        let logId = existingLog?.id ?? null;
        if (!logId) {
          const log = await prisma.attendanceLog.create({ data: { employeeId: emp.id, logTime: when, logType: type, source: 'TIME_ADJUST', note: `จากใบแก้เวลา ${draft.requestNo}` } });
          logId = log.id;
        }
        await prisma.timeAdjustRequest.update({
          where: { id: draft.id },
          data: { status: 'APPROVED', submittedAt: approvedAt, approvedAt, approvedById: approver.id, appliedAttendanceLogId: logId },
        });
        await prisma.timeAdjustApprovalStep.create({
          data: { timeAdjustRequestId: draft.id, stepNo: 1, nameTh: 'HR อนุมัติ', approverType: 'HR_ADMIN', expectedApproverId: approver.id, status: 'APPROVED', approvedCount: 1, actedById: approver.id, actedAt: approvedAt, note: 'บันทึกย้อนหลังตามระบบจริง' },
        });
        touchedDates.add(it.date);
        console.log(`   -> ${draft.requestNo} APPROVED`);
      }
      continue;
    }

    if (it.kind === 'OFFSITE') {
      const workDate = new Date(`${it.date}T00:00:00.000Z`);
      const dup = await prisma.offsiteWorkRequest.findFirst({ where: { employeeId: emp.id, workDate, deletedAt: null, status: { not: 'CANCELLED' } } });
      if (dup) { console.log(`${head} นอกสถานที่ — มีอยู่แล้ว ${dup.requestNo} (${dup.status})`); continue; }
      console.log(`${head} นอกสถานที่ ${it.start}-${it.end} · ${it.location || ''} · ${it.reason} · อนุมัติ ${approver.displayName} ${fmt(approvedAt)}`);
      if (!apply) continue;

      const draft = await offsite.create({ employeeId: emp.id, workDate: it.date, startTime: it.start, endTime: it.end, reason: it.reason }, user, SCOPE);
      await prisma.offsiteWorkRequest.update({
        where: { id: draft.id },
        data: {
          status: 'APPROVED', submittedAt: approvedAt, approvedAt, approvedById: approver.id,
          locationType: 'CUSTOMER_SITE', locationName: it.location || 'ทำงานนอกสถานที่',
          approvalSnapshot: { steps: [{ step: 1, status: 'APPROVED', approverId: approver.id, actedAt: approvedAt.toISOString(), note: NOTE }] },
        },
      });
      touchedDates.add(it.date);
      console.log(`   -> ${draft.requestNo} APPROVED`);
      continue;
    }

    console.log(`ข้าม ${head} — ไม่รู้จัก kind ${it.kind}`);
  }

  await app.close();

  if (!apply) { console.log('\n-- พรีวิวเท่านั้น ใส่ --apply เพื่อเขียนจริง --'); process.exit(0); }
  const dates = [...touchedDates].sort();
  if (dates.length) {
    console.log(`\nคำนวณสรุปเวลาใหม่ ${dates[0]} ถึง ${dates[dates.length - 1]}`);
    /* recalc ปิด Nest ไม่ทันใน 30 วิ แล้วออกด้วย exit code ไม่เป็นศูนย์ ทั้งที่คำนวณเสร็จแล้ว จึงไม่ถือเป็นล้ม */
    try {
      execFileSync(process.execPath, ['scripts/recalc-attendance-range.js', dates[0], dates[dates.length - 1]], { stdio: 'ignore' });
    } catch { /* ดูผลจากสรุปเวลาแทน */ }
    console.log('เสร็จ — ตรวจสรุปเวลาของวันเหล่านั้นได้เลย');
  }
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
