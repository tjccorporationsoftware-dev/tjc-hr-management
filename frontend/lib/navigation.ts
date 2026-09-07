import type { ComponentType } from "react";
import {
  canAccessPermissionRequirement,
  findRoutePermissionRequirement,
  type PermissionMode,
} from "@/lib/route-permissions";
import type { AuthUser } from "@/types/auth";
import {
  Activity,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  FileBarChart2,
  FileText,
  Fingerprint,
  Gauge,
  ArrowRightLeft,
  LogOut,
  ReceiptText,
  Settings,
  Settings2,
  UserPlus,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";

export type NavigationItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  permissions?: string[];
  permissionMode?: PermissionMode;
  roles?: string[];
  roleMode?: PermissionMode;
  badge?: string;
  description?: string;
  children?: NavigationItem[];
};

export type NavigationGroup = {
  title: string;
  description?: string;
  icon: ComponentType<{ className?: string }>;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    title: "พนักงาน",
    description: "Employee Self-Service",
    icon: UserRoundCheck,
    // ยุบจาก 11 เมนูเหลือ 4 — หน้าเดิมยัง redirect เข้าแท็บที่ถูกต้องอยู่
    items: [
      {
        title: "หน้าหลักพนักงาน",
        href: "/ess",
        icon: UserRoundCheck,
        permissions: ["ESS_ACCESS"],
      },
      {
        title: "ลงเวลา",
        href: "/ess/check-in",
        icon: Fingerprint,
        permissions: ["ATTENDANCE_CHECKIN", "ESS_ACCESS"],
        description: "ลงเวลาวันนี้และประวัติการลงเวลาของฉัน",
      },
      {
        title: "คำขอของฉัน",
        href: "/ess/requests",
        icon: FileText,
        permissions: ["ESS_ACCESS"],
        description: "ใบลา OT แก้เวลา และเอกสาร รวมอยู่ที่เดียว",
      },
      {
        title: "ข้อมูลของฉัน",
        href: "/ess/my-profile",
        icon: BadgeCheck,
        permissions: ["ESS_ACCESS"],
        description: "แฟ้มข้อมูลพนักงาน สลิปเงินเดือน และความปลอดภัยบัญชี",
      },
    ],
  },

  {
    title: "หัวหน้างาน",
    description: "Manager",
    icon: BadgeCheck,
    items: [
      /*
       * เดิมมี 8 เมนู: หน้าหลัก + ทีม + เวลาทำงาน + ลา + OT + นอกสถานที่ +
       * แก้เวลา + อนุมัติ
       *   - สี่หน้าคำขอรายประเภททำงานซ้ำกับ "ศูนย์คำขอ" (ดูรายการ + กดอนุมัติ)
       *   - หน้าหลัก/ทีม/เวลาทำงาน อ่านข้อมูลชุดเดียวกันคือ "ทีมของฉัน"
       * จึงเหลือ 2 เมนู: ดูทีม (3 แท็บ) กับ กดอนุมัติ
       */
      {
        title: "ทีมของฉัน",
        href: "/manager/team",
        icon: Users,
        permissions: ["TEAM_VIEW"],
        description: "ภาพรวมวันนี้ รายชื่อลูกทีม และเวลาเข้า-ออก",
        badge: "ใช้ได้",
      },
      /*
       * คนละหน้ากับ "ศูนย์คำขอ" ของ HR — ของหัวหน้ามองเฉพาะลูกทีมตัวเอง
       * ไม่มีตัวกรองสาขา/แผนก และไม่เห็นคำขอของแผนกอื่น
       */
      {
        title: "คำขอของทีม",
        href: "/manager/requests",
        icon: BadgeCheck,
        permissions: ["TEAM_VIEW"],
        description: "อนุมัติคำขอที่รอคุณ และประวัติของลูกทีม",
        badge: "ใช้ได้",
      },
    ],
  },

  /*
   * ข้อมูลกลาง — ของที่หลายฝ่ายต้องใช้จริง ไม่ใช่ของ HR ฝ่ายเดียว
   * ฝ่ายเงินเดือนต้องเปิดทะเบียนพนักงานเพื่อทำไฟล์โอนเงิน
   * หัวหน้างานต้องเปิดโปรไฟล์ลูกทีม ผู้บริหารต้องดูโครงสร้างองค์กร
   * แยกออกมาเป็นกลุ่มของตัวเอง จะได้ไม่ต้องพาคนเหล่านี้เข้าไปยืนในกลุ่ม "งาน HR"
   * ทั้งกลุ่มเพียงเพื่อเปิดสองหน้านี้
   */
  {
    title: "ข้อมูลกลาง",
    description: "Master Data",
    icon: Building2,
    items: [
      {
        /*
         * หน้าทะเบียนเต็มเป็นของ HR กับฝ่ายเงินเดือน
         * หัวหน้างานมี EMPLOYEE_READ ไว้เปิดโปรไฟล์ลูกทีมจากหน้า "ทีมของฉัน"
         * ไม่ได้มีไว้เปิดทะเบียนทั้งสาขา จึงไม่ควรเห็นเมนูนี้
         */
        title: "พนักงาน",
        href: "/employees",
        icon: BriefcaseBusiness,
        permissions: ["HR_WORKSPACE", "PAYROLL_WORKSPACE"],
        permissionMode: "any",
        description: "ทะเบียนพนักงาน (เลขบัตร/เลขบัญชีเปิดให้เฉพาะผู้มีสิทธิ์ข้อมูลอ่อนไหว)",
      },
      {
        /*
         * หน้านี้เป็นหน้า "ตั้งค่า" โครงสร้าง ไม่ใช่หน้าดูผัง
         * ผู้บริหารที่ถือ ORG_READ เคยเห็นเมนูนี้แล้วเปิดเข้าไปเจอ 403 กับผังว่างเปล่า
         * เพราะข้างในประกอบผังจาก /employees ที่ต้องมี EMPLOYEE_READ
         * ของผู้บริหารย้ายไปเป็นแท็บ "ผังองค์กร" ในห้องผู้บริหารแทน
         *
         * ฝ่ายเงินเดือนก็ไม่ต้องเห็น — การตั้งแผนก/ตำแหน่ง/ประเภทพนักงานเป็นงาน HR
         * แต่ยังต้องถือ ORG_READ ไว้ เพราะศูนย์รายงานดึงรายชื่อแผนกมาเป็นตัวกรอง
         */
        title: "โครงสร้างองค์กร",
        href: "/organization",
        icon: Building2,
        permissions: ["HR_WORKSPACE"],
        description: "แผนก / ฝ่าย / ตำแหน่ง / ประเภทพนักงาน / อัตรากำลัง",
      },
    ],
  },

  /*
   * งาน HR — ทุกหน้าในกลุ่มนี้ต้องมี HR_WORKSPACE ควบกับสิทธิ์ของหน้านั้น
   * ทั้งกลุ่มมองข้อมูลระดับองค์กร/สาขา ไม่ใช่ระดับทีม จึงไม่ควรเปิดให้บทบาทอื่น
   * ที่บังเอิญถือสิทธิ์อ่านตัวเดียวกันไว้ใช้กับลูกทีมตัวเอง
   */
  {
    title: "งาน HR",
    description: "Human Resources",
    icon: BriefcaseBusiness,
    items: [
      {
        title: "Dashboard HR",
        href: "/hr/dashboard",
        icon: Gauge,
        permissions: ["HR_WORKSPACE"],
        badge: "ใช้ได้",
      },
      {
        title: "ศูนย์คำขอ",
        href: "/approvals",
        icon: BadgeCheck,
        permissions: ["HR_WORKSPACE", "APPROVAL_ACCESS"],
        permissionMode: "all",
        description:
          "อนุมัติคำขอลา OT ขอแก้เวลา นอกสถานที่ และเอกสาร พร้อมย้อนดูประวัติคำขอทั้งองค์กร",
        badge: "ใช้ได้",
      },
      {
        title: "ตรวจเวลาทำงานรายวัน",
        href: "/attendance",
        icon: Clock3,
        permissions: ["HR_WORKSPACE", "ATTENDANCE_READ_ALL"],
        permissionMode: "all",
      },
      {
        /*
         * อยู่ต่อจาก "ตรวจเวลาทำงานรายวัน" เพราะเป็นต้นทางของหน้านั้นโดยตรง
         * ถ้าไม่ลงเวรหยุดไว้ วันที่คนหมุนเวรหยุดจะถูกนับเป็นขาดงานแล้วหักเงิน
         *
         * คุมด้วย ORG_MANAGE เพราะ API วันหยุดทั้งกอง (settings/system) บังคับสิทธิ์นี้
         * ตั้งแต่ตอนอ่าน ถ้าใส่แค่ HR_WORKSPACE จะเห็นเมนูแล้วเปิดเข้าไปเจอ 403
         */
        title: "เวรหยุดรายคน",
        href: "/day-off-roster",
        icon: CalendarRange,
        permissions: ["HR_WORKSPACE", "ORG_MANAGE"],
        permissionMode: "all",
        description:
          "ย้ายวันหยุดของทีมที่หมุนเวรกันเอง เช่น จัดส่งที่มาทำงานวันอาทิตย์แล้วไปหยุดวันธรรมดาแทน",
        badge: "ใหม่",
      },
      {
        title: "ตรวจสอบก่อนเข้าเงินเดือน",
        href: "/hr-review",
        icon: ClipboardCheck,
        permissions: ["HR_WORKSPACE", "ATTENDANCE_READ_ALL"],
        permissionMode: "all",
        description: "HR Review / Payroll Handoff",
      },
      {
        /*
         * แยกจากหน้า "ตั้งค่า > นโยบายการทำงาน > การลา" โดยตั้งใจ
         * หน้านั้นตั้งกติกาว่าแต่ละประเภทลาให้กี่วัน หน้านี้ดูผลจริงรายคน
         * และปรับเพิ่ม/ลดเป็นรายบุคคล ซึ่งเป็นงานประจำของ HR ไม่ใช่งานตั้งค่า
         */
        title: "สิทธิ์วันลาพนักงาน",
        href: "/leave-quota",
        icon: CalendarCheck,
        permissions: ["HR_WORKSPACE", "LEAVE_QUOTA_MANAGE"],
        permissionMode: "all",
        description:
          "ดูวันลาคงเหลือรายคน ปรับเพิ่ม/ลดรายบุคคล และสร้างยอดจากนโยบาย",
        badge: "ใหม่",
      },
      {
        title: "ศูนย์บริการพนักงาน",
        href: "/documents",
        icon: FileText,
        permissions: ["HR_WORKSPACE", "DOCUMENT_READ"],
        permissionMode: "all",
        description: "รับคำขอเอกสาร อนุมัติ ออก PDF และรับ-ติดตามเรื่องร้องเรียน",
      },
      {
        title: "รับพนักงานใหม่",
        href: "/onboarding",
        icon: UserPlus,
        permissions: ["HR_WORKSPACE", "ONBOARDING_READ"],
        permissionMode: "all",
        description:
          "สรรหาบุคลากร (ประกาศรับสมัคร ผู้สมัคร สัมภาษณ์ เสนอจ้าง) ต่อด้วยเช็กลิสต์ต้อนรับ งานที่ต้องทำ เอกสาร และทดลองงาน",
        badge: "ใช้ได้",
      },
      {
        /*
         * อยู่ก่อน "พนักงานออกจากงาน" เพราะเป็นเรื่องของคนที่ยังอยู่
         * เรียงตามช่วงชีวิตของพนักงาน: เข้า -> ย้าย/เลื่อน -> ออก
         */
        title: "โยกย้าย/ปรับตำแหน่ง",
        href: "/hr/transfers",
        icon: ArrowRightLeft,
        permissions: ["HR_WORKSPACE", "EMPLOYEE_UPDATE"],
        permissionMode: "all",
        description:
          "ออกคำสั่งย้ายสาขา/แผนก และเลื่อนตำแหน่งล่วงหน้า ระบบอัปเดตทะเบียนให้เองเมื่อถึงวันมีผล",
        badge: "ใหม่",
      },
      {
        title: "พนักงานออกจากงาน",
        href: "/offboarding",
        icon: LogOut,
        permissions: ["HR_WORKSPACE", "OFFBOARDING_READ"],
        permissionMode: "all",
        badge: "ใหม่",
      },
      {
        title: "ประเมินผล",
        href: "/performance",
        icon: ClipboardCheck,
        permissions: ["HR_WORKSPACE", "PERFORMANCE_READ"],
        permissionMode: "all",
      },
      // "ศูนย์รายงาน" เคยอยู่ทั้งกลุ่มนี้และกลุ่ม "รายงานและผู้บริหาร"
      // เหลือไว้ที่กลุ่มรายงานที่เดียว จะได้ไม่มีเมนูซ้ำสองที่
    ],
  },

  {
    title: "เงินเดือน",
    description: "Payroll",
    icon: WalletCards,
    items: [
      /*
       * PAYROLL_WORKSPACE คุมทั้งกลุ่ม
       * ผู้บริหารถือ PAYROLL_READ ไว้ดูสรุปค่าจ้างในห้องผู้บริหาร ไม่ได้มาทำรอบจ่าย
       * ถ้าใช้ PAYROLL_READ เป็นด่าน ผู้บริหารจะเห็นหน้าปฏิบัติการของฝ่ายเงินเดือนไปด้วย
       */
      {
        title: "รอบจ่ายเงินเดือน",
        href: "/payroll",
        icon: WalletCards,
        permissions: ["PAYROLL_WORKSPACE", "PAYROLL_READ"],
        permissionMode: "all",
        badge: "ใช้ได้",
      },
      {
        title: "ค่าจ้างพนักงาน",
        href: "/payroll/employees",
        icon: ReceiptText,
        permissions: ["PAYROLL_WORKSPACE", "PAYROLL_COMPENSATION_READ"],
        permissionMode: "all",
        badge: "ใช้ได้",
      },
      /*
       * ภาษีหัก ณ ที่จ่ายของคนนอก (ภ.ง.ด.3) อยู่กลุ่มเงินเดือนเพราะทีมบัญชี-เงินเดือน
       * เป็นคนทำ ถึงตัวข้อมูลจะไม่ใช่ลูกจ้างก็ตาม
       */
      {
        title: "หัก ณ ที่จ่าย",
        href: "/payroll/withholding",
        icon: ReceiptText,
        permissions: ["PAYROLL_WORKSPACE", "PAYROLL_READ"],
        permissionMode: "all",
        badge: "ใช้ได้",
      },
      {
        title: "ตั้งค่าเงินเดือน",
        href: "/payroll/settings",
        icon: Settings2,
        permissions: ["PAYROLL_WORKSPACE", "PAYROLL_MANAGE"],
        permissionMode: "all",
        badge: "ใช้ได้",
      },
    ],
  },

  /*
   * เดิมสองเมนูนี้อยู่กลุ่มเดียวกันชื่อ "รายงานและผู้บริหาร"
   * แต่คนที่ควรเห็นคนละกลุ่มกัน — HR/บัญชีต้องใช้ศูนย์รายงานเป็นงานประจำ
   * ส่วนห้องผู้บริหารเป็นพื้นที่ของผู้บริหาร แยกกลุ่มแล้วหัวข้อบนเมนู
   * จะตรงกับสิ่งที่ผู้ใช้แต่ละคนเห็นจริง ไม่ใช่กลุ่มที่มีของอยู่รายการเดียว
   */
  {
    title: "รายงาน",
    description: "Reports",
    icon: FileBarChart2,
    items: [
      {
        title: "ศูนย์รายงาน",
        href: "/reports",
        icon: FileBarChart2,
        permissions: ["REPORT_VIEW"],
        badge: "ใช้ได้",
      },
    ],
  },

  {
    title: "ผู้บริหาร",
    description: "Executive",
    icon: Gauge,
    items: [
      {
        // ยุบมาจาก Executive Dashboard / Manpower Insight / Payroll Summary
        // ทั้งสามเป็นแท็บอยู่ในหน้านี้แล้ว ส่วน Executive Reports ไปรวมกับศูนย์รายงาน
        title: "ห้องผู้บริหาร",
        href: "/executive",
        icon: Gauge,
        permissions: ["EXECUTIVE_VIEW"],
        badge: "ใช้ได้",
      },
    ],
  },

  {
    title: "ผู้ดูแลระบบ",
    description: "Administration",
    icon: Settings,
    // ยุบจาก 12 หน้าเหลือ 5 หน้า — หน้าเดิมยัง redirect เข้าแท็บที่ถูกต้องอยู่
    items: [
      {
        title: "ผู้ใช้และสิทธิ์",
        href: "/users",
        icon: Users,
        permissions: ["USER_MANAGE", "ORG_MANAGE"],
        permissionMode: "any",
        description: "บัญชีผู้ใช้ โรล และสิทธิ์การเข้าถึง",
      },
      {
        title: "นโยบายการทำงาน",
        href: "/settings/work-policies",
        icon: CalendarClock,
        permissions: ["ATTENDANCE_POLICY_READ", "LEAVE_READ", "OT_READ"],
        permissionMode: "any",
        description: "เวลางาน การลา OT ปฏิทินวันหยุด และสายอนุมัติ",
      },
      {
        title: "การลงเวลา",
        href: "/settings/attendance",
        icon: Fingerprint,
        permissions: ["ATTENDANCE_READ", "ATTENDANCE_EDIT"],
        permissionMode: "any",
        description: "เครื่องสแกน จุดลงเวลา GPS และวิธีลงเวลารายพนักงาน",
      },
      {
        title: "ตั้งค่าระบบ",
        href: "/settings/system",
        icon: Settings,
        permissions: ["ORG_MANAGE"],
        description: "ค่าทั่วไป ความปลอดภัย และแม่แบบเอกสาร",
      },
      {
        title: "ระบบและบันทึก",
        href: "/settings/monitoring",
        icon: Activity,
        permissions: ["ORG_MANAGE"],
        description: "สถานะระบบ ประวัติการใช้งาน และถังขยะ",
      },
    ],
  },
];

