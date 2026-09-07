import { Test } from "@nestjs/testing";
import { PrismaService } from "../../database/prisma.service";
import type { TenantScope } from "../../common/interfaces/authenticated-user.interface";
import { SystemSettingsService } from "../settings/system-settings.service";
import { DashboardService } from "./dashboard.service";

/**
 * กันการ scope ตาราง Branch ผิดคีย์
 * ---------------------------------
 * Branch ไม่มีคอลัมน์ `branchId` — ตัวมันเองคือสาขา ต้องเทียบด้วย `id`
 * ของเดิมใช้ helper ตัวเดียวกับ Employee/Department ทำให้ query พังด้วย P2009
 * เฉพาะผู้ใช้ระดับสาขา ส่วนระดับบริษัท/GLOBAL รอดเพราะ helper ไม่ใส่ branchId มา
 * บั๊กจึงไม่โผล่จนกว่าจะมีผู้ใช้ scope BRANCH เปิดห้องผู้บริหาร
 */
describe("DashboardService — scope ของตาราง Branch", () => {
  const branchScope: TenantScope = {
    level: "BRANCH",
    companyId: "company-1",
    branchId: "branch-1",
  };

  const buildService = async (capture: { branchWhere?: unknown }) => {
    const emptyList = jest.fn().mockResolvedValue([]);
    const prisma = {
      employee: { findMany: emptyList, count: jest.fn().mockResolvedValue(0) },
      attendanceDailySummary: { findMany: emptyList },
      attendanceLog: { findMany: emptyList },
      leaveRequest: { findMany: emptyList },
      department: { findMany: emptyList },
      overtimeRequest: { findMany: emptyList },
      /* ชั่วโมงทำงานต่อวันของบริษัท — ใช้แปลงวันลาเป็นชั่วโมง ไม่มีค่าก็ตกไปที่ 8 */
      companyPayrollSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      branch: {
        findMany: jest.fn((args: { where: unknown }) => {
          capture.branchWhere = args.where;
          return Promise.resolve([]);
        }),
      },
    };

    /* ยอด "ลาวันนี้" ต้องตัดวันหยุดของแต่ละคนออก — เทสนี้ไม่ได้ตรวจเรื่องนั้น
       จึงตอบว่า "ไม่ใช่วันหยุด" ให้ทุกคน */
    const systemSettings = {
      getSystemSettings: jest.fn().mockResolvedValue({}),
      resolveEmployeeAttendanceHolidayInfo: jest
        .fn()
        .mockReturnValue({ isHoliday: false }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: SystemSettingsService, useValue: systemSettings },
      ],
    }).compile();

    return moduleRef.get(DashboardService);
  };

  it("ผู้ใช้ระดับสาขา ต้องกรองด้วย id ของสาขา ไม่ใช่ branchId", async () => {
    const capture: { branchWhere?: Record<string, unknown> } = {};
    const service = await buildService(capture);

    await service.getExecutiveAttendanceToday(branchScope);

    expect(capture.branchWhere).toEqual({
      deletedAt: null,
      companyId: "company-1",
      id: "branch-1",
    });
    expect(capture.branchWhere).not.toHaveProperty("branchId");
  });

  it("ผู้ใช้ระดับบริษัท กรองแค่ companyId", async () => {
    const capture: { branchWhere?: Record<string, unknown> } = {};
    const service = await buildService(capture);

    await service.getExecutiveAttendanceToday({
      level: "COMPANY",
      companyId: "company-1",
      branchId: null,
    });

    expect(capture.branchWhere).toEqual({
      deletedAt: null,
      companyId: "company-1",
    });
  });

  it("ผู้ใช้ระดับ GLOBAL ไม่กรองสาขาเลย", async () => {
    const capture: { branchWhere?: Record<string, unknown> } = {};
    const service = await buildService(capture);

    await service.getExecutiveAttendanceToday({
      level: "GLOBAL",
      companyId: null,
      branchId: null,
    });

    expect(capture.branchWhere).toEqual({ deletedAt: null });
  });
});
