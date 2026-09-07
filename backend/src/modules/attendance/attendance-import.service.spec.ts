import { AttendanceImportStatus } from "../../generated/prisma/client";
import { AttendanceImportService } from "./attendance-import.service";

describe("AttendanceImportService", () => {
  it("queues every affected employee/date with ATTENDANCE_IMPORT source", async () => {
    const prisma = {
      attendanceImport: {
        findUnique: jest.fn().mockResolvedValue({
          id: "import-1",
          status: AttendanceImportStatus.PENDING,
          totalRows: 2,
          importedRows: 2,
          errorRows: 0,
        }),
        update: jest
          .fn()
          .mockResolvedValueOnce({ id: "import-1", status: "PROCESSING" })
          .mockResolvedValueOnce({ id: "import-1", status: "COMPLETED" }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "employee-1",
            companyId: "company-1",
            branchId: "branch-1",
          },
        ]),
      },
      attendanceLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const queue = {
      enqueueDailySummaryRecalculation: jest
        .fn()
        .mockResolvedValue({ id: "job" }),
    };
    const audit = { createLog: jest.fn().mockResolvedValue({}) };
    const service = new AttendanceImportService(
      prisma as any,
      queue as any,
      audit as any,
    );

    const result = await service.completeImport(
      "import-1",
      {
        rows: [
          { employeeId: "employee-1", workDate: "2026-07-20" },
          { employeeId: "employee-1", workDate: "2026-07-21" },
        ],
      },
      "user-1",
      { level: "BRANCH", companyId: "company-1", branchId: "branch-1" },
    );

    expect(result.queued).toBe(2);
    expect(queue.enqueueDailySummaryRecalculation).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "ATTENDANCE_IMPORT",
        sourceId: "import-1",
        sourceAction: "IMPORT_COMPLETED",
      }),
    );
  });
});
