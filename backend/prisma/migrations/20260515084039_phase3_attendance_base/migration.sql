-- CreateEnum
CREATE TYPE "AttendanceLogType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "AttendanceChannel" AS ENUM ('WEB', 'MOBILE', 'GPS', 'QR', 'KIOSK', 'DEVICE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "AttendanceLogStatus" AS ENUM ('NORMAL', 'LATE', 'EARLY_LEAVE', 'MISSING_CHECKIN', 'MISSING_CHECKOUT', 'MANUAL_ADDED', 'EDITED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceDeviceType" AS ENUM ('FINGERPRINT', 'FACE_SCAN', 'QR_KIOSK', 'TABLET', 'MOBILE_APP', 'WEB_DEVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceLocationType" AS ENUM ('OFFICE', 'BRANCH', 'SITE', 'REMOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceEditAction" AS ENUM ('CREATE_MANUAL', 'UPDATE_TIME', 'CANCEL', 'RESTORE');

-- CreateEnum
CREATE TYPE "AttendanceImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "attendance_locations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "type" "AttendanceLocationType" NOT NULL DEFAULT 'OFFICE',
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "radiusMeters" INTEGER NOT NULL DEFAULT 100,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_devices" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AttendanceDeviceType" NOT NULL DEFAULT 'OTHER',
    "serialNo" TEXT,
    "ipAddress" TEXT,
    "description" TEXT,
    "branchId" TEXT,
    "locationId" TEXT,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_logs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "logType" "AttendanceLogType" NOT NULL,
    "logTime" TIMESTAMP(3) NOT NULL,
    "channel" "AttendanceChannel" NOT NULL DEFAULT 'WEB',
    "status" "AttendanceLogStatus" NOT NULL DEFAULT 'NORMAL',
    "deviceId" TEXT,
    "locationId" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "gpsAccuracy" DECIMAL(10,2),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_edit_logs" (
    "id" TEXT NOT NULL,
    "attendanceLogId" TEXT NOT NULL,
    "action" "AttendanceEditAction" NOT NULL,
    "oldLogTime" TIMESTAMP(3),
    "newLogTime" TIMESTAMP(3),
    "oldStatus" "AttendanceLogStatus",
    "newStatus" "AttendanceLogStatus",
    "oldChannel" "AttendanceChannel",
    "newChannel" "AttendanceChannel",
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_edit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_imports" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT,
    "bucketName" TEXT,
    "status" "AttendanceImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_locations_companyId_idx" ON "attendance_locations"("companyId");

-- CreateIndex
CREATE INDEX "attendance_locations_branchId_idx" ON "attendance_locations"("branchId");

-- CreateIndex
CREATE INDEX "attendance_locations_type_idx" ON "attendance_locations"("type");

-- CreateIndex
CREATE INDEX "attendance_locations_status_idx" ON "attendance_locations"("status");

-- CreateIndex
CREATE INDEX "attendance_locations_deletedAt_idx" ON "attendance_locations"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_locations_companyId_code_key" ON "attendance_locations"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_code_key" ON "attendance_devices"("code");

-- CreateIndex
CREATE INDEX "attendance_devices_code_idx" ON "attendance_devices"("code");

-- CreateIndex
CREATE INDEX "attendance_devices_type_idx" ON "attendance_devices"("type");

-- CreateIndex
CREATE INDEX "attendance_devices_branchId_idx" ON "attendance_devices"("branchId");

-- CreateIndex
CREATE INDEX "attendance_devices_locationId_idx" ON "attendance_devices"("locationId");

-- CreateIndex
CREATE INDEX "attendance_devices_status_idx" ON "attendance_devices"("status");

-- CreateIndex
CREATE INDEX "attendance_devices_deletedAt_idx" ON "attendance_devices"("deletedAt");

-- CreateIndex
CREATE INDEX "attendance_logs_employeeId_idx" ON "attendance_logs"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_logs_employeeId_workDate_idx" ON "attendance_logs"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "attendance_logs_workDate_idx" ON "attendance_logs"("workDate");

-- CreateIndex
CREATE INDEX "attendance_logs_logTime_idx" ON "attendance_logs"("logTime");

-- CreateIndex
CREATE INDEX "attendance_logs_logType_idx" ON "attendance_logs"("logType");

-- CreateIndex
CREATE INDEX "attendance_logs_channel_idx" ON "attendance_logs"("channel");

-- CreateIndex
CREATE INDEX "attendance_logs_status_idx" ON "attendance_logs"("status");

-- CreateIndex
CREATE INDEX "attendance_logs_deviceId_idx" ON "attendance_logs"("deviceId");

-- CreateIndex
CREATE INDEX "attendance_logs_locationId_idx" ON "attendance_logs"("locationId");

-- CreateIndex
CREATE INDEX "attendance_logs_createdById_idx" ON "attendance_logs"("createdById");

-- CreateIndex
CREATE INDEX "attendance_logs_deletedAt_idx" ON "attendance_logs"("deletedAt");

-- CreateIndex
CREATE INDEX "attendance_edit_logs_attendanceLogId_idx" ON "attendance_edit_logs"("attendanceLogId");

-- CreateIndex
CREATE INDEX "attendance_edit_logs_action_idx" ON "attendance_edit_logs"("action");

-- CreateIndex
CREATE INDEX "attendance_edit_logs_editedById_idx" ON "attendance_edit_logs"("editedById");

-- CreateIndex
CREATE INDEX "attendance_edit_logs_createdAt_idx" ON "attendance_edit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "attendance_imports_status_idx" ON "attendance_imports"("status");

-- CreateIndex
CREATE INDEX "attendance_imports_createdById_idx" ON "attendance_imports"("createdById");

-- CreateIndex
CREATE INDEX "attendance_imports_createdAt_idx" ON "attendance_imports"("createdAt");

-- AddForeignKey
ALTER TABLE "attendance_locations" ADD CONSTRAINT "attendance_locations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_locations" ADD CONSTRAINT "attendance_locations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "attendance_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "attendance_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "attendance_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_edit_logs" ADD CONSTRAINT "attendance_edit_logs_attendanceLogId_fkey" FOREIGN KEY ("attendanceLogId") REFERENCES "attendance_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_edit_logs" ADD CONSTRAINT "attendance_edit_logs_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_imports" ADD CONSTRAINT "attendance_imports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
