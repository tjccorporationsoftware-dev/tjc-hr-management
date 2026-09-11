/**
 * กติกากลางว่าใครกดอนุมัติขั้นนี้ได้
 * -----------------------------------------------------------------------------
 * เดิมแต่ละโมดูล (ใบลา / OT / ปรับเวลา) เขียนเงื่อนไขซ้ำกันเองและยอมเฉพาะ
 * expectedApproverId ตรงตัว ขณะที่กล่องงาน /approvals/pending จับคู่ตามบทบาท
 * ผลคือรายการโผล่ในกล่องงานของคนที่กดอนุมัติไม่ได้จริง
 *
 * อีกจุดคือทางลัดของแอดมินเช็คบทบาท 'ADMIN' / 'SUPER_ADMIN' ซึ่งไม่มีอยู่ใน
 * prisma/seed-data/access-control.ts (ของจริงคือ SYSTEM_ADMIN) กลายเป็นโค้ดตาย
 * ทำให้ใบที่ผูกผู้อนุมัติผิดคนค้างอยู่โดยไม่มีใครปลดได้
 *
 * ไฟล์นี้จึงเป็นแหล่งเดียวของกติกา ให้ทั้งกล่องงานและปุ่มอนุมัติใช้ชุดเดียวกัน
 */

/** บทบาทที่ถือว่าเป็นแอดมินระบบ ปลดล็อกงานที่ผูกผู้อนุมัติผิดคนได้ */
export const APPROVAL_ADMIN_ROLE_CODES = [
  'SYSTEM_ADMIN',
  'SUPER_ADMIN',
  'ADMIN',
];

/** บทบาทที่ถือว่าเป็นฝ่ายบุคคล ใช้กับขั้น HR_ADMIN */
export const APPROVAL_HR_ROLE_CODES = [
  'HR_ADMIN',
  'HR_MANAGER',
  'HR',
  ...APPROVAL_ADMIN_ROLE_CODES,
];

/** บทบาทที่ถือว่าเป็นผู้บริหาร ใช้กับขั้น EXECUTIVE */
export const APPROVAL_EXECUTIVE_ROLE_CODES = [
  'EXECUTIVE',
  'CEO',
  'DIRECTOR',
  ...APPROVAL_ADMIN_ROLE_CODES,
];

/** รวมทุกบทบาทที่อาจมีสิทธิ์ ใช้เป็นเงื่อนไข query ครั้งเดียว */
export const APPROVAL_STEP_ROLE_CODES = Array.from(
  new Set([...APPROVAL_HR_ROLE_CODES, ...APPROVAL_EXECUTIVE_ROLE_CODES]),
);

type ActorRoleRow = { roles?: { role?: { code?: string | null } | null }[] };

/**
 * โหลดรหัสบทบาทที่ยังเปิดใช้งานของผู้กดอนุมัติ
 *
 * รับ client แบบหลวมเพราะถูกเรียกทั้งจาก PrismaService และ TransactionClient
 * ซึ่ง type ของ Prisma ไม่ตรงกันเมื่อประกาศ select ไว้ล่วงหน้า
 */
export async function loadActorRoleCodes(
  client: { user: { findFirst: (args: any) => Promise<any> } },
  actorId: string,
): Promise<string[]> {
  const actor = (await client.user.findFirst({
    where: { id: actorId, deletedAt: null },
    select: {
      roles: {
        where: { role: { isActive: true } },
        select: { role: { select: { code: true } } },
      },
    },
  })) as ActorRoleRow | null;

  return (actor?.roles ?? [])
    .map((item) => item?.role?.code)
    .filter((code): code is string => Boolean(code));
}

export type ApprovalStepAuthorizationInput = {
  expectedApproverId?: string | null;
  approverType?: string | null;
  roleCode?: string | null;
  nameTh?: string | null;
};

const normalize = (codes: string[]) =>
  codes.map((code) => String(code).toUpperCase());

/**
 * ขั้นนี้เป็นงานของฝ่ายบุคคลหรือไม่
 * ดูจากทั้ง approverType, roleCode และชื่อขั้น เพราะบางบริษัทตั้งขั้นเป็น ROLE
 * แทนที่จะใช้ approverType = HR_ADMIN
 */
function isHrStep(step: ApprovalStepAuthorizationInput) {
  return [step.approverType, step.roleCode, step.nameTh]
    .filter(Boolean)
    .map((value) => String(value).toUpperCase())
    .some((value) => value.includes('HR'));
}

/** ใครเป็นเจ้าของคำขอนี้ ใช้กันไม่ให้อนุมัติงานของตัวเอง */
export type ApprovalRequestOwner = {
  /** userId ของคนที่ยื่นคำขอ */
  requesterUserId?: string | null;
  /** employeeId ของพนักงานที่คำขอนี้มีผลกับเขา */
  subjectEmployeeId?: string | null;
};

/**
 * ผู้กดคนนี้เป็นเจ้าของคำขอเองหรือไม่
 *
 * ครอบทั้งคนยื่นและพนักงานที่คำขอมีผล เพราะหัวหน้าที่ยื่นแทนลูกน้อง
 * กับพนักงานที่ยื่นเองเป็นคนละกรณีแต่ต้องกันทั้งคู่
 */
