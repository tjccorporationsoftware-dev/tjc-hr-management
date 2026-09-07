-- บังคับเปลี่ยนรหัสผ่านครั้งแรก เมื่อผู้ดูแลเป็นคนตั้งรหัสให้
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
