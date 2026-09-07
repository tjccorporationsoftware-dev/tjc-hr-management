import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, type ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Skeleton, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  resolveTodayStamps,
  formatShortDate,
  monthOf,
  todayKey,
} from '@/features/attendance/calendar';
import { useAttendanceHistory } from '@/features/attendance/use-attendance-history';
import { usePunchQueue } from '@/features/attendance/use-punch-queue';
import { useAuthStore } from '@/features/auth/auth.store';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { AURORA, Reveal, SectionAction } from '@/design/aurora';
import { ExecutiveHome } from '@/features/executive/executive-home';
import {
  LeavePanel,
  NoticePanel,
  PeriodPanel,
  QuickRow,
  RequestsPanel,
  type QuickAction,
  type RequestRow,
} from '@/features/home/panels';
import {
  HomeIdentity,
  TodayStatus,
  type HeroStamp,
} from '@/features/home/today-hero';
import {
  REQUEST_TYPE_LABEL,
  type RequestItem,
} from '@/features/requests/requests.types';
import {
  useLeaveCatalog,
  useRequestList,
} from '@/features/requests/use-requests';
import { useSchedule } from '@/features/schedule/use-schedule';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * หน้าหลัก — **ฉากแสงฟ้ากับแผ่นกระจกขาว**
 *
 * พื้นฟ้าอ่อนตลอดทั้งสองโหมด มีก้อนแสงฟ้าลอยอยู่ข้างหลัง และทุกกล่องเป็น
 * กระจกขาวฝ้าที่เห็นแสงทะลุ — **จอนี้เป็นหนึ่งในห้าจอต้นแบบของทั้งแอป**
 * (ดู AGENTS.md) จอที่ยังไม่ใช้ผิวนี้คือจอที่ยังไม่ได้ย้าย ไม่ใช่จอที่ตั้งใจให้ต่าง
 *
 * เอฟเฟกต์ทุกตัวมีหน้าที่ ไม่ใช่ใส่เพราะทำได้:
 *   - ก้อนแสงลอย = ฉากมีชีวิต ไม่ใช่ภาพนิ่ง (ช้ามาก 9–15 วินาทีต่อรอบ)
 *   - การ์ดโผล่ไล่จากบนลงล่าง = บอกลำดับการอ่าน
 *   - วง/แท่งวิ่งจากศูนย์ = บอกว่าตัวเลขนี้เทียบกับเพดานเท่าไร
 *   - เลขไล่ขึ้น = ดึงตาไปที่ค่าที่สำคัญที่สุดของการ์ดนั้น
 *   - จุดเต้น = มีอะไรกำลังเกิดขึ้นตอนนี้จริง ๆ (กำลังทำงานอยู่)
 *
 * **ไม่มีปุ่มลงเวลาบนจอนี้** — การลงเวลาอยู่ที่แท็บลงเวลาที่เดียว หน้านี้
 * แสดงเวลาที่ลงไปแล้วครบทั้งสามรอบ กับชั่วโมงสะสมของวันเท่านั้น
 */

/**
 * ถามซ้ำทุก 30 วินาทีระหว่างเปิดหน้านี้อยู่
 *
 * เดิมตั้งไว้ 10 วินาทีเพื่อให้เห็นการลงเวลาจากเครื่องสแกนเร็วที่สุด แต่รอบนี้
 * ยิงพร้อมกันสองคำขอ (bootstrap ที่รวมทุกอย่าง + ประวัติเวลา) และทุกคำตอบ
 * ทำให้ทั้งจอ re-render — เปิดหน้าค้างไว้หนึ่งชั่วโมงคือ ~720 คำขอต่อคน
 *
 * 30 วินาทีลดลงเหลือ ~240 โดยที่ผู้ใช้ยังเห็นเวลาที่เพิ่งแตะเครื่องสแกน
 * ภายในครึ่งนาที ซึ่งอยู่ในช่วงที่คนเดินจากประตูมาถึงโต๊ะพอดี
 * ส่วนการลงเวลาจากในแอปเองไม่ต้องรอรอบนี้ — mutation invalidate ให้ทันที
 */
const REFRESH_INTERVAL_MS = 30_000;

