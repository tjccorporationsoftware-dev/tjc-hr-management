import { useMemo } from 'react';

import type { FeatureFlags } from './bootstrap.types';
import { useBootstrap } from './use-bootstrap';

/**
 * แท็บล่างเปลี่ยนตามบทบาท โดยอ่านจาก featureFlags ที่ backend ตัดสินให้
 *
 * ห้ามตัดสินจาก "ชื่อบทบาท" ในแอปเด็ดขาด เพราะสิทธิ์จริงอยู่ที่ permission
 * และ HR สลับสิทธิ์รายคนได้ตลอด — แอปที่เดาเองจะโชว์แท็บที่กดแล้ว 403
 */
export type TabName =
  | 'today'
  | 'attendance'
  | 'requests'
  | 'approvals'
  | 'wallet'
  | 'overview'
  | 'profile';

export interface TabVisibility {
  /** แท็บที่ขึ้นบนแถบล่าง เรียงตามลำดับที่จะแสดง */
  visible: TabName[];
  /**
   * ของที่ผู้ใช้มีสิทธิ์แต่แถบล่างไม่พอ — ต้องมีทางเข้าจากที่อื่นเสมอ
   * (หน้า "เพิ่มเติม" แสดงรายการนี้) ห้ามปล่อยให้หายเงียบ
   */
  overflow: TabName[];
  isVisible: (tab: TabName) => boolean;
  flags: FeatureFlags | null;
  /** จำนวนงานรออนุมัติ ใช้ขึ้น badge บนแท็บ */
  pendingApprovals: number;
}

/**
 * ลำดับการแสดงผลบนแถบล่าง — ตำแหน่งต้องคงที่
 * ผู้ใช้จำตำแหน่งนิ้ว ไม่ได้อ่านป้ายทุกครั้ง
 */
const ORDER: TabName[] = [
  'today',
  'attendance',
  'overview',
  'requests',
  'approvals',
  'wallet',
  'profile',
];

/**
 * ลำดับ "ใครได้อยู่บนแถบล่าง" เมื่อมีเกินห้า — คนละเรื่องกับลำดับการแสดงผล
 *
 * เคยใช้ลำดับการแสดงผลตัดของท้ายทิ้ง ซึ่งทำให้ผู้ที่เป็นทั้งหัวหน้าและผู้บริหาร
 * เสียแท็บเงินเดือนของตัวเองไปเงียบ ๆ — ของที่ผู้ใช้หาไม่เจอแย่กว่าของที่กดยาก
 *
 * เกณฑ์: ใช้บ่อยแค่ไหน และมีคนอื่นรออยู่ไหม
 *   - today/profile ต้องมีเสมอ (หน้าเพิ่มเติมเป็นทางเดียวไปออกจากระบบและเมนูที่เหลือ)
 *   - **attendance สูงเพราะปุ่มลงเวลาอยู่ในนั้น** เป็นสิ่งที่ทำทุกวัน
 *     ถ้าแท็บนี้หลุด พนักงานจะลงเวลาไม่ได้จากที่ไหนเลย
 *   - approvals มาก่อนของส่วนตัว เพราะมีคนรออนุมัติอยู่
 *   - wallet เรื่องเงิน ผู้ใช้หาไม่เจอแล้วโทรหา HR ทันที
 */
const PRIORITY: TabName[] = [
  'today',
  'profile',
  'attendance',
  'approvals',
  'wallet',
  'requests',
  'overview',
];

/** เพดานห้าแท็บ — เกินกว่านี้ป้ายจะถูกตัดจนอ่านไม่ออกบนจอแคบ */
const MAX_TABS = 5;

/**
 * ตรรกะล้วน แยกจาก hook เพื่อให้ทดสอบได้โดยไม่ต้อง render
 * (การตัดสินว่าใครเห็นเมนูอะไรคือของที่ต้องมีเทสคุม ไม่ใช่รายละเอียด UI)
 */
export function resolveTabs(
  flags: FeatureFlags | null,
  pendingApprovals = 0,
): TabVisibility {
  /*
   * ยังไม่รู้สิทธิ์ (กำลังโหลด/โหลดพลาด) ให้โชว์ชุดพื้นฐานที่ทุกคนมี
   * ดีกว่าจอเปล่าไม่มีแท็บเลย ซึ่งดูเหมือนแอปพัง
   */
  if (!flags) {
    const fallback: TabName[] = ['today', 'profile'];

    return {
      flags: null,
      isVisible: (tab) => fallback.includes(tab),
      overflow: [],
      pendingApprovals: 0,
      visible: fallback,
    };
  }

  const canRequest =
    flags.leave || flags.overtime || flags.timeAdjust || flags.offsite;

  const enabled: Record<TabName, boolean> = {
    approvals: flags.approvals,
    /*
     * พนักงานกับหัวหน้าเห็นแท็บนี้เสมอ ไม่ผูกกับสิทธิ์กดลงเวลา — จอนี้คือที่เดียว
     * ที่เขาดูเวลาเข้าออกของตัวเองได้ และ /attendance/history บังคับแค่ ESS_ACCESS
     * ส่วนปุ่มลงเวลาจะโผล่หรือไม่ attendance.tsx ตัดสินจาก flags.attendancePunch
     * (เดิมผูกแท็บกับ flags.attendance คนที่ HR ไม่ได้เปิดให้ลงเวลาผ่านแอป
     * จึงหาเวลาของตัวเองไม่เจอเลยทั้งแอป)
     *
     * ผู้บริหารก็ได้ช่องนี้ แต่เป็นคนละจอ — สำหรับเขาคือ "ลา & โอที ทั้งบริษัท
     * รายวัน" (attendance.tsx สลับเนื้อหาตาม flags.executive) และเป็นทางเข้า
     * ทางเดียวของจอนั้น เพราะเมนู /executive-attendance ยังปิดอยู่
     */
    attendance: true,
    /*
     * **แท็บภาพรวมถูกยุบเข้าไปเป็นหน้าหลักของผู้บริหารแล้ว** (today.tsx สลับ
     * ไปเรนเดอร์ ExecutiveHome เมื่อ flags.executive) จึงไม่ต้องมีแท็บซ้ำ
     *
     * เดิมแท็บนี้เปิดให้ผู้บริหาร แต่บทบาท EXECUTIVE มี APPROVAL_ACCESS
     * ติดมาด้วยเสมอ พอแท็บเต็มห้าช่อง ภาพรวมจึงถูกดันตกไปอยู่ในเมนูเพิ่มเติม
     * ทุกครั้ง — ของที่เขาเปิดแอปมาดูกลายเป็นของที่หายากที่สุดในแอป
     */
    overview: false,
    profile: true,
    requests: canRequest,
    today: true,
    wallet: flags.payslip,
  };

  const allowed = ORDER.filter((tab) => enabled[tab]);

  /* เลือกผู้รอดตามความสำคัญ แล้วค่อยเรียงกลับตามลำดับการแสดงผล */
  const kept = new Set(
    PRIORITY.filter((tab) => enabled[tab])
      .slice(0, MAX_TABS),
  );

  const visible = allowed.filter((tab) => kept.has(tab));
  const overflow = allowed.filter((tab) => !kept.has(tab));

  return {
    flags,
    isVisible: (tab) => kept.has(tab),
    overflow,
    pendingApprovals,
    visible,
  };
}

export function useRoleTabs(): TabVisibility {
  const { data } = useBootstrap();

  return useMemo(
    () =>
      resolveTabs(
        data?.featureFlags ?? null,
        data?.summary.pendingApprovals ?? data?.summary.pendingActions ?? 0,
      ),
    [data],
  );
}
