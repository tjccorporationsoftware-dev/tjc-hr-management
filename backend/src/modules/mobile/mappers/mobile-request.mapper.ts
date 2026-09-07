/**
 * รวมใบคำขอสี่ประเภทให้เป็นรูปแบบเดียวสำหรับแอป
 *
 * ในแอปทุกใบอยู่ในรายการเดียวกัน ผู้ใช้ไม่ได้คิดเป็น "ตารางลา / ตาราง OT"
 * แต่คิดว่า "เรื่องที่ฉันยื่นไป" จึงต้องมีรูปแบบกลางที่เรียงรวมกันได้
 *
 * ที่นี่ทำแค่ **เลือกและจัดรูป** เท่านั้น สถานะและกติกาทั้งหมดยังเป็นของ
 * service เดิม (ADR-001) ห้ามคำนวณจำนวนวัน/ชั่วโมงใหม่ที่นี่เด็ดขาด —
 * เลขที่โชว์ในแอปต้องเป็นเลขเดียวกับที่หัวหน้าเห็นตอนอนุมัติ
 */

export const MOBILE_REQUEST_TYPES = [
  'LEAVE',
  'OVERTIME',
  'TIME_ADJUST',
  'OFFSITE',
] as const;

export type MobileRequestType = (typeof MOBILE_REQUEST_TYPES)[number];

export interface MobileRequestListItem {
  amountLabel: string | null;
  approverName: string | null;
  canCancel: boolean;
  createdAt: Date | null;
  id: string;
  /** วันที่ที่คำขอนี้พูดถึง ใช้เรียงลำดับและจัดกลุ่ม รูปแบบ YYYY-MM-DD */
  occurredOn: string | null;
  rangeLabel: string | null;
  reason: string | null;
  requestNo: string | null;
  status: string;
  submittedAt: Date | null;
  title: string;
  type: MobileRequestType;
}

export interface MobileRequestAttachment {
  createdAt: Date | null;
  downloadSupported: boolean;
  fileName: string | null;
  fileSize: number | null;
  id: string;
  mimeType: string | null;
  title: string | null;
}

export interface MobileRequestTimelineItem {
  actedAt: Date | null;
  actorName: string | null;
  id: string;
  note: string | null;
  reason: string | null;
  status: string;
  stepNo: number;
  title: string;
}

export interface MobileRequestEditableFields {
  adjustType?: string | null;
  dayType?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  leaveTypeId?: string | null;
  reason?: string | null;
  requestedLogTime?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  targetLogType?: string | null;
  workDate?: string | null;
  workType?: string | null;
}

export interface MobileRequestDetail extends MobileRequestListItem {
  attachments: MobileRequestAttachment[];
  canDelete: boolean;
  canDeleteAttachments: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  details: { label: string; value: string }[];
  editable: MobileRequestEditableFields;
  timeline: MobileRequestTimelineItem[];
}

/**
 * ยกเลิกได้เฉพาะใบที่ยังไม่จบกระบวนการ
 *
 * รายชื่อนี้ครอบคลุมสถานะกลางของ offsite ที่ผ่านหัวหน้าแล้วแต่ HR ยังไม่อนุมัติด้วย
 * ปุ่มยกเลิกที่โผล่ผิดจังหวะจะทำให้ผู้ใช้กดแล้วเจอ error ที่อธิบายไม่ได้
 * ส่วน backend ตรวจซ้ำอยู่แล้ว ตรงนี้จึงเป็นเรื่องของการไม่หลอกตา ไม่ใช่การกันสิทธิ์
 */
const CANCELLABLE_STATUSES = new Set([
  'DRAFT',
  'SUBMITTED',
  'MANAGER_APPROVED',
  'HR_APPROVED',
]);

const toDateKey = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;

  const iso = value instanceof Date ? value.toISOString() : String(value);

  return iso.slice(0, 10);
};

const toDate = (value: unknown): Date | null =>
  value instanceof Date
    ? value
    : typeof value === 'string' || typeof value === 'number'
      ? (() => {
          const parsed = new Date(value);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        })()
      : null;

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const optionalText = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
};