function HomeSectionHeader({
  action,
  subtitle,
  title,
}: {
  action?: ReactNode;
  /** ละได้เมื่อชื่อหัวข้ออธิบายตัวเองครบแล้ว — อย่าเขียนคำอธิบายซ้ำชื่อ */
  subtitle?: string;
  title: string;
}) {
  return (
    <View
      style={{
        alignItems: 'flex-end',
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 4,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: AURORA.text }} variant="h2">
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: AURORA.textMuted }} variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export default function TodayScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const bootstrap = useBootstrap();
  const queue = usePunchQueue();

  const data = bootstrap.data;
  const flags = data?.featureFlags;

  /*
   * ผู้บริหารได้หน้าหลักคนละจอกับพนักงาน — คำถามที่เขาเปิดแอปมาถามคือ
   * "วันนี้บริษัทเดินอยู่ไหม" ไม่ใช่ "ฉันลงเวลาหรือยัง" คำขอของจอพนักงาน
   * ทั้งหมดจึงปิดไว้ด้วย ไม่ใช่ยิงทิ้งแล้วไม่ได้ใช้
   */
  const isExecutive = flags?.executive ?? false;

  const today = todayKey();
  const month = monthOf(today);

  /*
   * หน้าแรกนับตาม **รอบเงินเดือน** ไม่ใช่เดือนปฏิทิน — ตัวเลข OT/สาย บนจอนี้
   * คือของที่ผู้ใช้เอาไปเทียบกับสลิป ถ้านับคนละช่วงกันจะไม่ตรงแล้วผู้ใช้สรุปว่า
   * ระบบคำนวณผิด (แท็บลงเวลายังใช้เดือนปฏิทิน เพราะตารางที่นั่นคือปฏิทินจริง ๆ)
   */
  const history = useAttendanceHistory(month, 'payroll', today, !isExecutive);

  /* สถานะวันนี้เปลี่ยนได้จากเครื่องสแกนหรือเว็บ ต้องสดเมื่อกลับมาที่จอ */
  useRefetchOnFocus(bootstrap);

  /* แยกออกมาเพื่อให้ dependency ของ interval นิ่ง ไม่ถูกตั้งใหม่ทุกเรนเดอร์ */
  const bootstrapRefetch = bootstrap.refetch;
  const historyRefetch = history.refetch;

  /*
   * ตารางกะของเดือนนี้ — ใช้ตัดสินว่ารอบไหน "ถึงเวลาแล้ว" บนเส้นเวลาของหน้าแรก
   *
   * bootstrap ไม่ได้ส่งเวลากะมาด้วย (ดู bootstrap.types.ts) จอนี้จึงต้องถาม
   * ตารางเอง แต่เป็นคำขอเดียวกับที่แท็บตารางงานใช้ ถ้าผู้ใช้เคยเปิดแท็บนั้นแล้ว
   * จะได้จากแคชทันที และ staleTime 60 วินาทีกันไม่ให้ยิงซ้ำระหว่างวัน
   */
  const scheduleMonth = {
    month: Number(today.slice(5, 7)),
    year: Number(today.slice(0, 4)),
  };
  const schedule = useSchedule(
    (flags?.schedule ?? false) && !isExecutive,
    scheduleMonth.year,
    scheduleMonth.month,
  );

  const catalog = useLeaveCatalog((flags?.leave ?? false) && !isExecutive);
  const requests = useRequestList();

  /*
   * จอนี้พื้นฟ้าอ่อนตลอดทั้งสองโหมด ตัวหนังสือบนแถบสถานะจึงต้องเป็นสีเข้ม
   * แม้ผู้ใช้จะตั้งแอปเป็นโหมดมืด แล้วคืนค่าตามธีมจริงตอนออกจากจอ — ยกเว้นจอ
   * ผู้บริหาร ซึ่งแถบหัวจอไล่เฉดสีฟ้าทะลุไปชนขอบบนสุดของจอจริง (หลังแถบสถานะ)
   * ตัวหนังสือบนแถบสถานะจึงต้องเป็นสีอ่อนแทน ไม่งั้นอ่านไม่ออกบนพื้นฟ้า
   */
  const auroraStatusBarStyle = useVisibleStatusBarStyle('dark');
  const themeStatusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(auroraStatusBarStyle);

      return () => setStatusBarStyle(themeStatusBarStyle);
    }, [auroraStatusBarStyle, themeStatusBarStyle]),
  );

  /*
   * ดึงข้อมูลซ้ำตามรอบที่ตั้งไว้ระหว่างเปิดหน้านี้อยู่
   *
   * จำเป็นเพราะการลงเวลาไม่ได้เกิดจากแอปเสมอไป — แตะเครื่องสแกนที่หน้าออฟฟิศ
   * หรือ HR กรอกให้จากเว็บ แอปไม่มีทางรู้เลยถ้าไม่ถามเอง
   *
   * ใช้ refetch() ไม่ใช่ invalidate เพราะ refetch ยิงเครือข่ายจริงเสมอ
   * ส่วน invalidate ยังติดกำแพง staleTime 60 วินาทีของประวัติเวลา
   *
   * หยุดเองเมื่อออกจากหน้า (useFocusEffect คืนฟังก์ชันล้าง) จะได้ไม่กินแบต
   * ตอนผู้ใช้ไปแท็บอื่นหรือพับแอปไว้
   */
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        void bootstrapRefetch();
        void historyRefetch();
      }, REFRESH_INTERVAL_MS);

      return () => clearInterval(timer);
    }, [bootstrapRefetch, historyRefetch]),
  );

  /*
   * สลับไปจอผู้บริหาร — วางไว้ตรงนี้เพราะ hook ทุกตัวถูกเรียกครบแล้วข้างบน
   * ลำดับ hook จึงไม่เปลี่ยนระหว่างเรนเดอร์ ไม่ว่าจะเป็นบทบาทไหน
   */
  if (isExecutive) {
    return <ExecutiveHome />;
  }

  /* ---------------------------------------------------------- ข้อมูล */
  /* บันทึกของวันนี้อยู่ในเดือนปัจจุบันเสมอ ไม่ต้องดึงเดือนอื่นมาประกอบ */
  const todayRecord =
    history.data?.days.find((day) => day.workDate === today) ?? null;

  /* ---------------------------------------------------------- วันนี้ */
  const todayData = data?.today ?? null;
  const heroState = todayData?.heroState ?? null;
  /*
   * ซ่อนเส้นเวลาเฉพาะวันที่ไม่มีรอบให้ลงจริง ๆ — วันหยุดกดลงเวลาได้แล้ว
   * (มีกรณีถูกเรียกมาทำงานวันหยุด) จึงต้องเห็นช่องเวลาเหมือนวันทำงาน
   * ต่างกันแค่มีหมายเหตุกำกับไว้ว่าวันนี้เป็นวันหยุด
   */
  const restDay = heroState === 'NO_SHIFT';
  const holidayToday = heroState === 'DAY_OFF';

  /* ที่มาของเวลาสามรอบและกติกาการเลือก อยู่ใน calendar.ts พร้อมเทส */
  const todayStamps = resolveTodayStamps({
    logs: todayData?.timeline ?? [],
    record: todayRecord,
  });

  /*
   * เวลาตามกะของสามรอบ เรียงให้ตรงกับ `stamps`
   *
   * ค่าที่ backend ส่งมาเป็นสตริง "HH:mm" (ดู schedule.types.ts) และรหัสรอบคือ
   * MORNING_IN / AFTERNOON_IN / CHECK_OUT ชุดเดียวกับที่หน้าลงเวลาใช้
   * รอบที่กะไม่ได้กำหนดไว้ (เช่นกะที่ไม่มีสแกนบ่าย) เป็น null แล้วเส้นเวลาจะ
   * ไม่ถือว่ารอบนั้น "เลยเวลา" เลย
   */
  const sessionRules = schedule.data?.days.find((entry) => entry.date === today)
    ?.shift?.sessionRules;

  const expectedAt = (code: string) =>
    sessionRules?.find((rule) => rule.sessionCode === code)?.expectedTime ??
    null;

  const expectedTimes = [
    expectedAt('MORNING_IN'),
    expectedAt('AFTERNOON_IN'),
    expectedAt('CHECK_OUT'),
  ];

  const stamps: HeroStamp[] = [
    { at: todayStamps.morningInAt, label: 'เข้างาน' },
    { at: todayStamps.afternoonInAt, label: 'เข้าบ่าย' },
    { at: todayStamps.checkOutAt, label: 'ออกงาน' },
  ];

  const dateLabel = thaiDate(todayData?.workDate ?? data?.server.now, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  });

  /*
   * หัวจอแสดง "ใครกำลังใช้แอปอยู่" ไม่ใช่คำทักทาย — ชื่อเต็มก่อน แล้วค่อยเป็น
   * ชื่อเล่นเป็นตัวสำรอง เพราะพนักงานเทียบกับบัตรพนักงานของตัวเองเวลาตรวจสอบ
   */
  const fullName =
    data?.employee.displayName ||
    [data?.employee.firstName, data?.employee.lastName]
      .filter(Boolean)
      .join(' ') ||
    data?.employee.nickname ||
    user?.displayName ||
    '';

  /*
   * แผนก + ประเภทพนักงาน (รายเดือน/รายวัน) อยู่บรรทัดเดียวกันได้เพราะสั้น
   * ทั้งคู่ ส่วนสาขาแยกบรรทัด — ชื่อสาขาในระบบนี้เป็นชื่อบริษัทเต็ม ("บริษัท
   * เอ.อาร์.ที.เอกซ์โพเนนเชียล จำกัด") เอาไปต่อท้ายเมื่อไรบรรทัดก็ยาวจนตัดกลางคำ
   *
   * ชื่อตำแหน่งไม่อยู่บนหัวจอ — ยาวและซ้ำกับสิ่งที่เจ้าตัวรู้อยู่แล้ว
   * ส่วน "อยู่แผนกไหน" กับ "คิดเงินแบบไหน" เป็นสองอย่างที่ใช้อ้างอิงจริง
   * (ดูตำแหน่งเต็มได้ที่หน้าโปรไฟล์ ซึ่งกดจากรูปโปรไฟล์บนหัวจอนี้)
   */
  const roleLine = [
    data?.organization.department?.nameTh,
    data?.organization.employeeType?.nameTh,
  ]
    .filter(Boolean)
    .join(' · ');

  const branchName = data?.organization.branch?.nameTh ?? '';

  const employeeCode = data?.employee.employeeCode ?? '';

  const summary = history.data?.summary;
  const recordedDays = summary
    ? summary.presentDays +
      summary.lateDays +
      summary.absentDays +
      summary.leaveDays +
      summary.missingLogDays
    : 0;

  /*
   * ลำดับวันลาที่แสดง — เรียงตามวันคงเหลือมากไปน้อยแบบเดิมทำให้ลาคลอด 60 วัน
   * กับลาอุปสมบทขึ้นมาก่อนลาป่วย/ลากิจที่ใช้จริงทุกเดือน จึงเรียงใหม่จาก
   * "ของที่ใกล้ตัวที่สุด":
   *   1. ลากิจ แล้วตามด้วยลาป่วย (ทุกแบบ ทั้งได้/ไม่ได้ค่าจ้าง) — สองกลุ่มนี้
   *      คือของที่พนักงานยื่นจริงเกือบทั้งหมด ต้องอยู่ในชิ้นโดนัทที่แยกสีเสมอ
   *      ไม่ใช่ถูกดันไปกอง "อื่นๆ" เพราะโควตาบังเอิญมากกว่าลาพิธีการ
   *   2. ที่เหลือ: ประเภทที่แตะไปแล้ว (ใช้ไปหรือมีใบค้างอยู่) ขึ้นก่อน
   *   3. สุดท้ายเรียงจากโควตาน้อยไปมาก — โควตาก้อนใหญ่มักเป็นเหตุการณ์
   *      ครั้งเดียวในชีวิต อยู่ท้ายสุดถูกแล้ว
   */
  const allLeaveTypes = (catalog.data?.leaveTypes ?? [])
    .filter((type) => type.entitlementDays > 0)
    .sort((left, right) => {
      /*
       * เทียบด้วย `includes` เพราะชื่อจริงในระบบมีหางต่อท้ายหลายแบบ
       * ("ลากิจได้รับค่าจ้าง" / "ลากิจไม่ได้รับค่าจ้าง" / "ลาป่วยไม่ได้รับ
       * ค่าจ้าง มีใบรับรองแพทย์") — จับที่คำตั้งต้นทีเดียวครอบคลุมทุกแบบ
       *
       * เขียนคาไว้ในตัวเปรียบเทียบเลย ไม่แยกเป็นฟังก์ชันข้างนอก เพราะเคยแยก
       * แล้วเจอ "leavePriority is not defined" ตอน Fast Refresh
       */
      const leftPriority = left.name.includes('ลากิจ')
        ? 0
        : left.name.includes('ลาป่วย')
          ? 1
          : 2;
      const rightPriority = right.name.includes('ลากิจ')
        ? 0
        : right.name.includes('ลาป่วย')
          ? 1
          : 2;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftIdle = left.usedDays > 0 || left.pendingDays > 0 ? 0 : 1;
      const rightIdle = right.usedDays > 0 || right.pendingDays > 0 ? 0 : 1;

      if (leftIdle !== rightIdle) {
        return leftIdle - rightIdle;
      }

      return left.entitlementDays - right.entitlementDays;
    });

  /*
   * แสดงครบทุกประเภทที่มีโควตา ไม่ตัดให้เหลือไม่กี่อัน — การรู้ว่าตัวเองมีสิทธิ์
   * อะไรบ้างคือเหตุผลหลักที่คนเปิดดูส่วนนี้ ประเภทที่ถูกซ่อนคือประเภทที่ไม่มีใคร
   * รู้ว่ามี แล้วก็ไม่มีใครใช้
   */
  const leaveTypes = allLeaveTypes;

  /*
   * สามใบล่าสุดพอ — มากกว่านี้ก็กลายเป็นแท็บคำขอซ้อนอยู่บนหน้าแรก
   *
   * บรรทัดรองประกอบเองจาก occurredOn + จำนวน ไม่ใช้ rangeLabel ที่ backend ส่งมา
   * เพราะในนั้นเป็นวันที่ดิบ ("2026-08-20 · เต็มวัน") ซึ่งอ่านยากบนจอมือถือ
   */
  const recentRequests: RequestRow[] = (
    requests.data?.pages.flatMap((page) => page.items) ?? []
  )
    .slice(0, 3)
    .map((item: RequestItem) => ({
      amount: item.amountLabel ?? null,
      approverName: item.approverName ?? null,
      id: item.id,
      reason: item.reason ?? null,
      status: item.status,
      subtitle:
        formatShortDate(item.occurredOn) ?? REQUEST_TYPE_LABEL[item.type],
      title: item.title,
      type: item.type,
    }));

  const unread = data?.summary.unreadNotifications ?? 0;

  /*
   * ทางลัดใช้ไล่เฉดฟ้าชุดเดียวกันทั้งแถว — ให้ "ไอคอน" เป็นตัวแยกว่าอันไหนคืออะไร
   * ไม่ใช่ "สี" เพราะสี่สีสี่ช่องเรียงกันคือจุดที่ทำให้ทั้งจอดูมั่ว และสีพวกนั้น
   * ก็ไม่ได้แปลว่าอะไรอยู่ดี (ขอ OT ไม่ได้ "อุ่น" กว่ายื่นลา)
   */
  const quickActions: QuickAction[] = [];

  if (flags?.leave) {
    quickActions.push({
      icon: 'sun',
      label: 'ยื่นลา',
      onPress: () =>
        router.push({ params: { type: 'LEAVE' }, pathname: '/request-new' }),
    });
  }

  if (flags?.overtime) {
    quickActions.push({
      icon: 'moon',
      label: 'ขอ OT',
      onPress: () =>
        router.push({ params: { type: 'OVERTIME' }, pathname: '/request-new' }),
    });
  }

  if (flags?.timeAdjust) {
    quickActions.push({
      icon: 'edit-3',
      label: 'แก้เวลา',
      onPress: () =>
        router.push({
          params: { type: 'TIME_ADJUST' },
          pathname: '/request-new',
        }),
    });
  }

  if (flags?.offsite) {
    quickActions.push({
      icon: 'navigation',
      label: 'นอกสถานที่',
      onPress: () =>
        router.push({ params: { type: 'OFFSITE' }, pathname: '/request-new' }),
    });
  }

  /*
   * การ์ดสีน้ำเงินมีเพียงใบเดียวและเก็บเฉพาะข้อมูลที่สำคัญที่สุดของวันนี้
   * ส่วนหมวดด้านล่างวางบนผิวฟ้าอ่อนเดียวกัน แยกกันด้วยช่องไฟและหัวข้อ
   * จึงไม่กลายเป็นกล่องซ้อนกล่อง แต่ยังสแกนหาข้อมูลแต่ละชุดได้เร็ว
   */
  const sections: { key: string; node: ReactNode }[] = [];

  if (queue.pendingCount > 0) {
    sections.push({
      key: 'queue',
      node: (
        <NoticePanel
          actionLabel={queue.flush.isPending ? 'กำลังส่ง...' : 'ส่งอีกครั้ง'}
          color={AURORA.amber}
          icon="upload-cloud"
          message={`${queue.pendingCount} รายการรอส่งขึ้นระบบ`}
          onPress={() => queue.flush.mutate()}
          title="ข้อมูลลงเวลายังค้างอยู่"
        />
      ),
    });
  }

  if (heroState === 'MISSING_LOG') {
    sections.push({
      key: 'missing',
      node: (
        <NoticePanel
          color={AURORA.rose}
          icon="alert-circle"
          message="ยื่นขอแก้เวลาเพื่อให้รอบนี้สมบูรณ์"
          onPress={
            flags?.timeAdjust
              ? () =>
                  router.push({
                    params: { type: 'TIME_ADJUST' },
                    pathname: '/request-new',
                  })
              : undefined
          }
          title="วันนี้มีเวลาที่ขาดไป"
        />
      ),
    });
  }

  /*
   * ไม่มีแถบ "งานที่รอคุณอนุมัติ" บนหน้าหลักแล้ว — แท็บอนุมัติมีป้ายตัวเลข
   * สีแดงบอกจำนวนที่ค้างอยู่ตลอดเวลา การมีแถบซ้ำอีกที่บนหน้าหลักจึงบอกเรื่อง
   * เดียวกันสองครั้งและกินที่ของทางลัดที่คนกดจริงทุกวัน
   */

  if (quickActions.length > 0) {
    sections.push({
      key: 'quick',
      node: (
        <>
          {/* หัวข้อ + คำอธิบายอยู่บรรทัดเดียวกัน คนละฝั่ง ไม่ใช่ซ้อนกันสองบรรทัด */}
          <View
            style={{
              alignItems: 'flex-end',
              flexDirection: 'row',
              gap: 12,
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: AURORA.text, flex: 1 }} variant="h2">
              เมนูลัด
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: AURORA.textFaint, fontSize: 11.5 }}
            >
              จัดการงานของคุณได้ง่ายขึ้น
            </Text>
          </View>

          <QuickRow items={quickActions.slice(0, 4)} />
        </>
      ),
    });
  }

  if (recentRequests.length > 0) {
    sections.push({
      key: 'requests',
      node: (
        <>
          <HomeSectionHeader
            action={
              <SectionAction
                color={AURORA.accent}
                label="ดูทั้งหมด"
                onPress={() => router.push('/requests')}
              />
            }
            title="รายการคำขอล่าสุด"
          />
          <RequestsPanel
            items={recentRequests}
            onOpen={(item) =>
              router.push({
                params: { id: item.id, type: item.type },
                pathname: '/request/[type]/[id]',
              })
            }
          />
        </>
      ),
    });
  }

  /*
   * ส่วนนี้ไม่มีเงื่อนไขซ่อน — เดิมซ่อนทั้งใบเมื่อยังไม่มีสรุป แล้ววันที่คำขอ
   * ล้มจริง (backend รันโค้ดเก่าจนตีพารามิเตอร์รอบเงินเดือนกลับ) การ์ดก็หายไป
   * เฉย ๆ จนแยกไม่ออกว่า "ไม่มีข้อมูล" หรือ "ระบบพัง" ตัวการ์ดบอกเองได้แล้ว
   */
  sections.push({
    key: 'month',
    node: (
      <>
        <HomeSectionHeader title="ภาพรวมรอบเงินเดือนนี้" />
        {history.isPending ? (
          <Skeleton height={130} radius={18} />
        ) : (
          <PeriodPanel
            failed={history.isError}
            canViewSlips={flags?.payslip ?? false}
            onFixMissingLogs={
              flags?.timeAdjust
                ? () =>
                    router.push({
                      params: { type: 'TIME_ADJUST' },
                      pathname: '/request-new',
                    })
                : undefined
            }
            onRetry={() => {
              void history.refetch();
            }}
            period={history.data?.period ?? null}
            recordedDays={recordedDays}
            summary={summary}
            today={today}
          />
        )}
      </>
    ),
  });

  if (flags?.leave) {
    sections.push({
      key: 'leave',
      node: (
        <>
          <HomeSectionHeader
            action={
              <SectionAction
                color={AURORA.accent}
                label="ยื่นลา"
                onPress={() =>
                  router.push({
                    params: { type: 'LEAVE' },
                    pathname: '/request-new',
                  })
                }
              />
            }
            subtitle="สิทธิ์ที่พร้อมใช้งาน"
            title="วันลาคงเหลือ"
          />
          {catalog.isPending ? (
            <Skeleton height={90} radius={18} />
          ) : (
            <LeavePanel
              onMore={() =>
                router.push({
                  params: { type: 'LEAVE' },
                  pathname: '/request-new',
                })
              }
              types={leaveTypes}
            />
          )}
        </>
      ),
    });
  }

  return (
    /* พื้นขาวเรียบทั้งจอ ไม่มีฉากหลังฟ้า ไม่มีกล่องรองเนื้อหา */
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            gap: 36,
            paddingBottom: 36,
            paddingHorizontal: gutter,
            /*
             * เว้นจากขอบบนพอสมควร — บนเครื่องที่ safe-area inset เป็น 0
             * (Android ส่วนใหญ่ที่แอปไม่ได้วาดใต้แถบสถานะ) รูปโปรไฟล์จะไป
             * แปะขอบจอพอดีจนอึดอัด ค่านี้เผื่อไว้ให้ทั้งสองแบบ
             */
            paddingTop: 30,
          }}
          /*
           * ดึงเพื่อรีเฟรชมีเฉพาะบนมือถือ — react-native-web ไม่ได้ทำ
           * RefreshControl ให้ครบ มันส่ง prop อย่าง refreshing ลงไปเป็น
           * attribute ของ DOM ตรง ๆ แล้วขึ้น error แดงคาจอตอน dev
           */
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => {
                  void bootstrap.refetch();
                  void history.refetch();
                  void catalog.refetch();
                  void schedule.refetch();
                }}
                refreshing={bootstrap.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <View>
              <HomeIdentity
                avatarUrl={user?.avatarUrl ?? null}
                branch={branchName}
                code={employeeCode}
                name={fullName}
                onNotifications={() => router.push('/notifications')}
                onProfile={() => router.push('/my-profile')}
                role={roleLine}
                unread={unread}
              />
              <View style={{ marginTop: 18 }}>
                <TodayStatus
                  dateLabel={dateLabel ?? null}
                  day={todayRecord}
                  expected={expectedTimes}
                  now={data?.server.now ?? new Date()}
                  noteLabel={
                    holidayToday
                      ? 'วันนี้เป็นวันหยุด — ลงเวลาได้ถ้าถูกเรียกมาทำงาน'
                      : null
                  }
                  restLabel={restDay ? 'ยังไม่มีรอบลงเวลาสำหรับวันนี้' : null}
                  stamps={stamps}
                />
              </View>
            </View>
          </Reveal>

          {sections.map((section, index) => (
            <Reveal delay={70 + index * 70} key={section.key}>
              <View style={{ gap: 12 }}>{section.node}</View>
            </Reveal>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
