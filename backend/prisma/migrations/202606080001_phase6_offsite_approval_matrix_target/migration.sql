-- Phase 6: allow Approval Matrix to target Offsite Work Request
ALTER TYPE "ApprovalMatrixTargetType" ADD VALUE IF NOT EXISTS 'OFFSITE_WORK_REQUEST';