const personName = (value: unknown): string | null => {
  const person = toRecord(value);
  const displayName = optionalText(person.displayName);

  if (displayName) return displayName;

  const fullName = [person.firstName, person.lastName]
    .map(optionalText)
    .filter(Boolean)
    .join(' ');

  return fullName || optionalText(person.email);
};

/**
 * ชื่อผู้อนุมัติที่จะโชว์ในรายการ — คนที่ทำให้สถานะเป็นแบบนี้
 *
 * มีคนกดไปแล้ว (steps ล่าสุดที่ actedBy) ใช้ชื่อคนนั้น ไม่งั้นใช้คนที่กำลังรอ
 * อยู่ขั้นถัดไป (step แรกที่ WAITING) รองรับทั้ง approvalSteps ที่เป็น relation
 * (ลา/OT/แก้เวลา) และ approvalSnapshot.steps ที่เป็น JSON denormalized (นอกสถานที่)
 */
const currentApproverName = (row: Record<string, unknown>): string | null => {
  const snapshot = toRecord(row.approvalSnapshot);
  const source = Array.isArray(row.approvalSteps)
    ? row.approvalSteps
    : Array.isArray(snapshot.steps)
      ? snapshot.steps
      : [];
  const steps = source.map((raw) => toRecord(raw));

  const acted = [...steps].reverse().find((step) => personName(step.actedBy));
  if (acted) return personName(acted.actedBy);

  const waiting = steps.find((step) => String(step.status ?? '') === 'WAITING');
  return waiting
    ? (personName(waiting.expectedEmployee) ??
        personName(waiting.expectedApprover) ??
        optionalText(toRecord(waiting.position).nameTh))
    : null;
};

const timeOnly = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    /* offsite เก็บเป็น "18:00" อยู่แล้ว */
    return value.slice(0, 5);
  }

  return value.toISOString().slice(11, 16);
};

/** ช่วงวันแบบสั้น — วันเดียวไม่ต้องเขียนซ้ำสองครั้ง */
const dayRange = (start: string | null, end: string | null) => {
  if (!start) return null;

  return !end || start === end ? start : `${start} – ${end}`;
};

const DAY_TYPE_LABEL: Record<string, string> = {
  FULL_DAY: 'เต็มวัน',
  HALF_DAY_AFTERNOON: 'ครึ่งวันบ่าย',
  HALF_DAY_MORNING: 'ครึ่งวันเช้า',
  HOURLY: 'รายชั่วโมง',
};

const OT_WORK_TYPE_LABEL: Record<string, string> = {
  HOLIDAY: 'OT วันหยุด',
  SPECIAL_HOLIDAY: 'OT วันหยุดพิเศษ',
  WORKDAY: 'OT วันทำงาน',
};

const ADJUST_TYPE_LABEL: Record<string, string> = {
  DEVICE_ERROR: 'เครื่องบันทึกผิดพลาด',
  MISSING_CHECK_IN: 'ลืมลงเวลาเข้า',
  MISSING_CHECK_OUT: 'ลืมลงเวลาออก',
  OTHER: 'อื่น ๆ',
  OUTSIDE_WORK: 'ทำงานนอกสถานที่',
  WRONG_TIME: 'เวลาไม่ถูกต้อง',
};

const base = (row: Record<string, unknown>, type: MobileRequestType) => ({
  approverName: currentApproverName(row),
  canCancel: CANCELLABLE_STATUSES.has(String(row.status)),
  createdAt: toDate(row.createdAt),
  id: String(row.id),
  reason: (row.reason as string | null) ?? null,
  requestNo: (row.requestNo as string | null) ?? null,
  status: String(row.status),
  submittedAt: toDate(row.submittedAt),
  type,
});

