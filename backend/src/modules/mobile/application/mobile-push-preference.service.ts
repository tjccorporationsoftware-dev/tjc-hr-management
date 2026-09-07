import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database/prisma.service';

/**
 * หมวดของแจ้งเตือนที่ผู้ใช้เปิด/ปิดเข้ามือถือได้เอง
 *
 * แบ่งตาม **สิ่งที่ผู้ใช้ต้องทำต่อ** ไม่ใช่ตามชนิดของคำขอ — คนที่รำคาญ
 * แจ้งเตือนไม่ได้รำคาญ "ใบลา" แต่รำคาญ "ของที่ไม่ต้องทำอะไรต่อ" การแยกเป็น
 * ลา/OT/แก้เวลา/นอกสถานที่ จึงได้สวิตช์สี่ตัวที่คนกดพร้อมกันทั้งสี่ตัวเสมอ
 *
 * ปิดที่นี่คุมแค่ **push เข้าเครื่อง** — รายการแจ้งเตือนในแอปยังขึ้นครบเสมอ
 * ไม่งั้นผู้ใช้ที่ปิดไว้จะพลาดของที่ต้องอนุมัติโดยไม่มีร่องรอยเหลือให้ตามเลย
 */
export const MOBILE_PUSH_CATEGORIES = [
  'APPROVAL',
  'REQUEST',
  'ATTENDANCE',
  'PAYROLL',
  'TEAM',
  'OTHER',
] as const;

export type MobilePushCategory = (typeof MOBILE_PUSH_CATEGORIES)[number];

export const MOBILE_PUSH_CATEGORY_META: Record<
  MobilePushCategory,
  { description: string; label: string }
> = {
  APPROVAL: {
    description: 'คำขอของทีมเข้าคิวรอคุณอนุมัติ และใบที่ค้างในคิวนานเกินไป',
    label: 'งานที่รอฉันอนุมัติ',
  },
  ATTENDANCE: {
    description: 'เตือนตอนยังไม่ได้ลงเวลาเข้า และตอนยังไม่ได้ลงเวลาออก',
    label: 'เตือนลงเวลา',
  },
  OTHER: {
    description: 'ประกาศและเรื่องอื่นจากฝ่ายบุคคล',
    label: 'อื่น ๆ',
  },
  PAYROLL: {
    description: 'สลิปเงินเดือนงวดใหม่และเอกสารเรื่องเงิน',
    label: 'เงินเดือนและสลิป',
  },
  REQUEST: {
    description: 'คำขอที่คุณยื่นถูกอนุมัติ ไม่อนุมัติ หรือถูกส่งกลับ',
    label: 'ผลคำขอของฉัน',
  },
  TEAM: {
    description: 'ลูกทีมเริ่มลาพรุ่งนี้ และเรื่องของทีมที่ต้องรู้ล่วงหน้า',
    label: 'ทีมของฉัน',
  },
};

function isCategory(value: string): value is MobilePushCategory {
  return (MOBILE_PUSH_CATEGORIES as readonly string[]).includes(value);
}

/**
 * แปลงชนิดแจ้งเตือนของ core เป็นหมวดของมือถือ
 *
 * อ่านจาก `type` ก่อนเพราะมันบอกว่า "เกิดอะไรขึ้น" ซึ่งชี้ได้ว่าใครเป็นผู้รับ:
 * `*_PENDING_APPROVAL` วิ่งไปหาผู้อนุมัติ ส่วน `*_APPROVED` / `*_REJECTED` /
 * `*_RETURNED_FOR_REVIEW` วิ่งกลับไปหาคนยื่น — สองกลุ่มนี้ใช้ entityType
 * เดียวกันทั้งคู่ ถ้าดูแต่ entityType จะแยกไม่ออกและได้สวิตช์ที่ปิดผิดฝั่ง
 */
