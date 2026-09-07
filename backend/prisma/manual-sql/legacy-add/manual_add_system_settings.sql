-- Batch 9: System Settings Backend
-- Run this once before opening /settings/system after applying the Batch 9 files.

CREATE TABLE IF NOT EXISTS system_settings (
  "id" TEXT PRIMARY KEY,
  "value" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NULL,
  "updatedById" TEXT NULL
);

CREATE TABLE IF NOT EXISTS system_settings_audit (
  "id" TEXT PRIMARY KEY,
  "settingId" TEXT NOT NULL,
  "previousValue" JSONB NOT NULL,
  "newValue" JSONB NOT NULL,
  "changedById" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "system_settings_audit_settingId_idx"
  ON system_settings_audit ("settingId");

CREATE INDEX IF NOT EXISTS "system_settings_audit_changedById_idx"
  ON system_settings_audit ("changedById");

CREATE INDEX IF NOT EXISTS "system_settings_audit_createdAt_idx"
  ON system_settings_audit ("createdAt");

INSERT INTO system_settings ("id", "value", "createdAt", "updatedAt")
VALUES (
  'system',
  '{
    "organizationName": "HR Workforce Management System",
    "timezone": "Asia/Bangkok",
    "locale": "th-TH",
    "dateFormat": "DD/MM/YYYY พ.ศ.",
    "timeFormat": "HH:mm",
    "fiscalYearStartMonth": 1,
    "fileUploadMaxMb": 20,
    "allowedFileTypes": ["pdf", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg"],
    "sessionTimeoutMinutes": 480,
    "passwordMinLength": 8,
    "requireUppercase": false,
    "requireLowercase": false,
    "requireNumber": false,
    "requireSymbol": false,
    "requireTwoFactor": false,
    "enableEmailNotification": true,
    "enableLineNotification": false,
    "maintenanceMode": false
  }'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