export function toMobileLeaveRequest(
  row: Record<string, unknown>,
): MobileRequestListItem {
  const startDate = toDateKey(row.startDate as Date);
  const endDate = toDateKey(row.endDate as Date);
  const dayType = String(row.dayType ?? 'FULL_DAY');
  const leaveType = row.leaveType as { nameTh?: string } | null | undefined;

  /* รายชั่วโมงต้องเห็นช่วงเวลา ไม่งั้นแยกไม่ออกว่าลาช่วงไหนของวัน */
  const hourly =
    dayType === 'HOURLY' && row.startTime && row.endTime
      ? ` ${String(row.startTime)}–${String(row.endTime)}`
      : '';

  return {
    ...base(row, 'LEAVE'),
    amountLabel:
      row.totalDays === undefined || row.totalDays === null
        ? null
        : `${Number(row.totalDays)} วัน`,
    occurredOn: startDate,
    rangeLabel: `${dayRange(startDate, endDate) ?? '—'} · ${
      DAY_TYPE_LABEL[dayType] ?? dayType
    }${hourly}`,
    title: leaveType?.nameTh ?? 'ใบลา',
  };
}

export function toMobileOvertimeRequest(
  row: Record<string, unknown>,
): MobileRequestListItem {
  const workDate = toDateKey(row.workDate as Date);
  const start = timeOnly(row.startTime as Date);
  const end = timeOnly(row.endTime as Date);

  return {
    ...base(row, 'OVERTIME'),
    amountLabel:
      row.totalHours === undefined || row.totalHours === null
        ? null
        : `${Number(row.totalHours)} ชม.`,
    occurredOn: workDate,
    rangeLabel: start && end ? `${workDate} · ${start}–${end}` : workDate,
    title: OT_WORK_TYPE_LABEL[String(row.workType ?? 'WORKDAY')] ?? 'ขอ OT',
  };
}

export function toMobileTimeAdjustRequest(
  row: Record<string, unknown>,
): MobileRequestListItem {
  const requestedAt = toDate(row.requestedLogTime);

  return {
    ...base(row, 'TIME_ADJUST'),
    amountLabel: null,
    occurredOn: toDateKey(requestedAt),
    rangeLabel: requestedAt
      ? `${toDateKey(requestedAt)} · แก้เป็น ${timeOnly(requestedAt)}`
      : null,
    title:
      ADJUST_TYPE_LABEL[String(row.adjustType ?? '')] ?? 'ขอแก้เวลาเข้าออก',
  };
}

export function toMobileOffsiteRequest(
  row: Record<string, unknown>,
): MobileRequestListItem {
  const workDate = toDateKey(row.workDate as Date);
  const start = timeOnly(row.startTime as string);
  const end = timeOnly(row.endTime as string);

  return {
    ...base(row, 'OFFSITE'),
    amountLabel: null,
    occurredOn: workDate,
    rangeLabel: start && end ? `${workDate} · ${start}–${end}` : workDate,
    title: 'ทำงานนอกสถานที่',
  };
}

const MAPPER: Record<
  MobileRequestType,
  (row: Record<string, unknown>) => MobileRequestListItem
> = {
  LEAVE: toMobileLeaveRequest,
  OFFSITE: toMobileOffsiteRequest,
  OVERTIME: toMobileOvertimeRequest,
  TIME_ADJUST: toMobileTimeAdjustRequest,
};

export function toMobileRequest(
  type: MobileRequestType,
  row: Record<string, unknown>,
): MobileRequestListItem {
  return MAPPER[type](row);
}

