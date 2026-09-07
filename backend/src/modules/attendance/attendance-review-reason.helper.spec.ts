import { resolveAttendanceReviewState } from "./attendance-review-reason.helper";

describe("resolveAttendanceReviewState", () => {
  it("marks a queued recalculation as a blocking review reason", () => {
    const result = resolveAttendanceReviewState({
      reviewStatus: "NEED_REVIEW",
      policySnapshot: {
        attendanceRecalculation: { status: "PENDING" },
      },
    });

    expect(result.hasReviewIssue).toBe(true);
    expect(result.requiresReview).toBe(true);
    expect(result.reviewReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RECALCULATION_PENDING" }),
      ]),
    );
  });

  it("marks a final queue failure as a calculation blocker", () => {
    const result = resolveAttendanceReviewState({
      reviewStatus: "NEED_REVIEW",
      calculationStatus: "ERROR",
      policySnapshot: {
        attendanceRecalculation: {
          status: "FAILED",
          error: "Redis worker unavailable",
        },
      },
    });

    expect(result.reviewReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RECALCULATION_FAILED",
          detail: "Redis worker unavailable",
        }),
        expect.objectContaining({ code: "CALCULATION_ERROR" }),
      ]),
    );
  });
});
