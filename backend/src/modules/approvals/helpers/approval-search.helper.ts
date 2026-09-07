import { Prisma } from '../../../generated/prisma/client';

/**
 * approval-search.helper.ts
 *
 * รวม logic ค้นหาข้อความของ Approval Center
 * แยกออกจาก approvals.service.ts เพื่อให้ service อ่านง่าย
 *
 * q ใช้ค้นหาจาก:
 * - เลขที่คำขอ
 * - เหตุผล
 * - ข้อมูลพนักงาน เช่น รหัส ชื่อ นามสกุล ตำแหน่ง
 * - บาง module มี master เพิ่ม เช่น leaveType
 */

/** สร้าง where สำหรับค้นหาใบลา */
export function buildLeaveTextSearchWhere(
  q?: string,
): Prisma.LeaveRequestWhereInput {
  const search = q?.trim();

  if (!search) return {};

  return {
    OR: [
      {
        requestNo: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        reason: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        employee: buildEmployeeSearchWhere(search),
      },
      {
        leaveType: {
          OR: [
            {
              code: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              nameTh: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ],
        },
      },
    ],
  };
}

/** สร้าง where สำหรับค้นหา OT */
export function buildOvertimeTextSearchWhere(
  q?: string,
): Prisma.OvertimeRequestWhereInput {
  const search = q?.trim();

  if (!search) return {};

  return {
    OR: [
      {
        requestNo: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        reason: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        employee: buildEmployeeSearchWhere(search),
      },
    ],
  };
}

/** สร้าง where สำหรับค้นหาคำขอแก้เวลา */
export function buildTimeAdjustTextSearchWhere(
  q?: string,
): Prisma.TimeAdjustRequestWhereInput {
  const search = q?.trim();

  if (!search) return {};

  return {
    OR: [
      {
        requestNo: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        reason: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        employee: buildEmployeeSearchWhere(search),
      },
    ],
  };
}

/**
 * เงื่อนไขค้นหาพนักงานกลาง ใช้ซ้ำทุก module
 * ใช้ mode insensitive เพื่อให้ค้นหาไม่สนตัวพิมพ์เล็ก/ใหญ่
 */
function buildEmployeeSearchWhere(search: string): Prisma.EmployeeWhereInput {
  return {
    OR: [
      {
        employeeCode: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        firstName: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        lastName: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        displayName: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        position: {
          contains: search,
          mode: 'insensitive',
        },
      },
      {
        company: {
          nameTh: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        branch: {
          nameTh: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        department: {
          nameTh: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
      {
        division: {
          nameTh: {
            contains: search,
            mode: 'insensitive',
          },
        },
      },
    ],
  };
}
