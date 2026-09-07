import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Skeleton, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import { AURORA, Reveal, SectionAction } from '@/design/aurora';
import {
  resolveTodayStamps,
  formatShortDate,
  monthOf,
  shiftMonth,
  todayKey,
} from '@/features/attendance/calendar';
import {
  AttendanceHero,
  DayListPanel,
  MonthSwitcher,
} from '@/features/attendance/panels';
import { PunchPanel } from '@/features/attendance/punch-panel';
import { useAttendanceHistory } from '@/features/attendance/use-attendance-history';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { ExecutiveDaily } from '@/features/executive/executive-daily';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * แท็บลงเวลา — ทั้งลงเวลาและดูย้อนหลังจบในจอเดียว
 *
 * เดิมปุ่มลงเวลาเด้งไปจอ `/punch` อีกที กลายเป็นสองจังหวะสำหรับสิ่งที่ผู้ใช้ทำ
 * วันละสองสามครั้ง ตอนนี้การ์ดลงเวลาอยู่บนสุดของจอนี้เลย ส่วนจอ `/punch`
 * ถูกยุบทิ้ง ไม่เหลือโค้ดสองชุดให้เพี้ยนกันทีหลัง
 *
 * จอนี้กับหน้าหลักใช้ผิวออโรราเดียวกัน — สลับไปมาแล้วต้องรู้สึกเป็นที่เดียวกัน
 * และเป็นหนึ่งในห้าจอต้นแบบที่ทั้งแอปยึดตาม (ดู AGENTS.md)
 */
/**
 * หัวข้อของหมวด — ชื่อซ้าย ตัวเลข/คำกำกับขวา วางบนผิวของจอตรง ๆ
 *
 * `paddingHorizontal: 4` เป็นระยะเดียวกับหัวข้อบนหน้าหลัก ทำให้ทุกหัวข้อของ
 * ทั้งแอปเรียงตรงกัน ลำดับของจอมาจากขนาดตัวหนังสือกับระยะห่าง ไม่ใช่จากกล่อง
 */
