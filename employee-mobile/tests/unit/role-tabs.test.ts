import type { FeatureFlags } from '@/features/bootstrap/bootstrap.types';
import { resolveTabs } from '@/features/bootstrap/use-role-tabs';

/**
 * แท็บล่างต้องตรงกับสิทธิ์จริงเสมอ
 *
 * ผิดทางหนึ่ง = ผู้ใช้เห็นแท็บที่กดแล้วเจอ 403 (ดูเหมือนแอปพัง)
 * ผิดอีกทาง = หัวหน้าไม่เห็นกล่องอนุมัติ งานค้างโดยไม่มีใครรู้
 */
const BASE_FLAGS: FeatureFlags = {
  announcements: false,
  approvals: false,
  attendance: true,
  attendancePhotoRequired: false,
  attendancePunch: true,
  complaints: true,
  documents: true,
  executive: false,
  leave: true,
  offlinePunch: false,
  offsite: true,
  overtime: true,
  payslip: true,
  schedule: true,
  team: false,
  timeAdjust: true,
};

const tabsOf = (overrides: Partial<FeatureFlags>, pending = 0) =>
  resolveTabs({ ...BASE_FLAGS, ...overrides }, pending);

describe('resolveTabs · พนักงานทั่วไป', () => {
  it('เห็นห้าแท็บพื้นฐาน ไม่มีอนุมัติและภาพรวม', () => {
    expect(tabsOf({}).visible).toEqual([
      'today',
      'attendance',
      'requests',
      'wallet',
      'profile',
    ]);
  });

  it('ไม่มีสิทธิ์ดูสลิป ต้องไม่เห็นแท็บเงินเดือน', () => {
    expect(tabsOf({ payslip: false }).isVisible('wallet')).toBe(false);
  });

  it('ปิดคำขอทุกประเภท ต้องไม่เห็นแท็บคำขอ', () => {
    const tabs = tabsOf({
      leave: false,
      offsite: false,
      overtime: false,
      timeAdjust: false,
    });

    expect(tabs.isVisible('requests')).toBe(false);
  });

  it('เปิดคำขอไว้ประเภทเดียวก็ยังต้องเห็นแท็บคำขอ', () => {
    const tabs = tabsOf({
      leave: false,
      offsite: false,
      overtime: true,
      timeAdjust: false,
    });

    expect(tabs.isVisible('requests')).toBe(true);
  });

  /*
   * แท็บลงเวลาเป็นทางเดียวที่พนักงานดูเวลาเข้าออกของตัวเองได้ จึงต้องอยู่เสมอ
   * ส่วน "กดลงเวลาได้ไหม" เป็นเรื่องของ flags.attendancePunch ในจอนั้น
   */
  it('ปิดลงเวลาผ่านมือถือ ต้องยังเห็นแท็บลงเวลาไว้ดูประวัติ', () => {
    expect(
      tabsOf({ attendance: false, attendancePunch: false }).isVisible(
        'attendance',
      ),
    ).toBe(true);
  });
});

describe('resolveTabs · หัวหน้า', () => {
  it('เห็นแท็บอนุมัติ', () => {
    expect(tabsOf({ approvals: true }).isVisible('approvals')).toBe(true);
  });

  it('ส่งจำนวนงานค้างออกไปทำ badge', () => {
    expect(tabsOf({ approvals: true }, 7).pendingApprovals).toBe(7);
  });

  it('สิทธิ์ครบจนเกินห้าแท็บ ต้องตัดเหลือห้าและคง "ฉัน" ไว้ท้ายสุด', () => {
    const { visible } = tabsOf({ approvals: true, executive: true });

    expect(visible).toHaveLength(5);
    expect(visible.at(-1)).toBe('profile');
    expect(visible).toContain('approvals');
  });
});

