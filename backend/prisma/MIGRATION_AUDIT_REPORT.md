# Migration Audit Report

ตรวจจากไฟล์ `migrations(1).zip`

## สรุปสั้น
- โฟลเดอร์ `migrations/` มี migration จริง 25 ตัว
- ไม่ควรลบ migration folder ใน `migrations/` แบบสุ่ม
- ปัญหาหลักไม่ได้อยู่ที่ไฟล์ migration ใน zip แต่เกิดจาก `_prisma_migrations` ใน database มีชื่อ migration เก่าที่ไม่มีใน local
- ไฟล์ที่รกคือ manual SQL / seed / UAT SQL ที่วางปนอยู่ระดับ root ควรย้ายไป archive/dev-only ไม่ควรวางรวมกับชุด migration production

## ฐานข้อมูลจาก log
```txt
PostgreSQL database: hr_workforce
Host: localhost
Port: 5433
Schema: public
```

## Database มี migration record ที่ local ไม่มี
รายการเหล่านี้ควรถูกตรวจสอบในตาราง `_prisma_migrations` และถ้าเป็น dev/staging database หลัง backup แล้วสามารถลบ record ออกจาก history ได้ ไม่ใช่ลบตารางจริง:

- `20260518023809_phase4_3_time_adjust_core`
- `20260528035433_add_overtime_approval_steps`
- `20260528065634_add_overtime_approval_steps`
- `20260528083643_add_overtime_approval_steps`

เหตุผล: ชื่อ record เหล่านี้สลับ/ชนกับ migration ปัจจุบัน เช่น local มี `20260528035433_add_time_adjust_approval_steps` แต่ database มี `20260528035433_add_overtime_approval_steps`

## Local migration ที่ยังไม่ได้ apply ตาม status
หลัง reconcile history แล้วควรเหลือ migration ที่ต้อง apply จริง ๆ คือ:

- `20260528083643_add_payroll_adjustments_compensation_rules`
- `202606050001_hr_wfm_phase1_foundation`

## สิ่งที่ควรเก็บ
เก็บทั้งหมดใน `migrations/` โดยเฉพาะ:
- migration ตั้งแต่ `20260514024454_init_audit_log`
- ถึง `202606050001_hr_wfm_phase1_foundation`

ห้าม rename migration folder ที่เคย apply แล้ว

## สิ่งที่ควรย้ายออกจากชุด production migration
ไฟล์เหล่านี้ไม่ควรปนกับ production migration root:

- `manual_add_attendance_daily_summaries.sql`
- `manual_add_attendance_policy_and_punch_source.sql`
- `manual_add_leave_type_duration_settings.sql`
- `manual_add_payroll_payslip_publication.sql`
- `manual_add_system_settings.sql`
- `manual_repair_20260518023809_time_adjust_attachments.sql`
- `manual_repair_20260528035433_time_adjust_approval_steps.sql`
- `manual_reset_seed_attendance_logs_exact_8_13_17_june_1_2.sql`
- `manual_reset_seed_attendance_logs_june_1_2.sql`
- `manual_reset_seed_attendance_logs_realistic_june_1_2.sql`
- `manual_seed_attendance_permissions.sql`
- `manual_seed_attendance_test_logs.sql`
- `uat_reset_database.sql`
- `uat_seed_full_system.sql`

แนะนำย้ายไป:
```txt
backend/prisma/manual-sql/
backend/prisma/dev-seed/
backend/prisma/archive/
```

โดยเฉพาะไฟล์ `reset` และ `uat_reset_database.sql` ควรอยู่ใน `dev-only` เท่านั้น เพราะเสี่ยงกับข้อมูลจริง

## แนวทางแก้ที่แนะนำ

### ทางสะอาดสุด ถ้าไม่มีข้อมูลจริง
สร้าง database ใหม่ เช่น `hr_workforce_blueprint` แล้วรัน migration ใหม่ทั้งหมด

### ทางรักษาฐานเดิม ถ้ามีข้อมูล
1. backup database
2. ตรวจ `_prisma_migrations`
3. ลบเฉพาะ record แปลกที่ database มีแต่ local ไม่มี
4. รัน `npx prisma migrate status`
5. รัน `npx prisma migrate deploy`
6. ถ้ามี object duplicate อีก ให้ repair เฉพาะตัว ไม่ drop table

## คำสั่งตรวจสอบ
```powershell
npx prisma migrate status
```

```powershell
npx prisma db execute --file .\prisma\inspect_prisma_migration_history.sql
```

