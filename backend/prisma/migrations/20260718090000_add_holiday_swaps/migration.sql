-- Add holiday swap support for company, branch, department, and employee scopes.
-- This allows a holiday date to become a workday and another date to become the replacement holiday.

CREATE TYPE "HolidaySwapScopeType" AS ENUM ('COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE');
CREATE TYPE "HolidaySwapStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "holiday_swaps" (
    "id" TEXT NOT NULL,
    "originalHolidayDate" DATE NOT NULL,
    "swappedHolidayDate" DATE NOT NULL,
    "scopeType" "HolidaySwapScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "name" TEXT,
    "reason" TEXT,
    "status" "HolidaySwapStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledReason" TEXT,

    CONSTRAINT "holiday_swaps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "holiday_swaps_originalHolidayDate_idx" ON "holiday_swaps"("originalHolidayDate");
CREATE INDEX "holiday_swaps_swappedHolidayDate_idx" ON "holiday_swaps"("swappedHolidayDate");
CREATE INDEX "holiday_swaps_scopeType_scopeId_idx" ON "holiday_swaps"("scopeType", "scopeId");
CREATE INDEX "holiday_swaps_status_idx" ON "holiday_swaps"("status");
CREATE INDEX "holiday_swaps_deletedAt_idx" ON "holiday_swaps"("deletedAt");

CREATE UNIQUE INDEX "holiday_swaps_active_unique_idx"
ON "holiday_swaps"("originalHolidayDate", "swappedHolidayDate", "scopeType", "scopeId")
WHERE "deletedAt" IS NULL AND "status" = 'ACTIVE';
