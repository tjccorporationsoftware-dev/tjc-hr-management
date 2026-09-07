import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';
import { toThaiDateOnly } from '../../../common/utils/thai-date.util';
import type { CreateApprovalDelegationDto } from '../dto/approval-delegation.dto';
import { SUPPORTED_APPROVAL_TARGET_TYPES } from '../utils/supported-target-types.util';

/**
 * จัดการใบมอบอำนาจอนุมัติแทน
 *
 * เดิมเมื่อผู้อนุมัติลายาว ใบลา/OT ของทั้งทีมจะค้างจนกว่าเจ้าตัวจะกลับ
 * ทางออกเดียวคือให้ SYSTEM_ADMIN กดข้ามให้ ซึ่งไม่มีร่องรอยว่ากดแทนใคร
 */
@Injectable()
export class ApprovalDelegationService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    delegator: { select: { id: true, displayName: true, email: true } },
    delegate: { select: { id: true, displayName: true, email: true } },
    createdBy: { select: { id: true, displayName: true, email: true } },
  };

  async list(companyId: string, activeOnly: boolean) {
    const today = toThaiDateOnly(new Date());

    return this.prisma.approvalDelegation.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(activeOnly
          ? {
              status: 'ACTIVE',
              revokedAt: null,
              startDate: { lte: today },
              endDate: { gte: today },
            }
          : {}),
      },
      include: this.include,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(
    companyId: string,
    dto: CreateApprovalDelegationDto,
    actorId: string,
  ) {
    if (dto.delegatorUserId === dto.delegateUserId) {
      throw new BadRequestException('มอบอำนาจให้ตัวเองไม่ได้');
    }

    const startDate = toThaiDateOnly(new Date(dto.startDate));
    const endDate = toThaiDateOnly(new Date(dto.endDate));

    if (endDate < startDate) {
      throw new BadRequestException('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    }

    await this.assertUsersExist(companyId, [
      dto.delegatorUserId,
      dto.delegateUserId,
    ]);

    /*
     * กันมอบอำนาจต่อเป็นทอด ๆ — คนที่กำลังรับมอบอำนาจอยู่ มอบต่อให้คนอื่นไม่ได้
     * ไม่งั้นสายอนุมัติจะไล่ย้อนไม่ได้ว่าท้ายที่สุดใครเป็นคนตัดสินใจ
     */
    const delegateIsAlreadyDelegating =
      await this.prisma.approvalDelegation.findFirst({
        where: {
          companyId,
          delegateUserId: dto.delegatorUserId,
          deletedAt: null,
          revokedAt: null,
          status: 'ACTIVE',
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { id: true },
      });

    if (delegateIsAlreadyDelegating) {
      throw new BadRequestException(
        'ผู้มอบอำนาจคนนี้กำลังรับมอบอำนาจจากคนอื่นอยู่ในช่วงเวลาเดียวกัน จึงมอบต่อไม่ได้',
      );
    }

    const targetTypes = dto.targetTypes ?? [];

    return this.prisma.approvalDelegation.create({
      data: {
        companyId,
        delegatorUserId: dto.delegatorUserId,
        delegateUserId: dto.delegateUserId,
        startDate,
        endDate,
        targetTypes: targetTypes as never,
        reason: dto.reason?.trim() || null,
        createdById: actorId,
      },
      include: this.include,
    });
  }

  /**
   * ยกเลิกใบมอบอำนาจ
   *
   * ไม่ลบทิ้ง เพราะต้องตรวจย้อนหลังได้ว่ารายการที่ถูกอนุมัติไปแล้ว
   * กดโดยใครและอ้างอิงใบไหน
   */
  async revoke(id: string, companyId: string, actorId: string) {
    const revoked = await this.prisma.approvalDelegation.updateMany({
      where: { id, companyId, deletedAt: null, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedById: actorId,
        status: 'INACTIVE',
      },
    });

    if (revoked.count === 0) {
      throw new NotFoundException('ไม่พบใบมอบอำนาจ หรือถูกยกเลิกไปแล้ว');
    }

    return this.prisma.approvalDelegation.findFirst({
      where: { id },
      include: this.include,
    });
  }

  /** ประเภทรายการที่มอบอำนาจได้ ใช้ให้หน้าจอสร้างตัวเลือก */
  supportedTargetTypes() {
    return [...SUPPORTED_APPROVAL_TARGET_TYPES];
  }

  private async assertUsersExist(companyId: string, userIds: string[]) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { id: true, employee: { select: { companyId: true } } },
    });

    if (users.length !== new Set(userIds).size) {
      throw new NotFoundException('ไม่พบผู้ใช้งานที่ระบุ');
    }

    /*
     * ผู้ใช้ที่ผูกกับพนักงานคนละบริษัท ไม่ควรถูกมอบอำนาจข้ามบริษัท
     * ผู้ใช้ที่ยังไม่ผูกพนักงาน (เช่นแอดมินระบบ) ปล่อยผ่าน เพราะไม่มีบริษัทให้เทียบ
     */
    const outsider = users.find(
      (user) => user.employee && user.employee.companyId !== companyId,
    );

    if (outsider) {
      throw new BadRequestException(
        'มอบอำนาจข้ามบริษัทไม่ได้ ผู้มอบและผู้รับมอบต้องอยู่บริษัทเดียวกัน',
      );
    }
  }
}