describe('resolveTabs · ผู้บริหาร', () => {
  /*
   * ช่องลงเวลาของผู้บริหารคือจอ "ลา & โอที ทั้งบริษัทรายวัน" และเป็นทางเข้า
   * ทางเดียวของจอนั้น (เมนู /executive-attendance ยังปิดอยู่) ห้ามหลุด
   */
  it('ยังต้องมีช่องลงเวลาไว้เป็นจอ ลา/โอที รายวัน', () => {
    expect(tabsOf({ executive: true }).isVisible('attendance')).toBe(true);
  });

  /*
   * ภาพรวมบริษัทไม่ใช่แท็บของตัวเองอีกแล้ว — today.tsx สลับไปเรนเดอร์
   * ExecutiveHome เมื่อ flags.executive จอแรกที่ผู้บริหารเห็นจึงเป็นภาพรวมอยู่แล้ว
   *
   * บั๊กที่เคยเกิดจริงและเป็นที่มาของการยุบ: กฎเดิมให้ overview เป็นแท็บแยก
   * แต่บทบาท EXECUTIVE มี APPROVAL_ACCESS ติดมาด้วยเสมอ พอแท็บเต็มห้าช่อง
   * ภาพรวมจึงถูกดันตกไปอยู่ในเมนูเพิ่มเติมทุกครั้ง
   */
  it('ไม่มีแท็บภาพรวมแยกอีกแล้ว ไม่ว่าจะเป็นผู้อนุมัติด้วยหรือไม่', () => {
    expect(tabsOf({ executive: true }).isVisible('overview')).toBe(false);

    const both = tabsOf({ approvals: true, executive: true });

    expect([...both.visible, ...both.overflow]).not.toContain('overview');
  });

  it('หน้าหลักต้องอยู่บนแถบล่างเสมอ เพราะเป็นจอภาพรวมของผู้บริหาร', () => {
    const tabs = tabsOf({ approvals: true, executive: true });

    expect(tabs.visible).toContain('today');
  });
});

describe('resolveTabs · ของที่เกินห้าแท็บต้องไม่หายไปเฉย ๆ', () => {
  /*
   * บั๊กที่เคยเกิดจริงข้อสอง: ตัดส่วนเกินตามลำดับการแสดงผล ทำให้ผู้ที่เป็น
   * ทั้งหัวหน้าและผู้บริหารเสียแท็บ "เงินเดือน" ของตัวเองไปโดยไม่มีทางเข้าอื่น
   */
  it('ทุกอย่างที่มีสิทธิ์ต้องอยู่ใน visible หรือ overflow อย่างใดอย่างหนึ่ง', () => {
    const tabs = tabsOf({ approvals: true, executive: true });
    const reachable = [...tabs.visible, ...tabs.overflow];

    for (const tab of [
      'today',
      'attendance',
      'requests',
      'approvals',
      'wallet',
      'profile',
    ]) {
      expect(reachable).toContain(tab);
    }
  });

  it('visible กับ overflow ต้องไม่ซ้ำกัน', () => {
    const tabs = tabsOf({ approvals: true, executive: true });

    for (const tab of tabs.overflow) {
      expect(tabs.visible).not.toContain(tab);
    }
  });

  /* เรื่องเงินหาไม่เจอแล้วผู้ใช้โทรหา HR ทันที ต้องอยู่บนแถบล่างเสมอ */
  it('แท็บเงินเดือนต้องไม่ถูกตัดออกจากแถบล่าง แม้สิทธิ์จะครบทุกอย่าง', () => {
    const tabs = tabsOf({ approvals: true, executive: true });

    expect(tabs.visible).toContain('wallet');
  });

  it('งานที่มีคนรออยู่ต้องอยู่บนแถบล่างก่อนของส่วนตัวที่เปิดเป็นครั้งคราว', () => {
    const tabs = tabsOf({ approvals: true, executive: true });

    expect(tabs.visible).toContain('approvals');
    expect(tabs.overflow).toContain('requests');
  });

  it('พนักงานทั่วไปสิทธิ์ไม่เกินห้า ต้องไม่มีอะไรตกไป overflow', () => {
    expect(tabsOf({}).overflow).toEqual([]);
  });
});

describe('resolveTabs · ยังไม่รู้สิทธิ์', () => {
  /*
   * ระหว่างโหลดหรือโหลดพลาด ห้ามคืนแท็บว่าง เพราะแถบล่างจะหายทั้งแถบ
   * ผู้ใช้จะคิดว่าแอปค้าง
   */
  it('ยังไม่มีข้อมูล ต้องคืนชุดพื้นฐานที่ทุกคนมี', () => {
    const tabs = resolveTabs(null);

    expect(tabs.visible).toEqual(['today', 'profile']);
    expect(tabs.isVisible('wallet')).toBe(false);
    expect(tabs.pendingApprovals).toBe(0);
  });
});

describe('resolveTabs · ลำดับแท็บ', () => {
  /* ตำแหน่งต้องคงที่ ผู้ใช้จำตำแหน่งนิ้ว ไม่ได้อ่านป้ายทุกครั้ง */
  it('"หน้าหลัก" อยู่ซ้ายสุดและ "ฉัน" อยู่ขวาสุดเสมอ', () => {
    for (const overrides of [
      {},
      { approvals: true },
      { executive: true },
      { payslip: false },
      { approvals: true, executive: true },
    ]) {
      const { visible } = tabsOf(overrides);

      expect(visible[0]).toBe('today');
      expect(visible.at(-1)).toBe('profile');
    }
  });
});
