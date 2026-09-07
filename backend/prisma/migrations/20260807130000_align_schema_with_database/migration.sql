-- ทำให้สคีมากับฐานข้อมูลจริงตรงกัน
--
-- ฐานข้อมูลที่ใช้งานอยู่มีสองข้อจำกัดที่ไม่ได้อยู่ในสคีมา ทำให้ถ้า deploy
-- จากสคีมาไปเครื่องใหม่ จะได้ระบบคนละแบบกับที่รันอยู่จริง:
--
--   1. employees — ของจริงเป็น UNIQUE(companyId, employeeCode) แต่สคีมาเขียน @unique เดี่ยว
--      deploy ใหม่ = รหัสพนักงานห้ามซ้ำข้ามบริษัท บริษัทที่สองจะสร้าง "001" ไม่ได้ (P2002)
--
--   2. leave_balance_ledgers — ของจริงมี UNIQUE(sourceType, sourceId, action) แต่สคีมาไม่มี
--      เป็นตัวเดียวที่กันยกยอด/หมดอายุวันลาซ้ำ เพราะโค้ดที่เช็คซ้ำอยู่นอก transaction
--      deploy ใหม่ = index หายไป วันลาถูกตัดซ้ำได้
--
-- ใช้ IF EXISTS / IF NOT EXISTS เพื่อให้รันได้ทั้งบนฐานข้อมูลเดิม (ไม่มีอะไรเปลี่ยน)
-- และบนฐานข้อมูลใหม่ที่สร้างจาก migration ทั้งชุด (สร้าง/ลบให้ตรง)

-- DropIndex
DROP INDEX IF EXISTS "employees_employeeCode_key";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "employees_companyId_employeeCode_key" ON "employees"("companyId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "leave_balance_ledgers_sourceType_sourceId_action_key" ON "leave_balance_ledgers"("sourceType", "sourceId", "action");
