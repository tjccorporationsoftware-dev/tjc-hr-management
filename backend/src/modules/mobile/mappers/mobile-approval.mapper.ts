/**
 * กล่องรออนุมัติสำหรับหัวหน้าบนมือถือ
 *
 * ApprovalItem ของ Approval Center มี field เยอะมาก (ผังอนุมัติทุกขั้น
 * ข้อมูลองค์กรครบชั้น ประวัติการกระทำ) ซึ่งจำเป็นบนจอคอมแต่ไม่มีที่ลงบนมือถือ
 * ที่นี่จึงเลือกเฉพาะสิ่งที่หัวหน้าต้องรู้ก่อนกดอนุมัติ:
 * ใครขอ · ขออะไร · เมื่อไหร่ · เหตุผล · ถึงคิวเราหรือยัง
 *
 * **ห้ามตัดสินสิทธิ์การอนุมัติที่นี่** — ApprovalsService คัดมาให้แล้วว่า
 * รายการไหนถึงคิวของผู้เรียก และตรวจซ้ำอีกครั้งตอนกดอนุมัติจริง
 */

type ApprovalItemLike = {
  approvalLogs?: Record<string, unknown>[] | null;
  approvalSteps?: Record<string, unknown>[] | null;
  createdAt?: Date | null;
  detail?: Record<string, unknown> | null;
  employee?: {
    branch?: { nameTh?: string | null } | null;
    department?: { nameTh?: string | null } | null;
    displayName?: string | null;
    employeeCode?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    /** ช่องข้อความอิสระในทะเบียนพนักงาน ใช้เมื่อยังไม่ได้ผูกตำแหน่งมาตรฐาน */
    position?: string | null;
    positionMaster?: { nameTh?: string | null } | null;
    user?: { avatarUrl?: string | null } | null;
  } | null;
  id: string;
  reason?: string | null;
  requestNo?: string | null;
  requestStatus?: string | null;
  status?: string | null;
  submittedAt?: Date | null;
  title: string;
  type: string;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const dateKey = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  return typeof value === 'string' ? value.slice(0, 10) : null;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const dateValue = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const personName = (value: unknown): string | null => {
  const person = record(value);
  const displayName = text(person.displayName);
  if (displayName) return displayName;

  const fullName = [text(person.firstName), text(person.lastName)]
    .filter(Boolean)
    .join(' ');

  return fullName || text(person.email);
};

function buildDetails(type: string, detail: Record<string, unknown>) {
  const values: { label: string; value: string | null }[] = [];

  if (type === 'LEAVE') {
    values.push(
      { label: 'วันที่เริ่ม', value: dateKey(detail.startDate) },
      { label: 'วันที่สิ้นสุด', value: dateKey(detail.endDate) },
      {
        label: 'จำนวนวัน',
        value: num(detail.totalDays) === null ? null : `${num(detail.totalDays)} วัน`,
      },
      { label: 'ประเภทวันลา', value: text(detail.dayType) },
      { label: 'ข้อมูลติดต่อ', value: text(detail.contactInfo) },
      { label: 'หมายเหตุ', value: text(detail.note) },
    );
  }

  if (type === 'OVERTIME') {
    values.push(
      { label: 'วันที่ทำงาน', value: dateKey(detail.workDate) },
      {
        label: 'ช่วงเวลา',
        value:
          text(detail.startTime) && text(detail.endTime)
            ? `${text(detail.startTime)}–${text(detail.endTime)}`
            : null,
      },
      {
        label: 'รวม',
        value:
          num(detail.totalHours) === null
            ? null
            : `${num(detail.totalHours)} ชั่วโมง`,
      },
      { label: 'ประเภทวัน', value: text(detail.workType) },
      { label: 'หมายเหตุ', value: text(detail.note) },
    );
  }

  if (type === 'TIME_ADJUST') {
    values.push(
      { label: 'ประเภทการแก้ไข', value: text(detail.adjustType) },
      {
        label: 'เวลาเดิม',
        value: dateValue(detail.originalLogTime)?.toISOString() ?? null,
      },
      {
        label: 'เวลาที่ขอแก้',
        value: dateValue(detail.requestedLogTime)?.toISOString() ?? null,
      },
      { label: 'ประเภทเวลา', value: text(detail.targetLogType) },
      { label: 'หมายเหตุ', value: text(detail.note) },
    );
  }

  if (type === 'OFFSITE') {
    values.push(
      { label: 'วันที่ทำงาน', value: dateKey(detail.workDate) },
      {
        label: 'ช่วงเวลา',
        value:
          text(detail.startTime) && text(detail.endTime)
            ? `${text(detail.startTime)}–${text(detail.endTime)}`
            : null,
      },
      { label: 'สถานที่', value: text(detail.locationName) },
      { label: 'ที่อยู่', value: text(detail.address) },
    );
  }

  return values.filter(
    (item): item is { label: string; value: string } => Boolean(item.value),
  );
}

function buildTimeline(steps: Record<string, unknown>[] = []) {
  return steps.map((step, index) => {
    const position = record(step.position);

    return {
      actedAt: dateValue(step.actedAt),
      actorName:
        personName(step.actedBy) ??
        personName(step.expectedEmployee) ??
        personName(step.expectedApprover) ??
        text(position.nameTh),
      id: text(step.id) ?? `step-${index + 1}`,
      note: text(step.note),
      reason: text(step.reason),
      status: text(step.status) ?? 'WAITING',
      stepNo: Number(step.stepNo ?? index + 1),
      title: text(step.nameTh) ?? `ขั้นที่ ${index + 1}`,
    };
  });
}

function buildAttachments(detail: Record<string, unknown>) {
  const attachments = Array.isArray(detail.attachments)
    ? detail.attachments
    : [];

  return attachments.map((value, index) => {
    const attachment = record(value);

    return {
      createdAt: dateValue(attachment.createdAt),
      downloadSupported: Boolean(attachment.id),
      fileName: text(attachment.fileName),
      fileSize:
        attachment.fileSize === undefined || attachment.fileSize === null
          ? null
          : Number(attachment.fileSize),
      id: text(attachment.id) ?? `attachment-${index + 1}`,
      mimeType: text(attachment.mimeType),
      title: text(attachment.title),
    };
  });
}

/**
 * บรรทัดสรุปใต้ชื่อ — ต้องอ่านจบในบรรทัดเดียวว่าขออะไร
 *
 * `detail` มีรูปร่างต่างกันตามประเภท จึงหยิบเฉพาะคีย์ที่รู้จัก
 * ถ้าไม่เจอคีย์ไหนเลยก็คืน null แล้วให้จอไม่แสดงบรรทัดนี้
 * ดีกว่าโชว์ค่าดิบอย่าง `[object Object]`
 */
function buildSummary(type: string, detail: Record<string, unknown>) {
  if (type === 'LEAVE') {
    const start = dateKey(detail.startDate);
    const end = dateKey(detail.endDate);
    const days = num(detail.totalDays);
    const range = start && end && start !== end ? `${start} – ${end}` : start;

    return [range, days === null ? null : `${days} วัน`]
      .filter(Boolean)
      .join(' · ');
  }

  if (type === 'OVERTIME') {
    const workDate = dateKey(detail.workDate);
    const hours = num(detail.totalHours);

    return [workDate, hours === null ? null : `${hours} ชม.`]
      .filter(Boolean)
      .join(' · ');
  }

  if (type === 'TIME_ADJUST') {
    const requested = detail.requestedLogTime;
    const at =
      requested instanceof Date
        ? requested.toISOString().slice(0, 16).replace('T', ' ')
        : text(requested);

    return at ? `แก้เป็น ${at}` : null;
  }

  if (type === 'OFFSITE') {
    const workDate = dateKey(detail.workDate);
    const start = text(detail.startTime);
    const end = text(detail.endTime);

    return [workDate, start && end ? `${start}–${end}` : null]
      .filter(Boolean)
      .join(' · ');
  }

  return null;
}

function mobileApprovalBase(item: ApprovalItemLike) {
  const employee = item.employee ?? null;
  const detail = item.detail ?? {};

  const employeeName =
    employee?.displayName ??
    [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') ??
    null;

  return {
    /* รูปโปรไฟล์ของคนยื่น — จอรายละเอียดฝั่งผู้อนุมัติเอาไปขึ้นเป็นวงรูป */
    avatarUrl: employee?.user?.avatarUrl ?? null,
    branch: employee?.branch?.nameTh ?? null,
    createdAt: item.createdAt ?? null,
    department: employee?.department?.nameTh ?? null,
    employeeCode: employee?.employeeCode ?? null,
    employeeName: employeeName || null,
    id: item.id,
    /* ตำแหน่งมาตรฐานมาก่อนช่องข้อความอิสระ — ทะเบียนเก่าบางคนมีแต่ช่องอิสระ */
    position: employee?.positionMaster?.nameTh ?? employee?.position ?? null,
    reason: item.reason ?? null,
    requestNo: item.requestNo ?? null,
    requestStatus: item.requestStatus ?? null,
    status: item.status ?? null,
    submittedAt: item.submittedAt ?? null,
    summary: buildSummary(item.type, detail) || null,
    title: item.title,
    type: item.type,
  };
}

/**
 * Payload สำหรับ inbox: ตั้งใจไม่ใส่ timeline / attachments / detail rows
 * เพื่อให้ list เบา รายละเอียดจริงโหลดจาก dedicated endpoint ตอนผู้ใช้เปิด Sheet
 */
export function toMobileApprovalListItem(item: ApprovalItemLike) {
  return mobileApprovalBase(item);
}

/** Payload เต็มสำหรับหน้ารายละเอียดหนึ่งรายการ */
export function toMobileApprovalDetail(item: ApprovalItemLike) {
  const detail = item.detail ?? {};

  return {
    ...mobileApprovalBase(item),
    attachments: buildAttachments(detail),
    details: buildDetails(item.type, detail),
    timeline: buildTimeline(item.approvalSteps ?? []),
  };
}

export type MobileApprovalListItem = ReturnType<
  typeof toMobileApprovalListItem
>;
export type MobileApprovalDetail = ReturnType<typeof toMobileApprovalDetail>;
