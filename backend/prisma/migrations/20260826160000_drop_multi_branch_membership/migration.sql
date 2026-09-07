-- ถอนระบบ "หนึ่งคนอยู่หลายสาขา" ออกทั้งชุด
--
-- ทดลองใช้แล้วสรุปว่าไม่เอา — กลับไปใช้กติกาเดิมที่ตรงไปตรงมากว่า:
-- ทะเบียนพนักงานหนึ่งใบ = หนึ่งสาขา = เงินเดือนหนึ่งก้อน
-- คนที่รับเงินจากหลายสาขาให้เปิดทะเบียนใบใหม่ (รหัสพนักงานใหม่) ด้วยมือแทน
--
-- สิ่งที่ยังอยู่ต่อ:
--   - ระบบใบโยกย้าย/ปรับตำแหน่ง (employee_transfers) ยังใช้งานอยู่
--   - การถอด unique ของ nationalId / socialSecurityNo / taxId ต่อบริษัท ยังคงถอดไว้
--     เพราะการเปิดทะเบียนใบที่สองด้วยมือต้องใส่เลขชุดเดียวกันได้ ถ้าเอา unique กลับมา
--     วิธีทำมือจะติดตั้งแต่ใบที่สอง

-- ช่องที่ผูกกับแนวคิด "คงชื่อไว้ที่สาขาเดิม" ตอนโยกย้าย ไม่มีความหมายอีกต่อไป
ALTER TABLE "employee_transfers" DROP COLUMN "keepPreviousBranch";

ALTER TABLE "employees" DROP CONSTRAINT "employees_personLinkId_fkey";
DROP INDEX "employees_personLinkId_idx";
ALTER TABLE "employees" DROP COLUMN "personLinkId";

DROP TABLE "employee_person_links";
DROP TABLE "employee_branch_assignments";
DROP TABLE "user_branch_scopes";
