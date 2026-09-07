-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'LOGIN_LOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_REQUIRED';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_SUCCESS';
ALTER TYPE "AuditAction" ADD VALUE 'TWO_FACTOR_FAILED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastFailedLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorCodeHash" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "twoFactorLastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorRequestedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_lockedUntil_idx" ON "User"("lockedUntil");
