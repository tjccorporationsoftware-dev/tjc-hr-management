-- การมอบอำนาจอนุมัติแทน
--
-- เขียน SQL เองแทนการใช้ `prisma migrate dev` เพราะฐานข้อมูลมี migration
-- ที่ถูก apply ไปแล้วแต่ไม่มีโฟลเดอร์ในโปรเจค (drift) ทำให้ Prisma
-- เสนอให้ reset ฐานข้อมูลทั้งก้อน ซึ่งจะทำให้ข้อมูลจริงหายทั้งหมด
-- ไฟล์นี้จึงมีเฉพาะสิ่งที่ต้องเพิ่ม ไม่แตะโครงสร้างเดิมเลย

-- CreateTable
CREATE TABLE "approval_delegations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "delegatorUserId" TEXT NOT NULL,
    "delegateUserId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "targetTypes" "ApprovalMatrixTargetType"[],
    "reason" TEXT,
    "status" "MasterStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "approval_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_delegations_companyId_idx" ON "approval_delegations"("companyId");

-- CreateIndex
CREATE INDEX "approval_delegations_delegatorUserId_idx" ON "approval_delegations"("delegatorUserId");

-- CreateIndex
CREATE INDEX "approval_delegations_delegateUserId_idx" ON "approval_delegations"("delegateUserId");

-- CreateIndex
CREATE INDEX "approval_delegations_startDate_endDate_idx" ON "approval_delegations"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "approval_delegations_status_idx" ON "approval_delegations"("status");

-- CreateIndex
CREATE INDEX "approval_delegations_deletedAt_idx" ON "approval_delegations"("deletedAt");

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegatorUserId_fkey" FOREIGN KEY ("delegatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_delegateUserId_fkey" FOREIGN KEY ("delegateUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_delegations" ADD CONSTRAINT "approval_delegations_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
