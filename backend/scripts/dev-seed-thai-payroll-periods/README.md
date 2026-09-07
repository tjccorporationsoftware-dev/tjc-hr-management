# Dev Seed Thai Payroll Periods

โฟลเดอร์นี้เป็น seed ชุดใหม่สำหรับข้อมูลทดสอบเข้างาน/ออกงาน/มาสาย/ขาดงาน/ลา/Offsite แบบเวลาไทย โดยไม่ทับไฟล์ seed เดิม

## ช่วงข้อมูลที่ seed

- งวดที่ 1: `2026-04-26` ถึง `2026-05-25`
- งวดที่ 2: `2026-05-26` ถึง `2026-06-25`

สคริปต์เก็บ `DateTime` แบบ UTC-correct สำหรับการแสดงผล `Asia/Bangkok` จึงไม่ต้องรันไฟล์ `fix_seed_timezone_shift_*.sql` เพิ่ม

## คำสั่งรัน

รันจากโฟลเดอร์ `backend`

```powershell
$env:DATABASE_URL="postgresql://hr_admin:hr_password@localhost:5433/hr_workforce?schema=public"

npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts
```

## ตรวจแบบไม่เขียนข้อมูลก่อน

```powershell
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --dryRun
```

## รันเฉพาะงวด

```powershell
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --period=2026-04
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --period=2026-05
```

หรือระบุหลายงวด

```powershell
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --periods=2026-04,2026-05
```

## ระบุบริษัทหรือพนักงาน

```powershell
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --companyId=COMPANY_ID

npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --employeeCodes=EMP001,EMP002,EMP003
```

## จำนวนพนักงานต่อบริษัท

ค่าเริ่มต้นเลือกพนักงาน `ACTIVE` / `PROBATION` บริษัทละ 9 คน

```powershell
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --maxEmployees=20
```

## สถานะ Summary

ค่าเริ่มต้นเป็น `READY_FOR_PAYROLL` เพื่อให้ทดลอง Payroll ได้ทันที

```powershell
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --summaryStatus=READY_FOR_PAYROLL
```

ถ้าต้องการทดสอบ HR Review ก่อน Ready ให้ใช้

```powershell
npx tsx scripts/dev-seed-thai-payroll-periods/seed-two-periods-thai-time.ts --summaryStatus=CALCULATED
```

## รูปแบบข้อมูลที่สร้าง

สคริปต์สร้าง scenario แบบหมุนเวียนต่อพนักงาน/วัน ได้แก่

- ปกติครบ 3 รอบ
- สายเช้า
- สายบ่าย
- ลืมสแกนออกงาน
- ลาได้รับค่าจ้างเต็มวัน
- ลาไม่รับค่าจ้างเต็มวัน
- ลาไม่รับค่าจ้างครึ่งวันเช้า
- ลาได้รับค่าจ้างครึ่งวันบ่าย
- ลาไม่รับค่าจ้างรายชั่วโมง
- Offsite อนุมัติเต็มวัน
- Offsite อนุมัติพร้อมลงเวลา
- Offsite รอตรวจ/ยังไม่อนุมัติ
- ออกก่อนเวลา
- กลับช้า
- ขาดงาน/ไม่มีเวลาทั้งวัน

## Prefix ข้อมูล

สคริปต์จะลบเฉพาะข้อมูล seed ชุดตัวเองก่อนรันซ้ำ โดยใช้ prefix เหล่านี้เท่านั้น

- Attendance: `DEV-TH2P-20260426-*`, `DEV-TH2P-20260526-*`
- Leave: `LV-TH2P-20260426-*`, `LV-TH2P-20260526-*`
- Offsite: `OS-TH2P-20260426-*`, `OS-TH2P-20260526-*`
- Audit entity: `DevSeedThaiPayrollPeriods`

ไม่ลบข้อมูลจริงที่ไม่มี prefix เหล่านี้

## ตรวจข้อมูลหลังรัน

```sql
SELECT COUNT(*) AS attendance_logs
FROM attendance_logs
WHERE "workDate" BETWEEN DATE '2026-04-26' AND DATE '2026-06-25';

SELECT
  MIN("workDate") AS start_date,
  MAX("workDate") AS end_date,
  COUNT(*) AS total_summary,
  COUNT("morningInAt") AS morning_in,
  COUNT("afternoonInAt") AS afternoon_in,
  COUNT("checkOutAt") AS checkout
FROM attendance_daily_summaries
WHERE "calculationNote" LIKE 'DEV-TH2P-%';

SELECT COUNT(*) AS leave_requests
FROM leave_requests
WHERE "requestNo" LIKE 'LV-TH2P-%';

SELECT COUNT(*) AS offsite_requests
FROM offsite_work_requests
WHERE "requestNo" LIKE 'OS-TH2P-%';
```

## หมายเหตุ

- สคริปต์นี้ไม่สร้าง OT
- สคริปต์นี้ไม่แก้ schema, payroll logic, frontend หรือ endpoint ใด ๆ
- สคริปต์นี้บันทึก AuditLog action `IMPORT` entity `DevSeedThaiPayrollPeriods`
