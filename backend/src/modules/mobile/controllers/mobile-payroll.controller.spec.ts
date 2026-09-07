import { MobilePayrollController } from './mobile-payroll.controller';

describe('MobilePayrollController tax certificate', () => {
  const user = { id: 'user-1' } as never;

  function build() {
    const salarySlipService = {
      getMyWithholdingCertificateYears: jest.fn(async () => ({ years: [2026, 2025] })),
      buildMyWithholdingCertificateCsv: jest.fn(async () => ({
        csv: '\ufeffปีภาษี,เงินได้\n2026,100000',
        fileName: '50-tawi-2026-E001.csv',
      })),
    };

    return {
      salarySlipService,
      controller: new MobilePayrollController(salarySlipService as never),
    };
  }

  it('คืนเฉพาะปีที่ service ของพนักงานหาได้', async () => {
    const { controller, salarySlipService } = build();

    await expect(controller.taxCertificateYears(user)).resolves.toEqual({
      years: [2026, 2025],
    });
    expect(salarySlipService.getMyWithholdingCertificateYears).toHaveBeenCalledWith(user);
  });

  it('export CSV ผ่าน self-scoped service และตั้ง header สำหรับไฟล์ดาวน์โหลด', async () => {
    const { controller, salarySlipService } = build();
    const response = {
      setHeader: jest.fn(),
      end: jest.fn((value) => value),
    } as never;

    await controller.downloadTaxCertificate(user, response, '2026');

    expect(salarySlipService.buildMyWithholdingCertificateCsv).toHaveBeenCalledWith(
      user,
      2026,
    );
    expect((response as any).setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect((response as any).setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="50-tawi-2026-E001.csv"',
    );
  });
});
