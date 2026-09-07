import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { toMoney } from '../utils/payroll-money.util';
import {
  buildCsv,
  csvDigits,
  csvMoney,
  safeFileName,
  toDateOnlyText,
} from '../utils/payroll-csv.util';
import {
  BANK_FORMAT_LABEL,
  buildBankTransferFile,
  type BankTransferFormat,
} from '../utils/payroll-bank-format.util';
import { buildSsoFilingFile } from '../utils/payroll-sso-filing.util';
import { generateBankTransferPdf } from '../payroll-bank-transfer-pdf.util';
import {
  generateSsoFormPdf,
  type SsoFormInput,
} from '../payroll-sso-form-pdf.util';
import { generateSsoFormXlsx } from '../payroll-sso-form-xlsx.util';
import { DEFAULT_EMPLOYEE_RATE } from './payroll-social-security.service';
import type { TenantScope } from '../../../common/interfaces/authenticated-user.interface';
import { assertWithinScope } from '../../../common/tenant/tenant-scope.util';

/**
 * PayrollFilingReportService
 * -----------------------------------------------------------------------------
 * รายงานสำหรับ "นำส่ง" ออกนอกระบบ — ตัวเลขทั้งหมดมาจาก PayrollRun ที่คำนวณแล้ว
 * ไม่มีการคำนวณซ้ำในไฟล์นี้ เพื่อให้ยอดที่ยื่นตรงกับสลิปที่พนักงานได้รับเสมอ
 *
 *   สปส.1-10   เงินสมทบประกันสังคมรายเดือน
 *   ไฟล์โอน     รายการโอนเงินเดือนเข้าบัญชีธนาคาร
 *   กยศ.        รายการหักและนำส่งกองทุนเงินให้กู้ยืมเพื่อการศึกษา
 */
@Injectable()
export class PayrollFilingReportService {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------------ */
  /* สปส.1-10                                                            */
  /* ------------------------------------------------------------------ */

