import { Injectable } from '@nestjs/common';

import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ManagerService } from '../../manager/manager.service';
import type {
  MobileTeamAttendanceQueryDto,
  MobileTeamMembersQueryDto,
  MobileTeamMonthQueryDto,
  MobileTeamRequestsQueryDto,
} from '../dto/mobile-team.dto';
import {
  toMobileRequest,
  type MobileRequestType,
} from '../mappers/mobile-request.mapper';
import {
  toMobileTeamAttendanceLog,
  toMobileTeamCalendar,
  toMobileTeamMemberDetail,
  toMobileTeamMemberListItem,
  toMobileTeamRequestItem,
  toMobileTeamSummary,
} from '../mappers/mobile-team.mapper';

/**
 * จอทีมของหัวหน้างานบนมือถือ
 *
 * ทุกเมธอดเป็น PASSTHROUGH ไปยัง ManagerService — ที่นี่ไม่มีการนับ ไม่มีการ
 * รวมยอด และไม่แตะ Prisma โดยตรง ตัวเลขที่หัวหน้าเห็นบนแอปกับบนเว็บจึงมา
 * จากโค้ดชุดเดียวกันเสมอ (ADR-001)
 *
 * ManagerService resolve ทีมจาก token เอง และไม่รับ managerId จาก client
 * ดังนั้นไม่มีทางที่หัวหน้าคนหนึ่งจะเปิดดูทีมของอีกคนได้ ต่อให้แก้ payload
 */
@Injectable()
export class MobileTeamOrchestrator {
  constructor(private readonly manager: ManagerService) {}

  async summary(user: AuthenticatedUser, query: MobileTeamMonthQueryDto) {
    const result = await this.manager.getTeamSummary(user, {
      ...(query.date ? { date: query.date } : {}),
      ...(query.month ? { month: query.month } : {}),
    });

    return toMobileTeamSummary(result as never);
  }

  async members(user: AuthenticatedUser, query: MobileTeamMembersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const result = await this.manager.getTeam(user, {
      page: String(page),
      pageSize: String(pageSize),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.status ? { status: query.status } : {}),
    });

    return {
      items: (result.items as Record<string, unknown>[]).map((item) =>
        toMobileTeamMemberListItem(item as never),
      ),
      meta: {
        ...result.meta,
        hasMore: result.meta.page < result.meta.totalPages,
      },
      summary: result.summary,
    };
  }

  async member(
    user: AuthenticatedUser,
    employeeId: string,
    query: MobileTeamMonthQueryDto,
  ) {
    const result = await this.manager.findMobileTeamMember(
      user,
      employeeId,
      query.month ? { month: query.month } : {},
    );

    return toMobileTeamMemberDetail(result as never);
  }

  async calendar(user: AuthenticatedUser, query: MobileTeamMonthQueryDto) {
    const result = await this.manager.getTeamCalendar(
      user,
      query.month ? { month: query.month } : {},
    );

    return toMobileTeamCalendar(result as never);
  }

  async attendance(
    user: AuthenticatedUser,
    query: MobileTeamAttendanceQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const result = await this.manager.findMobileTeamAttendance(user, {
      page: String(page),
      pageSize: String(pageSize),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
    });

    return {
      items: (result.items as Record<string, unknown>[]).map((item) =>
        toMobileTeamAttendanceLog(item as never),
      ),
      meta: {
        ...result.meta,
        hasMore: result.meta.page < result.meta.totalPages,
      },
    };
  }

  async requests(user: AuthenticatedUser, query: MobileTeamRequestsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const result = await this.manager.findMobileTeamRequests(user, {
      page: String(page),
      pageSize: String(pageSize),
      ...(query.type ? { type: query.type } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search?.trim() ? { search: query.search.trim() } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
    });

    return {
      items: result.items.map((row) => {
        const source = row.item as Record<string, unknown>;

        return toMobileTeamRequestItem(
          toMobileRequest(
            row.type as MobileRequestType,
            source,
          ) as unknown as Record<string, unknown>,
          source.employee as never,
        );
      }),
      meta: result.meta,
    };
  }
}
