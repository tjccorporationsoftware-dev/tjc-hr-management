-- AlterTable
ALTER TABLE "holiday_calendars" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "holiday_work_assignments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "substitute_holiday_credits" ALTER COLUMN "updatedAt" DROP DEFAULT;