  async getSocialSecurityReport(runId: string, scope: TenantScope) {
    const run = await this.requireRun(runId, scope);

    const items = await this.prisma.payrollItem.findMany({
      where: { runId, status: { not: 'CANCELLED' } },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            title: true,
            firstName: true,
            lastName: true,
            displayName: true,
            profile: {
              select: { nationalId: true, socialSecurityNo: true },
            },
          },
        },
        // ใช้ตัดสินว่าคนนี้เป็นผู้ประกันตนหรือไม่ ไม่ใช่ตัดสินจาก "เงินสมทบ > 0"
        compensation: { select: { socialSecurityEnabled: true } },
        /*
         * ดึงทุกบรรทัด ไม่ใช่เฉพาะ sourceType SOCIAL_SECURITY เพราะช่อง 4 ของ
         * ฟอร์มคือ "ค่าจ้างที่จ่ายจริง" ซึ่งต้องรวมจากบรรทัดที่เป็นฐานประกันสังคม
         */
        lines: {
          select: {
            code: true,
            type: true,
            amount: true,
            quantity: true,
            sourceType: true,
            isSocialSecurityBase: true,
          },
        },
      },
      orderBy: { employee: { employeeCode: 'asc' } },
    });

    const rows = items
      /*
       * คำชี้แจงข้อ 6 ท้ายแบบ สปส.1-10: ผู้ประกันตนที่ไม่มีค่าจ้างต้องกรอกใน
       * ช่อง 1-5 ด้วย โดยช่อง 4 และ 5 เป็น 0 — คนลาออกกลางเดือนหรือลาไม่รับ
       * ค่าจ้างทั้งเดือนจึงต้องคงอยู่ในฟอร์ม ตัดออกได้เฉพาะคนที่ไม่ใช่ผู้ประกันตน
       */
      .filter((item) => item.compensation?.socialSecurityEnabled !== false)
      .map((item, index) => {
        const employeeLine = item.lines.find(
          (line) => line.code === 'SOCIAL_SECURITY',
        );
        const employerLine = item.lines.find(
          (line) => line.code === 'SOCIAL_SECURITY_EMPLOYER',
        );

        const employeeAmount = toMoney(employeeLine?.amount ?? 0);
        const employerAmount = toMoney(employerLine?.amount ?? 0);

        // quantity ของบรรทัดประกันสังคมเก็บ "ฐานคำนวณหลังชนเพดาน" ไว้
        const contributionBase = toMoney(
          employeeLine?.quantity ?? employerLine?.quantity ?? 0,
        );

        /*
         * ช่อง 4 ของฟอร์มคือค่าจ้างที่จ่ายจริง ไม่ใช่ฐานหลังชนเพดาน
         * (เพดานมีผลเฉพาะช่อง 5 ตามคำชี้แจงข้อ 1)
         */
        const actualWage = this.sumSocialSecurityBaseWage(item.lines);

        /*
         * คำชี้แจงข้อ 4: เงินสมทบที่นำส่งต้องปัดเป็นบาทเต็มรายคน
         * (ตั้งแต่ 50 สตางค์ปัดขึ้น ต่ำกว่านั้นปัดทิ้ง) และเงินสมทบนายจ้าง
         * ต้องเท่ากับของผู้ประกันตน "หลังปัดเศษแล้ว"
         *
         * ระบบยังหักจากเงินเดือนตามยอดที่มีสตางค์ตามเดิม การปัดจึงทำเฉพาะตอน
         * ออกฟอร์ม/ไฟล์นำส่ง ส่วนต่างที่เกิดขึ้นรายงานไว้ที่ summary
         */
        const employeeFiled = this.roundContributionToBaht(employeeAmount);
        const employerFiled = employeeFiled;

        return {
          sequence: index + 1,
          employeeId: item.employeeId,
          employeeCode: item.employee.employeeCode,
          employeeName: this.employeeName(item.employee),
          /*
           * ไฟล์นำส่ง e-Service แยกช่องคำนำหน้า/ชื่อ/สกุล ไม่ใช่ชื่อเต็มช่องเดียว
           * จึงต้องส่งออกมาทั้งสามช่อง ไม่ใช่ให้ปลายทางไปตัดคำเอง
           */
          title: item.employee.title ?? null,
          firstName: item.employee.firstName ?? null,
          lastName: item.employee.lastName ?? null,
          nationalId: item.employee.profile?.nationalId ?? null,
          socialSecurityNo: item.employee.profile?.socialSecurityNo ?? null,
          /** ช่อง 4 — ค่าจ้างที่จ่ายจริง */
          actualWage,
          /** ฐานหลังชนเพดาน ใช้อธิบายที่มาของช่อง 5 */
          contributionBase,
          /** ยอดที่หักจริงจากเงินเดือน (มีสตางค์) */
          employeeContribution: employeeAmount,
          employerContribution: employerAmount,
          totalContribution: toMoney(employeeAmount + employerAmount),
          /** ช่อง 5 — ยอดที่นำส่งจริง ปัดเป็นบาทเต็มแล้ว */
          employeeContributionFiled: employeeFiled,
          employerContributionFiled: employerFiled,
          totalContributionFiled: employeeFiled + employerFiled,
          /** ข้อมูลที่ยังขาดและต้องเติมก่อนยื่นจริง */
          missingFields: [
            item.employee.profile?.nationalId ? null : 'เลขบัตรประชาชน',
            item.employee.profile?.socialSecurityNo
              ? null
              : 'เลขที่ผู้ประกันตน',
          ].filter((value): value is string => Boolean(value)),
        };
      });

    const sum = (pick: (row: (typeof rows)[number]) => number) =>
      toMoney(rows.reduce((total, row) => total + pick(row), 0));

    const totalEmployeeContribution = sum((row) => row.employeeContribution);
    const totalEmployerContribution = sum((row) => row.employerContribution);
    const totalEmployeeFiled = rows.reduce(
      (total, row) => total + row.employeeContributionFiled,
      0,
    );
    const totalEmployerFiled = rows.reduce(
      (total, row) => total + row.employerContributionFiled,
      0,
    );

    const summary = {
      employeeCount: rows.length,
      /** ช่อง 1 ของส่วนที่ 1 — เงินค่าจ้างทั้งสิ้น */
      totalActualWage: sum((row) => row.actualWage),
      totalContributionBase: sum((row) => row.contributionBase),
      totalEmployeeContribution,
      totalEmployerContribution,
      totalContribution: toMoney(
        totalEmployeeContribution + totalEmployerContribution,
      ),
      /** ยอดที่ยื่นจริงหลังปัดเศษ — ช่อง 2, 3, 4 ของส่วนที่ 1 */
      totalEmployeeContributionFiled: totalEmployeeFiled,
      totalEmployerContributionFiled: totalEmployerFiled,
      totalContributionFiled: totalEmployeeFiled + totalEmployerFiled,
      /*
       * ส่วนต่างระหว่างยอดที่หักจากเงินเดือนกับยอดที่นำส่ง — เกิดจากการปัดเศษ
       * ตามคำชี้แจงข้อ 4 บวก = บริษัทต้องออกเพิ่ม ลบ = นำส่งน้อยกว่าที่หักไว้
       */
      roundingDifference: toMoney(
        totalEmployeeFiled +
          totalEmployerFiled -
          (totalEmployeeContribution + totalEmployerContribution),
      ),
      roundedRowCount: rows.filter(
        (row) => row.employeeContributionFiled !== row.employeeContribution,
      ).length,
      incompleteCount: rows.filter((row) => row.missingFields.length > 0)
        .length,
      zeroWageCount: rows.filter((row) => row.actualWage <= 0).length,
    };

    return {
      formType: 'SSO_1_10',
      run: this.runInfo(run),
      company: {
        id: run.company?.id ?? run.companyId,
        nameTh: run.company?.nameTh ?? null,
        nameEn: run.company?.nameEn ?? null,
        taxId: run.company?.taxId ?? null,
        logoUrl: run.company?.logoUrl ?? null,
        address: run.company?.address ?? null,
        phone: run.company?.phone ?? null,
        email: run.company?.email ?? null,
        socialSecurityAccountNo: run.company?.socialSecurityAccountNo ?? null,
        socialSecurityBranchNo: run.company?.socialSecurityBranchNo ?? null,
      },
      rows,
      summary: {
        ...summary,
        /** ข้อมูลนายจ้างที่ยังขาด ต้องเติมก่อนสร้างไฟล์ e-Service */
        missingCompanyFields: [
          run.company?.socialSecurityAccountNo
            ? null
            : 'เลขที่บัญชีนายจ้าง (สปส.)',
        ].filter((value): value is string => Boolean(value)),
      },
    };
  }

  /**
   * ค่าจ้างที่จ่ายจริงของงวด = บรรทัดรายได้ที่เป็นฐานประกันสังคม หักด้วย
   * บรรทัดรายการหักที่ลดฐาน (เช่น ขาดงาน) — สูตรเดียวกับตอนคำนวณเงินสมทบ
   * ต่างกันตรงที่ไม่เอาไปชนเพดาน เพราะช่อง 4 ของฟอร์มขอค่าจ้างจริง
   */
  private sumSocialSecurityBaseWage(
    lines: {
      type: string;
      amount: unknown;
      isSocialSecurityBase: boolean;
    }[],
  ) {
    const earnings = lines
      .filter((line) => line.isSocialSecurityBase && line.type === 'EARNING')
      .reduce((total, line) => total + toMoney(line.amount), 0);

    const deductions = lines
      .filter((line) => line.isSocialSecurityBase && line.type === 'DEDUCTION')
      .reduce((total, line) => total + toMoney(line.amount), 0);

    return toMoney(Math.max(earnings - deductions, 0));
  }

  /**
   * ปัดเงินสมทบเป็นบาทเต็มตามคำชี้แจงข้อ 4 ท้ายแบบ สปส.1-10
   * ตั้งแต่ 50 สตางค์ขึ้นไปปัดเป็น 1 บาท ต่ำกว่านั้นปัดทิ้ง
   *
   * คิดบนหน่วยสตางค์เป็นจำนวนเต็ม ไม่ใช่เทียบทศนิยมตรง ๆ เพราะ 663.75 * 100
   * ใน floating point ได้ 66374.999... ซึ่งจะปัดพลาดไปหนึ่งบาท
   */
  private roundContributionToBaht(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;

    const satang = Math.round(amount * 100);
    const baht = Math.floor(satang / 100);

    return satang % 100 >= 50 ? baht + 1 : baht;
  }

  async buildSocialSecurityCsv(runId: string, scope: TenantScope) {
    const report = await this.getSocialSecurityReport(runId, scope);

    const headers = [
      'ลำดับ',
      'เลขที่ผู้ประกันตน',
      'เลขบัตรประชาชน',
      'รหัสพนักงาน',
      'ชื่อ-สกุล',
      'ค่าจ้างที่ใช้คำนวณ',
      'เงินสมทบลูกจ้าง',
      'เงินสมทบนายจ้าง',
      'รวมเงินสมทบ',
      'ข้อมูลที่ยังขาด',
    ];

    const csv = buildCsv(
      headers,
      report.rows.map((row) => ({
        ลำดับ: row.sequence,
        เลขที่ผู้ประกันตน: csvDigits(row.socialSecurityNo),
        เลขบัตรประชาชน: csvDigits(row.nationalId),
        รหัสพนักงาน: row.employeeCode,
        'ชื่อ-สกุล': row.employeeName,
        ค่าจ้างที่ใช้คำนวณ: csvMoney(row.contributionBase),
        เงินสมทบลูกจ้าง: csvMoney(row.employeeContribution),
        เงินสมทบนายจ้าง: csvMoney(row.employerContribution),
        รวมเงินสมทบ: csvMoney(row.totalContribution),
        ข้อมูลที่ยังขาด: row.missingFields.join(' / '),
      })),
    );

    return {
      csv,
      fileName: `sso-1-10-${safeFileName(report.run.runNo, 'run')}.csv`,
      summary: report.summary,
    };
  }

  /**
   * ไฟล์นำส่งเงินสมทบสำหรับอัปโหลดเข้าระบบ e-Service ของประกันสังคม
   * เป็นไฟล์ข้อความความกว้างคงที่ ไม่ใช่ CSV
   */
  async buildSocialSecurityFilingFile(runId: string, scope: TenantScope) {
    const report = await this.getSocialSecurityReport(runId, scope);
    const employeeRatePercent = await this.resolveEmployeeRatePercent(
      report.company.id,
    );

    const file = buildSsoFilingFile(
      report.rows.map((row) => ({
        sequence: row.sequence,
        employeeName: row.employeeName,
        title: row.title,
        firstName: row.firstName,
        lastName: row.lastName,
        nationalId: row.nationalId,
        socialSecurityNo: row.socialSecurityNo,
        actualWage: row.actualWage,
        contributionBase: row.contributionBase,
        employeeContributionFiled: row.employeeContributionFiled,
        employerContributionFiled: row.employerContributionFiled,
      })),
      {
        companyName: report.company.nameTh ?? '',
        accountNo: report.company.socialSecurityAccountNo,
        branchNo: report.company.socialSecurityBranchNo,
        // เดือนค่าจ้าง ไม่ใช่วันจ่าย — งวดที่คร่อมเดือนถือตามเดือนที่งวดสิ้นสุด
        wageMonthDate: report.run.periodEndDate ?? report.run.paymentDate,
        paymentDate: report.run.paymentDate,
        employeeRatePercent,
        runNo: safeFileName(report.run.runNo, 'run'),
      },
    );

    return { ...file, summary: report.summary };
  }

  /**
   * อัตราเงินสมทบฝั่งผู้ประกันตนของบริษัท — ดึงจากตั้งค่าเงินเดือน ไม่ใช่คิดย้อน
   * จากยอดที่หัก เพราะงวดที่ทุกคนชนเพดานจะคิดย้อนกลับไม่ได้
   */
  private async resolveEmployeeRatePercent(companyId: string) {
    const settings = await this.prisma.companyPayrollSetting.findFirst({
      where: { companyId },
      select: { socialSecurityEmployeeRate: true },
    });

    const rate = Number(settings?.socialSecurityEmployeeRate);

    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EMPLOYEE_RATE;
  }

  /**
   * ข้อมูลชุดเดียวที่ทั้ง PDF และ XLSX ของแบบ สปส.1-10 ใช้ร่วมกัน
   * อัตราเงินสมทบดึงจากตั้งค่าเงินเดือนของบริษัท ไม่ใช่คิดย้อนจากยอดที่หัก
   * เพราะงวดที่ทุกคนชนเพดานจะคิดย้อนไม่ได้
   */
  private async buildSsoFormInput(
    runId: string,
    scope: TenantScope,
  ): Promise<SsoFormInput> {
    const report = await this.getSocialSecurityReport(runId, scope);

    return {
      company: report.company,
      run: report.run,
      employeeRatePercent: await this.resolveEmployeeRatePercent(
        report.company.id,
      ),
      rows: report.rows,
      summary: report.summary,
    };
  }

  /** แบบ สปส.1-10 ส่วนที่ 1 + ส่วนที่ 2 สำหรับพิมพ์ยื่น */
  async buildSocialSecurityFormPdf(runId: string, scope: TenantScope) {
    return generateSsoFormPdf(await this.buildSsoFormInput(runId, scope));
  }

  /** แบบ สปส.1-10 ในรูป Excel สำหรับทำงานต่อและกระทบยอด */
  async buildSocialSecurityFormXlsx(runId: string, scope: TenantScope) {
    return generateSsoFormXlsx(await this.buildSsoFormInput(runId, scope));
  }

  /* ------------------------------------------------------------------ */
  /* ไฟล์โอนเงินเข้าธนาคาร                                                */
  /* ------------------------------------------------------------------ */

  async getBankTransferReport(runId: string, scope: TenantScope) {
    const run = await this.requireRun(runId, scope);

    const items = await this.prisma.payrollItem.findMany({
      where: { runId, status: { not: 'CANCELLED' } },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            displayName: true,
            profile: {
              select: {
                bankName: true,
                bankAccountNo: true,
                bankAccountName: true,
              },
            },
          },
        },
        compensation: {
          select: {
            bankName: true,
            bankAccountNo: true,
            bankAccountName: true,
            paymentMethod: true,
          },
        },
      },
      orderBy: { employee: { employeeCode: 'asc' } },
    });

    const rows = items
      .map((item, index) => {
        /*
         * ข้อมูลบัญชีอยู่ได้ 2 ที่ — ใน compensation (ผูกกับงวดจ่าย)
         * และในโปรไฟล์พนักงาน ให้ compensation ชนะเพราะเจาะจงกว่า
         */
        const bankName =
          item.compensation?.bankName ||
          item.employee.profile?.bankName ||
          null;
        const bankAccountNo =
          item.compensation?.bankAccountNo ||
          item.employee.profile?.bankAccountNo ||
          null;
        const bankAccountName =
          item.compensation?.bankAccountName ||
          item.employee.profile?.bankAccountName ||
          null;

        const netPay = toMoney(item.totalNetPay);

        return {
          sequence: index + 1,
          employeeId: item.employeeId,
          employeeCode: item.employee.employeeCode,
          employeeName: this.employeeName(item.employee),
          paymentMethod: item.compensation?.paymentMethod ?? null,
          bankName,
          bankAccountNo,
          bankAccountName: bankAccountName || this.employeeName(item.employee),
          netPay,
          missingFields: [
            bankName ? null : 'ธนาคาร',
            bankAccountNo ? null : 'เลขที่บัญชี',
          ].filter((value): value is string => Boolean(value)),
        };
      })
      .filter((row) => row.netPay > 0);

    return {
      run: this.runInfo(run),
      company: {
        id: run.company?.id ?? run.companyId,
        nameTh: run.company?.nameTh ?? null,
        bankCompanyCode: run.company?.bankCompanyCode ?? null,
        bankDebitAccountNo: run.company?.bankDebitAccountNo ?? null,
      },
      rows,
      summary: {
        employeeCount: rows.length,
        totalNetPay: toMoney(rows.reduce((sum, row) => sum + row.netPay, 0)),
        incompleteCount: rows.filter((row) => row.missingFields.length > 0)
          .length,
        /** ข้อมูลบริษัทที่ไฟล์รูปแบบธนาคารต้องใช้ */
        missingCompanyFields: [
          run.company?.bankCompanyCode ? null : 'รหัสบริษัทที่ธนาคารออกให้',
          run.company?.bankDebitAccountNo ? null : 'บัญชีบริษัทที่ใช้ตัดจ่าย',
        ].filter((value): value is string => Boolean(value)),
      },
    };
  }

  /**
   * หนังสือแจ้งการโอนเงินเข้าบัญชีเงินเดือน (PDF)
   *
   * เป็นใบปะหน้าที่มีลายเซ็นผู้มีอำนาจกำกับไฟล์นำเข้าธนาคาร ไม่ใช่ตัวไฟล์นำเข้า
   * ใช้ทั้งยื่นธนาคารและเสนออนุมัติภายในก่อนส่งเงินออก
   */
  async buildBankTransferPdf(
    runId: string,
    scope: TenantScope,
    format: BankTransferFormat = 'GENERIC_CSV',
  ) {
    const report = await this.getBankTransferReport(runId, scope);

    return generateBankTransferPdf({
      company: {
        nameTh: report.company.nameTh,
        bankCompanyCode: report.company.bankCompanyCode,
        bankDebitAccountNo: report.company.bankDebitAccountNo,
        ...(await this.letterheadOf(report.company.id)),
      },
      run: {
        runNo: report.run.runNo,
        periodName: report.run.periodName,
        periodStartDate: report.run.periodStartDate,
        periodEndDate: report.run.periodEndDate,
        paymentDate: report.run.paymentDate,
        status: report.run.status,
      },
      rows: report.rows,
      summary: report.summary,
      formatLabel: BANK_FORMAT_LABEL[format],
    });
  }

  /**
   * ข้อมูลหัวจดหมายของบริษัท — getBankTransferReport เลือกมาเฉพาะช่องที่ไฟล์
   * ธนาคารต้องใช้ ส่วนที่อยู่/โทร/อีเมลต้องดึงเพิ่มเพื่อทำหัวจดหมายบนกระดาษ
   */
  private async letterheadOf(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        code: true,
        nameEn: true,
        logoUrl: true,
        taxId: true,
        address: true,
        phone: true,
        email: true,
      },
    });

    return company ?? {};
  }

  /**
   * ไฟล์นำเข้าระบบจ่ายเงินเดือนของธนาคาร
   * รูปแบบ GENERIC_CSV ใช้ได้ทุกที่ ส่วน KTB_IPAY เป็นไฟล์ข้อความความกว้างคงที่
   */
  async buildBankTransferFile(
    runId: string,
    scope: TenantScope,
    format: BankTransferFormat = 'GENERIC_CSV',
  ) {
    const report = await this.getBankTransferReport(runId, scope);

    const file = buildBankTransferFile(format, report.rows, {
      companyName: report.company.nameTh ?? '',
      companyCode: report.company.bankCompanyCode,
      debitAccountNo: report.company.bankDebitAccountNo,
      paymentDate: report.run.paymentDate,
      runNo: safeFileName(report.run.runNo, 'run'),
    });

    return { ...file, format, summary: report.summary };
  }

  async buildBankTransferCsv(runId: string, scope: TenantScope) {
    const report = await this.getBankTransferReport(runId, scope);

    const headers = [
      'ลำดับ',
      'ธนาคาร',
      'เลขที่บัญชี',
      'ชื่อบัญชี',
      'รหัสพนักงาน',
      'ชื่อ-สกุล',
      'จำนวนเงินโอน',
      'ข้อมูลที่ยังขาด',
    ];

    const csv = buildCsv(
      headers,
      report.rows.map((row) => ({
        ลำดับ: row.sequence,
        ธนาคาร: row.bankName ?? '',
        เลขที่บัญชี: csvDigits(row.bankAccountNo),
        ชื่อบัญชี: row.bankAccountName,
        รหัสพนักงาน: row.employeeCode,
        'ชื่อ-สกุล': row.employeeName,
        จำนวนเงินโอน: csvMoney(row.netPay),
        ข้อมูลที่ยังขาด: row.missingFields.join(' / '),
      })),
    );

    return {
      csv,
      fileName: `bank-transfer-${safeFileName(report.run.runNo, 'run')}.csv`,
      summary: report.summary,
    };
  }

  /* ------------------------------------------------------------------ */
  /* กยศ.                                                                */
  /* ------------------------------------------------------------------ */

  async getStudentLoanReport(runId: string, scope: TenantScope) {
    const run = await this.requireRun(runId, scope);

    const entries = await this.prisma.employeeDeductionPlanEntry.findMany({
      where: {
        payrollRunId: runId,
        plan: { planType: 'STUDENT_LOAN' },
      },
      include: {
        plan: {
          include: {
            employee: {
              select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                displayName: true,
                profile: { select: { nationalId: true } },
              },
            },
          },
        },
      },
      orderBy: { plan: { employee: { employeeCode: 'asc' } } },
    });

    const rows = entries.map((entry, index) => ({
      sequence: index + 1,
      employeeId: entry.plan.employeeId,
      employeeCode: entry.plan.employee.employeeCode,
      employeeName: this.employeeName(entry.plan.employee),
      nationalId: entry.plan.employee.profile?.nationalId ?? null,
      referenceNo: entry.plan.referenceNo,
      amount: toMoney(entry.amount),
      balanceBefore: toMoney(entry.balanceBefore),
      balanceAfter: toMoney(entry.balanceAfter),
      isPartial: entry.isPartial,
      missingFields: [
        entry.plan.employee.profile?.nationalId ? null : 'เลขบัตรประชาชน',
        entry.plan.referenceNo ? null : 'เลขที่ผู้กู้',
      ].filter((value): value is string => Boolean(value)),
    }));

    return {
      run: this.runInfo(run),
      company: {
        id: run.company?.id ?? run.companyId,
        nameTh: run.company?.nameTh ?? null,
        taxId: run.company?.taxId ?? null,
      },
      rows,
      summary: {
        employeeCount: rows.length,
        totalAmount: toMoney(rows.reduce((sum, row) => sum + row.amount, 0)),
        partialCount: rows.filter((row) => row.isPartial).length,
        incompleteCount: rows.filter((row) => row.missingFields.length > 0)
          .length,
      },
    };
  }

  async buildStudentLoanCsv(runId: string, scope: TenantScope) {
    const report = await this.getStudentLoanReport(runId, scope);

    const headers = [
      'ลำดับ',
      'เลขบัตรประชาชน',
      'เลขที่ผู้กู้',
      'รหัสพนักงาน',
      'ชื่อ-สกุล',
      'จำนวนเงินที่หัก',
      'ยอดคงเหลือก่อนหัก',
      'ยอดคงเหลือหลังหัก',
      'หักไม่เต็มงวด',
      'ข้อมูลที่ยังขาด',
    ];

    const csv = buildCsv(
      headers,
      report.rows.map((row) => ({
        ลำดับ: row.sequence,
        เลขบัตรประชาชน: csvDigits(row.nationalId),
        เลขที่ผู้กู้: row.referenceNo ?? '',
        รหัสพนักงาน: row.employeeCode,
        'ชื่อ-สกุล': row.employeeName,
        จำนวนเงินที่หัก: csvMoney(row.amount),
        ยอดคงเหลือก่อนหัก: csvMoney(row.balanceBefore),
        ยอดคงเหลือหลังหัก: csvMoney(row.balanceAfter),
        หักไม่เต็มงวด: row.isPartial ? 'ใช่' : '',
        ข้อมูลที่ยังขาด: row.missingFields.join(' / '),
      })),
    );

    return {
      csv,
      fileName: `student-loan-${safeFileName(report.run.runNo, 'run')}.csv`,
      summary: report.summary,
    };
  }

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  private async requireRun(runId: string, scope: TenantScope) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId },
      include: {
        company: {
          select: {
            id: true,
            code: true,
            nameTh: true,
            nameEn: true,
            taxId: true,
            // หัวฟอร์ม สปส.1-10 ส่วนที่ 1 ขอที่อยู่ โทร. และอีเมลของสถานประกอบการ
            logoUrl: true,
            address: true,
            phone: true,
            email: true,
            socialSecurityAccountNo: true,
            socialSecurityBranchNo: true,
            bankCompanyCode: true,
            bankDebitAccountNo: true,
          },
        },
        period: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            paymentDate: true,
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException('ไม่พบรอบการจ่ายเงินเดือนนี้');
    }

    assertWithinScope(scope, { companyId: run.companyId });

    return run;
  }

  private runInfo(run: {
    id: string;
    runNo: string;
    name: string | null;
    status: string;
    companyId: string;
    period?: {
      name: string | null;
      startDate: Date;
      endDate: Date;
      paymentDate: Date;
    } | null;
  }) {
    return {
      id: run.id,
      runNo: run.runNo,
      name: run.name,
      status: run.status,
      periodName: run.period?.name ?? null,
      periodStartDate: toDateOnlyText(run.period?.startDate),
      periodEndDate: toDateOnlyText(run.period?.endDate),
      paymentDate: toDateOnlyText(run.period?.paymentDate),
    };
  }

  private employeeName(employee: {
    firstName: string;
    lastName: string;
    displayName?: string | null;
    employeeCode: string;
  }) {
    return (
      employee.displayName ||
      `${employee.firstName} ${employee.lastName}`.trim() ||
      employee.employeeCode
    );
  }
}
