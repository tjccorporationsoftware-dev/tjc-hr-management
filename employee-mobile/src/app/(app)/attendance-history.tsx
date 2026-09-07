import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, Sheet, Skeleton, Text, type IconName } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  AttendanceHistoryMotif,
  PageHero,
  PressableScale,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import {
  DAY_STATE_LABEL,
  formatMinutes,
  formatShortDate,
  todayKey,
} from '@/features/attendance/calendar';
import type {
  AttendanceDayState,
  AttendanceHistory,
} from '@/features/attendance/history.types';
import { DayListPanel, STATE_COLOR } from '@/features/attendance/panels';
import { useAttendanceHistoryFeed } from '@/features/attendance/use-attendance-history';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { formatNumber } from '@/lib/format/number';

/**
 * ประวัติลงเวลา — ผิวขาวผืนเดียวชุดเดียวกับจอคำขอ เงินเดือน และข้อมูลพนักงาน
 *
 * แยกจากแท็บลงเวลาโดยตั้งใจ: แท็บนั้นเป็นที่สำหรับ **ทำ** (ปุ่มลงเวลาอยู่บนสุด)
 * ส่วนจอนี้เป็นที่สำหรับ **ตรวจย้อนหลัง** ทั้งหมดที่มี
 *
 * ## ลำดับของจอ
 *
 * หัวจอ → แถบงวดที่กำลังดู → แถบงานที่ต้องตามแก้ → งวดทีละก้อน
 * ทุกงวดหน้าตาเหมือนกันหมด การเลื่อนผ่านจึงเป็นการเปรียบเทียบในตัวมันเอง
 *
 * ## โดนัทคือหัวใจของแต่ละงวด
 *
 * วงเดียวบอกสัดส่วนวันทั้งงวด (มา สาย ลา เวลาไม่ครบ ขาด) พร้อมจำนวนวันกับ
 * เปอร์เซ็นต์ข้าง ๆ — งวดที่ราบรื่นวงจะเกือบเป็นสีเดียว งวดที่ต้องตามแก้จะมี
 * เสี้ยวสีอุ่นกว้างให้เห็นทันที ส่วนตารางรายวันยังอยู่ครบ แต่พับไว้ใต้งวด
 * ของตัวเอง
 *
 * **ไม่มีตัวเลขเงินบนจอนี้** — เรื่องเงินอยู่ที่แท็บเงินเดือนที่เดียว ยอดหักของ
 * งวดที่ยังไม่ปิดเปลี่ยนได้จนถึงวันตัด เอามาโชว์ที่นี่มีแต่จะทำให้ผู้ใช้จำ
 * ตัวเลขที่ยังไม่ใช่ของจริงไปเทียบกับสลิป
 */

/** ตัวเลขทุกตัวกว้างเท่ากัน ไม่งั้นกางตารางแล้วทั้งแถวขยับ */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

/** ชื่อช่วงของงวด เช่น "26 ก.ค. – 25 ส.ค." */
function periodLabel(page: AttendanceHistory) {
  const period = page.period;

  if (!period) return page.month;

  return `${formatShortDate(period.from) ?? period.from} – ${
    formatShortDate(period.to) ?? period.to
  }`;
}

function needsFixingCount(page: AttendanceHistory) {
  return page.summary.missingLogDays + page.summary.absentDays;
}

/** ขนาดวงโดนัท — เท่ากับความสูงของตัวเลขสรุปสี่ช่องข้าง ๆ พอดี */
const DONUT_SIZE = 116;

/** ความหนาของวง — บางกว่านี้อ่านเป็นเส้น หนากว่านี้รูตรงกลางเล็กจนใส่เลขไม่ได้ */
const DONUT_STROKE = 15;

/** ลำดับของส่วนในวง — เรียงจาก "ปกติ" ไป "ต้องจัดการ" เหมือนคำอธิบายสี */
const DONUT_ORDER: AttendanceDayState[] = [
  'PRESENT',
  'LATE',
  'LEAVE',
  'MISSING_LOG',
  'ABSENT',
];

