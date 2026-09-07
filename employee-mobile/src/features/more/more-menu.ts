import type { Href } from 'expo-router';

import type { IconName } from '@/design';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useRoleTabs, type TabName } from '@/features/bootstrap/use-role-tabs';

/**
 * รายการเมนู "เพิ่มเติม"
 *
 * แยกออกจากจอเพราะตอนนี้มีสองที่ที่ใช้ชุดเดียวกัน: แผงที่เลื่อนออกมาจากขวา
 * ตอนกดแท็บเพิ่มเติม กับตัวจอจริงที่ยังต้องมีไว้ให้ deep link เข้าถึงได้
 * ถ้าปล่อยให้แต่ละที่ประกอบเมนูเอง สองที่จะมีเมนูไม่เท่ากันทันทีที่เพิ่มของใหม่
 */

const OVERFLOW_META: Record<
  TabName,
  { href: Href; icon: IconName; label: string }
> = {
  approvals: { href: '/approvals', icon: 'check-square', label: 'รออนุมัติ' },
  attendance: { href: '/attendance', icon: 'clock', label: 'ประวัติเวลา' },
  overview: { href: '/overview', icon: 'bar-chart-2', label: 'ภาพรวมบริษัท' },
  profile: { href: '/profile', icon: 'more-horizontal', label: 'เพิ่มเติม' },
  requests: { href: '/requests', icon: 'file-text', label: 'คำขอของฉัน' },
  today: { href: '/today', icon: 'home', label: 'หน้าหลัก' },
  wallet: { href: '/wallet', icon: 'credit-card', label: 'เงินเดือน' },
};

/**
 * เมนูห้องผู้บริหารที่ยังไม่เปิดให้ใช้ — ปิดไว้ตามที่ลูกค้าขอ
 *
 * เวลาทำงานวันนี้ · สลิปเงินเดือนของฉัน · ผังองค์กร · รายงาน
 *
 * ปิดที่ธงตัวเดียว ไม่ได้ลบโค้ดทิ้ง เพราะทั้งสี่จอทำเสร็จและต่อ backend แล้ว
 * เปิดกลับเมื่อไรก็แค่กลับค่านี้เป็น `true`
 */
const EXECUTIVE_EXTRA_MENUS: boolean = false;

/**
 * เมนูของหัวหน้างานที่ยังไม่เปิดให้ใช้ — ปิดไว้ตามที่ลูกค้าขอ
 *
 * เวลาทำงานของทีม · ปฏิทินทีม
 *
 * "ทีมของฉัน" ยังเปิดอยู่ เพราะเป็นทางเข้าหลักของหัวหน้าไปดูลูกทีม
 * ปิดที่ธงตัวเดียวเหมือนฝั่งผู้บริหาร ไม่ได้ลบโค้ดทิ้ง
 */
const TEAM_EXTRA_MENUS: boolean = false;

/** กลุ่มของเมนู — ใช้จัดหัวข้อในแผง ไม่ใช่แค่เรียงต่อกันเป็นพืดเดียว */
export type MoreGroup = 'app' | 'exec' | 'me' | 'team';

export interface MoreItem {
  group: MoreGroup;
  href: Href;
  icon: IconName;
  /**
   * ยังทำไม่เสร็จ — โชว์ไว้แต่กดไม่ได้
   *
   * เลือกโชว์แบบจางแทนการซ่อนทิ้ง เพราะผู้ใช้ที่เคยเห็นเมนูแล้วหายไปจะคิดว่า
   * ตัวเองทำอะไรผิดหรือสิทธิ์ถูกถอด ส่วนคนที่ยังไม่เคยเห็นก็ได้รู้ว่ากำลังจะมี
   */
  soon?: boolean;
  subtitle?: string;
  title: string;
}

