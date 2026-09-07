-- กองทุนเงินทดแทนใช้รหัสกิจการและอัตราเงินสมทบคนละชุดกับประกันสังคม
-- อัตราขึ้นกับความเสี่ยงของประเภทกิจการ (ราว 0.2%-1.0%) จึงเก็บเป็นทศนิยม 4 ตำแหน่ง
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "workmenCompensationCode" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "workmenCompensationRate" DECIMAL(6,4);