export function isOwnRequest(
  owner: ApprovalRequestOwner | undefined,
  actorId: string,
  actorEmployeeId?: string | null,
) {
  if (!owner) return false;

  if (owner.requesterUserId && owner.requesterUserId === actorId) return true;

  return Boolean(
    owner.subjectEmployeeId &&
      actorEmployeeId &&
      owner.subjectEmployeeId === actorEmployeeId,
  );
}

/**
 * ฝ่ายบุคคลอนุมัติคำขอของตัวเองได้
 *
 * กติกากันอนุมัติงานตัวเองมีไว้กันหัวหน้าที่ถูกผูกเป็นผู้อนุมัติสายงานตัวเอง
 * แต่กับเจ้าหน้าที่ HR มันกลายเป็นทางตัน — บริษัทที่มี HR คนเดียว ใบลาของ
 * HR คนนั้นจะค้างที่ขั้น HR ตลอดไปเพราะไม่มีใครอื่นกดได้นอกจากแอดมินระบบ
 * ซึ่งไม่ใช่คนที่ควรมายุ่งกับใบลา
 *
 * ยึดชุดบทบาทเดียวกับที่ใช้ตัดสินขั้น HR_ADMIN จะได้ไม่มีสองนิยามของคำว่า HR
 */
export function canApproveOwnRequest(actorRoleCodes: readonly string[]) {
  return normalize([...actorRoleCodes]).some((code) =>
    APPROVAL_HR_ROLE_CODES.includes(code),
  );
}

export function canActOnApprovalStep(params: {
  step: ApprovalStepAuthorizationInput;
  actorId: string;
  actorRoleCodes: string[];
  /** เจ้าของคำขอ — ส่งมาเพื่อเปิดการกันอนุมัติงานตัวเอง */
  owner?: ApprovalRequestOwner;
  /** employeeId ของผู้กด ใช้เทียบกับ subjectEmployeeId */
  actorEmployeeId?: string | null;
  /** userId ของผู้อนุมัติที่ผู้กดได้รับมอบอำนาจให้ทำแทน */
  delegatedFromUserIds?: readonly string[];
}): boolean {
  const { step, actorId } = params;
  const roleCodes = normalize(params.actorRoleCodes);

  /*
   * กันอนุมัติงานของตัวเอง — อยู่เหนือทุกเงื่อนไข รวมถึงทางลัดของแอดมิน
   * ยกเว้นฝ่ายบุคคล (ดูเหตุผลที่ canApproveOwnRequest)
   *
   * เดิมมีการกันเฉพาะโมดูลทำงานนอกสถานที่โมดูลเดียว ใบลา/OT/แก้เวลาจึงอนุมัติ
   * ของตัวเองได้ถ้าถูกผูกเป็นผู้อนุมัติ หรือถือบทบาทผู้บริหาร/แอดมิน
   * ซึ่งเป็นเรื่องปกติมากสำหรับหัวหน้าที่ก็เป็นลูกจ้างเหมือนกัน
   */
  if (
    isOwnRequest(params.owner, actorId, params.actorEmployeeId) &&
    !canApproveOwnRequest(roleCodes)
  ) {
    return false;
  }

  // ผู้อนุมัติที่ระบบผูกไว้ตอนสร้างขั้น
  if (step.expectedApproverId && step.expectedApproverId === actorId) {
    return true;
  }

  /*
   * ได้รับมอบอำนาจให้ทำแทนผู้อนุมัติตัวจริง
   *
   * อยู่ใต้การกันอนุมัติงานตัวเอง เพราะรับมอบอำนาจแล้วก็ยังอนุมัติใบของตัวเองไม่ได้
   * (เช่นหัวหน้ามอบอำนาจให้ลูกน้อง แล้วลูกน้องคนนั้นยื่นใบลาเอง)
   */
  if (
    step.expectedApproverId &&
    params.delegatedFromUserIds?.includes(step.expectedApproverId)
  ) {
    return true;
  }

  // แอดมินระบบปลดงานที่ค้างได้
  if (roleCodes.some((code) => APPROVAL_ADMIN_ROLE_CODES.includes(code))) {
    return true;
  }

  const approverType = String(step.approverType ?? '').toUpperCase();

  /*
   * ขั้นที่ระบุเป็น "กลุ่ม" ไม่ใช่ตัวบุคคล — ผู้อนุมัติที่ถูกผูกไว้เป็นเพียง
   * คนหนึ่งที่ระบบเลือกมาจากกลุ่มนั้น คนอื่นในกลุ่มเดียวกันจึงกดแทนได้
   * ต่างจากขั้น SUPERVISOR / EMPLOYEE / POSITION ที่เจาะจงตัวบุคคลจริง ๆ
   */
  if (approverType === 'HR_ADMIN' || isHrStep(step)) {
    if (roleCodes.some((code) => APPROVAL_HR_ROLE_CODES.includes(code))) {
      return true;
    }
  }

  if (approverType === 'EXECUTIVE') {
    if (roleCodes.some((code) => APPROVAL_EXECUTIVE_ROLE_CODES.includes(code))) {
      return true;
    }
  }

  if (step.roleCode && roleCodes.includes(String(step.roleCode).toUpperCase())) {
    return true;
  }

  return false;
}
