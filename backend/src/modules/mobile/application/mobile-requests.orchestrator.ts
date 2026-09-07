import { BadRequestException, Injectable } from '@nestjs/common';

import { LeaveBalancesService } from '../../leaves/leave-balances.service';
import { LeaveRequestsService } from '../../leaves/leave-requests.service';
import { OffsiteWorkService } from '../../offsite-work/offsite-work.service';
import { OvertimeRequestsService } from '../../overtime/overtime-requests.service';
import { TimeAdjustRequestsService } from '../../time-adjust/time-adjust-requests.service';
import type {
  MobileCancelRequestDto,
  MobileRequestListQueryDto,
} from '../dto/mobile-request.dto';
import {
  MOBILE_REQUEST_TYPES,
  sortMobileRequests,
  toMobileRequest,
  toMobileRequestDetail,
  type MobileRequestListItem,
  type MobileRequestType,
} from '../mappers/mobile-request.mapper';

type CurrentUserLike = { id: string; scope?: unknown };

interface ListResult {
  items?: unknown[];
  meta?: { total?: number; totalPages?: number };
}

/**
 * BE-MOB-006 — ใบคำขอสี่ประเภทสำหรับแอป
 *
 * ประเภท endpoint: PASSTHROUGH + รวมรายการ
 * กติกาการลา/OT/แก้เวลา/นอกสถานที่ทั้งหมดยังเป็นของ service เดิม (ADR-001)
 * ที่นี่ทำสามอย่างเท่านั้น: เลือก service ให้ถูกประเภท, บังคับให้เป็นของตัวเอง,
 * และจัดรูปให้เป็นรายการเดียว
 */
@Injectable()
export class MobileRequestsOrchestrator {
  constructor(
    private readonly leaveBalancesService: LeaveBalancesService,
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly offsiteWorkService: OffsiteWorkService,
    private readonly overtimeRequestsService: OvertimeRequestsService,
    private readonly timeAdjustRequestsService: TimeAdjustRequestsService,
  ) {}

  /**
   * ตัวเลือกสำหรับฟอร์มยื่นลา — ประเภทการลาพร้อมวันคงเหลือ
   *
   * ต้องมาจาก leaveBalance ไม่ใช่รายการ leaveType ทั้งหมด เพราะพนักงาน
   * แต่ละคนมีสิทธิ์ไม่เท่ากัน การโชว์ประเภทที่ยื่นไม่ได้ทำให้กรอกเสร็จแล้วถูกปฏิเสธ
   */
  async getLeaveCatalog(currentUser: CurrentUserLike, year?: number) {
    const balances = await this.leaveBalancesService.findMy(
      { year },
      currentUser as never,
    );

    const items = ((balances.items ?? []) as Record<string, unknown>[]).map(
      (item) => {
        const leaveType = item.leaveType as Record<string, unknown> | null;

        return {
          allowsHourly: Boolean(leaveType?.allowHourlyLeave ?? true),
          entitlementDays: Number(item.entitlementDays ?? 0),
          isPaid: Boolean(leaveType?.isPaid ?? true),
          leaveTypeId: String(leaveType?.id ?? item.leaveTypeId ?? ''),
          name: String(leaveType?.nameTh ?? 'ไม่ระบุ'),
          pendingDays: Number(item.pendingDays ?? 0),
          remainingDays: Number(item.remainingDays ?? 0),
          requiresAttachment: Boolean(leaveType?.requireAttachment ?? false),
          usedDays: Number(item.usedDays ?? 0),
        };
      },
    );

    return {
      leaveTypes: items.filter((item) => item.leaveTypeId),
      summary: balances.summary ?? null,
    };
  }

  /**
   * ประเภทวันของใบ OT — ระบบจับจากปฏิทินวันหยุดเอง
   *
   * ฟอร์มในแอปไม่มีให้เลือกแล้ว เรียกตัวนี้มาแสดงว่าวันที่เลือกจะถูกคิดเป็นอะไร
   * ค่าที่บันทึกจริงตอนสร้างใบก็มาจากตัวเดียวกัน จึงไม่มีทางไม่ตรงกัน
   */
  async getOvertimeDayType(currentUser: CurrentUserLike, workDate: string) {
    return this.overtimeRequestsService.previewDayType(
      { workDate },
      currentUser as never,
      currentUser.scope as never,
    );
  }

