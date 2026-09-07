import { toThaiDateOnly } from '../../../common/utils/thai-date.util';

/**
 * การมอบอำนาจอนุมัติแทน
 * -----------------------------------------------------------------------------
 * เดิมระบบไม่มีทางออกเลยเมื่อผู้อนุมัติลาพักร้อนหรือลาป่วยยาว
 * ใบลา/OT/คำขอแก้เวลาของทั้งทีมจะค้างจนกว่าเจ้าตัวจะกลับมา
 * ทางเดียวคือให้ SYSTEM_ADMIN กดข้ามให้ ซึ่งไม่มีร่องรอยว่ากดแทนใคร
 *
 * ตัวช่วยชุดนี้แปลง "ใบมอบอำนาจที่ยังมีผลวันนี้" เป็นรายชื่อ userId ที่ผู้กด
 * ทำแทนได้ แล้วส่งเข้า canActOnApprovalStep เป็นตัวเทียบเพิ่มอีกชุดหนึ่ง
 */

/** เฉพาะเมธอดที่ต้องใช้ รับได้ทั้ง PrismaService และ TransactionClient */
type DelegationClient = {
  approvalDelegation: {
    findMany(args: any): Promise<any[]>;
  };
};

export type ActiveDelegation = {
  id: string;
  delegatorUserId: string;
  delegatorName: string | null;
};

/**
 * รายชื่อผู้มอบอำนาจที่ผู้กดคนนี้ทำแทนได้ ณ วันที่กำหนด
 *
 * @param targetType ประเภทรายการที่กำลังกด ใช้กรองใบที่จำกัดประเภทไว้
 * @param on         วันที่อ้างอิง ปกติคือวันนี้ (ตัดวันตามเวลาไทย)
 */
export async function loadActiveDelegations(
  db: DelegationClient,
  actorId: string,
  targetType: string,
  on: Date = new Date(),
): Promise<ActiveDelegation[]> {
  const today = toThaiDateOnly(on);

  const rows = await db.approvalDelegation.findMany({
    where: {
      delegateUserId: actorId,
      deletedAt: null,
      revokedAt: null,
      status: 'ACTIVE',
      // นับรวมวันเริ่มและวันสิ้นสุด
      startDate: { lte: today },
      endDate: { gte: today },
      /*
       * targetTypes ว่าง = มอบอำนาจทุกประเภท
       * Prisma แปลง isEmpty เป็น cardinality(...) = 0 บน Postgres
       */
      OR: [{ targetTypes: { isEmpty: true } }, { targetTypes: { has: targetType } }],
    },
    select: {
      id: true,
      delegatorUserId: true,
      delegator: { select: { displayName: true, email: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    delegatorUserId: row.delegatorUserId,
    delegatorName: row.delegator?.displayName || row.delegator?.email || null,
  }));
}

/** userId ทั้งหมดที่ผู้กดทำแทนได้ ใช้ส่งเข้า canActOnApprovalStep */
export function delegatedUserIds(delegations: ActiveDelegation[]) {
  return delegations.map((item) => item.delegatorUserId);
}

/**
 * หาใบมอบอำนาจที่ทำให้ผู้กดคนนี้กดขั้นนี้ได้ (ถ้ามี)
 *
 * ใช้เขียนลงบันทึกการอนุมัติว่า "อนุมัติแทนใคร ด้วยใบไหน"
 * ซึ่งเป็นส่วนที่ทางออกเดิม (SYSTEM_ADMIN กดข้าม) ไม่มีเลย
 */
export function findDelegationForStep(
  delegations: ActiveDelegation[],
  expectedApproverId: string | null | undefined,
) {
  if (!expectedApproverId) return null;

  return (
    delegations.find((item) => item.delegatorUserId === expectedApproverId) ??
    null
  );
}

/** ข้อความต่อท้ายบันทึกการอนุมัติ เพื่อให้ตรวจย้อนหลังได้ว่าใครกดแทนใคร */
export function buildDelegationNote(delegation: ActiveDelegation | null) {
  if (!delegation) return null;

  return `ดำเนินการแทน ${delegation.delegatorName ?? delegation.delegatorUserId} ตามใบมอบอำนาจ ${delegation.id}`;
}
