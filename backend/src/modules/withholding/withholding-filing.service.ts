import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import { WithholdingPayeeType } from '../../generated/prisma/client';
import type { TenantScope } from '../../common/interfaces/authenticated-user.interface';
import { effectiveCompanyId } from '../../common/tenant/tenant-scope.util';
import type { WithholdingFilingQueryDto } from './dto/withholding.dto';
import { buildPnd3Form } from './utils/pnd3-form.util';
import { buildPnd3TableCsv } from './utils/pnd3-csv.util';
import { generatePnd3FormPdf } from './utils/pnd3-pdf.util';
import { monthRange } from './withholding.service';

/**
 * แบบยื่น ภ.ง.ด.3 ของเดือนหนึ่ง
 * -----------------------------------------------------------------------------
 * ดึงเฉพาะรายการจ่ายให้ **บุคคลธรรมดา** เพราะนิติบุคคลต้องยื่นแบบ ภ.ง.ด.53
 * ซึ่งเป็นคนละแบบและคนละกำหนดเวลา ถ้าปนกันจะยื่นผิดแบบทั้งชุด
 *
 * เอกสารทุกรูปแบบสร้างจากข้อมูลก้อนเดียวกัน ตัวเลขจึงตรงกันเสมอ
 */
@Injectable()
export class WithholdingFilingService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(query: WithholdingFilingQueryDto, scope: TenantScope) {
    const form = await this.buildForm(query, scope);

    return {
      summary: {
        year: form.gregorianYear,
        buddhistYear: form.buddhistYear,
        month: form.month,
        payeeCount: form.totals.payeeCount,
        rowCount: form.totals.rowCount,
        amount: form.totals.amount,
        taxAmount: form.totals.taxAmount,
        sheetCount: form.attachments.length,
        missingCompanyFields: form.missingCompanyFields,
        incompleteRowCount: form.incompleteRowCount,
      },
      company: form.company,
      data: form.rows,
    };
  }

  async buildPdf(query: WithholdingFilingQueryDto, scope: TenantScope) {
    return generatePnd3FormPdf(await this.buildForm(query, scope));
  }

  async buildCsv(query: WithholdingFilingQueryDto, scope: TenantScope) {
    return buildPnd3TableCsv(await this.buildForm(query, scope));
  }

  private async buildForm(
    query: WithholdingFilingQueryDto,
    scope: TenantScope,
  ) {
    const companyId = effectiveCompanyId(scope, query.companyId);
    if (!companyId) throw new BadRequestException('กรุณาระบุบริษัท');

    const range = monthRange(query.year, query.month);
    if (!range) throw new BadRequestException('กรุณาระบุปีและเดือนที่จ่าย');

    const [company, payments] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId },
        select: {
          code: true,
          nameTh: true,
          nameEn: true,
          taxId: true,
          address: true,
        },
      }),
      this.prisma.withholdingPayment.findMany({
        where: {
          companyId,
          deletedAt: null,
          paidOn: range,
          /* ภ.ง.ด.3 เป็นของบุคคลธรรมดาเท่านั้น นิติบุคคลไปแบบ ภ.ง.ด.53 */
          payee: { type: WithholdingPayeeType.INDIVIDUAL },
        },
        include: { payee: true },
        orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    if (!company) throw new BadRequestException('ไม่พบบริษัทตามที่ระบุ');

    return buildPnd3Form(
      payments,
      company,
      { year: query.year, month: query.month },
      query.issueDate,
    );
  }
}
