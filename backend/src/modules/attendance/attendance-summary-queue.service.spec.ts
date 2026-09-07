import { AttendanceReviewStatus } from "../../generated/prisma/client";
import { AttendanceSummaryQueueService } from "./attendance-summary-queue.service";

function createSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "summary-1",
    reviewStatus: AttendanceReviewStatus.READY_FOR_PAYROLL,
    reviewedAt: new Date("2026-07-20T10:00:00.000Z"),
    readyForPayrollAt: new Date("2026-07-20T11:00:00.000Z"),
    lockedAt: null,
    sentToPayrollAt: null,
    payrollRunId: null,
    calculationNote: null,
    policySnapshot: {
      attendanceReview: {
        sourceHash: "hash-1",
        reviewReasons: [],
      },
    },
    ...overrides,
  };
}

describe("AttendanceSummaryQueueService", () => {
  it("invalidates READY status before a recalculation job is queued", async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({ id: "job-1", data: {} }),
    };
    const prisma = {
      attendanceDailySummary: {
        findUnique: jest.fn().mockResolvedValue(createSummary()),
        update: jest.fn().mockResolvedValue({ id: "summary-1" }),
      },
    };
    const audit = { createLog: jest.fn().mockResolvedValue({}) };
    const service = new AttendanceSummaryQueueService(
      queue as any,
      prisma as any,
      audit as any,
    );

    await service.enqueueDailySummaryRecalculation({
      employeeId: "employee-1",
      workDate: "2026-07-21",
      requestedById: "user-1",
      sourceType: "LEAVE_REQUEST",
      sourceId: "leave-1",
      sourceAction: "APPROVED",
    });

    const firstUpdate = prisma.attendanceDailySummary.update.mock.calls[0][0];
    expect(firstUpdate.data.reviewStatus).toBe(
      AttendanceReviewStatus.NEED_REVIEW,
    );
    expect(firstUpdate.data.readyForPayrollAt).toBeNull();
    expect(firstUpdate.data.policySnapshot.attendanceRecalculation.status).toBe(
      "PENDING",
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("queues a follow-up job when the primary job is already active", async () => {
    const activeJob = {
      id: "primary-job",
      data: {},
      getState: jest.fn().mockResolvedValue("active"),
    };
    const queue = {
      getJob: jest
        .fn()
        .mockResolvedValueOnce(activeJob)
        .mockResolvedValueOnce(null),
      add: jest.fn().mockResolvedValue({ id: "followup-job", data: {} }),
    };
    const prisma = {
      attendanceDailySummary: {
        findUnique: jest.fn().mockResolvedValue(createSummary()),
        update: jest.fn().mockResolvedValue({ id: "summary-1" }),
      },
    };
    const service = new AttendanceSummaryQueueService(
      queue as any,
      prisma as any,
      { createLog: jest.fn().mockResolvedValue({}) } as any,
    );

    await service.enqueueDailySummaryRecalculation({
      employeeId: "employee-1",
      workDate: "2026-07-21",
      requestedById: "user-1",
      sourceType: "ATTENDANCE_LOG",
      sourceId: "log-2",
      sourceAction: "UPDATED",
    });

    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        jobId: expect.stringContaining(":followup"),
      }),
    );
  });

  it("keeps the summary blocked when adding a job to Redis fails", async () => {
    const queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const prisma = {
      attendanceDailySummary: {
        findUnique: jest.fn().mockResolvedValue(createSummary()),
        findFirst: jest.fn().mockResolvedValue(createSummary()),
        update: jest.fn().mockResolvedValue({ id: "summary-1" }),
      },
    };
    const service = new AttendanceSummaryQueueService(
      queue as any,
      prisma as any,
      { createLog: jest.fn().mockResolvedValue({}) } as any,
    );

    await expect(
      service.enqueueDailySummaryRecalculation({
        employeeId: "employee-1",
        workDate: "2026-07-21",
        requestedById: "user-1",
        sourceType: "ATTENDANCE_IMPORT",
        sourceId: "import-1",
        sourceAction: "IMPORT_COMPLETED",
      }),
    ).rejects.toThrow("Redis unavailable");

    const failedUpdate =
      prisma.attendanceDailySummary.update.mock.calls.at(-1)[0];
    expect(failedUpdate.data.reviewStatus).toBe(
      AttendanceReviewStatus.NEED_REVIEW,
    );
    expect(failedUpdate.data.calculationStatus).toBe("ERROR");
    expect(
      failedUpdate.data.policySnapshot.attendanceRecalculation.status,
    ).toBe("FAILED");
  });
});
