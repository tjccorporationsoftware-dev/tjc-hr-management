# Prisma Folder – Organized HR WFM Blueprint Version

ชุดนี้จัดระเบียบ `backend/prisma` ใหม่ให้แยกไฟล์ production migration ออกจากไฟล์ manual / repair / seed / reset อย่างชัดเจน

## โครงสร้าง

```text
prisma/
├─ schema.prisma
├─ seed.ts
├─ migrations/                         # ใช้กับ `npx prisma migrate deploy` เท่านั้น
├─ manual-sql/
│  ├─ legacy-add/                      # SQL เก่าที่เคย add field/table แบบ manual
│  ├─ repair/                          # SQL ซ่อม object ที่มีอยู่แล้ว แต่ migration history ไม่ตรง
│  └─ migration-history/               # SQL ตรวจ/ซ่อม _prisma_migrations
├─ dev-seed/                           # seed สำหรับ dev/UAT
├─ danger-reset-dev-only/              # ไฟล์ reset ห้ามใช้ production
├─ MIGRATION_AUDIT_REPORT.md
└─ README.md
```

## กติกาใช้งาน

1. ห้ามวาง `manual_*.sql`, `repair_*.sql`, `reset_*.sql` ปนใน root `prisma/` อีก
2. `prisma/migrations/` ต้องมีเฉพาะ migration folder ที่ Prisma ใช้จริงเท่านั้น
3. ห้าม rename migration folder ที่เคย apply แล้ว
4. ห้ามลบ migration folder เพื่อแก้ error โดยไม่ backup
5. ถ้า database มีข้อมูลสำคัญ ห้ามใช้ `migrate reset`
6. ไฟล์ใน `danger-reset-dev-only/` ใช้เฉพาะฐาน dev/test ที่ล้างได้เท่านั้น

## คำสั่งแนะนำหลังวางโฟลเดอร์นี้

```powershell
cd D:\NextProject\HR\HR-Management\backend

npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npm run build
```

ถ้ายังเจอ object ซ้ำ ให้ใช้ไฟล์ repair เฉพาะตัวใน `manual-sql/repair/` หรือไฟล์ตรวจ history ใน `manual-sql/migration-history/` ก่อน ห้าม drop table ทิ้ง

## หมายเหตุสำคัญ

`schema.prisma` ในชุดนี้เป็นตัวที่รวม Phase 1 Database Foundation แล้ว มี model ใหม่ เช่น:

- `AttendanceSessionRule`
- `AttendanceRawEvent`
- `LeaveBalanceLedger`
- `OffsiteWorkRequest`

และมี migration:

```text
202606050001_hr_wfm_phase1_foundation
```

## Important fix 202606050000_hr_wfm_legacy_foundation

เพิ่ม migration นี้เพื่อย้าย SQL manual ที่ schema.prisma ใช้อยู่จริงเข้ามาเป็น Prisma migration อย่างเป็นทางการ ได้แก่ attendance_policies, attendance_daily_summaries, source/session ใน attendance_logs, leave_types allowHalfDay/allowHourly, payroll payslip publication fields และ system_settings. ต้องอยู่ก่อน 202606050001_hr_wfm_phase1_foundation เพราะ Phase 1 ต้อง ALTER attendance_policies และ attendance_daily_summaries.
