import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { assertWithinScope } from '../../common/tenant/tenant-scope.util';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateAttendanceSessionRuleDto,
  ListAttendanceSessionRulesQueryDto,
  ReorderAttendanceSessionRulesDto,
  UpdateAttendanceSessionRuleDto,
} from './dto/attendance-session-rule.dto';
import { AttendanceRecalculationScopeService } from './attendance-recalculation-scope.service';

const DEFAULT_EARLY_CHECKOUT_PENALTY_PER_MINUTE = 5;

type SessionRuleWindow = {
  id?: string;
  sessionCode: string;
  punchType: string;
  openTime: string;
  expectedTime: string;
  closeTime: string;
  status?: string;
};

@Injectable()
export class AttendanceSessionRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceRecalculationScope: AttendanceRecalculationScopeService,
  ) {}

  async findByPolicy(
    policyId: string,
    query: ListAttendanceSessionRulesQueryDto = {},
  ) {
    await this.ensurePolicyExists(policyId);

    const prisma = this.prisma as any;
    const where: Record<string, unknown> = {
      policyId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.punchType ? { punchType: query.punchType } : {}),
    };

    return prisma.attendanceSessionRule.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { openTime: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(
    policyId: string,
    dto: CreateAttendanceSessionRuleDto,
    currentUserId: string,
    scope: TenantScope,
  ) {
    await this.assertPolicyWritableByScope(policyId, scope);

    const normalized = this.normalizeCreateDto(dto);
    await this.validateRuleWindow(normalized);
    await this.validateNoDuplicateSessionCode(policyId, normalized.sessionCode);
    await this.validateNoOverlappingRule(policyId, normalized);

    const prisma = this.prisma as any;

    const created = await prisma.attendanceSessionRule.create({
      data: {
        policyId,
        ...normalized,
      },
    });

    await this.attendanceRecalculationScope.enqueuePolicyById({
      policyId,
      requestedById: currentUserId,
      sourceId: created.id,
      sourceAction: 'CREATE_SESSION_RULE',
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateAttendanceSessionRuleDto,
    currentUserId: string,
    scope: TenantScope,
  ) {
    await this.assertRuleWritableByScope(id, scope);

    const prisma = this.prisma as any;
    const current = await prisma.attendanceSessionRule.findFirst({
      where: { id, deletedAt: null },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบรอบลงเวลานี้');
    }

    const normalizedPatch = this.normalizeUpdateDto(dto, current);
    const next: SessionRuleWindow = {
      id: current.id,
      sessionCode: normalizedPatch.sessionCode ?? current.sessionCode,
      punchType: normalizedPatch.punchType ?? current.punchType,
      openTime: normalizedPatch.openTime ?? current.openTime,
      expectedTime: normalizedPatch.expectedTime ?? current.expectedTime,
      closeTime: normalizedPatch.closeTime ?? current.closeTime,
      status: normalizedPatch.status ?? current.status,
    };

    await this.validateRuleWindow(next);

    if (next.status !== 'INACTIVE') {
      await this.validateNoDuplicateSessionCode(
        current.policyId,
        next.sessionCode,
        current.id,
      );
      await this.validateNoOverlappingRule(current.policyId, next, current.id);
    }

    const updated = await prisma.attendanceSessionRule.update({
      where: { id },
      data: normalizedPatch,
    });

    await this.attendanceRecalculationScope.enqueuePolicyById({
      policyId: current.policyId,
      requestedById: currentUserId,
      sourceId: id,
      sourceAction: 'UPDATE_SESSION_RULE',
    });

    return updated;
  }

  async remove(id: string, currentUserId: string, scope: TenantScope) {
    await this.assertRuleWritableByScope(id, scope);

    const prisma = this.prisma as any;
    const current = await prisma.attendanceSessionRule.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, policyId: true },
    });

    if (!current) {
      throw new NotFoundException('ไม่พบรอบลงเวลานี้');
    }

    await prisma.attendanceSessionRule.update({
      where: { id },
      data: {
        status: 'INACTIVE',
        deletedAt: new Date(),
      },
    });

    await this.attendanceRecalculationScope.enqueuePolicyById({
      policyId: current.policyId,
      requestedById: currentUserId,
      sourceId: id,
      sourceAction: 'REMOVE_SESSION_RULE',
    });

    return { id, deleted: true };
  }

  async reorder(
    policyId: string,
    dto: ReorderAttendanceSessionRulesDto,
    currentUserId: string,
    scope: TenantScope,
  ) {
    await this.assertPolicyWritableByScope(policyId, scope);

    const uniqueIds = new Set(dto.items.map((item) => item.id));
    if (uniqueIds.size !== dto.items.length) {
      throw new BadRequestException('รายการรอบลงเวลามี id ซ้ำ');
    }

    const prisma = this.prisma as any;
    const existing = await prisma.attendanceSessionRule.findMany({
      where: {
        policyId,
        id: { in: [...uniqueIds] },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existing.length !== uniqueIds.size) {
      throw new BadRequestException('มีรอบลงเวลาที่ไม่อยู่ในนโยบายนี้หรือถูกลบแล้ว');
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        prisma.attendanceSessionRule.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    await this.attendanceRecalculationScope.enqueuePolicyById({
      policyId,
      requestedById: currentUserId,
      sourceId: policyId,
      sourceAction: 'REORDER_SESSION_RULES',
    });

    return this.findByPolicy(policyId);
  }

  private async ensurePolicyExists(policyId: string) {
    const prisma = this.prisma as any;
    const policy = await prisma.attendancePolicy.findFirst({
      where: { id: policyId, deletedAt: null },
      select: { id: true },
    });

    if (!policy) {
      throw new NotFoundException('ไม่พบนโยบายเวลาทำงาน');
    }
  }

  /**
   * รอบลงเวลาเป็นของกะ สิทธิ์จึงต้องยึดตามกะที่มันสังกัด
   * ถ้าไม่ตรวจตรงนี้ ใครที่มีสิทธิ์ ATTENDANCE_POLICY_MANAGE จะแก้รอบของกะ
   * บริษัทไหน สาขาไหนก็ได้ ทั้งที่ endpoint ของตัวกะเองกันไว้แล้ว
   */
  private async assertPolicyWritableByScope(
    policyId: string,
    scope: TenantScope,
  ) {
    const prisma = this.prisma as any;
    const policy = await prisma.attendancePolicy.findFirst({
      where: { id: policyId, deletedAt: null },
      select: { companyId: true, branchId: true },
    });

    if (!policy) {
      throw new NotFoundException('ไม่พบนโยบายเวลาทำงาน');
    }

    assertWithinScope(scope, {
      companyId: policy.companyId,
      branchId: policy.branchId,
    });

    // บัญชีระดับสาขาแก้กะระดับบริษัทไม่ได้ (assertWithinScope ปล่อยผ่านเมื่อ branchId เป็น null)
    if (scope.level === 'BRANCH') {
      if (!policy.branchId) {
        throw new ForbiddenException(
          'บัญชีระดับสาขาไม่มีสิทธิ์แก้รอบลงเวลาของกะระดับบริษัท',
        );
      }
      if (policy.branchId !== scope.branchId) {
        throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขานี้');
      }
    }
  }

  /** หา policyId ของรอบลงเวลา แล้วตรวจสิทธิ์จากกะนั้น */
  private async assertRuleWritableByScope(ruleId: string, scope: TenantScope) {
    const prisma = this.prisma as any;
    const rule = await prisma.attendanceSessionRule.findFirst({
      where: { id: ruleId, deletedAt: null },
      select: { policyId: true },
    });

    if (!rule) {
      throw new NotFoundException('ไม่พบรอบลงเวลานี้');
    }

    await this.assertPolicyWritableByScope(rule.policyId, scope);
  }

  private normalizeCreateDto(dto: CreateAttendanceSessionRuleDto) {
    const isCheckout = dto.punchType === 'CHECK_OUT' || dto.sessionCode === 'CHECK_OUT';
    const expectedCheckoutTime = dto.expectedTime || '17:00';

    return {
      sessionCode: dto.sessionCode,
      label: dto.label.trim(),
      punchType: dto.punchType,
      openTime: isCheckout ? (dto.openTime || '00:00') : dto.openTime,
      expectedTime: dto.expectedTime,
      closeTime: dto.closeTime,
      lateAfterTime: isCheckout ? null : this.nullableTime(dto.lateAfterTime),
      lateUntilTime: isCheckout ? null : this.nullableTime(dto.lateUntilTime),
      earlyBeforeTime: isCheckout
        ? this.nullableTime(dto.earlyBeforeTime) ?? expectedCheckoutTime
        : this.nullableTime(dto.earlyBeforeTime),
      lateOutAfterTime: isCheckout
        ? this.nullableTime(dto.lateOutAfterTime) ?? expectedCheckoutTime
        : this.nullableTime(dto.lateOutAfterTime),
      requirePunch: dto.requirePunch ?? true,
      allowEarlyPunch: isCheckout ? true : dto.allowEarlyPunch ?? false,
      earlyPunchGraceMinutes: dto.earlyPunchGraceMinutes ?? 0,
      lateGraceMinutes: dto.lateGraceMinutes ?? 0,
      latePenaltyPerMinute: dto.latePenaltyPerMinute ?? 0,
      missingPenaltyAmount: dto.missingPenaltyAmount ?? 0,
      earlyLeavePenaltyPerMinute: isCheckout
        ? dto.earlyLeavePenaltyPerMinute ?? DEFAULT_EARLY_CHECKOUT_PENALTY_PER_MINUTE
        : dto.earlyLeavePenaltyPerMinute ?? 0,
      collectLateOutMinutes: isCheckout ? dto.collectLateOutMinutes ?? true : dto.collectLateOutMinutes ?? false,
      autoCreateOt: dto.autoCreateOt ?? false,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? 'ACTIVE',
    };
  }

  private normalizeUpdateDto(dto: UpdateAttendanceSessionRuleDto, current?: SessionRuleWindow) {
    const data: Record<string, unknown> = {};

    if (dto.sessionCode !== undefined) data.sessionCode = dto.sessionCode;
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.punchType !== undefined) data.punchType = dto.punchType;
    if (dto.openTime !== undefined) data.openTime = dto.openTime;
    if (dto.expectedTime !== undefined) data.expectedTime = dto.expectedTime;
    if (dto.closeTime !== undefined) data.closeTime = dto.closeTime;
    if (dto.lateAfterTime !== undefined) data.lateAfterTime = this.nullableTime(dto.lateAfterTime);
    if (dto.lateUntilTime !== undefined) data.lateUntilTime = this.nullableTime(dto.lateUntilTime);
    if (dto.earlyBeforeTime !== undefined) data.earlyBeforeTime = this.nullableTime(dto.earlyBeforeTime);
    if (dto.lateOutAfterTime !== undefined) data.lateOutAfterTime = this.nullableTime(dto.lateOutAfterTime);
    if (dto.requirePunch !== undefined) data.requirePunch = dto.requirePunch;
    if (dto.allowEarlyPunch !== undefined) data.allowEarlyPunch = dto.allowEarlyPunch;
    if (dto.earlyPunchGraceMinutes !== undefined) data.earlyPunchGraceMinutes = dto.earlyPunchGraceMinutes;
    if (dto.lateGraceMinutes !== undefined) data.lateGraceMinutes = dto.lateGraceMinutes;
    if (dto.latePenaltyPerMinute !== undefined) data.latePenaltyPerMinute = dto.latePenaltyPerMinute;
    if (dto.missingPenaltyAmount !== undefined) data.missingPenaltyAmount = dto.missingPenaltyAmount;
    if (dto.earlyLeavePenaltyPerMinute !== undefined) data.earlyLeavePenaltyPerMinute = dto.earlyLeavePenaltyPerMinute;
    if (dto.collectLateOutMinutes !== undefined) data.collectLateOutMinutes = dto.collectLateOutMinutes;
    if (dto.autoCreateOt !== undefined) data.autoCreateOt = dto.autoCreateOt;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) data.status = dto.status;

    const nextSessionCode = String(data.sessionCode ?? dto.sessionCode ?? current?.sessionCode ?? '');
    const nextPunchType = String(data.punchType ?? dto.punchType ?? current?.punchType ?? '');
    const isCheckout = nextSessionCode === 'CHECK_OUT' || nextPunchType === 'CHECK_OUT';

    if (isCheckout) {
      const expectedTime = String(data.expectedTime ?? dto.expectedTime ?? current?.expectedTime ?? '17:00');
      if (data.lateAfterTime === undefined) data.lateAfterTime = null;
      if (data.lateUntilTime === undefined) data.lateUntilTime = null;
      if (data.earlyBeforeTime === undefined) data.earlyBeforeTime = expectedTime;
      if (data.lateOutAfterTime === undefined) data.lateOutAfterTime = expectedTime;
      if (data.earlyLeavePenaltyPerMinute === undefined) {
        data.earlyLeavePenaltyPerMinute = DEFAULT_EARLY_CHECKOUT_PENALTY_PER_MINUTE;
      }
      if (data.allowEarlyPunch === undefined) data.allowEarlyPunch = true;
      if (data.collectLateOutMinutes === undefined) data.collectLateOutMinutes = true;
    }

    return data;
  }

  private nullableTime(value?: string | null) {
    return value?.trim() || null;
  }

  private async validateNoDuplicateSessionCode(
    policyId: string,
    sessionCode: string,
    excludeId?: string,
  ) {
    if (sessionCode === 'CUSTOM') {
      return;
    }

    const prisma = this.prisma as any;
    const duplicated = await prisma.attendanceSessionRule.findFirst({
      where: {
        policyId,
        sessionCode,
        status: 'ACTIVE',
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException('นโยบายนี้มีรอบลงเวลารหัสนี้อยู่แล้ว');
    }
  }

  private async validateNoOverlappingRule(
    policyId: string,
    candidate: SessionRuleWindow,
    excludeId?: string,
  ) {
    if (candidate.status === 'INACTIVE') {
      return;
    }

    const prisma = this.prisma as any;
    const rules: SessionRuleWindow[] = await prisma.attendanceSessionRule.findMany({
      where: {
        policyId,
        punchType: candidate.punchType,
        status: 'ACTIVE',
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        sessionCode: true,
        punchType: true,
        openTime: true,
        expectedTime: true,
        closeTime: true,
      },
    });

    const candidateStart = this.toMinutes(candidate.openTime);
    const candidateEnd = this.toMinutes(candidate.closeTime);

    for (const rule of rules) {
      const currentStart = this.toMinutes(rule.openTime);
      const currentEnd = this.toMinutes(rule.closeTime);
      const overlaps = candidateStart <= currentEnd && currentStart <= candidateEnd;

      if (overlaps) {
        throw new BadRequestException(
          `ช่วงเวลารอบลงเวลาซ้อนกับ ${rule.sessionCode} (${rule.openTime}-${rule.closeTime})`,
        );
      }
    }
  }

  private async validateRuleWindow(rule: SessionRuleWindow) {
    const open = this.toMinutes(rule.openTime);
    const expected = this.toMinutes(rule.expectedTime);
    const close = this.toMinutes(rule.closeTime);

    if (open > expected || expected > close) {
      throw new BadRequestException(
        'เวลาเปิดรอบ ต้องไม่เกินเวลามาตรฐาน และเวลามาตรฐานต้องไม่เกินเวลาปิดรอบ',
      );
    }
  }

  private toMinutes(time: string) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  }
}
