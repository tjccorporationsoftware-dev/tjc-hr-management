-- Expand employee profile for international-standard HR master data
ALTER TABLE "employee_profiles"
  ADD COLUMN "firstNameEn" TEXT,
  ADD COLUMN "lastNameEn" TEXT,
  ADD COLUMN "personalEmail" TEXT,
  ADD COLUMN "workPhoneExt" TEXT,
  ADD COLUMN "lineId" TEXT,
  ADD COLUMN "bloodType" TEXT,
  ADD COLUMN "taxId" TEXT,
  ADD COLUMN "socialSecurityNo" TEXT,
  ADD COLUMN "socialSecurityHospital" TEXT,
  ADD COLUMN "providentFundNo" TEXT,
  ADD COLUMN "payrollPaymentMethod" TEXT,
  ADD COLUMN "contractNo" TEXT,
  ADD COLUMN "contractStartDate" TIMESTAMP(3),
  ADD COLUMN "contractEndDate" TIMESTAMP(3),
  ADD COLUMN "workLocation" TEXT,
  ADD COLUMN "workPermitNo" TEXT,
  ADD COLUMN "workPermitExpiredDate" TIMESTAMP(3),
  ADD COLUMN "visaNo" TEXT,
  ADD COLUMN "visaExpiredDate" TIMESTAMP(3),
  ADD COLUMN "emergencyContactAddress" TEXT;

CREATE INDEX "employee_profiles_taxId_idx" ON "employee_profiles"("taxId");
CREATE INDEX "employee_profiles_socialSecurityNo_idx" ON "employee_profiles"("socialSecurityNo");
