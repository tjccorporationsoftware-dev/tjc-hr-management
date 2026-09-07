import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { ZodType } from 'zod';

import { getAppConfig } from '@/config/app-config';
import { useAuthStore } from '@/features/auth/auth.store';
import { apiClient } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { getOrCreateInstallationId } from '@/lib/storage/secure-storage';

import {
  payslipDetailSchema,
  payslipListSchema,
  taxCertificateSchema,
  taxCertificateYearsSchema,
  type PayslipDetail,
  type TaxCertificate,
} from './payslip.types';

function parse<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw ApiError.invalidResponse(result.error.issues);
  }

  return result.data;
}

async function payrollFileRequest() {
  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  return {
    config,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-App-Version': config.appVersion,
      'X-Installation-Id': await getOrCreateInstallationId(),
      'X-Platform': config.platform,
    },
  };
}

function payslipPdfUrl(apiBaseUrl: string, id: string) {
  return `${apiBaseUrl}/mobile/v1/payroll/slips/${encodeURIComponent(id)}/pdf`;
}

export interface PayslipPdfPreview {
  dispose: () => void;
  uri: string;
}

/**
 * โหลด PDF สำหรับพรีวิวเท่านั้น
 *
 * Native เก็บไว้ใน cache และลบเมื่อออกจากหน้าพรีวิว ส่วนเว็บใช้ Blob URL
 * ซึ่งถูก revoke เช่นกัน ไฟล์จึงไม่ค้างเป็นเอกสารดาวน์โหลดของผู้ใช้จนกว่า
 * ผู้ใช้จะกดปุ่มบันทึกหรือส่งต่อด้วยตัวเอง
 */
export async function loadPayslipPdfPreview(
  id: string,
): Promise<PayslipPdfPreview> {
  const { config, headers } = await payrollFileRequest();
  const url = payslipPdfUrl(config.apiBaseUrl, id);

  if (Platform.OS === 'web') {
    let response: Response;

    try {
      response = await fetch(url, { headers });
    } catch (error) {
      throw ApiError.network(error);
    }

    if (!response.ok) {
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        /* PDF endpoint อาจคืนข้อความธรรมดาเมื่อ proxy ขัดข้อง */
      }
      throw ApiError.fromResponse(response, payload);
    }

    const blobUrl = URL.createObjectURL(await response.blob());
    return {
      dispose: () => URL.revokeObjectURL(blobUrl),
      uri: blobUrl,
    };
  }

  const target = new Directory(Paths.cache, 'payslip-previews');
  if (!target.exists) {
    target.create({ intermediates: true });
  }

  const file = new File(target, `preview-${id}.pdf`);
  await File.downloadFileAsync(url, file, {
    headers,
    idempotent: true,
  });

  return {
    dispose: () => {
      try {
        if (file.exists) file.delete();
      } catch {
        /* เป็น cache เท่านั้น ระบบจะล้างให้ภายหลังถ้าลบไม่ได้ */
      }
    },
    uri: file.uri,
  };
}

export async function fetchPayslips() {
  const payload = await apiClient.get<unknown>('/mobile/v1/payroll/slips');

  return parse(payslipListSchema, payload);
}