function flattenNavigationItems(items: NavigationItem[]): NavigationItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.children ? flattenNavigationItems(item.children) : []),
  ]);
}

export const navigationItems: NavigationItem[] = navigationGroups.flatMap(
  (group) => flattenNavigationItems(group.items),
);

type NavigationUser =
  | Pick<AuthUser, "permissions" | "roles" | "scope">
  | null
  | undefined;

function getUserPermissions(user: NavigationUser) {
  return user?.permissions ?? [];
}

function getUserRoles(user: NavigationUser) {
  return user?.roles ?? [];
}

export function canShowMenu(
  userPermissions: string[] = [],
  requiredPermissions?: string[],
  permissionMode: PermissionMode = "any",
  userRoles: string[] = [],
  requiredRoles?: string[],
  roleMode: PermissionMode = "any",
) {
  return canAccessPermissionRequirement(
    userPermissions,
    {
      permissions: requiredPermissions ?? [],
      mode: permissionMode,
      roles: requiredRoles,
      roleMode,
    },
    userRoles,
  );
}

function getNavigationItemRequirement(item: NavigationItem) {
  const routeRequirement = findRoutePermissionRequirement(item.href);

  if (!routeRequirement) {
    return {
      permissions: item.permissions ?? [],
      mode: item.permissionMode ?? "any",
      roles: item.roles,
      roleMode: item.roleMode ?? "any",
    };
  }

  return {
    ...routeRequirement,
    roles: item.roles ?? routeRequirement.roles,
    roleMode: item.roleMode ?? routeRequirement.roleMode,
  };
}