function SectionHeader({ meta, title }: { meta?: string; title: string }) {
  return (
    <View
      style={{
        alignItems: 'flex-end',
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 4,
      }}
    >
      <Text style={{ color: AURORA.text, flex: 1 }} variant="h2">
        {title}
      </Text>
      {meta ? (
        <Text
          numberOfLines={1}
          style={{ color: AURORA.textFaint, fontSize: 11.5 }}
        >
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

export default function AttendanceScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const bootstrap = useBootstrap();

  /*
   * ผู้บริหารได้ช่องแท็บนี้เป็นจอ "ลา & โอที รายวัน" ของทั้งบริษัท ไม่ใช่จอ
   * ลงเวลาของตัวเอง (เข้าจอนั้นได้จากเมนูเพิ่มเติม → ประวัติลงเวลา)
   * คำขอของจอพนักงานจึงปิดไว้ด้วย ไม่ใช่ยิงทิ้งแล้วไม่ได้ใช้
   */
  const isExecutive = bootstrap.data?.featureFlags.executive ?? false;

  const today = todayKey();
  const [periodOffset, setPeriodOffset] = useState(0);
  const calendarMonth = monthOf(today);

  /*
   * ถาม backend ด้วยวันที่วันนี้ก่อน เพื่อให้รู้ว่างวดปัจจุบันคือเดือนไหนจริง
   * เช่นหลังวันที่ 25 งวดปัจจุบันจะเป็นงวดเดือนถัดไป แม้เดือนปฏิทินยังไม่เปลี่ยน
   */
  const currentHistory = useAttendanceHistory(
    calendarMonth,
    'payroll',
    today,
    !isExecutive,
  );
  const currentPayrollMonth = currentHistory.data?.period
    ? monthOf(currentHistory.data.period.to)
    : calendarMonth;
  const month = shiftMonth(currentPayrollMonth, periodOffset);
  const historicalHistory = useAttendanceHistory(
    month,
    'payroll',
    undefined,
    periodOffset !== 0 && !isExecutive,
  );
  const history = periodOffset === 0 ? currentHistory : historicalHistory;

  /* HR แก้เวลาย้อนหลังได้ ประวัติจึงเปลี่ยนได้แม้ผู้ใช้ไม่ได้ทำอะไร */
  useRefetchOnFocus(history);
  /*
   * เห็นจอนี้ = ดูเวลาตัวเองได้ ซึ่งพนักงานทุกคนได้ — คนละเรื่องกับ "กดลงเวลาได้"
   * ที่ HR เปิดปิดรายคน (ATTENDANCE_CHECKIN + วิธีลงเวลาที่อนุญาต)
   * fallback ไป attendance ไว้เผื่อคุยกับ backend รุ่นก่อนแยก flag
   */
  const flags = bootstrap.data?.featureFlags;
  const canPunch = flags?.attendancePunch ?? flags?.attendance ?? false;

  /*
   * จอนี้พื้นฟ้าอ่อนตลอดทั้งสองโหมด ตัวหนังสือบนแถบสถานะจึงต้องเป็นสีเข้ม
   * แม้ผู้ใช้จะตั้งแอปเป็นโหมดมืด แล้วคืนค่าตามธีมจริงตอนออกจากจอ — ยกเว้น
   * จอผู้บริหาร ที่แถบหัวจอสีฟ้าทะลุไปหลังแถบสถานะ ต้องใช้ตัวหนังสือสีอ่อน
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
   * สลับไปจอผู้บริหาร — วางไว้ตรงนี้เพราะ hook ทุกตัวถูกเรียกครบแล้วข้างบน
   * ลำดับ hook จึงไม่เปลี่ยนระหว่างเรนเดอร์ ไม่ว่าจะเป็นบทบาทไหน
   */
  if (isExecutive) {
    return <ExecutiveDaily />;
  }

  /* ห้ามให้เลื่อนไปเดือนอนาคต ไม่มีข้อมูลและทำให้ผู้ใช้คิดว่าระบบไม่บันทึก */
  const canGoNext = periodOffset < 0;
  const period = history.data?.period;
  const isPayrollPeriod = period?.type === 'payroll';
  const periodRangeLabel = isPayrollPeriod
    ? `${formatShortDate(period.from) ?? period.from} – ${
        formatShortDate(period.to) ?? period.to
      }`
    : undefined;

  /*
   * เวลาลงจริงของวันนี้ 3 จุด ใช้แหล่งเดียวกับหน้า Today เพื่อให้ตัวเลขไม่เพี้ยน
   * ถ้าผู้ใช้เลื่อนไปดูเดือนก่อน `history` จะไม่มีวันนี้ จึง fallback ไป timeline
   * ของ bootstrap ซึ่งยังเป็นข้อมูลวันนี้เสมอ
   */
  const todayRecord =
    history.data?.days.find((day) => day.workDate === today) ?? null;
  const todayStamps = resolveTodayStamps({
    logs: bootstrap.data?.today?.timeline ?? [],
    record: todayRecord,
  });

  /* วันที่แบบอ่านออก สำหรับหัวข้อหน้า — แหล่งเดียวกับหน้าหลัก */
  const dateLabel = thaiDate(
    bootstrap.data?.today?.workDate ?? bootstrap.data?.server.now,
    {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    },
  );

  const doneCount = [
    todayStamps.morningInAt,
    todayStamps.afternoonInAt,
    todayStamps.checkOutAt,
  ].filter(Boolean).length;

  return (
    /*
     * ทั้งจอเป็นผิวเดียวกันหมด — ไม่มีการ์ด ไม่มีแผ่นรอง ไม่มีกรอบ ไม่มีเงา
     *
     * เคยลองทั้งแบบการ์ดหลายใบและแบบแผ่นขาวใบใหญ่ใบเดียว ทั้งสองแบบยังอ่านเป็น
     * "กล่อง" อยู่ดี ตอนนี้ทุกหมวดวางบนพื้นขาวของจอตรง ๆ แบ่งกันด้วยระยะห่าง
     * กับขนาดตัวหนังสือ ส่วนสีฟ้ามาจากไอคอน ตัวเลข และปุ่ม ไม่ใช่จากพื้นหรือขอบ
     */
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            /* หมวดห่างกันมาก ของในหมวดชิดกัน — ระยะเดียวกับหน้าหลัก */
            gap: 30,
            paddingBottom: 36,
            paddingHorizontal: gutter,
            /*
             * เว้นจากขอบบนพอสมควร — บนเครื่องที่ inset เป็น 0 (แอปไม่ได้วาด
             * ใต้แถบสถานะ) เนื้อหาจะไปแปะขอบจอพอดีจนอึดอัด
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
                }}
                refreshing={history.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          {/* --------------------------------------------------- หัวข้อหน้า */}
          <Reveal>
            {/*
              หักระยะขอบของ ScrollView ออกด้วย margin ติดลบทั้งสามด้าน หัวข้อหน้า
              จึงกินเต็มความกว้างจอและไปติดขอบบนสุด (ใต้แถบสถานะ) พอดี ลายคลื่น
              เลยลากไปชนขอบจอได้จริง ส่วนตัวหนังสือมีระยะขอบของตัวเองอยู่แล้ว
            */}
            <View style={{ marginHorizontal: -18, marginTop: -34 }}>
              <AttendanceHero
                dateLabel={dateLabel}
                doneCount={doneCount}
                totalCount={3}
              />
            </View>
          </Reveal>

          {/* ------------------------------------------------ ลงเวลาเลย */}
          {/*
            ส่วนลงเวลาอยู่บนสุด ไม่ใช่หน้าแรก — หน้าแรกเป็นแดชบอร์ดสำหรับ "ดู"
            ส่วนแท็บนี้เป็นที่สำหรับ "ทำ" เรื่องเวลาทั้งหมด
          */}
          {/*
            ไม่มีหัวข้อ "ลงเวลาวันนี้" คั่นแล้ว — หัวข้อหน้าข้างบนบอกครบทั้ง
            ชื่อจอ วันที่ และความคืบหน้าของวันนี้อยู่แล้ว หัวข้อซ้ำอีกชั้นคือ
            บรรทัดที่กินที่แต่ไม่ได้เพิ่มอะไร
          */}
          {/*
            ดันขึ้นไปชิดหัวข้อหน้าด้วย margin ติดลบเท่ากับ `gap` ของ ScrollView
            เส้นบนของแถบสามรอบจึงไปแปะใต้หัวจอพอดี กลายเป็นเส้นคั่นของหัวข้อ
            ไปในตัว — ไม่ต้องมีเส้นคั่นอีกเส้นให้ตาต้องข้ามสองชั้น
          */}
          <Reveal delay={60} style={{ marginTop: -30 }}>
            {/*
              คนที่ยังไม่ได้สิทธิ์กดก็เห็นแผงเต็มใบเหมือนกัน — แผนที่สาขา รอบของ
              วันนี้ ระยะห่าง ครบทุกอย่าง ต่างแค่ปุ่มกดไม่ได้และมีเหตุผลกำกับ
              (เดิมแทนที่ทั้งแผงด้วยข้อความบรรทัดเดียว ซึ่งทำให้เขาไม่รู้ว่าระบบ
              มองที่ทำงานและเวลาของเขาอย่างไรเลย)
            */}
            <PunchPanel canPunch={canPunch} stamps={todayStamps} />
          </Reveal>

          {/* --------------------------------------------------- ย้อนหลัง */}
          <Reveal delay={140}>
            <View style={{ gap: 12 }}>
              <SectionHeader
                meta={
                  history.isPending || history.isError
                    ? undefined
                    : `${history.data?.days.length ?? 0} วัน`
                }
                title="ประวัติการลงเวลา"
              />

              {/* ตัวเลือกงวดอยู่ใต้หัวข้อ เพราะมันคุมรายการข้างล่างนี้เท่านั้น */}
              <MonthSwitcher
                canGoNext={canGoNext}
                month={month}
                onShiftMonth={(delta: number) =>
                  setPeriodOffset((current) => current + delta)
                }
                rangeLabel={periodRangeLabel}
              />

              {history.isError ? (
                <View style={{ gap: 4 }}>
                  <Text
                    maxScale={1.2}
                    style={{ color: AURORA.textMuted, fontSize: 12 }}
                  >
                    {history.error instanceof ApiError
                      ? history.error.message
                      : 'โหลดประวัติเวลาไม่สำเร็จ'}
                  </Text>
                  <SectionAction
                    label="ลองใหม่"
                    onPress={() => void history.refetch()}
                  />
                </View>
              ) : history.isPending ? (
                <Skeleton height={240} radius={18} />
              ) : (
                <DayListPanel days={history.data?.days ?? []} today={today} />
              )}
            </View>
          </Reveal>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
