-- Phase 6.7: Offsite Work two-step approval status values
ALTER TYPE "OffsiteRequestStatus" ADD VALUE IF NOT EXISTS 'MANAGER_APPROVED';
ALTER TYPE "OffsiteRequestStatus" ADD VALUE IF NOT EXISTS 'HR_APPROVED';
ALTER TYPE "OffsiteRequestStatus" ADD VALUE IF NOT EXISTS 'MANAGER_REJECTED';
ALTER TYPE "OffsiteRequestStatus" ADD VALUE IF NOT EXISTS 'HR_REJECTED';