export function canShowNavigationItem(
  user: NavigationUser,
  item: NavigationItem,
) {
  return canAccessPermissionRequirement(
    getUserPermissions(user),
    getNavigationItemRequirement(item),
    getUserRoles(user),
    user?.scope?.level ?? null,
  );
}

function getVisibleNavigationItems(
  user: NavigationUser,
  items: NavigationItem[],
): NavigationItem[] {
  return items
    .map((item): NavigationItem | null => {
      const visibleChildren = item.children
        ? getVisibleNavigationItems(user, item.children)
        : undefined;
      const visibleSelf = canShowNavigationItem(user, item);

      if (!visibleSelf && (!visibleChildren || visibleChildren.length === 0)) {
        return null;
      }

      return {
        ...item,
        children: visibleChildren,
      };
    })
    .filter((item): item is NavigationItem => item !== null);
}

export function getVisibleNavigationGroups(user: NavigationUser) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: getVisibleNavigationItems(user, group.items),
    }))
    .filter((group) => group.items.length > 0);
}

export function normalizePath(path: string) {
  if (!path) return "/";

  const pathOnly = path.split("?")[0]?.split("#")[0] || "/";

  if (pathOnly !== "/" && pathOnly.endsWith("/")) {
    return pathOnly.slice(0, -1);
  }

  return pathOnly;
}

export function isMenuMatch(pathname: string, href: string) {
  const currentPath = normalizePath(pathname);
  const menuHref = normalizePath(href);

  if (menuHref === "/") {
    return currentPath === "/";
  }

  return currentPath === menuHref || currentPath.startsWith(`${menuHref}/`);
}

export function getActiveNavigationItem(
  pathname: string,
  user: NavigationUser,
) {
  const visibleItems = getVisibleNavigationGroups(user).flatMap((group) =>
    flattenNavigationItems(group.items),
  );

  return (
    visibleItems
      .filter((item) => isMenuMatch(pathname, item.href))
      .sort(
        (a, b) => normalizePath(b.href).length - normalizePath(a.href).length,
      )[0] ?? null
  );
}

export function getActiveNavigationGroup(
  pathname: string,
  user: NavigationUser,
) {
  const groups = getVisibleNavigationGroups(user);

  return (
    groups.find((group) =>
      group.items.some((item) => isMenuMatch(pathname, item.href)),
    ) ?? null
  );
}