/**
 * โดนัทสัดส่วนวันของทั้งงวด
 *
 * ตอบคำถาม "งวดนี้หน้าตาเป็นยังไง" ด้วยภาพเดียว — วงที่เกือบเป็นสีเดียวคืองวด
 * ที่ราบรื่น ส่วนวงที่มีเสี้ยวสีอุ่นกว้างคืองวดที่ต้องตามแก้ ตัวเลขกลางวงคือ
 * จำนวนวันที่บันทึกแล้ว ซึ่งเป็นตัวหารของทุกสัดส่วนในวง
 *
 * วาดด้วย `strokeDasharray` บนวงกลมวงเดียว ไม่ใช่ `<Path>` ส่วนโค้งทีละชิ้น —
 * ส่วนโค้งต้องคำนวณ arc flag เองและพังทันทีที่ส่วนใดกว้างเกินครึ่งวง
 */
function DayDonut({ page }: { page: AttendanceHistory }) {
  const summary = page.summary;

  const counted: { count: number; state: AttendanceDayState }[] = [
    { count: summary.presentDays, state: 'PRESENT' },
    { count: summary.lateDays, state: 'LATE' },
    { count: summary.leaveDays, state: 'LEAVE' },
    { count: summary.missingLogDays, state: 'MISSING_LOG' },
    { count: summary.absentDays, state: 'ABSENT' },
  ];

  const parts = counted
    .filter((part) => part.count > 0)
    .sort(
      (left, right) =>
        DONUT_ORDER.indexOf(left.state) - DONUT_ORDER.indexOf(right.state),
    );

  const total = parts.reduce((sum, part) => sum + part.count, 0);

  if (total === 0) return null;

  const radius = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = DONUT_SIZE / 2;

  /*
   * ระยะเริ่มของแต่ละส่วนคำนวณล่วงหน้าเป็นอาร์เรย์ ไม่ใช่ตัวแปรที่บวกเพิ่ม
   * ระหว่าง map — React Compiler ห้ามแก้ค่าตัวแปรระหว่างเรนเดอร์
   */
  const arcs = parts.map((part, index) => {
    const length = (part.count / total) * circumference;
    const start = parts
      .slice(0, index)
      .reduce((sum, item) => sum + (item.count / total) * circumference, 0);

    return { length, part, start };
  });

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 16 }}>
      <View style={{ height: DONUT_SIZE, width: DONUT_SIZE }}>
        <Svg height={DONUT_SIZE} width={DONUT_SIZE}>
          {/* รางจาง ๆ ข้างหลัง กันไม่ให้วงดูขาดตอนมีส่วนเดียว */}
          <Circle
            cx={center}
            cy={center}
            fill="none"
            r={radius}
            stroke={AURORA.glassBorder}
            strokeWidth={DONUT_STROKE}
          />

          {arcs.map(({ length, part, start }) => {
            const dash = `${length} ${circumference - length}`;
            const rotation = (start / circumference) * 360 - 90;

            return (
              <Circle
                cx={center}
                cy={center}
                fill="none"
                key={part.state}
                r={radius}
                /*
                  หมุนด้วย transform ไม่ใช่คู่ origin/rotation — บนเว็บ
                  react-native-svg แปลง origin เป็น `transform-origin` ของ DOM
                  ตรง ๆ แล้ว React ขึ้น error แดงคาจอว่าไม่รู้จัก property นี้
                */
                transform={`rotate(${rotation} ${center} ${center})`}
                stroke={STATE_COLOR[part.state]}
                strokeDasharray={dash}
                strokeLinecap="butt"
                strokeWidth={DONUT_STROKE}
              />
            );
          })}
        </Svg>

        <View
          style={{
            alignItems: 'center',
            bottom: 0,
            justifyContent: 'center',
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        >
          <Text
            maxScale={1.1}
            style={[
              TABULAR,
              {
                color: AURORA.text,
                fontSize: 24,
                fontWeight: '800',
                lineHeight: 30,
              },
            ]}
          >
            {total}
          </Text>
          <Text
            maxScale={1.1}
            style={{ color: AURORA.textFaint, fontSize: 10, lineHeight: 14 }}
          >
            วันที่บันทึก
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, gap: 7, minWidth: 0 }}>
        {parts.map((part) => (
          <View
            key={part.state}
            style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
          >
            <View
              style={{
                backgroundColor: STATE_COLOR[part.state],
                borderRadius: 999,
                height: 9,
                width: 9,
              }}
            />
            <Text
              maxScale={1.1}
              numberOfLines={1}
              style={{
                color: AURORA.textMuted,
                flex: 1,
                fontSize: 11.5,
                lineHeight: 16,
              }}
            >
              {DAY_STATE_LABEL[part.state]}
            </Text>
            <Text
              maxScale={1.1}
              style={[
                TABULAR,
                {
                  color: AURORA.text,
                  fontSize: 11.5,
                  fontWeight: '700',
                  lineHeight: 16,
                },
              ]}
            >
              {part.count} วัน
            </Text>
            <Text
              maxScale={1.1}
              style={[
                TABULAR,
                {
                  color: AURORA.textFaint,
                  fontSize: 10.5,
                  lineHeight: 16,
                  minWidth: 32,
                  textAlign: 'right',
                },
              ]}
            >
              {Math.round((part.count / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** หนึ่งช่องตัวเลขของงวด — ค่าที่เป็นศูนย์ให้จาง */
function StatCell({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        maxScale={1.15}
        numberOfLines={1}
        style={{ color: AURORA.textFaint, fontSize: 10.5, lineHeight: 14 }}
      >
        {label}
      </Text>
      <Text
        maxScale={1.15}
        numberOfLines={1}
        style={[
          TABULAR,
          { color, fontSize: 15, fontWeight: '800', lineHeight: 20 },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * หนึ่งงวดบนผิวของจอ — **ไม่มีการ์ดครอบ**
 *
 * หัวข้อใช้ขีดน้ำเงินนำหน้าเหมือน `PageSection` ของจออื่น แต่เขียนเองเพราะ
 * ทั้งแถวต้องกดได้ (พับ/กางตารางรายวัน) ซึ่งคอมโพเนนต์กลางไม่รองรับ
 *
 * ไม่มีคำเตือนอยู่ในงวด — วันที่ต้องตามแก้ถูกยกไปรวมไว้แถบเดียวบนหัวจอ เพราะ
 * มันคือ "งานที่ต้องทำ" ไม่ใช่ "สรุปของงวด"
 */
function PeriodBlock({
  expanded,
  onToggle,
  page,
  today,
}: {
  expanded: boolean;
  onToggle: () => void;
  page: AttendanceHistory;
  today: string;
}) {
  const summary = page.summary;
  const recordedDays =
    summary.presentDays +
    summary.lateDays +
    summary.absentDays +
    summary.leaveDays +
    summary.missingLogDays;
  const workedDays = summary.presentDays + summary.lateDays;

  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityLabel={`${periodLabel(page)} ${expanded ? 'ย่อ' : 'กาง'}ตารางเวลา`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: pressed ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
          flexDirection: 'row',
          gap: 9,
          marginHorizontal: -6,
          paddingHorizontal: 6,
          paddingVertical: 2,
        })}
      >
        <View
          style={{
            backgroundColor: AURORA.accent,
            borderRadius: 999,
            height: 15,
            width: 3,
          }}
        />
        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <Text
            maxScale={1.15}
            numberOfLines={1}
            style={{ color: AURORA.text }}
            variant="h3"
          >
            {periodLabel(page)}
          </Text>
        </View>
        <Text
          maxScale={1.1}
          style={[
            TABULAR,
            { color: AURORA.textMuted, fontSize: 11, lineHeight: 15 },
          ]}
        >
          บันทึกแล้ว {recordedDays} วัน
        </Text>
        <Icon
          color={AURORA.accent}
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={17}
        />
      </Pressable>

      <DayDonut page={page} />

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatCell
          color={AURORA.text}
          label="มาทำงาน"
          value={`${formatNumber(workedDays)} วัน`}
        />
        <StatCell
          color={summary.totalLateMinutes > 0 ? AURORA.amber : AURORA.textFaint}
          label="สายสะสม"
          value={
            summary.totalLateMinutes > 0
              ? formatMinutes(summary.totalLateMinutes)
              : 'ไม่มี'
          }
        />
        <StatCell
          color={summary.otMinutes > 0 ? AURORA.accent : AURORA.textFaint}
          label="ล่วงเวลา"
          value={
            summary.otMinutes > 0 ? formatMinutes(summary.otMinutes) : 'ไม่มี'
          }
        />
        <StatCell
          color={summary.leaveDays > 0 ? AURORA.sky : AURORA.textFaint}
          label="วันลา"
          value={summary.leaveDays > 0 ? `${formatNumber(summary.leaveDays)} วัน` : 'ไม่มี'}
        />
      </View>

      {expanded ? (
        <View
          style={{
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: 1,
            paddingTop: 2,
          }}
        >
          <DayListPanel bare days={page.days} today={today} />
        </View>
      ) : null}
    </View>
  );
}

/** สถานะกลางจอ — โหลด/ว่าง/ผิดพลาด/ไม่มีสิทธิ์ ใช้หน้าตาเดียวกันหมด */
function StateBlock({
  action,
  icon,
  message,
  title,
  tone = AURORA.accent,
}: {
  action?: { label: string; onPress: () => void };
  icon: IconName;
  message: string;
  title: string;
  tone?: string;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 7, paddingVertical: 26 }}>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: `${tone}1a`,
          borderRadius: 999,
          height: 52,
          justifyContent: 'center',
          marginBottom: 4,
          width: 52,
        }}
      >
        <Icon color={tone} name={icon} size={23} />
      </View>
      <Text style={{ color: AURORA.text }} variant="bodyStrong">
        {title}
      </Text>
      <Text
        style={{ color: AURORA.textMuted, textAlign: 'center' }}
        variant="caption"
      >
        {message}
      </Text>
      {action ? (
        <SectionAction label={action.label} onPress={action.onPress} />
      ) : null}
    </View>
  );
}

/** หนึ่งตัวเลือกในแผ่นเลือกงวด — แถวคั่นเส้นบาง ชุดเดียวกับแผ่นอื่นของแอป */
function PeriodOption({
  divider,
  label,
  onPress,
  selected,
  subtitle,
}: {
  divider: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  subtitle: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: selected
          ? AURORA.accentSoft
          : pressed
            ? 'rgba(37, 99, 235, 0.06)'
            : 'transparent',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 10,
        minHeight: 56,
        paddingHorizontal: 12,
        paddingVertical: 10,
      })}
    >
      <View
        style={{
          backgroundColor: selected ? AURORA.accent : 'transparent',
          borderRadius: 999,
          height: 18,
          width: 3,
        }}
      />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text
          maxScale={1.15}
          numberOfLines={1}
          style={{
            color: selected ? AURORA.accent : AURORA.text,
            fontSize: 14,
            fontWeight: '700',
            lineHeight: 19,
          }}
        >
          {label}
        </Text>
        <Text
          maxScale={1.15}
          numberOfLines={1}
          style={[
            TABULAR,
            { color: AURORA.textMuted, fontSize: 11.5, lineHeight: 16 },
          ]}
        >
          {subtitle}
        </Text>
      </View>
      <Icon
        color={selected ? AURORA.accent : AURORA.textFaint}
        name={selected ? 'check-circle' : 'chevron-right'}
        size={18}
      />
    </Pressable>
  );
}