export async function fetchPayslipDetail(id: string): Promise<PayslipDetail> {
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/payroll/slips/${encodeURIComponent(id)}`,
  );

  return parse(payslipDetailSchema, payload);
}

export async function fetchTaxCertificate(
  year?: number,
): Promise<TaxCertificate> {
  const payload = await apiClient.get<unknown>(
    `/mobile/v1/payroll/tax-certificate${year ? `?year=${year}` : ''}`,
  );

  return parse(taxCertificateSchema, payload);
}

export async function fetchTaxCertificateYears(): Promise<number[]> {
  const payload = await apiClient.get<unknown>(
    '/mobile/v1/payroll/tax-certificate/years',
  );

  return parse(taxCertificateYearsSchema, payload).years;
}

export async function shareTaxCertificateCsv(year: number): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw ApiError.invalidRequest('เครื่องนี้ยังแชร์ไฟล์ไม่ได้');
  }

  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  const target = new Directory(Paths.cache, 'tax-certificates');
  if (!target.exists) {
    target.create({ intermediates: true });
  }
  const file = new File(target, `50-ทวิ-${year}.csv`);

  try {
    await File.downloadFileAsync(
      `${config.apiBaseUrl}/mobile/v1/payroll/tax-certificate/export?year=${encodeURIComponent(String(year))}`,
      file,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-App-Version': config.appVersion,
          'X-Installation-Id': await getOrCreateInstallationId(),
          'X-Platform': config.platform,
        },
        idempotent: true,
      },
    );

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      /* ไฟล์อยู่ใน cache เท่านั้น ระบบจะล้างให้ภายหลัง */
    }
  }
}

/**
 * ดาวน์โหลดสลิป PDF แล้วเปิดแผ่นแชร์ของระบบ
 *
 * ใช้ File.downloadFileAsync แทน apiClient เพราะ apiClient แกะ JSON เสมอ
 * และการโหลดไฟล์ทั้งก้อนเข้า memory แล้วเขียนลงดิสก์เองสิ้นเปลืองกว่าโดยเปล่าประโยชน์
 *
 * ไฟล์ลงที่ cache directory โดยตั้งใจ — สลิปมีเงินเดือนอยู่ในนั้น ไม่ควรค้าง
 * ถาวรบนเครื่อง ระบบล้าง cache ให้เองเมื่อพื้นที่ใกล้เต็ม และเราลบทิ้งหลังแชร์เสร็จ
 */
export async function sharePayslipPdf(params: {
  id: string;
  periodName: string;
}): Promise<void> {
  /* ชื่อไฟล์ต้องอ่านรู้เรื่องตอนอยู่ในแอปแชทหรือโฟลเดอร์ดาวน์โหลด */
  const safeName = params.periodName.replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const fileName = `สลิปเงินเดือน-${safeName}.pdf`;

  /*
   * expo-file-system ไม่มี implementation บนเว็บ แม้หน้า preview จะเปิด Blob
   * ได้แล้วก็ตาม จึงดาวน์โหลดด้วย browser API โดยตรง
   */
  if (Platform.OS === 'web') {
    const { config, headers } = await payrollFileRequest();
    let response: Response;

    try {
      response = await fetch(payslipPdfUrl(config.apiBaseUrl, params.id), {
        headers,
      });
    } catch (error) {
      throw ApiError.network(error);
    }

    if (!response.ok) {
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        /* PDF endpoint อาจคืนข้อความธรรมดา */
      }
      throw ApiError.fromResponse(response, payload);
    }

    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = window.document.createElement('a');
    anchor.download = fileName;
    anchor.href = blobUrl;
    anchor.style.display = 'none';
    window.document.body.appendChild(anchor);

    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000);
    }
    return;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw ApiError.invalidRequest('เครื่องนี้ยังแชร์ไฟล์ไม่ได้');
  }

  const config = getAppConfig();
  const accessToken = useAuthStore.getState().accessToken;

  if (!accessToken) {
    throw ApiError.invalidRequest('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  const target = new Directory(Paths.cache, 'payslips');

  if (!target.exists) {
    target.create({ intermediates: true });
  }

  const file = new File(target, fileName);

  try {
    await File.downloadFileAsync(
      `${config.apiBaseUrl}/mobile/v1/payroll/slips/${encodeURIComponent(
        params.id,
      )}/pdf`,
      file,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-App-Version': config.appVersion,
          'X-Installation-Id': await getOrCreateInstallationId(),
          'X-Platform': config.platform,
        },
        idempotent: true,
      },
    );

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
  } finally {
    /*
     * ลบทันทีหลังปิดแผ่นแชร์ ไม่ปล่อยให้สลิปค้างอยู่ใน cache
     * ถ้าลบไม่สำเร็จก็ไม่ควรทำให้ผู้ใช้เห็น error เพราะแชร์สำเร็จไปแล้ว
     */
    try {
      if (file.exists) file.delete();
    } catch {
      /* ปล่อยให้ระบบล้าง cache เอง */
    }
  }
}
