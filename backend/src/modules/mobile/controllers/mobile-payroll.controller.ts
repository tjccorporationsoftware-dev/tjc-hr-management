import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { Auth } from '../../../common/decorators/auth.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../../common/guards/rate-limit.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EssSalarySlipService } from '../../ess/ess-salary-slip.service';
import { toPayslipPaperLayout } from '../../payroll/payroll-payslip-pdf.util';
import {
  toMobilePayslipDetail,
  toMobilePayslipListItem,
} from '../mappers/mobile-payslip.mapper';
import { MOBILE_API_PREFIX } from '../mobile.constants';

/**
 * สลิปเงินเดือนและ 50 ทวิ สำหรับแอป
 *
 * ประเภท endpoint: PASSTHROUGH ล้วน — EssSalarySlipService เป็นเจ้าของกติกา
 * ทั้งหมด รวมถึงข้อสำคัญที่สุดคือ **แสดงเฉพาะงวดที่ publish แล้ว**
 * พนักงานต้องไม่เห็นตัวเลขของงวดที่ HR ยังคำนวณไม่เสร็จ
 *
 * สิทธิ์ตรงกับฝั่งเว็บ: ESS_ACCESS + PAYROLL_SLIP_VIEW
 */
@Controller(`${MOBILE_API_PREFIX}/payroll`)
export class MobilePayrollController {
  constructor(private readonly salarySlipService: EssSalarySlipService) {}

  /**
   * รายการสลิปทุกงวดที่มี
   *
   * ต้องส่ง `allPeriods` เพราะค่าเริ่มต้นของ service คืนงวดเดียว (ตามจอเว็บที่
   * มี dropdown เลือกงวดแล้วยิงถามใหม่ทีละงวด) ส่วนมือถือโชว์ทุกงวดในจอเดียว
   * ถ้าไม่ส่ง ตัวเลือกงวดบนแอปจะมีแค่งวดล่าสุดงวดเดียวเสมอ
   *
   * ตั้งใจไม่รับพารามิเตอร์ปี เพราะ EssSalarySlipQueryDto ไม่มีตัวกรองปี
   * การเปิดรับ `year` แล้วเงียบ ๆ ไม่กรองให้ แย่กว่าการไม่มีตัวเลือกเลย
   * คืนสองปีล่าสุด (24 งวด) ซึ่งครอบคลุมที่พนักงานย้อนดูจริงบนมือถือ
   */
  @Get('slips')
  @Auth('ESS_ACCESS', 'PAYROLL_SLIP_VIEW')
  async listSlips(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.salarySlipService.findMySalarySlips(
      user,
      { page: 1, pageSize: 24 } as never,
      { allPeriods: true },
    );

    const items = ((result.data ?? []) as Record<string, unknown>[]).map(
      (item) => toMobilePayslipListItem(item as never),
    );

    return {
      items,
      summary: {
        latestNetPay: Number(
          (result.summary as { latestNetPay?: unknown } | undefined)
            ?.latestNetPay ?? 0,
        ),
        total: items.length,
      },
    };
  }

  @Get('tax-certificate/years')
  @Auth('ESS_ACCESS', 'PAYROLL_SLIP_VIEW')
  async taxCertificateYears(@CurrentUser() user: AuthenticatedUser) {
    return this.salarySlipService.getMyWithholdingCertificateYears(user);
  }

  @Get('tax-certificate/export')
  @Auth('ESS_ACCESS', 'PAYROLL_SLIP_VIEW')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    includePath: true,
    includeUserId: true,
    keyPrefix: 'mobile:tax-certificate:download',
    limit: 20,
    message: 'ดาวน์โหลดหนังสือรับรองภาษีบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
    windowSeconds: 60,
  })
  async downloadTaxCertificate(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('year') year?: string,
  ) {
    const file = await this.salarySlipService.buildMyWithholdingCertificateCsv(
      user,
      year ? Number(year) : undefined,
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return res.end(file.csv);
  }

  @Get('tax-certificate')
  @Auth('ESS_ACCESS', 'PAYROLL_SLIP_VIEW')
  async taxCertificate(
    @CurrentUser() user: AuthenticatedUser,
    @Query('year') year?: string,
  ) {
    return this.salarySlipService.getMyWithholdingCertificate(
      user,
      year ? Number(year) : undefined,
    );
  }

  /*
   * ต้องมาก่อน :itemId ไม่งั้น "tax-certificate" จะถูกอ่านเป็น itemId
   * และต้องวาง /pdf ก่อน :itemId ด้วยเหตุผลเดียวกัน
   */
  @Get('slips/:itemId/pdf')
  @Auth('ESS_ACCESS', 'PAYROLL_SLIP_VIEW')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    includePath: true,
    includeUserId: true,
    keyPrefix: 'mobile:salary-slip:download',
    limit: 30,
    message: 'ดาวน์โหลดสลิปบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่',
    windowSeconds: 60,
  })
  async downloadSlipPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
    @Res() res: Response,
    @Query('layout') layout?: string,
  ) {
    const pdf = await this.salarySlipService.generateMySalarySlipPdf(
      user,
      itemId,
      toPayslipPaperLayout(layout),
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.fileName}"`,
    );
    res.setHeader('Content-Length', String(pdf.buffer.length));

    return res.end(pdf.buffer);
  }

  @Get('slips/:itemId')
  @Auth('ESS_ACCESS', 'PAYROLL_SLIP_VIEW')
  async slipDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId') itemId: string,
  ) {
    const item = await this.salarySlipService.getMySalarySlip(user, itemId);

    return toMobilePayslipDetail(item as never);
  }
}