export default function AttendanceHistoryScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const bootstrap = useBootstrap();

  const today = todayKey();

  /*
   * จำเฉพาะงวดที่ผู้ใช้กดเอง ค่าเริ่มต้นคำนวณจากลำดับ (งวดล่าสุดกางไว้)
   * ผูกกับเดือนของงวด ไม่ใช่ index เพื่อให้จำถูกก้อนเดิมหลังโหลดงวดเพิ่ม
   */
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  /** null = ดูทุกงวดต่อกัน ค่าอื่นคือดูงวดเดียว */
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [periodSheetOpen, setPeriodSheetOpen] = useState(false);

  const flags = bootstrap.data?.featureFlags;
  const canView = flags?.attendance ?? false;

  const feed = useAttendanceHistoryFeed(today, canView);

  /* HR แก้เวลาย้อนหลังได้ ประวัติจึงเปลี่ยนได้แม้ผู้ใช้ไม่ได้ทำอะไร */
  useRefetchOnFocus(feed);

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

  /* งวดที่ยังไม่มีบันทึกเลยไม่ต้องมีก้อนของตัวเอง (เกิดกับงวดก่อนวันเริ่มงาน) */
  const loaded = (feed.data?.pages ?? []).filter((page) => page.days.length > 0);
  const selected = selectedMonth
    ? loaded.find((page) => page.month === selectedMonth)
    : undefined;
  const shown = selected ? [selected] : loaded;

  const fixList = shown
    .filter((page) => needsFixingCount(page) > 0)
    .map((page) => ({ count: needsFixingCount(page), page }));
  const fixTotal = fixList.reduce((total, item) => total + item.count, 0);

  const selectionLabel = selected ? periodLabel(selected) : 'ทุกงวดที่มีบันทึก';

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          /*
           * ดึงเพื่อรีเฟรชมีเฉพาะบนมือถือ — react-native-web ไม่ได้ทำ
           * RefreshControl ให้ครบ มันส่ง prop อย่าง refreshing ลงไปเป็น
           * attribute ของ DOM ตรง ๆ แล้วขึ้น error แดงคาจอตอน dev
           */
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void feed.refetch()}
                refreshing={feed.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <View>
              <PageHero
                decoration={<AttendanceHistoryMotif />}
                icon="arrow-left"
                iconLabel="ย้อนกลับ"
                onIconPress={() => router.back()}
                subtitle="ทุกงวดที่ผ่านมา แตะหัวข้องวดเพื่อดูเวลารายวัน"
                title="ประวัติลงเวลา"
              />
            </View>
          </Reveal>

          {!canView ? (
            <View style={{ paddingHorizontal: gutter }}>
              <StateBlock
                icon="lock"
                message="ติดต่อฝ่ายบุคคลหากต้องการดูเวลาเข้าออกของบัญชีนี้"
                title="ยังไม่เปิดสิทธิ์ดูประวัติเวลา"
                tone={AURORA.textMuted}
              />
            </View>
          ) : feed.isError ? (
            <View style={{ paddingHorizontal: gutter }}>
              <StateBlock
                action={{
                  label: feed.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่',
                  onPress: () => void feed.refetch(),
                }}
                icon="alert-circle"
                message={
                  feed.error instanceof ApiError
                    ? feed.error.message
                    : 'กรุณาลองใหม่อีกครั้ง'
                }
                title="โหลดประวัติเวลาไม่สำเร็จ"
                tone={AURORA.rose}
              />
            </View>
          ) : feed.isPending ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 24 }}>
              <Skeleton height={200} radius={18} />
            </View>
          ) : loaded.length === 0 ? (
            <View style={{ paddingHorizontal: gutter }}>
              <StateBlock
                icon="clock"
                message="เมื่อลงเวลาครั้งแรกแล้ว งวดของคุณจะมาแสดงที่นี่"
                title="ยังไม่มีประวัติการลงเวลา"
              />
            </View>
          ) : (
            <>
              {/* แถบงวดที่กำลังดู — ชุดเดียวกับแถบเลือกงวดของจอเงินเดือน */}
              <Reveal delay={40}>
                <View
                  style={{
                    alignItems: 'center',
                    borderBottomColor: AURORA.glassBorder,
                    borderBottomWidth: 1,
                    flexDirection: 'row',
                    gap: 12,
                    paddingHorizontal: gutter,
                    paddingVertical: 12,
                  }}
                >
                  <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                    <Text
                      style={{
                        color: AURORA.textMuted,
                        fontSize: 11,
                        lineHeight: 15,
                      }}
                    >
                      กำลังดู
                    </Text>
                    <Text
                      maxScale={1.15}
                      numberOfLines={1}
                      style={{
                        color: AURORA.text,
                        fontSize: 15,
                        fontWeight: '700',
                        lineHeight: 21,
                      }}
                    >
                      {selectionLabel}
                    </Text>
                  </View>

                  <PressableScale
                    accessibilityLabel="เลือกงวดที่ต้องการดู"
                    accessibilityRole="button"
                    onPress={() => setPeriodSheetOpen(true)}
                    style={{
                      alignItems: 'center',
                      backgroundColor: AURORA.accentSoft,
                      borderRadius: 999,
                      flexDirection: 'row',
                      gap: 6,
                      minHeight: 38,
                      paddingHorizontal: 13,
                    }}
                  >
                    <Icon color={AURORA.accent} name="calendar" size={15} />
                    <Text
                      maxScale={1.1}
                      style={{
                        color: AURORA.accent,
                        fontSize: 12,
                        fontWeight: '700',
                        lineHeight: 16,
                      }}
                    >
                      เลือกงวด
                    </Text>
                    <Icon color={AURORA.accent} name="chevron-down" size={14} />
                  </PressableScale>
                </View>
              </Reveal>

              {/*
                วันที่ต้องตามแก้อยู่แถบเดียวบนหัวจอ ไม่ใช่แทรกในทุกงวด — มันคือ
                "งานที่ต้องทำ" ไม่ใช่สรุปของงวด ถ้ากระจายอยู่กลางเนื้อหา ผู้ใช้
                ต้องเลื่อนหาเองว่ามีงวดไหนเตือนบ้าง แต่ยังบอกเป็นรายงวดอยู่
                เพราะงวดที่ปิดไปแล้วยื่นแก้เวลาไม่ได้ ต้องคุยกับฝ่ายบุคคลแทน
              */}
              {fixTotal > 0 ? (
                <Reveal delay={70}>
                  <View
                    style={{
                      backgroundColor: `${AURORA.amber}12`,
                      borderBottomColor: AURORA.glassBorder,
                      borderBottomWidth: 1,
                      paddingHorizontal: gutter,
                      paddingVertical: 12,
                    }}
                  >
                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 9,
                      }}
                    >
                      <Icon
                        color={AURORA.amber}
                        name="alert-triangle"
                        size={17}
                      />
                      <Text
                        style={{
                          color: AURORA.text,
                          flex: 1,
                          fontSize: 14,
                          fontWeight: '800',
                          lineHeight: 19,
                        }}
                      >
                        ต้องจัดการ
                      </Text>
                      <Text
                        maxScale={1.1}
                        style={[
                          TABULAR,
                          {
                            color: AURORA.amber,
                            fontSize: 14,
                            fontWeight: '800',
                            lineHeight: 19,
                          },
                        ]}
                      >
                        {fixTotal} วัน
                      </Text>
                    </View>

                    {fixList.map((item) => (
                      <View
                        key={item.page.month}
                        style={{
                          alignItems: 'center',
                          flexDirection: 'row',
                          gap: 10,
                          paddingTop: 8,
                        }}
                      >
                        <Text
                          maxScale={1.15}
                          numberOfLines={1}
                          style={{
                            color: AURORA.textMuted,
                            flex: 1,
                            fontSize: 11.5,
                            lineHeight: 16,
                          }}
                        >
                          {periodLabel(item.page)}
                        </Text>
                        <Text
                          maxScale={1.1}
                          style={[
                            TABULAR,
                            {
                              color: AURORA.text,
                              fontSize: 11.5,
                              fontWeight: '700',
                              lineHeight: 16,
                            },
                          ]}
                        >
                          {item.count} วัน
                        </Text>
                      </View>
                    ))}

                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 10,
                        paddingTop: 10,
                      }}
                    >
                      <Text
                        maxScale={1.15}
                        style={{
                          color: AURORA.textFaint,
                          flex: 1,
                          fontSize: 11,
                          lineHeight: 15,
                        }}
                      >
                        วันที่เวลาไม่ครบจะถูกนับเป็นขาดงานเมื่อปิดงวด
                      </Text>
                      {flags?.timeAdjust ? (
                        <SectionAction
                          label="ยื่นแก้เวลา"
                          onPress={() =>
                            router.push({
                              params: { type: 'TIME_ADJUST' },
                              pathname: '/request-new',
                            })
                          }
                        />
                      ) : null}
                    </View>
                  </View>
                </Reveal>
              ) : null}

              <View style={{ gap: 30, paddingHorizontal: gutter, paddingTop: 18 }}>
                {shown.map((page, index) => (
                  <Reveal delay={130 + index * 60} key={page.month}>
                    <PeriodBlock
                      /* เลือกดูงวดเดียวคือตั้งใจจะดูงวดนั้น กางให้เลย */
                      expanded={
                        openMonths[page.month] ??
                        (Boolean(selected) || index === 0)
                      }
                      onToggle={() =>
                        setOpenMonths((current) => ({
                          ...current,
                          [page.month]: !(
                            current[page.month] ??
                            (Boolean(selected) || index === 0)
                          ),
                        }))
                      }
                      page={page}
                      today={today}
                    />
                  </Reveal>
                ))}

                {/* เลือกงวดเดียวอยู่ ไม่ต้องมีปุ่มโหลดต่อท้ายให้สับสน */}
                {selected ? null : feed.hasNextPage ? (
                  <PressableScale
                    accessibilityRole="button"
                    disabled={feed.isFetchingNextPage}
                    onPress={() => void feed.fetchNextPage()}
                    style={{
                      alignItems: 'center',
                      backgroundColor: AURORA.accentSoft,
                      borderRadius: 16,
                      justifyContent: 'center',
                      minHeight: 48,
                      opacity: feed.isFetchingNextPage ? 0.62 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: AURORA.accent,
                        fontSize: 13.5,
                        fontWeight: '700',
                        lineHeight: 18,
                      }}
                    >
                      {feed.isFetchingNextPage
                        ? 'กำลังโหลด...'
                        : 'โหลดงวดก่อนหน้า'}
                    </Text>
                  </PressableScale>
                ) : (
                  <Text
                    style={{ color: AURORA.textFaint, textAlign: 'center' }}
                    variant="caption"
                  >
                    แสดงครบทุกงวดที่มีบันทึกแล้ว
                  </Text>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <Sheet
        onClose={() => setPeriodSheetOpen(false)}
        title="เลือกงวดที่ต้องการดู"
        visible={periodSheetOpen}
      >
        <View style={{ marginHorizontal: -4 }}>
          <PeriodOption
            divider={false}
            label="ทุกงวดที่มีบันทึก"
            onPress={() => {
              setSelectedMonth(null);
              setPeriodSheetOpen(false);
            }}
            selected={selectedMonth === null}
            subtitle={`โหลดมาแล้ว ${loaded.length} งวด`}
          />

          {loaded.map((page) => (
            <PeriodOption
              divider
              key={page.month}
              label={periodLabel(page)}
              onPress={() => {
                setSelectedMonth(page.month);
                setPeriodSheetOpen(false);
              }}
              selected={selectedMonth === page.month}
              subtitle={`${page.days.length} วัน${
                needsFixingCount(page) > 0
                  ? ` · ต้องจัดการ ${needsFixingCount(page)} วัน`
                  : ''
              }`}
            />
          ))}
        </View>

        {/*
          โหลดเพิ่มได้จากในแผ่นเลย ไม่ต้องปิดออกไปกดข้างนอกแล้วเปิดใหม่ —
          คนที่เปิดแผ่นนี้คือคนที่กำลังหางวดเก่า ซึ่งมักจะยังไม่ถูกโหลดมา
        */}
        {feed.hasNextPage ? (
          <PressableScale
            accessibilityRole="button"
            disabled={feed.isFetchingNextPage}
            onPress={() => void feed.fetchNextPage()}
            style={{
              alignItems: 'center',
              backgroundColor: AURORA.accentSoft,
              borderRadius: 16,
              justifyContent: 'center',
              marginTop: 10,
              minHeight: 48,
              opacity: feed.isFetchingNextPage ? 0.62 : 1,
            }}
          >
            <Text
              style={{
                color: AURORA.accent,
                fontSize: 13.5,
                fontWeight: '700',
                lineHeight: 18,
              }}
            >
              {feed.isFetchingNextPage
                ? 'กำลังโหลด...'
                : 'โหลดงวดก่อนหน้าเพิ่ม'}
            </Text>
          </PressableScale>
        ) : null}
      </Sheet>
    </View>
  );
}
