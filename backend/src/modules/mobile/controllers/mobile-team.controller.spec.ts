import 'reflect-metadata';

import { REQUIRED_PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { MobileTeamOrchestrator } from '../application/mobile-team.orchestrator';
import {
  toMobileTeamCalendar,
  toMobileTeamMemberDetail,
  toMobileTeamMemberListItem,
  toMobileTeamRequestItem,
} from '../mappers/mobile-team.mapper';
import { MobileTeamController } from './mobile-team.controller';

/**
 * จอทีมบนมือถือ
 *
 * สองเรื่องที่ต้องคุม:
 *   1. ทุก route ต้องใช้ `TEAM_VIEW` ไม่ใช่ `APPROVAL_ACCESS` — HR ถือสิทธิ์
 *      อนุมัติแต่ไม่มีลูกทีม ถ้าใช้สลับกันจะได้จอว่างเปล่าโดยไม่มีคำอธิบาย
 *   2. mapper ต้องไม่คำนวณตัวเลขเอง — ค่าที่ ManagerService ส่งมาต้องผ่านไป
 *      ตรง ๆ ไม่งั้นเลขบนแอปกับบนเว็บจะเริ่มไม่ตรงกันโดยไม่มีใครรู้
 */
describe('MobileTeamController', () => {
  const ROUTES = [
    'summary',
    'members',
    'calendar',
    'attendance',
    'requests',
    'member',
  ] as const;

  it('ทุก route ใช้สิทธิ์ ESS_ACCESS + TEAM_VIEW', () => {
    for (const route of ROUTES) {
      const permissions = Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        MobileTeamController.prototype[route],
      );

      expect({ route, permissions }).toEqual({
        route,
        permissions: ['ESS_ACCESS', 'TEAM_VIEW'],
      });
    }
  });

  it('ส่ง query ต่อให้ orchestrator โดยไม่แปลงความหมาย', async () => {
    const orchestrator = {
      attendance: jest.fn(async () => ({ items: [], meta: {} })),
      calendar: jest.fn(async () => ({ days: [] })),
      member: jest.fn(async () => ({})),
      members: jest.fn(async () => ({ items: [], meta: {} })),
      requests: jest.fn(async () => ({ items: [], meta: {} })),
      summary: jest.fn(async () => ({})),
    } as unknown as MobileTeamOrchestrator;

    const controller = new MobileTeamController(orchestrator);
    const user = { id: 'user-1' } as never;

    await controller.attendance(user, { employeeId: 'emp-1', page: 2 });
    await controller.member(user, 'emp-1', { month: '2026-07' });

    expect(orchestrator.attendance).toHaveBeenCalledWith(user, {
      employeeId: 'emp-1',
      page: 2,
    });
    expect(orchestrator.member).toHaveBeenCalledWith(user, 'emp-1', {
      month: '2026-07',
    });
  });
});

describe('mapper ของจอทีม', () => {
  it('รายชื่อลูกทีมใช้ตำแหน่งจากตารางกลางก่อนข้อความอิสระ', () => {
    const item = toMobileTeamMemberListItem({
      employeeCode: '000123',
      firstName: 'สมชาย',
      id: 'emp-1',
      lastName: 'ใจดี',
      position: 'ตำแหน่งเก่าที่พิมพ์ไว้',
      positionMaster: { nameTh: 'หัวหน้าแผนกบัญชี' },
      status: 'ACTIVE',
    });

    expect(item.position).toBe('หัวหน้าแผนกบัญชี');
    expect(item.name).toBe('สมชาย ใจดี');
  });

  it('รายละเอียดสมาชิกตัดวันลาประเภทที่ไม่มีโควตาและไม่เคยใช้ออก', () => {
    const detail = toMobileTeamMemberDetail({
      date: '2026-08-21',
      member: {
        employee: { displayName: 'สมหญิง', id: 'emp-2' },
        leaveBalances: [
          { code: 'ANNUAL', entitlementDays: 6, remainingDays: 4, usedDays: 2 },
          { code: 'ORDINATION', entitlementDays: 0, usedDays: 0 },
          { code: 'SICK', entitlementDays: 0, usedDays: 1.5 },
        ],
        month: { lateDays: 2 },
        today: { status: 'LATE' },
      },
      month: '2026-08',
    });

    expect(detail.leaveBalances.map((row) => row.code)).toEqual([
      'ANNUAL',
      'SICK',
    ]);
    expect(detail.monthTotals.lateDays).toBe(2);
    expect(detail.today.status).toBe('LATE');
  });

  it('รายละเอียดสมาชิกไม่เดาสถานะเมื่อ backend ไม่ได้ส่งมา', () => {
    const detail = toMobileTeamMemberDetail({
      member: { employee: { id: 'emp-3' } },
    });

    expect(detail.today.status).toBe('NOT_CHECKED_IN');
    expect(detail.shift).toBeNull();
  });

  it('ปฏิทินทีมคงจำนวนคนที่ไม่อยู่ตามที่ service คำนวณมา', () => {
    const calendar = toMobileTeamCalendar({
      days: [
        {
          awayTotal: 2,
          date: '2026-08-03',
          isHoliday: false,
          leaves: [{ employeeId: 'emp-1', leaveType: 'ลากิจ', name: 'สมชาย' }],
          offsites: [{ employeeId: 'emp-2', name: 'สมหญิง' }],
          weekday: 1,
        },
      ],
      month: '2026-08',
      teamTotal: 5,
    });

    expect(calendar.days[0]?.awayTotal).toBe(2);
    expect(calendar.teamTotal).toBe(5);
  });

  it('คำขอของทีมเติมชื่อผู้ยื่นโดยไม่แตะฟิลด์เดิมของใบ', () => {
    const row = toMobileTeamRequestItem(
      { id: 'leave-1', status: 'SUBMITTED', title: 'ลาป่วย' },
      { employeeCode: '000123', firstName: 'สมชาย', id: 'emp-1', lastName: 'ใจดี' },
    );

    expect(row).toEqual({
      employeeCode: '000123',
      employeeId: 'emp-1',
      employeeName: 'สมชาย ใจดี',
      id: 'leave-1',
      status: 'SUBMITTED',
      title: 'ลาป่วย',
    });
  });
});