export function useMoreItems(): MoreItem[] {
  const { data } = useBootstrap();
  const tabs = useRoleTabs();

  const items: MoreItem[] = [
    {
      group: 'me',
      href: '/my-profile',
      icon: 'user',
      subtitle: 'ข้อมูลส่วนตัว ข้อมูลงาน และเอกสารพนักงาน',
      title: 'ข้อมูลพนักงาน',
    },
  ];

  /*
   * ไปจอประวัติของตัวเอง ไม่ใช่แท็บลงเวลา — แท็บนั้นเป็นที่สำหรับ "ทำ"
   * (ปุ่มลงเวลาอยู่บนสุด) ส่วนจอนี้เป็นที่สำหรับ "ตรวจ" ย้อนหลังอย่างเดียว
   */
  if (data?.featureFlags.attendance) {
    items.push({
      group: 'me',
      href: '/attendance-history',
      icon: 'clock',
      subtitle: 'เวลาเข้าออกย้อนหลังและสรุปรอบเงินเดือน',
      title: 'ประวัติลงเวลา',
    });
  }
  if (data?.featureFlags.schedule) {
    items.push({
      group: 'me',
      href: '/schedule',
      icon: 'calendar',
      subtitle: 'กะ วันหยุด และปฏิทินการทำงาน',
      soon: true,
      title: 'ตารางงานของฉัน',
    });
  }
  if (data?.featureFlags.documents) {
    items.push({
      group: 'me',
      href: '/documents',
      icon: 'file-text',
      subtitle: 'ยื่น ติดตาม และดาวน์โหลดเอกสาร',
      soon: true,
      title: 'คำร้องเอกสาร',
    });
  }
  if (data?.featureFlags.complaints) {
    items.push({
      group: 'me',
      href: '/complaints',
      icon: 'message-square',
      subtitle: 'ส่งเรื่องและติดตามการดำเนินการ',
      soon: true,
      title: 'เรื่องร้องเรียน',
    });
  }
  if (data?.featureFlags.payslip) {
    items.push({
      group: 'me',
      href: '/tax-certificate',
      icon: 'file',
      subtitle: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)',
      title: 'หนังสือรับรองภาษี',
    });
  }
  if (data?.featureFlags.team) {
    items.push({
      group: 'team',
      href: '/team',
      icon: 'users',
      subtitle: 'ดูสถานะและเวลาทำงานของลูกทีม',
      title: 'ทีมของฉัน',
    });
  }

  if (data?.featureFlags.team && TEAM_EXTRA_MENUS) {
    items.push({
      group: 'team',
      href: '/team-attendance',
      icon: 'watch',
      subtitle: 'เวลาเข้าออกของลูกทีมรายวัน',
      title: 'เวลาทำงานของทีม',
    });
    items.push({
      group: 'team',
      href: '/team-calendar',
      icon: 'calendar',
      subtitle: 'วันลาและวันหยุดของทีมทั้งเดือน',
      title: 'ปฏิทินทีม',
    });
  }

  /*
   * สามเมนูนี้อยู่ในรายการบนสุดร่วมกับเมนูของพนักงาน ไม่ได้แยกหัวข้อ
   * "ห้องผู้บริหาร" อีกแล้ว — ผู้บริหารที่เปิดแผงนี้เข้าสามจอนี้เป็นหลัก
   * การให้เลื่อนผ่านหัวข้อลงไปทุกครั้งคือระยะทางที่ไม่ได้แลกอะไรกลับมา
   */
  if (tabs.flags?.executive) {
    items.push({
      group: 'me',
      href: '/executive-insights',
      icon: 'trending-up',
      subtitle: 'ต้นทุนต่อหัว วินัย และเทียบงวดก่อน',
      title: 'ตัวชี้วัดบริหาร',
    });
    items.push({
      group: 'me',
      href: '/executive-manpower',
      icon: 'users',
      subtitle: 'แยกตามบริษัทในเครือ แผนก ตำแหน่ง',
      title: 'กำลังคน',
    });
    /* แท็บที่สี่เป็น "ต้นทุนรายวัน" ส่วนยอดรายเดือน/รายปีจากเครื่องคิดเงินเดือน
       ยังอยู่ที่นี่ — คนละคำถามกัน (จะจ่ายเท่าไร กับ จ่ายไปแล้วเท่าไร) */
    items.push({
      group: 'me',
      href: '/executive-payroll',
      icon: 'bar-chart-2',
      subtitle: 'ยอดจ่ายจริงรายเดือนและองค์ประกอบค่าแรง',
      title: 'ค่าจ้างองค์กร',
    });
  }

  if (tabs.flags?.executive && EXECUTIVE_EXTRA_MENUS) {
    items.push({
      group: 'exec',
      href: '/executive-attendance',
      icon: 'clock',
      subtitle: 'ใครมา ใครลา ใครขาด รายคน',
      title: 'เวลาทำงานวันนี้',
    });
    items.push({
      group: 'exec',
      href: '/my-payslips',
      icon: 'credit-card',
      subtitle: 'สรุปและสลิปย้อนหลังของบัญชีนี้',
      title: 'สลิปเงินเดือนของฉัน',
    });
    items.push({
      group: 'exec',
      href: '/executive-organization',
      icon: 'git-branch',
      subtitle: 'โครงสร้างและกำลังคนแต่ละหน่วย',
      title: 'ผังองค์กร',
    });
    items.push({
      group: 'exec',
      href: '/executive-reports',
      icon: 'file-text',
      subtitle: 'ขอไฟล์รายงานและติดตามสถานะ',
      title: 'รายงาน',
    });
  }

  const takenHrefs = new Set(items.map((item) => String(item.href)));

  tabs.overflow.forEach((tab) => {
    const meta = OVERFLOW_META[tab];

    /* แท็บที่ตกมา overflow อาจมีแถวของตัวเองอยู่แล้ว (เช่นประวัติลงเวลา) */
    if (takenHrefs.has(String(meta.href))) return;

    items.push({
      group: 'me',
      href: meta.href,
      icon: meta.icon,
      title: meta.label,
    });
  });

  /*
   * ไม่มีแถว "การแจ้งเตือน" ที่นี่ — เข้าได้จากกระดิ่งบนหน้าหลักซึ่งมีจุดแดง
   * บอกจำนวนที่ยังไม่อ่านอยู่แล้ว ส่วนการตั้งค่าว่าจะให้เด้งเรื่องไหนอยู่ใน
   * หน้าตั้งค่าแอป การมีทางเข้าที่สามตรงนี้ทำให้ผู้ใช้ต้องเดาว่าต่างกันยังไง
   */
  items.push({
    group: 'app',
      href: '/settings',
    icon: 'settings',
    subtitle: 'ความปลอดภัย แจ้งเตือน และธีม',
    title: 'ตั้งค่าแอป',
  });

  /*
   * เมนูที่ยังทำไม่เสร็จ (`soon`) ไม่ต้องขึ้นในแผงเลย
   *
   * เดิมโชว์เป็นแถวจาง ๆ ติดป้าย "เร็ว ๆ นี้" ไว้ท้ายรายการ ซึ่งกินความสูงของ
   * แผงที่ต้องเลื่อนอยู่แล้วสามแถว โดยที่กดอะไรไม่ได้สักแถว — คำสัญญาว่าจะมี
   * ของในอนาคตไม่ใช่หน้าที่ของเมนู
   *
   * ยังเก็บนิยามของทั้งสามเมนูไว้ในไฟล์นี้ พร้อมธง `soon` เดิม พอหน้าไหน
   * ทำเสร็จก็ลบธงออกแล้วมันจะโผล่ขึ้นมาเองตามลำดับที่วางไว้
   */
  return items.filter((item) => item.soon !== true);
}

/** ชื่อหัวข้อของแต่ละกลุ่ม — เรียงตามลำดับที่ต้องการให้ขึ้นในแผง */
const GROUP_ORDER: { group: MoreGroup; title: string }[] = [
  { group: 'me', title: 'ของฉัน' },
  { group: 'team', title: 'ทีมของฉัน' },
  { group: 'exec', title: 'ห้องผู้บริหาร' },
  { group: 'app', title: 'ตั้งค่า' },
];

export interface MoreSection {
  items: MoreItem[];
  title: string;
}

/**
 * เมนูที่จัดเป็นหมวดแล้ว — สิบกว่าแถวเรียงต่อกันเป็นพืดเดียวหาของไม่เจอ
 *
 * หมวดที่ไม่มีเมนูเลย (เช่นห้องผู้บริหารของพนักงานทั่วไป) จะไม่ขึ้นหัวข้อ
 * เปล่า ๆ ทิ้งไว้
 */
export function useMoreSections(): MoreSection[] {
  const items = useMoreItems();

  return GROUP_ORDER.map(({ group, title }) => ({
    items: items.filter((item) => item.group === group),
    title,
  })).filter((section) => section.items.length > 0);
}