function requestDetails(
  type: MobileRequestType,
  row: Record<string, unknown>,
): { label: string; value: string }[] {
  const values: ({ label: string; value: string | null })[] = [];

  if (type === 'LEAVE') {
    values.push(
      { label: 'วันที่เริ่ม', value: toDateKey(row.startDate as never) },
      { label: 'วันที่สิ้นสุด', value: toDateKey(row.endDate as never) },
      {
        label: 'รูปแบบการลา',
        value:
          DAY_TYPE_LABEL[String(row.dayType ?? 'FULL_DAY')] ??
          optionalText(row.dayType),
      },
      {
        label: 'จำนวนวัน',
        value:
          row.totalDays === undefined || row.totalDays === null
            ? null
            : `${Number(row.totalDays)} วัน`,
      },
      { label: 'ข้อมูลติดต่อ', value: optionalText(row.contactInfo) },
      { label: 'หมายเหตุ', value: optionalText(row.note) },
    );
  }

  if (type === 'OVERTIME') {
    values.push(
      { label: 'วันที่ทำงาน', value: toDateKey(row.workDate as never) },
      { label: 'เวลาเริ่ม', value: timeOnly(row.startTime as never) },
      { label: 'เวลาสิ้นสุด', value: timeOnly(row.endTime as never) },
      {
        label: 'รวม',
        value:
          row.totalHours === undefined || row.totalHours === null
            ? null
            : `${Number(row.totalHours)} ชั่วโมง`,
      },
      {
        label: 'ประเภทวัน',
        value:
          OT_WORK_TYPE_LABEL[String(row.workType ?? 'WORKDAY')] ??
          optionalText(row.workType),
      },
      { label: 'หมายเหตุ', value: optionalText(row.note) },
    );
  }

  if (type === 'TIME_ADJUST') {
    const original = toDate(row.originalLogTime);
    const requested = toDate(row.requestedLogTime);

    values.push(
      {
        label: 'ประเภทการแก้ไข',
        value:
          ADJUST_TYPE_LABEL[String(row.adjustType ?? '')] ??
          optionalText(row.adjustType),
      },
      {
        label: 'เวลาเดิม',
        value: original ? original.toISOString() : null,
      },
      {
        label: 'เวลาที่ขอแก้',
        value: requested ? requested.toISOString() : null,
      },
      { label: 'ประเภทเวลา', value: optionalText(row.targetLogType) },
      { label: 'หมายเหตุ', value: optionalText(row.note) },
    );
  }

  if (type === 'OFFSITE') {
    values.push(
      { label: 'วันที่ทำงาน', value: toDateKey(row.workDate as never) },
      {
        label: 'ช่วงเวลา',
        value:
          timeOnly(row.startTime as never) && timeOnly(row.endTime as never)
            ? `${timeOnly(row.startTime as never)}–${timeOnly(row.endTime as never)}`
            : null,
      },
      { label: 'สถานที่', value: optionalText(row.locationName) },
      { label: 'ที่อยู่', value: optionalText(row.address) },
      {
        label: 'รัศมีลงเวลา',
        value:
          row.radiusMeters === undefined || row.radiusMeters === null
            ? null
            : `${Number(row.radiusMeters)} เมตร`,
      },
    );
  }

  return values.filter(
    (item): item is { label: string; value: string } => Boolean(item.value),
  );
}

function requestTimeline(row: Record<string, unknown>) {
  const snapshot = toRecord(row.approvalSnapshot);
  const source = Array.isArray(row.approvalSteps)
    ? row.approvalSteps
    : Array.isArray(snapshot.steps)
      ? snapshot.steps
      : [];

  return source.map((rawStep, index): MobileRequestTimelineItem => {
    const step = toRecord(rawStep);
    const position = toRecord(step.position);

    return {
      actedAt: toDate(step.actedAt),
      actorName:
        personName(step.actedBy) ??
        personName(step.expectedEmployee) ??
        personName(step.expectedApprover) ??
        optionalText(position.nameTh),
      id: optionalText(step.id) ?? `step-${index + 1}`,
      note: optionalText(step.note),
      reason: optionalText(step.reason),
      status: optionalText(step.status) ?? 'WAITING',
      stepNo: Number(step.stepNo ?? index + 1),
      title: optionalText(step.nameTh) ?? `ขั้นที่ ${index + 1}`,
    };
  });
}

/**
 * UI capability เท่านั้น — domain service เป็นผู้ตรวจสถานะจริงตอน DELETE เสมอ
 * ค่านี้มีไว้ไม่ให้แอปแสดงปุ่มที่กดแล้วถูกปฏิเสธแน่นอน
 */
function canDeleteRequestAttachments(
  type: MobileRequestType,
  status: unknown,
): boolean {
  const requestStatus = String(status ?? '');

  if (type === 'OFFSITE') return false;
  if (type === 'TIME_ADJUST') return requestStatus !== 'APPROVED';

  return requestStatus === 'DRAFT' || requestStatus === 'SUBMITTED';
}

