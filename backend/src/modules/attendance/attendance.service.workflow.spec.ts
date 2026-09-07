import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { AttendanceReviewStatus } from "../../generated/prisma/client";
import { AttendanceService } from "./attendance.service";

function createService(pendingKeys = new Set<string>()) {
  const queue = {
    findPendingRecalculationKeys: jest.fn().mockResolvedValue(pendingKeys),
  };

  const service = new AttendanceService(
    {} as any,
    {} as any,
    queue as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service: service as any, queue };
}

function freshSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: "summary-1",
    employeeId: "employee-1",
    workDate: new Date("2026-07-21T00:00:00.000Z"),
    calculatedAt: new Date("2026-07-21T12:00:00.000Z"),
    reviewStatus: AttendanceReviewStatus.READY_FOR_PAYROLL,
    lockedAt: null,
    sentToPayrollAt: null,
    payrollRunId: null,
    policySnapshot: {
      attendanceReview: { sourceHash: "source-hash-1" },
      attendanceRecalculation: {
        status: "COMPLETED",
        queuedAt: "2026-07-21T10:00:00.000Z",
        completedAt: "2026-07-21T12:00:00.000Z",
      },
    },
    ...overrides,
  };
}

describe("Attendance workflow guards", () => {
  it("blocks Ready/Lock while a queue job is pending", async () => {
    const { service } = createService(new Set(["employee-1:2026-07-21"]));

    await expect(
      service.assertDailySummariesFreshForTransition(
        [freshSummary()],
        AttendanceReviewStatus.LOCKED,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks Ready/Lock after the final recalculation failure", async () => {
    const { service } = createService();
    const summary = freshSummary({
      policySnapshot: {
        attendanceReview: { sourceHash: "source-hash-1" },
        attendanceRecalculation: { status: "FAILED" },
      },
    });

    await expect(
      service.assertDailySummariesFreshForTransition(
        [summary],
        AttendanceReviewStatus.READY_FOR_PAYROLL,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("allows Lock only after the summary is fresh and READY_FOR_PAYROLL", async () => {
    const { service } = createService();
    const summary = freshSummary();

    await expect(
      service.assertDailySummariesFreshForTransition(
        [summary],
        AttendanceReviewStatus.LOCKED,
      ),
    ).resolves.toBeUndefined();
    expect(() =>
      service.ensureDailySummaryCanMoveToStatus(
        summary,
        AttendanceReviewStatus.LOCKED,
      ),
    ).not.toThrow();
  });

  it("rejects cross-branch access even when the company matches", () => {
    const { service } = createService();

    expect(() =>
      service.assertAttendanceEntityWithinScope(
        { level: "BRANCH", companyId: "company-1", branchId: "branch-1" },
        { companyId: "company-1", branchId: "branch-2" },
      ),
    ).toThrow(ForbiddenException);
  });
});