  async list(currentUser: CurrentUserLike, query: MobileRequestListQueryDto) {
    const pageSize = query.pageSize ?? 20;
    const page = query.page ?? 1;
    const filters = {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search?.trim() || undefined,
      status: query.status,
    };

    if (query.type) {
      const result = await this.fetchByType(query.type, currentUser, {
        ...filters,
        page,
        pageSize,
      });

      return {
        items: this.mapItems(query.type, result),
        meta: {
          hasMore: page < (result.meta?.totalPages ?? 1),
          page,
          pageSize,
          total: result.meta?.total ?? 0,
          totalPages: result.meta?.totalPages ?? 0,
        },
      };
    }

    /**
     * หน้ารวมต้องรู้ top N ของแต่ละ source ตาม occurredOn ก่อน merge
     * โดย N = จำนวนรายการตั้งแต่หน้าแรกถึงหน้าที่ผู้ใช้ขอ เพียงเท่านี้ก็เพียงพอ
     * ต่อการหา top N ของ union และไม่ต้องโหลดประวัติทั้งหมดเหมือนเดิม
     */
    const windowSize = page * pageSize;
    const results = await Promise.all(
      MOBILE_REQUEST_TYPES.map(async (type) => ({
        result: await this.fetchTimelineWindowByType(
          type,
          currentUser,
          windowSize,
          filters,
        ),
        type,
      })),
    );

    const merged = sortMobileRequests(
      results.flatMap(({ result, type }) => this.mapItems(type, result)),
    );
    const total = results.reduce(
      (sum, { result }) => sum + Number(result.meta?.total ?? 0),
      0,
    );
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      items: merged.slice(start, end),
      meta: {
        hasMore: end < total,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async detail(
    type: MobileRequestType,
    id: string,
    currentUser: CurrentUserLike,
  ) {
    /* findMyOne ของทุก service ตรวจความเป็นเจ้าของให้แล้ว */
    const row = (await this.serviceFor(type).findMyOne(
      id,
      currentUser as never,
    )) as Record<string, unknown>;

    return { ...toMobileRequestDetail(type, row), raw: row };
  }

  async create(
    type: MobileRequestType,
    dto: Record<string, unknown>,
    currentUser: CurrentUserLike,
  ) {
    /*
     * ตัด employeeId ทิ้งเสมอ
     *
     * DTO ของ service เดิมเปิดให้ HR ยื่นแทนคนอื่นได้ ถ้าปล่อยผ่านมาจากแอป
     * พนักงานที่มีสิทธิ์ยื่นของตัวเองจะยื่นใบลาให้เพื่อนได้ทันที
     * นี่คือเหตุผลเดียวที่ orchestrator นี้ต้องแตะ payload
     */
    const payload = { ...dto, employeeId: undefined };

    if (type === 'TIME_ADJUST') {
      return this.timeAdjustRequestsService.createMy(
        payload as never,
        currentUser as never,
      );
    }

    const scope = currentUser.scope as never;

    if (type === 'LEAVE') {
      return this.leaveRequestsService.create(
        payload as never,
        currentUser as never,
        scope,
      );
    }

    if (type === 'OVERTIME') {
      return this.overtimeRequestsService.create(
        payload as never,
        currentUser as never,
        scope,
      );
    }

    return this.offsiteWorkService.create(
      payload as never,
      currentUser as never,
      scope,
    );
  }

  async update(
    type: MobileRequestType,
    id: string,
    dto: Record<string, unknown>,
    currentUser: CurrentUserLike,
  ) {
    const current = (await this.serviceFor(type).findMyOne(
      id,
      currentUser as never,
    )) as Record<string, unknown>;

    if (String(current.status ?? '') !== 'DRAFT') {
      throw new BadRequestException('แก้ไขได้เฉพาะคำขอสถานะฉบับร่างเท่านั้น');
    }

    /* identity ต้องมาจาก token เสมอ แม้ DTO บาง domain จะมี employeeId สำหรับ HR */
    const payload = { ...dto, employeeId: undefined };

    if (type === 'LEAVE') {
      return this.leaveRequestsService.updateMy(
        id,
        payload as never,
        currentUser as never,
      );
    }

    if (type === 'OVERTIME') {
      return this.overtimeRequestsService.updateMy(
        id,
        payload as never,
        currentUser as never,
      );
    }

    if (type === 'TIME_ADJUST') {
      return this.timeAdjustRequestsService.updateMy(
        id,
        payload as never,
        currentUser as never,
      );
    }

    return this.offsiteWorkService.updateMy(
      id,
      payload as never,
      currentUser as never,
    );
  }

  async submit(
    type: MobileRequestType,
    id: string,
    currentUser: CurrentUserLike,
  ) {
    if (type === 'LEAVE') {
      return this.leaveRequestsService.submitMy(id, currentUser as never);
    }

    if (type === 'OVERTIME') {
      return this.overtimeRequestsService.submitMy(id, currentUser as never);
    }

    if (type === 'TIME_ADJUST') {
      return this.timeAdjustRequestsService.submitMy(id, currentUser as never);
    }

    return this.offsiteWorkService.submitMy(id, currentUser as never);
  }

  async deleteDraft(
    type: MobileRequestType,
    id: string,
    currentUser: CurrentUserLike,
  ) {
    if (type !== 'OFFSITE') {
      throw new BadRequestException(
        'ลบฉบับร่างผ่านแอปได้เฉพาะคำขอทำงานนอกสถานที่',
      );
    }

    const current = (await this.offsiteWorkService.findMyOne(
      id,
      currentUser as never,
    )) as Record<string, unknown>;

    if (String(current.status ?? '') !== 'DRAFT') {
      throw new BadRequestException('ลบได้เฉพาะคำขอสถานะฉบับร่างเท่านั้น');
    }

    return this.offsiteWorkService.deleteMy(id, currentUser as never);
  }

  async cancel(
    type: MobileRequestType,
    id: string,
    dto: MobileCancelRequestDto,
    currentUser: CurrentUserLike,
  ) {
    return this.serviceFor(type).cancelMy(
      id,
      (dto ?? {}) as never,
      currentUser as never,
    );
  }

  /* --------------------------------------------------------------- ภายใน */

  private serviceFor(type: MobileRequestType) {
    return {
      LEAVE: this.leaveRequestsService,
      OFFSITE: this.offsiteWorkService,
      OVERTIME: this.overtimeRequestsService,
      TIME_ADJUST: this.timeAdjustRequestsService,
    }[type] as {
      cancelMy: (id: string, dto: never, user: never) => Promise<unknown>;
      findMy: (query: never, user: never) => Promise<ListResult>;
      findMyOne: (id: string, user: never) => Promise<unknown>;
    };
  }

  private fetchByType(
    type: MobileRequestType,
    currentUser: CurrentUserLike,
    query: {
      dateFrom?: string;
      dateTo?: string;
      page: number;
      pageSize: number;
      search?: string;
      status?: string;
    },
  ): Promise<ListResult> {
    return this.serviceFor(type).findMy(
      query as never,
      currentUser as never,
    );
  }

  private async fetchTimelineWindowByType(
    type: MobileRequestType,
    currentUser: CurrentUserLike,
    windowSize: number,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      status?: string;
    },
  ): Promise<ListResult> {
    if (type === 'LEAVE') {
      return this.leaveRequestsService.findMyForMobileTimeline(
        { ...filters, page: 1, pageSize: windowSize } as never,
        currentUser as never,
      );
    }

    if (type === 'OVERTIME') {
      return this.overtimeRequestsService.findMyForMobileTimeline(
        { ...filters, page: 1, pageSize: windowSize } as never,
        currentUser as never,
      );
    }

    if (type === 'TIME_ADJUST') {
      return this.timeAdjustRequestsService.findMyForMobileTimeline(
        { ...filters, page: 1, pageSize: windowSize } as never,
        currentUser as never,
      );
    }

    /*
     * Offsite findMy เรียง workDate ตรงกับ occurredOn อยู่แล้ว และ service เดิม
     * จำกัด pageSize <= 100 จึงอ่านเป็นช่วง ๆ จนได้ top N โดยไม่โหลดทั้งประวัติ
     */
    const chunkSize = 100;
    const chunks: unknown[] = [];
    let page = 1;
    let total = 0;
    let totalPages = 0;

    while (chunks.length < windowSize) {
      const result = await this.offsiteWorkService.findMy(
        { ...filters, page, pageSize: chunkSize } as never,
        currentUser as never,
      );
      const items = result.items ?? [];

      if (page === 1) {
        total = Number(result.meta?.total ?? 0);
        totalPages = Number(result.meta?.totalPages ?? 0);
      }

      chunks.push(...items);
      if (items.length === 0 || page >= totalPages || chunks.length >= windowSize) {
        break;
      }
      page += 1;
    }

    return {
      items: chunks.slice(0, windowSize),
      meta: { total, totalPages },
    };
  }

  private mapItems(
    type: MobileRequestType,
    result: ListResult,
  ): MobileRequestListItem[] {
    return ((result.items ?? []) as Record<string, unknown>[]).map((row) =>
      toMobileRequest(type, row),
    );
  }
}