function requestEditableFields(
  type: MobileRequestType,
  row: Record<string, unknown>,
): MobileRequestEditableFields {
  if (type === 'LEAVE') {
    return {
      dayType: optionalText(row.dayType) ?? 'FULL_DAY',
      endDate: toDateKey(row.endDate as never),
      endTime: timeOnly(row.endTime as never),
      leaveTypeId:
        optionalText(row.leaveTypeId) ?? optionalText(toRecord(row.leaveType).id),
      reason: optionalText(row.reason),
      startDate: toDateKey(row.startDate as never),
      startTime: timeOnly(row.startTime as never),
    };
  }

  if (type === 'OVERTIME') {
    return {
      endTime: timeOnly(row.endTime as never),
      reason: optionalText(row.reason),
      startTime: timeOnly(row.startTime as never),
      workDate: toDateKey(row.workDate as never),
      workType: optionalText(row.workType) ?? 'WORKDAY',
    };
  }

  if (type === 'TIME_ADJUST') {
    const requested = toDate(row.requestedLogTime);

    return {
      adjustType: optionalText(row.adjustType),
      reason: optionalText(row.reason),
      requestedLogTime: requested ? requested.toISOString() : null,
      targetLogType: optionalText(row.targetLogType),
    };
  }

  return {
    endTime: timeOnly(row.endTime as never),
    reason: optionalText(row.reason),
    startTime: timeOnly(row.startTime as never),
    workDate: toDateKey(row.workDate as never),
  };
}

function requestAttachments(
  type: MobileRequestType,
  row: Record<string, unknown>,
): MobileRequestAttachment[] {
  if (Array.isArray(row.attachments)) {
    return row.attachments.map((rawAttachment, index) => {
      const attachment = toRecord(rawAttachment);
      const id = optionalText(attachment.id) ?? `attachment-${index + 1}`;

      return {
        createdAt: toDate(attachment.createdAt),
        downloadSupported: Boolean(attachment.id),
        fileName: optionalText(attachment.fileName),
        fileSize:
          attachment.fileSize === undefined || attachment.fileSize === null
            ? null
            : Number(attachment.fileSize),
        id,
        mimeType: optionalText(attachment.mimeType),
        title: optionalText(attachment.title),
      };
    });
  }

  const attachmentUrl = optionalText(row.attachmentUrl);

  return attachmentUrl
    ? [
        {
          createdAt: null,
          downloadSupported: false,
          fileName: null,
          fileSize: null,
          id: 'offsite-attachment',
          mimeType: null,
          title: 'หลักฐานแนบคำขอ',
        },
      ]
    : [];
}

export function toMobileRequestDetail(
  type: MobileRequestType,
  row: Record<string, unknown>,
): MobileRequestDetail {
  const status = String(row.status ?? '');
  const isDraft = status === 'DRAFT';

  return {
    ...toMobileRequest(type, row),
    attachments: requestAttachments(type, row),
    canDelete: type === 'OFFSITE' && isDraft,
    canDeleteAttachments: canDeleteRequestAttachments(type, row.status),
    canEdit: isDraft,
    canSubmit: isDraft,
    details: requestDetails(type, row),
    editable: requestEditableFields(type, row),
    timeline: requestTimeline(row),
  };
}

/**
 * เรียงใบคำขอจากทุกประเภทรวมกัน
 *
 * เรียงตามวันที่ของเรื่อง (ใหม่ก่อน) ไม่ใช่วันที่ยื่น เพราะผู้ใช้จำว่า
 * "ลาวันศุกร์" ไม่ได้จำว่า "ยื่นเมื่อวันอังคาร"
 * ใบที่ไม่มีวันของเรื่องให้ตกไปท้ายสุดแทนที่จะโผล่ขึ้นบนเพราะเทียบกับ null
 */
export function sortMobileRequests(items: MobileRequestListItem[]) {
  return [...items].sort((left, right) => {
    if (left.occurredOn === right.occurredOn) {
      return (
        (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0)
      );
    }

    if (!left.occurredOn) return 1;
    if (!right.occurredOn) return -1;

    return right.occurredOn.localeCompare(left.occurredOn);
  });
}
