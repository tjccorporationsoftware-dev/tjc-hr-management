import { useMutation, useQuery } from '@tanstack/react-query';

import { ApiError } from '@/lib/api/api-error';

import {
  fetchPayslipDetail,
  fetchPayslips,
  fetchTaxCertificate,
  fetchTaxCertificateYears,
  sharePayslipPdf,
  shareTaxCertificateCsv,
} from './payslip.api';

const payrollKeys = {
  detail: (id: string) => ['payroll', 'slip', id] as const,
  slips: ['payroll', 'slips'] as const,
  taxCertificate: (year?: number) =>
    ['payroll', 'tax-certificate', year ?? 'current'] as const,
  taxCertificateYears: ['payroll', 'tax-certificate-years'] as const,
};

const retryServerErrorsOnly = (failureCount: number, error: unknown) => {
  if (error instanceof ApiError && error.status && error.status < 500) {
    return false;
  }

  return failureCount < 2;
};

export function usePayslips(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: fetchPayslips,
    queryKey: payrollKeys.slips,
    retry: retryServerErrorsOnly,
    /*
     * **รายการ**สลิปสดกว่ารายละเอียดโดยตั้งใจ
     *
     * เดิมตั้งไว้ห้านาทีด้วยเหตุผลว่า "สลิปที่ publish แล้วไม่เปลี่ยนอีก" ซึ่ง
     * จริงกับตัวสลิป แต่ไม่จริงกับรายการ — สิ่งที่พนักงานรอคือ *งวดใหม่โผล่*
     * ซึ่งเกิดตอน HR กดประกาศ การถือ cache ไว้นานแปลว่าคนที่เปิดจอค้างไว้
     * ตอนเช้าจะยังเห็น "ยังไม่มีสลิป" ทั้งที่เงินเข้าแล้ว
     */
    staleTime: 60_000,
  });
}

export function usePayslipDetail(id: string) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => fetchPayslipDetail(id),
    queryKey: payrollKeys.detail(id),
    retry: retryServerErrorsOnly,
    /* ตัวเลขในสลิปงวดที่ประกาศแล้วนิ่งจริง เก็บได้นาน */
    staleTime: 5 * 60_000,
  });
}

export function useTaxCertificate(enabled: boolean, year?: number) {
  return useQuery({
    enabled,
    queryFn: () => fetchTaxCertificate(year),
    queryKey: payrollKeys.taxCertificate(year),
    retry: retryServerErrorsOnly,
    staleTime: 5 * 60_000,
  });
}

export function useSharePayslip() {
  return useMutation({
    mutationFn: (input: { id: string; periodName: string }) =>
      sharePayslipPdf(input),
  });
}

export function useTaxCertificateYears(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: fetchTaxCertificateYears,
    queryKey: payrollKeys.taxCertificateYears,
    retry: retryServerErrorsOnly,
    staleTime: 10 * 60_000,
  });
}

/**
 * **พักไว้ ยังไม่มีจอไหนเรียก** — อย่าลบและอย่าต่อกลับเข้าแอปพนักงาน
 *
 * ไฟล์ที่ endpoint นี้ให้เป็น CSV ฉบับร่างสำหรับฝ่ายบัญชี ไม่ใช่ 50 ทวิ ตัวจริง
 * (ไม่มีลายมือชื่อผู้จ่ายเงินได้ ไม่ใช่แบบฟอร์มของกรมสรรพากร) จอหนังสือรับรอง
 * จึงถอดปุ่มดาวน์โหลดออกไปก่อน เหลือไว้ให้ดูยอดอย่างเดียว
 *
 * ต่อกลับเมื่อครบสองข้อ: ออก PDF ตามแบบฟอร์มจริงได้ และล็อกให้โหลดได้เฉพาะ
 * ปีภาษีที่ปิดแล้ว
 */
export function useShareTaxCertificate() {
  return useMutation({
    mutationFn: (year: number) => shareTaxCertificateCsv(year),
  });
}
