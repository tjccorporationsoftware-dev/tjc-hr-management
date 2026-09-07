import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { AuditAction } from '../../generated/prisma/client';
import { Audit } from '../../common/decorators/audit.decorator';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { requireCompanyId } from '../../common/tenant/tenant-scope.util';
import { SeveranceQuoteDto } from './dto/payroll-severance.dto';
import { ReplaceSeveranceTiersDto } from './dto/severance-tier.dto';
import { PayrollSeveranceService } from './services/payroll-severance.service';

function optionalNumber(value?: string) {
  if (value === undefined || value === null || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * คำนวณเงินและภาษีตอนออกจากงาน
 *
 *   POST /payroll/severance/quote
 *
 * เป็นการคำนวณอย่างเดียว ไม่เขียนอะไรลงฐานข้อมูล
 * เรียกซ้ำกี่ครั้งก็ได้ระหว่างที่ HR ปรับตัวเลขดูผลก่อนตัดสินใจ
 */
@Controller('payroll/severance')
export class PayrollSeveranceController {
  constructor(private readonly service: PayrollSeveranceService) {}

  @Post('quote')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'PayrollSeverance',
    description: 'คำนวณค่าชดเชยและภาษีเงินก้อนตอนออกจากงาน',
  })
  quote(@Body() dto: SeveranceQuoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.quote(dto.employeeId, {
      reasonType: dto.reasonType,
      lastWorkingDate: new Date(dto.lastWorkingDate),
      scope: user.scope,
      overrides: {
        monthlyWage: optionalNumber(dto.monthlyWage),
        noticePayDays: optionalNumber(dto.noticePayDays),
        unusedLeaveDays: optionalNumber(dto.unusedLeaveDays),
        specialSeveranceDays: optionalNumber(dto.specialSeveranceDays),
        otherSeparationPay: optionalNumber(dto.otherSeparationPay),
        terminatedWithCause: dto.terminatedWithCause,
        grossUpTax: dto.grossUpTax,
      },
    });
  }

  /**
   * บันไดค่าชดเชยของบริษัท
   *
   *   GET /payroll/severance/tiers
   *   PUT /payroll/severance/tiers
   *
   * ระบบใช้ขั้นต่ำตามมาตรา 118 ให้อัตโนมัติเมื่อยังไม่ได้ตั้งเอง
   * หน้านี้จึงมีไว้สำหรับบริษัทที่จ่ายมากกว่าที่กฎหมายกำหนด
   */
  @Get('tiers')
  @Auth('PAYROLL_READ')
  @Audit({
    action: AuditAction.VIEW,
    entity: 'SeverancePayTier',
    description: 'ดูบันไดค่าชดเชยของบริษัท',
  })
  listTiers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.listTiers(requireCompanyId(user.scope, companyId));
  }

  @Put('tiers')
  @Auth('PAYROLL_MANAGE')
  @Audit({
    action: AuditAction.UPDATE,
    entity: 'SeverancePayTier',
    description: 'บันทึกบันไดค่าชดเชยของบริษัท',
  })
  replaceTiers(
    @Body() dto: ReplaceSeveranceTiersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.replaceTiers(
      requireCompanyId(user.scope, dto.companyId),
      dto.tiers,
    );
  }
}
