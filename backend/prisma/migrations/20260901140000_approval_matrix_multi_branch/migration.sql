-- สายอนุมัติหนึ่งเส้นครอบได้หลายสาขา (สาขาแรกยังอยู่ที่ approval_matrices.branchId)
CREATE TABLE "approval_matrix_branches" (
    "id" TEXT NOT NULL,
    "approvalMatrixId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_matrix_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "approval_matrix_branches_approvalMatrixId_branchId_key" ON "approval_matrix_branches"("approvalMatrixId", "branchId");
CREATE INDEX "approval_matrix_branches_branchId_idx" ON "approval_matrix_branches"("branchId");

ALTER TABLE "approval_matrix_branches" ADD CONSTRAINT "approval_matrix_branches_approvalMatrixId_fkey" FOREIGN KEY ("approvalMatrixId") REFERENCES "approval_matrices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_matrix_branches" ADD CONSTRAINT "approval_matrix_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
