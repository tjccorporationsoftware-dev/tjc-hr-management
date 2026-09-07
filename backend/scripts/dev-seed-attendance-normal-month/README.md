# Dev Seed Attendance Normal Month

ไฟล์นี้ใช้ seed ข้อมูลลงเวลาเข้างานสำหรับทดสอบหน้า Attendance / HR Review โดยยึดระบบเดิมของโปรเจค:

- เข้างานเช้า `MORNING_IN`
- เข้างานบ่าย / กลับจากพักกลางวัน `AFTERNOON_IN`
- ออกงาน `CHECK_OUT`

สคริปต์จะอ่าน `attendance_policies` และ `attendance_session_rules` จริงก่อน ถ้าไม่มี rule จะ fallback เป็นเวลาเริ่มต้นของระบบ:

| รอบ | เวลา fallback |
|---|---:|
| เข้างานเช้า | 08:00 |
| เข้างานบ่าย | 13:00 |
| ออกงาน | 17:00 |

> หมายเหตุ: “เข้างานบ่าย” ในระบบนี้หมายถึงสแกนกลับเข้าทำงานช่วงบ่าย ไม่ใช่กะบ่าย 13:00–21:00

## ไฟล์

```text
backend/scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts
```

## คำสั่งใช้งาน

จากโฟลเดอร์ `backend`:

```powershell
$env:DATABASE_URL="postgresql://hr_admin:hr_password@localhost:5433/hr_workforce?schema=public"
npx tsx scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts --dateFrom=2026-05-26 --dateTo=2026-06-25
```

ดูตัวอย่างก่อน โดยยังไม่บันทึกข้อมูลจริง:

```powershell
npx tsx scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts --dateFrom=2026-05-26 --dateTo=2026-06-25 --dryRun
```

ลบข้อมูลจริงในช่วงที่เลือกของพนักงานกลุ่มนั้นก่อน seed ใหม่:

```powershell
npx tsx scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts --dateFrom=2026-05-26 --dateTo=2026-06-25 --replace
```

จำกัดเฉพาะบริษัท/สาขา/แผนก:

```powershell
npx tsx scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts --dateFrom=2026-05-26 --dateTo=2026-06-25 --companyId=xxx --branchId=xxx --departmentId=xxx
```

จำกัดจำนวนพนักงาน:

```powershell
npx tsx scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts --dateFrom=2026-05-26 --dateTo=2026-06-25 --limit=50
```

เลือกเฉพาะรหัสพนักงาน:

```powershell
npx tsx scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts --dateFrom=2026-05-26 --dateTo=2026-06-25 --employeeCodes=EMP0001,EMP0002
```

ข้ามวันอาทิตย์ ใช้เฉพาะกรณีที่ระบบตั้งค่าวันหยุด/วันทำงานรองรับแล้ว:

```powershell
npx tsx scripts/dev-seed-attendance-normal-month/seed-attendance-normal-month.ts --dateFrom=2026-05-26 --dateTo=2026-06-25 --skipSundays
```

## ตัวเลือกทั้งหมด

| ตัวเลือก | ความหมาย |
|---|---|
| `--dateFrom=YYYY-MM-DD` | วันที่เริ่มต้น ค่า default คือ `2026-05-26` |
| `--dateTo=YYYY-MM-DD` | วันที่สิ้นสุด ค่า default คือ `2026-06-25` |
| `--companyId=...` | จำกัดเฉพาะบริษัท |
| `--branchId=...` | จำกัดเฉพาะสาขา |
| `--departmentId=...` | จำกัดเฉพาะแผนก |
| `--employeeCodes=A,B,C` | จำกัดเฉพาะรหัสพนักงาน |
| `--limit=50` | จำกัดจำนวนพนักงาน |
| `--dryRun` | แสดงจำนวนข้อมูลที่จะสร้าง แต่ไม่บันทึกจริง |
| `--replace` | ลบข้อมูลลงเวลา/คำขอ/summary ในช่วงที่เลือกก่อน seed ใหม่ |
| `--skipSundays` | ไม่สร้าง log วันอาทิตย์ |
| `--noReviewCases` | ไม่สร้างเคสลืมสแกน/ต้องตรวจสอบเลย |
| `--maxReviewCases=10` | จำกัดจำนวนเคสต้องตรวจสอบเล็กน้อย ค่า default คือ 10 |

## สัดส่วนข้อมูล

สคริปต์ตั้งใจให้ข้อมูลส่วนใหญ่เป็นพนักงานเข้างานปกติ และมีเคสทดสอบเล็กน้อย:

- ปกติครบ 3 รอบ เป็นส่วนใหญ่
- มาสายเช้า/มาสายบ่ายเล็กน้อย
- ออกก่อนเล็กน้อย
- ลาเต็มวัน/ลาครึ่งวันแบบอนุมัติแล้ว
- ทำงานนอกสถานที่แบบอนุมัติแล้ว
- OT แบบอนุมัติแล้ว
- ลืมสแกนออกงานจำนวนน้อยมาก และถูกจำกัดด้วย `--maxReviewCases`

ถ้าต้องการไม่ให้มีสถานะต้องตรวจสอบเลย ให้เพิ่ม `--noReviewCases`

## หลัง seed เสร็จ

ข้อมูล seed จะสร้างเฉพาะ logs/requests ให้ระบบเดิมนำไปคำนวณ ดังนั้นหลัง seed ให้ไปหน้า HR Review แล้วกดคำนวณใหม่ หรือเรียก endpoint recalculate ตามสิทธิ์ HR/Admin

ถ้าใช้ `--replace` ระบบจะลบ `attendance_daily_summaries` ในช่วงที่เลือกด้วย เพื่อให้คำนวณใหม่สะอาดขึ้น

## ความปลอดภัย

ถ้าไม่ใส่ `--replace` สคริปต์จะลบเฉพาะข้อมูลเก่าที่เคยสร้างจากสคริปต์นี้เท่านั้น โดยอ้างอิง:

- `attendance_logs.source = DEV_SEED_NORMAL_MONTH`
- `requestNo` prefix `DNM-LV-*`, `DNM-OT-*`, `DNM-OF-*`

ถ้าใส่ `--replace` จะลบข้อมูลจริงในช่วงวันที่และพนักงานที่เลือกด้วย เหมาะสำหรับฐาน dev/test เท่านั้น
