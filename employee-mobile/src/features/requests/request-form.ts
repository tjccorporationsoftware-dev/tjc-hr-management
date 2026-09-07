import type { RequestEditable, RequestType } from './requests.types';

/**
 * ประกอบ payload ของใบคำขอแต่ละประเภท
 *
 * **ห้ามใช้ toISOString() กับวันที่เด็ดขาด** — ผู้ใช้เลือก "16 สิงหาคม" จาก
 * picker ได้ Date ที่เป็นเที่ยงคืนตามเวลาไทย พอแปลงเป็น ISO จะกลายเป็น
 * 2026-08-15T17:00:00Z แล้ว slice เอาสิบตัวแรกได้ "2026-08-15" คือลาผิดวัน
 * ทุกครั้ง โดยที่ผู้ใช้เห็นวันถูกบนหน้าจอ จึงต้องประกอบจากส่วนประกอบท้องถิ่น
 */

const pad = (value: number) => String(value).padStart(2, '0');

/** YYYY-MM-DD ตามปฏิทินของเครื่อง */
export function toLocalDateString(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** HH:mm ตามนาฬิกาของเครื่อง */
export function toLocalTimeString(value: Date): string {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** YYYY-MM-DDTHH:mm:ss ไม่มี Z — ให้ backend ตีความเป็นเวลาท้องถิ่นของบริษัท */
export function toLocalDateTimeString(value: Date): string {
  return `${toLocalDateString(value)}T${toLocalTimeString(value)}:00`;
}

export type LeaveDayType =
  | 'FULL_DAY'
  | 'HALF_DAY_MORNING'
  | 'HALF_DAY_AFTERNOON'
  | 'HOURLY';

export interface RequestFormState {
  adjustType: string;
  dayType: LeaveDayType;
  endAt: Date | null;
  endDate: Date | null;
  leaveTypeId: string | null;
  reason: string;
  startAt: Date | null;
  startDate: Date | null;
  targetLogType: string;
  workDate: Date | null;
}

export type RequestFormErrors = Partial<Record<keyof RequestFormState, string>>;

export const emptyRequestForm: RequestFormState = {
  adjustType: 'MISSING_CHECK_IN',
  dayType: 'FULL_DAY',
  endAt: null,
  endDate: null,
  leaveTypeId: null,
  reason: '',
  startAt: null,
  startDate: null,
  targetLogType: 'CHECK_IN',
  workDate: null,
};

const REASON_MIN_LENGTH = 3;

/**
 * ตรวจฟอร์มก่อนส่ง
 *
 * ตรวจเฉพาะเรื่องที่แอปรู้แน่ (กรอกครบไหม ลำดับเวลาถูกไหม)
 * กติกาธุรกิจอย่างโควตาคงเหลือ วันซ้อนทับ หรือช่วงล็อกงวด ปล่อยให้ backend
 * เป็นคนบอก — คัดลอกกฎมาไว้ในแอปแล้วสองที่จะไม่ตรงกันภายในไม่กี่เดือน
 */
export function validateRequestForm(
  type: RequestType,
  form: RequestFormState,
): RequestFormErrors {
  const errors: RequestFormErrors = {};

  if (form.reason.trim().length < REASON_MIN_LENGTH) {
    errors.reason = 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร';
  }

  if (type === 'LEAVE') {
    if (!form.leaveTypeId) errors.leaveTypeId = 'กรุณาเลือกประเภทการลา';
    if (!form.startDate) errors.startDate = 'กรุณาเลือกวันที่เริ่มลา';
    if (!form.endDate) errors.endDate = 'กรุณาเลือกวันสุดท้ายที่ลา';

    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      errors.endDate = 'วันสุดท้ายต้องไม่ก่อนวันที่เริ่มลา';
    }

    if (form.dayType === 'HOURLY') {
      if (!form.startAt) errors.startAt = 'กรุณาเลือกเวลาเริ่มลา';
      if (!form.endAt) errors.endAt = 'กรุณาเลือกเวลาสิ้นสุด';

      if (
        form.startAt &&
        form.endAt &&
        toLocalTimeString(form.endAt) <= toLocalTimeString(form.startAt)
      ) {
        errors.endAt = 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม';
      }
    }

    return errors;
  }

  if (type === 'TIME_ADJUST') {
    if (!form.startAt) errors.startAt = 'กรุณาเลือกวันและเวลาที่ถูกต้อง';

    return errors;
  }

  /* OVERTIME และ OFFSITE ใช้โครงเดียวกัน: วันทำงานหนึ่งวัน + ช่วงเวลา */
  if (!form.workDate) errors.workDate = 'กรุณาเลือกวันที่';
  if (!form.startAt) errors.startAt = 'กรุณาเลือกเวลาเริ่ม';
  if (!form.endAt) errors.endAt = 'กรุณาเลือกเวลาสิ้นสุด';

  if (form.startAt && form.endAt) {
    const start = toLocalTimeString(form.startAt);
    const end = toLocalTimeString(form.endAt);

    /*
     * OT ข้ามเที่ยงคืนเป็นเรื่องปกติ (เข้า 20:00 เลิก 02:00) จึงห้ามตัดทิ้ง
     * ที่ผิดจริงคือเวลาเท่ากันเป๊ะ ซึ่งแปลว่าไม่ได้ทำงานเลย
     */
    if (start === end) {
      errors.endAt = 'เวลาสิ้นสุดต้องไม่เท่ากับเวลาเริ่ม';
    } else if (type === 'OFFSITE' && end < start) {
      /* งานนอกสถานที่อยู่ในวันเดียวกันเสมอตามที่ backend รับ */
      errors.endAt = 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มภายในวันเดียวกัน';
    }
  }

  return errors;
}

export function hasErrors(errors: RequestFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** แปลงฟอร์มเป็น body ที่ backend รับ — เรียกได้ต่อเมื่อ validate ผ่านแล้ว */
export function buildRequestPayload(
  type: RequestType,
  form: RequestFormState,
): Record<string, unknown> {
  const reason = form.reason.trim();

  if (type === 'LEAVE') {
    const hourly = form.dayType === 'HOURLY';

    return {
      dayType: form.dayType,
      endDate: toLocalDateString(form.endDate!),
      endTime: hourly && form.endAt ? toLocalTimeString(form.endAt) : undefined,
      leaveTypeId: form.leaveTypeId,
      reason,
      startDate: toLocalDateString(form.startDate!),
      startTime:
        hourly && form.startAt ? toLocalTimeString(form.startAt) : undefined,
    };
  }

  if (type === 'TIME_ADJUST') {
    return {
      adjustType: form.adjustType,
      reason,
      requestedLogTime: toLocalDateTimeString(form.startAt!),
      targetLogType: form.targetLogType,
    };
  }

  /*
   * OT ไม่ส่ง workType อีกแล้ว
   *
   * ประเภทวัน (วันทำงาน/วันหยุด/วันหยุดพิเศษ) หลังบ้านจับเองจากปฏิทินวันหยุด
   * ส่งไปก็ถูกเมิน และถ้าแอปยังส่งค่าที่ผู้ใช้เลือกไว้ จอกับใบจริงจะไม่ตรงกัน
   */
  return {
    endTime: toLocalTimeString(form.endAt!),
    reason,
    startTime: toLocalTimeString(form.startAt!),
    workDate: toLocalDateString(form.workDate!),
  };
}


function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseLocalTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;

  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

/**
 * เติมฟอร์มจาก snapshot ที่ Backend อนุญาตให้แก้
 * ไม่อ่าน `raw` domain object เพื่อไม่ผูก Mobile กับชื่อคอลัมน์ภายใน
 */
export function requestFormFromEditable(
  type: RequestType,
  editable: RequestEditable,
): RequestFormState {
  const form: RequestFormState = { ...emptyRequestForm };

  if (type === 'LEAVE') {
    return {
      ...form,
      dayType: (editable.dayType as LeaveDayType | null) ?? 'FULL_DAY',
      endAt: parseLocalTime(editable.endTime),
      endDate: parseLocalDate(editable.endDate),
      leaveTypeId: editable.leaveTypeId ?? null,
      reason: editable.reason ?? '',
      startAt: parseLocalTime(editable.startTime),
      startDate: parseLocalDate(editable.startDate),
    };
  }

  if (type === 'TIME_ADJUST') {
    const requested = editable.requestedLogTime
      ? new Date(editable.requestedLogTime)
      : null;

    return {
      ...form,
      adjustType: editable.adjustType ?? form.adjustType,
      reason: editable.reason ?? '',
      startAt:
        requested && !Number.isNaN(requested.getTime()) ? requested : null,
      targetLogType: editable.targetLogType ?? form.targetLogType,
    };
  }

  return {
    ...form,
    endAt: parseLocalTime(editable.endTime),
    reason: editable.reason ?? '',
    startAt: parseLocalTime(editable.startTime),
    workDate: parseLocalDate(editable.workDate),
  };
}
