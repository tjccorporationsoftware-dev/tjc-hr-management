-- DropForeignKey
ALTER TABLE "attendance_daily_summaries" DROP CONSTRAINT "attendance_daily_summaries_policyId_fkey";

-- AlterTable
ALTER TABLE "attendance_daily_summaries" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "attendance_policies" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "system_settings" ALTER COLUMN "value" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