export function resolvePushCategory(
  type?: string | null,
  entityType?: string | null,
): MobilePushCategory {
  const kind = (type ?? '').toUpperCase();

  if (kind.endsWith('_PENDING_APPROVAL')) {
    return 'APPROVAL';
  }

  /*
   * งานสะกิดเรื่องคิวอนุมัติ — ไม่ได้ลงท้ายด้วย _PENDING_APPROVAL เพราะไม่ได้
   * ผูกกับใบใดใบหนึ่ง แต่เป็นเรื่องของคิวคนเดียวกัน ต้องอยู่สวิตช์เดียวกัน
   * ไม่งั้นคนที่ปิด "งานที่รอฉันอนุมัติ" ยังโดนสะกิดเรื่องคิวอยู่ดี
   */
  if (kind === 'APPROVAL_QUEUE_STALE') {
    return 'APPROVAL';
  }

  /* เรื่องเงิน — สลิปงวดใหม่และเอกสารภาษี ไม่ควรอยู่ถังเดียวกับ "อื่น ๆ" */
  if (kind.startsWith('PAYSLIP') || kind.startsWith('PAYROLL')) {
    return 'PAYROLL';
  }

  /* เรื่องของลูกทีม — คนที่ไม่มีลูกทีมไม่เคยได้รับ ปิดไว้ก็ไม่กระทบใคร */
  if (kind === 'LEAVE_STARTS_TOMORROW') {
    return 'TEAM';
  }

  if (
    kind.endsWith('_APPROVED') ||
    kind.endsWith('_REJECTED') ||
    kind.endsWith('_RETURNED_FOR_REVIEW')
  ) {
    return 'REQUEST';
  }

  if ((entityType ?? '').startsWith('Attendance')) {
    return 'ATTENDANCE';
  }

  return 'OTHER';
}

@Injectable()
export class MobilePushPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** คืนครบทุกหมวดเสมอ หมวดที่ผู้ใช้ยังไม่เคยแตะถือว่าเปิดอยู่ */
  async list(userId: string) {
    const rows = await this.prisma.mobilePushPreference.findMany({
      select: { category: true, enabled: true },
      where: { userId },
    });

    const disabled = new Set(
      rows.filter((row) => !row.enabled).map((row) => row.category),
    );

    return {
      items: MOBILE_PUSH_CATEGORIES.map((category) => ({
        category,
        description: MOBILE_PUSH_CATEGORY_META[category].description,
        enabled: !disabled.has(category),
        label: MOBILE_PUSH_CATEGORY_META[category].label,
      })),
    };
  }

  async update(userId: string, category: string, enabled: boolean) {
    if (!isCategory(category)) {
      throw new BadRequestException('ไม่รู้จักหมวดการแจ้งเตือนนี้');
    }

    await this.prisma.mobilePushPreference.upsert({
      create: { category, enabled, userId },
      update: { enabled },
      where: { userId_category: { category, userId } },
    });

    return this.list(userId);
  }

  /**
   * คัดผู้ใช้ที่ยังรับ push หมวดนี้อยู่
   *
   * ถามเฉพาะแถวที่ปิดไว้ (`enabled: false`) แล้วหักออกจากรายชื่อ — ทำกลับกัน
   * ไม่ได้เพราะคนส่วนใหญ่ไม่มีแถวเลย ถ้าเช็คว่า "มีแถวที่เปิดอยู่ไหม"
   * จะกลายเป็นไม่ส่งให้ใครเลยทั้งระบบ
   */
  async allowedUserIds(userIds: string[], category: MobilePushCategory) {
    if (userIds.length === 0) return [];

    const muted = await this.prisma.mobilePushPreference.findMany({
      select: { userId: true },
      where: { category, enabled: false, userId: { in: userIds } },
    });

    if (muted.length === 0) return userIds;

    const mutedIds = new Set(muted.map((row) => row.userId));

    return userIds.filter((userId) => !mutedIds.has(userId));
  }
}
