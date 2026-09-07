import { useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Sheet, SkeletonList, Text, hitSlop } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  LeaveOvertimeMotif,
  PageHero,
  PeriodBar,
  PressableScale,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import {
  formatMonthLabel,
  formatShortDate,
  monthOf,
  shiftMonth,
  todayKey,
} from '@/features/attendance/calendar';
import { useAttendanceHistory } from '@/features/attendance/use-attendance-history';
import { DayPickerSheet } from '@/features/executive/royal-day-picker';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import {
  useExecutiveAttendanceToday,
  useExecutiveLeaveOtPeriod,
  type ExecutiveRequest,
} from '@/features/executive/executive-views';
import {
  DonutChart,
  SERIES,
  SERIES_REST,
  TABULAR,
} from '@/features/executive/royal';
import { ApiError } from '@/lib/api/api-error';
import { publicFileUrl } from '@/lib/api/public-url';
import { thaiDate, thaiTime } from '@/lib/date/thai-date';

/**
 * ลา & โอที — แท็บที่สองของผู้บริหาร (แทนแท็บลงเวลาของพนักงาน)
 *
 * มีสองแกนให้สลับ ซึ่งตอบคนละคำถามกัน:
 *   - **ช่วงเวลา**: รายวัน (ค่าตั้งต้น "วันนี้ใครไม่อยู่") กับ รายงวด
 *     ("ทั้งงวดใครลาเยอะ ใครโอทีเยอะ") — คนละ endpoint เพราะรายวันเป็น
 *     "สถานะ ณ วันนั้น" ส่วนรายงวดเป็น "ผลรวมของช่วง" (ลาครึ่งวันนับ 0.5)
 *   - **เรื่อง**: ลา หรือ โอที — แยกกันเพราะสองเรื่องนี้คนละการตัดสินใจ
 *     (ลา = กำลังคนพอไหม, โอที = ต้นทุนบานไหม) การเอามาปนกันในลิสต์เดียว
 *     ทำให้ต้องกวาดตาหาเองว่าแถวไหนเป็นเรื่องอะไร
 *
 * ขอบเขตงวดมาจากรอบเงินเดือนของผู้ใช้เอง (`useAttendanceHistory`) ไม่ใช่เดือน
 * ปฏิทิน เพราะวันตัดงวดของแต่ละบริษัทไม่เท่ากัน
 */

type RangeMode = 'day' | 'period';

/**
 * โหมด "รายงวด" ยังไม่เปิดให้ใช้ — ปิดไว้ตามที่ลูกค้าขอ (ยังไม่ได้ใช้งานจริง)
 *
 * ปิดที่ตัวสลับบนจอเท่านั้น ไม่ได้ลบโค้ดของโหมดงวดทิ้ง เพราะทั้งเส้นทางข้อมูล
 * (ขอบเขตงวดจากรอบเงินเดือน + `useExecutiveLeaveOtPeriod`) ทำเสร็จและผ่าน
 * การทดสอบแล้ว เปิดกลับเมื่อไรก็แค่กลับค่านี้เป็น `true`
 *
 * ระหว่างที่ปิด `range` ค้างที่ 'day' เสมอ คำขอของฝั่งงวดจึงไม่ถูกยิงเลย
 */
const PERIOD_ENABLED: boolean = false;
type Topic = 'leave' | 'ot';

/** วันเป็นสตริง "YYYY-MM-DD" เลื่อนแบบ UTC เพื่อไม่ให้เขตเวลาเครื่องมาขยับวัน */
function shiftDay(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const moved = new Date(Date.UTC(year!, month! - 1, day! + delta));

  return moved.toISOString().slice(0, 10);
}

function formatFullDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);

  return thaiDate(new Date(Date.UTC(year!, month! - 1, day!)), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    weekday: 'short',
    year: 'numeric',
  });
}

/**
 * "ยื่น 3 ก.ย." จากใบล่าสุดของคนนั้น
 *
 * ใช้ใบที่ยื่นล่าสุดเมื่อมีหลายใบ เพราะเป็นความเคลื่อนไหวล่าสุดที่ผู้บริหาร
 * อยากรู้ก่อน (รายละเอียดครบทุกใบอยู่ในป๊อปอัพอยู่แล้ว)
 */
function submittedLabel(requests: ExecutiveRequest[]): string | undefined {
  const stamps = requests
    .map((request) => request.submittedAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  const latest = stamps[stamps.length - 1];

  if (!latest) return undefined;

  const parsed = new Date(latest);

  if (Number.isNaN(parsed.getTime())) return undefined;

  return `ยื่น ${thaiDate(parsed, { day: 'numeric', month: 'short' })}`;
}

/**
 * ระยะเวลาแบบอ่านง่าย — ต่ำกว่าหนึ่งชั่วโมงบอกเป็นนาที
 *
 * "0.3 ชม." ไม่มีใครแปลงในหัวได้ว่านานแค่ไหน ส่วน "18 นาที" เข้าใจทันที
 * เกินหนึ่งชั่วโมงที่มีเศษก็บอกทั้งสองหน่วย ("2 ชม. 30 นาที")
 */
function duration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 นาที';

  const totalMinutes = Math.round(hours * 60);

  if (totalMinutes < 60) return `${totalMinutes} นาที`;

  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0
    ? `${wholeHours} ชม.`
    : `${wholeHours} ชม. ${minutes} นาที`;
}

/** ตัดทศนิยมที่ไม่จำเป็นทิ้ง ("2" ไม่ใช่ "2.0") */
function amount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/* ---------------------------------------------------------- ตัวสลับโหมด */

/**
 * ปุ่มสลับรายวัน/รายงวด — เม็ดขาวบนแถบฟ้าจางใต้หัวจอ
 *
 * อยู่บนแถบสีของตัวเอง ไม่ใช่ลอยบนพื้นขาว เพราะเป็นตัวคุม "ช่วงเวลาของทั้งจอ"
 * ตัวเลขทุกตัวที่อยู่ใต้ลงไปเปลี่ยนตามมันหมด — ของระดับนี้ต้องแยกออกจาก
 * เนื้อหาด้วยพื้น ไม่ใช่แค่ระยะห่าง (กติกาเดียวกับแถบสรุปของจอเวลาทำงาน)
 */
function RangeSwitch<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (next: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    <View
      style={{
        backgroundColor: AURORA.baseDeep,
        borderRadius: 999,
        flexDirection: 'row',
        gap: 3,
        padding: 3,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <PressableScale
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: 'center',
              backgroundColor: active ? AURORA.accent : 'transparent',
              borderRadius: 999,
              flex: 1,
              justifyContent: 'center',
              paddingVertical: 7,
            }}
          >
            <Text
              maxScale={1.1}
              numberOfLines={1}
              style={{
                color: active ? '#ffffff' : AURORA.textMuted,
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * แถบเลือกวันของจอนี้ — เปลือกบาง ๆ ของ `PeriodBar` ที่ใช้ร่วมกันทั้งแอป
 *
 * ตรงกลางกดได้ (เปิดปฏิทิน) จึงมีลูกศรลงกำกับ — ถ้าไม่มี ผู้ใช้จะเลื่อนทีละวัน
 * อย่างเดียวแล้วต้องกดสิบกว่าครั้งเวลาย้อนไปไกล
 */
function DaySwitcher({
  canGoNext,
  label,
  onPick,
  onShift,
}: {
  canGoNext: boolean;
  label: string;
  onPick: () => void;
  onShift: (delta: number) => void;
}) {
  return (
    <PeriodBar
      backLabel="วันก่อนหน้า"
      canGoNext={canGoNext}
      forwardLabel="วันถัดไป"
      label={label}
      onPick={onPick}
      onShift={onShift}
      pickLabel="เลือกวัน"
    />
  );
}

/**
 * แท็บ ลา / โอที — ขีดใต้ตัวที่เลือก พร้อมจำนวนคนต่อท้าย
 *
 * ไม่ใช่ปุ่มพื้นทึบอีกใบ เพราะบนจอเดียวกันมีตัวสลับพื้นทึบอยู่แล้ว (รายวัน/
 * รายงวด) ของสองชิ้นที่หน้าตาเหมือนกันแต่คุมคนละเรื่องคือที่มาของการกดผิด
 * ขีดใต้บอกว่า "กำลังอ่านเรื่องไหนอยู่" ซึ่งเบากว่าและอ่านออกพอกัน
 *
 * จำนวนติดอยู่บนแท็บเลย ผู้บริหารจึงรู้ว่าอีกฝั่งมีของรออยู่กี่คนโดยไม่ต้องกดดู
 */
function TopicTabs<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (next: T) => void;
  options: { count: number; label: string; value: T }[];
  value: T;
}) {
  return (
    <View
      style={{
        borderBottomColor: AURORA.glassBorder,
        borderBottomWidth: 1,
        flexDirection: 'row',
      }}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <PressableScale
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{
              alignItems: 'center',
              borderBottomColor: active ? AURORA.accent : 'transparent',
              borderBottomWidth: 2.5,
              /* แบ่งครึ่งเท่ากัน ขีดใต้จึงยาวเต็มช่องของตัวเอง ไม่ใช่ยาวแค่
                 ตามความกว้างของคำ ซึ่งทำให้ "ลา" กับ "โอที" ได้ขีดยาวไม่เท่ากัน */
              flex: 1,
              flexDirection: 'row',
              gap: 7,
              justifyContent: 'center',
              /* ขีดของแท็บทับเส้นคั่นของแถว ไม่ใช่ลอยอยู่เหนือมัน */
              marginBottom: -1,
              paddingBottom: 10,
            }}
          >
            <Text
              maxScale={1.1}
              style={{
                color: active ? AURORA.text : AURORA.textMuted,
                fontSize: 14,
                fontWeight: active ? '800' : '600',
              }}
            >
              {option.label}
            </Text>

            {/* จำนวนเป็นเม็ดกลม ไม่ใช่ตัวเลขลอย — ตัวเลขลอยข้างคำอ่านเป็นส่วน
                หนึ่งของชื่อแท็บ ("ลา 1" เหมือนชื่อเรื่อง ไม่ใช่ป้ายจำนวน) */}
            <View
              style={{
                alignItems: 'center',
                backgroundColor: active ? AURORA.accent : AURORA.base,
                borderRadius: 999,
                minWidth: 21,
                paddingHorizontal: 6,
                paddingVertical: 1.5,
              }}
            >
              <Text
                maxScale={1}
                style={[
                  TABULAR,
                  {
                    color: active ? '#ffffff' : AURORA.textMuted,
                    fontSize: 10.5,
                    fontWeight: '800',
                    lineHeight: 15,
                  },
                ]}
              >
                {option.count}
              </Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * จำนวนแผนกที่ยกมาแสดงจริง — ที่เหลือยุบเป็น "อื่น ๆ" ทั้งในวงและในรายการ
 *
 * ลูกค้ารายนี้มีสิบสี่แผนก ถ้าแสดงครบ รายการจะยาวกว่าวงแหวนสามเท่าและกลาย
 * เป็นตารางที่ต้องอ่านทีละบรรทัด ซึ่งเป็นงานของรายชื่อพนักงานด้านล่าง ไม่ใช่
 * ของกราฟ — กราฟมีหน้าที่บอกว่า "หน่วยไหนหนักสุดสองสามหน่วย" เท่านั้น
 *
 * ใช้กับวงแผนกเท่านั้น วงบริษัทในเครือแสดงครบทุกแห่งเสมอ (มีไม่กี่แห่งและเป็น
 * โครงที่ต้องอยู่คงที่) ส่วนแผนกที่ถูกยุบยังกรองได้จากแผ่นตัวกรองข้างหัวข้อรายชื่อ
 */
const TOP_UNITS = 3;

/**
 * สรุปรายหน่วยงาน — วงแหวนหนึ่งวงกับรายการใต้วง
 *
 * วงแหวนอยู่ซ้าย รายชื่อหน่วยอยู่ขวา — วงตอบ "ใครกินสัดส่วนเท่าไรของทั้งก้อน"
 * ส่วนรายชื่อตอบว่าแต่ละชิ้นคือใครและกี่คน สองอย่างอยู่ในสายตาเดียวกัน
 * ไม่ต้องกวาดขึ้นลง
 *
 * วงแหวนยุบหน่วยที่เล็กกว่าท็อปห้าเป็น "อื่น ๆ" เพราะชิ้นที่บางกว่าไม่กี่องศา
 * มองไม่ออกอยู่ดี แต่ **รายการใต้วงแสดงครบทุกหน่วย** โดยหน่วยที่ถูกยุบใช้
 * จุดสีเทาเดียวกับชิ้น "อื่น ๆ" — ตัวเลขของหน่วยเล็กยังต้องอ่านได้
 *
 * แต่ละแถวกดเพื่อกรองรายชื่อด้านล่างได้ทันที กดซ้ำเพื่อยกเลิก — ตัวเลขที่บอกว่า
 * หน่วยไหนเยอะที่สุดจะไร้ประโยชน์ ถ้าดูแล้วต้องไปไล่หาชื่อเอาเองในรายการยาว ๆ
 */
function UnitDonut({
  activeId,
  centerLabel,
  centerText,
  limit,
  onToggle,
  units,
}: {
  activeId: string | null;
  centerLabel: string;
  centerText: string;
  /** ยกมาแสดงกี่หน่วย ที่เหลือยุบเป็น "อื่น ๆ" — ไม่ส่งมาแปลว่าแสดงครบทุกหน่วย */
  limit?: number;
  onToggle: (id: string | null) => void;
  units: {
    id: string;
    label: string;
    primary: string;
    value: number;
  }[];
}) {
  const top = limit ? units.slice(0, limit) : units;
  const rest = limit ? units.slice(limit) : [];
  const restValue = rest.reduce((sum, unit) => sum + unit.value, 0);

  const slices = [
    ...top.map((unit, index) => ({
      color: SERIES[index % SERIES.length]!,
      label: unit.label,
      text: unit.primary,
      value: unit.value,
    })),
    ...(rest.length > 0
      ? [
          {
            color: SERIES_REST,
            label: 'อื่น ๆ',
            text: `${restValue} คน`,
            value: restValue,
          },
        ]
      : []),
  ];

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 13 }}>
      <DonutChart
        center={centerText}
        centerLabel={centerLabel}
        size={92}
        slices={slices}
      />

      {/* คอลัมน์ขวาแคบกว่าครึ่งจอ ชื่อบริษัทจึงตัดได้สองบรรทัด ไม่ใช่บรรทัดเดียว
          แล้วโดนตัดหาย — ความสูงของแถวไม่เท่ากันยอมได้ แต่ชื่อหายไม่ได้ */}
      <View style={{ flex: 1, minWidth: 0 }}>
        {top.map((unit, index) => {
          const active = unit.id === activeId;

          return (
            <Pressable
              accessibilityLabel={`กรองเฉพาะ ${unit.label}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={unit.id}
              onPress={() => onToggle(active ? null : unit.id)}
              style={({ pressed }) => ({
                alignItems: 'flex-start',
                backgroundColor: pressed
                  ? 'rgba(37, 99, 235, 0.06)'
                  : 'transparent',
                borderTopColor: AURORA.glassBorder,
                borderTopWidth: index > 0 ? 1 : 0,
                flexDirection: 'row',
                gap: 8,
                marginHorizontal: -4,
                paddingHorizontal: 4,
                paddingVertical: 5,
              })}
            >
              {/* จุดสีเดียวกับชิ้นในวงแหวน — ตัวเดียวที่ผูกแถวเข้ากับกราฟ */}
              <View
                style={{
                  backgroundColor: SERIES[index % SERIES.length]!,
                  borderRadius: 999,
                  height: 8,
                  marginTop: 3.5,
                  width: 8,
                }}
              />

              <Text
                numberOfLines={2}
                style={{
                  color: active ? AURORA.accent : AURORA.text,
                  flex: 1,
                  fontSize: 11.5,
                  fontWeight: active ? '700' : '500',
                  lineHeight: 16,
                }}
              >
                {unit.label}
              </Text>

              <Text
                maxScale={1.1}
                numberOfLines={1}
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
                {unit.primary}
              </Text>
            </Pressable>
          );
        })}

        {/* "อื่น ๆ" ไม่ใช่ปุ่มกรอง เพราะไม่ได้ชี้ไปที่หน่วยใดหน่วยหนึ่ง —
            เป็นบรรทัดบอกว่ายังมีของเหลืออยู่เท่าไร ไม่ใช่ทางลัดไปไหน */}
        {rest.length > 0 ? (
          <View
            style={{
              alignItems: 'flex-start',
              borderTopColor: AURORA.glassBorder,
              borderTopWidth: 1,
              flexDirection: 'row',
              gap: 8,
              paddingVertical: 5,
            }}
          >
            <View
              style={{
                backgroundColor: SERIES_REST,
                borderRadius: 999,
                height: 8,
                marginTop: 3.5,
                width: 8,
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                color: AURORA.textMuted,
                flex: 1,
                fontSize: 11.5,
                lineHeight: 16,
              }}
            >
              {`อื่น ๆ ${rest.length} หน่วย`}
            </Text>
            <Text
              maxScale={1.1}
              style={[
                TABULAR,
                {
                  color: AURORA.textMuted,
                  fontSize: 11.5,
                  fontWeight: '700',
                  lineHeight: 16,
                },
              ]}
            >
              {`${restValue} คน`}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** ป้ายกลุ่มย่อยในหมวด (บริษัทในเครือ / แผนก) — เล็กกว่าหัวข้อหมวดหนึ่งขั้น */
function GroupLabel({ text }: { text: string }) {
  return (
    <Text
      maxScale={1.15}
      style={{ color: AURORA.textFaint, fontSize: 11, lineHeight: 15 }}
    >
      {text}
    </Text>
  );
}

/* ---------------------------------------------------------- ตัวกรองหน่วย */

interface UnitOption {
  count: string;
  id: string;
  label: string;
}

/**
 * ป๊อปอัพเลือกบริษัทในเครือ/แผนก — เปิดจากไอคอนเล็กข้างหัวข้อรายการ
 *
 * เดิมเป็นแถบชิปคาอยู่บนจอ ซึ่งกินที่สองแถวตลอดเวลาแม้ผู้ใช้จะไม่ได้กรอง
 * ทั้งที่เป็นของที่แตะนาน ๆ ครั้ง — กติกาเดียวกับตัวกรองของแท็บอนุมัติ/คำขอ
 * ที่ให้ตัวเลือกทั้งหมดอยู่ในแผ่น ไม่ใช่บนจอ
 *
 * ตัวเลขท้ายแต่ละตัวเลือกคือจำนวนคนของหน่วยนั้นในช่วงที่กำลังดูอยู่
 */
function FilterSheet({
  branchValue,
  branches,
  departmentValue,
  departments,
  onClear,
  onClose,
  onSelectBranch,
  onSelectDepartment,
  visible,
}: {
  branchValue: string | null;
  branches: UnitOption[];
  departmentValue: string | null;
  departments: UnitOption[];
  onClear: () => void;
  onClose: () => void;
  onSelectBranch: (id: string | null) => void;
  onSelectDepartment: (id: string | null) => void;
  visible: boolean;
}) {
  const hasFilter = Boolean(branchValue || departmentValue);

  const group = (
    label: string,
    options: UnitOption[],
    value: string | null,
    onSelect: (id: string | null) => void,
  ) => {
    if (options.length === 0) return null;

    return (
      <View style={{ gap: 4 }}>
        {/* หัวข้อกลุ่มในแผ่น = ขีดน้ำเงินสั้นชุดเดียวกับหัวข้อหมวดบนจอ
            ไม่ใช่ป้ายตัวเล็กเว้นวรรคกว้าง ซึ่งเป็นผิวรุ่นก่อนของแอป */}
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: 9,
            paddingBottom: 4,
          }}
        >
          <View
            style={{
              backgroundColor: AURORA.accent,
              borderRadius: 999,
              height: 14,
              width: 3,
            }}
          />
          <Text style={{ color: AURORA.text, flex: 1 }} variant="h3">
            {label}
          </Text>
        </View>

        {[{ count: '', id: '', label: 'ทั้งหมด' }, ...options].map(
          (option, index) => {
            const id = option.id === '' ? null : option.id;
            const active = id === value;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={option.id || 'all'}
                onPress={() => {
                  onSelect(id);
                  onClose();
                }}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: pressed
                    ? 'rgba(37, 99, 235, 0.06)'
                    : 'transparent',
                  borderTopColor: AURORA.glassBorder,
                  borderTopWidth: index > 0 ? 1 : 0,
                  flexDirection: 'row',
                  gap: 10,
                  marginHorizontal: -6,
                  minHeight: 46,
                  paddingHorizontal: 6,
                  paddingVertical: 9,
                })}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    color: active ? AURORA.accent : AURORA.text,
                    flex: 1,
                    fontSize: 13,
                    fontWeight: active ? '700' : '500',
                    lineHeight: 19,
                  }}
                >
                  {option.label}
                </Text>

                {option.count ? (
                  <Text
                    maxScale={1.1}
                    style={[
                      TABULAR,
                      { color: AURORA.textFaint, fontSize: 11.5 },
                    ]}
                  >
                    {`${option.count} คน`}
                  </Text>
                ) : null}

                {/* ช่องเครื่องหมายถูกกว้างคงที่ ตัวเลือกที่ไม่ได้เลือกจึงไม่ขยับ
                    ตำแหน่งตัวเลขเมื่อสลับไปเลือกตัวอื่น */}
                <View style={{ alignItems: 'center', width: 20 }}>
                  {active ? (
                    <Icon color={AURORA.accent} name="check" size={17} />
                  ) : null}
                </View>
              </Pressable>
            );
          },
        )}
      </View>
    );
  };

  return (
    <Sheet onClose={onClose} title="กรองรายชื่อ" visible={visible}>
      <View style={{ gap: 20, paddingBottom: 8 }}>
        {group('บริษัทในเครือ', branches, branchValue, onSelectBranch)}
        {group('แผนก', departments, departmentValue, onSelectDepartment)}

        {/* ล้างทั้งสองกลุ่มในปุ่มเดียว — เดิมต้องไล่กด "ทั้งหมด" ทีละกลุ่ม
            ปุ่มโผล่เฉพาะตอนมีตัวกรองอยู่จริง ไม่งั้นเป็นปุ่มที่กดแล้วไม่เกิดอะไร */}
        {hasFilter ? (
          <Button
            onPress={() => {
              onClear();
              onClose();
            }}
            title="ล้างตัวกรอง"
            variant="secondary"
          />
        ) : null}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------- แดชบอร์ดย่อ */

/**
 * สีของแต่ละชิ้นในกราฟ — ไล่เฉดฟ้าของจอนี้ ไม่ใช่สีสุ่มคนละโทน
 * หน่วยที่เหลือหลังตัดท็อปห้าจะถูกยุบเป็น "อื่น ๆ" สีเทา
 */
/* ------------------------------------------------------ รายละเอียดใบคำขอ */

/** "3 ก.ย. 2568" จากค่า ISO ที่ backend ส่งมา */
function formatIsoDate(iso?: string | null): string | null {
  if (!iso) return null;

  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) return null;

  return thaiDate(parsed, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "3 ก.ย. 2568 · 09:15" — ใช้กับเวลาที่ยื่น/อนุมัติ ซึ่งเวลาในวันมีความหมาย */
function formatIsoDateTime(iso?: string | null): string | null {
  const date = formatIsoDate(iso);
  const time = formatIsoTime(iso);

  return date ? (time ? `${date} · ${time} น.` : date) : null;
}

/** "08:30" — ใช้กับใบโอทีที่บอกช่วงเวลาเป็นชั่วโมง ไม่ใช่เป็นวัน */
function formatIsoTime(iso?: string | null): string | null {
  if (!iso) return null;

  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) return null;

  return thaiTime(parsed);
}

/**
 * ป๊อปอัพรายละเอียดใบคำขอของพนักงานหนึ่งคน
 *
 * ใบลาบอกเป็น "ช่วงวัน" ส่วนใบโอทีบอกเป็น "ช่วงเวลาในวันเดียว" จึงจัดรูปแบบ
 * คนละแบบตาม `kind` แทนที่จะยัดลงแม่แบบเดียวแล้วได้ "3 ก.ย. – 3 ก.ย."
 */
function RequestDetailSheet({
  onClose,
  person,
  visible,
}: {
  onClose: () => void;
  person: {
    avatarUrl?: string | null;
    meta: string;
    name: string;
    requests: ExecutiveRequest[];
  } | null;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      {/* แตะพื้นมืดรอบ ๆ เพื่อปิด — แผ่นลอยกลางจอ ไม่ใช่แผ่นเลื่อนจากขอบล่าง
          เพราะเป็นของที่ "อ่านแล้วปิด" ไม่ใช่ของที่ต้องเลือกอะไรต่อ */}
      <Pressable
        onPress={onClose}
        style={{
          alignItems: 'center',
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          flex: 1,
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: AURORA.baseDeep,
            borderRadius: 22,
            elevation: 8,
            maxHeight: '80%',
            maxWidth: 420,
            paddingHorizontal: 20,
            paddingVertical: 18,
            shadowColor: '#0b1c4d',
            shadowOffset: { height: 10, width: 0 },
            shadowOpacity: 0.22,
            shadowRadius: 24,
            width: '100%',
          }}
        >
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: 10,
              paddingBottom: 14,
            }}
          >
            <Text
              style={{
                color: AURORA.text,
                flex: 1,
                fontSize: 15,
                fontWeight: '800',
              }}
            >
              รายละเอียดคำขอ
            </Text>
            <PressableScale
              accessibilityLabel="ปิด"
              hitSlop={hitSlop}
              onPress={onClose}
              style={{
                alignItems: 'center',
                backgroundColor: AURORA.accentSoft,
                borderRadius: 999,
                height: 28,
                justifyContent: 'center',
                width: 28,
              }}
            >
              <Icon color={AURORA.textMuted} name="x" size={16} />
            </PressableScale>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {person ? (
              <View style={{ paddingBottom: 4 }}>
                {/* หัวการ์ด: รูป + ชื่อ + สังกัด */}
                <View
                  style={{
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: 12,
                    paddingBottom: 14,
                  }}
                >
                  <Avatar name={person.name} url={person.avatarUrl} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: AURORA.text,
                        fontSize: 15,
                        fontWeight: '800',
                      }}
                    >
                      {person.name}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{ color: AURORA.textMuted, fontSize: 11.5 }}
                    >
                      {person.meta}
                    </Text>
                  </View>
                </View>

                {person.requests.length === 0 ? (
                  <Text
                    style={{
                      borderTopColor: AURORA.glassBorder,
                      borderTopWidth: 1,
                      color: AURORA.textMuted,
                      fontSize: 12.5,
                      paddingTop: 14,
                    }}
                  >
                    ไม่พบใบคำขอของช่วงนี้ — ตัวเลขอาจมาจากที่ HR บันทึกให้โดยตรง
                  </Text>
                ) : (
                  person.requests.map((request) => {
                    const isLeaveRequest = request.kind === 'LEAVE';
                    const from = formatIsoDate(request.from);
                    const to = formatIsoDate(request.to);
                    const dateRange = isLeaveRequest
                      ? from === to
                        ? from
                        : [from, to].filter(Boolean).join(' – ')
                      : from;
                    const timeRange = isLeaveRequest
                      ? request.clock
                      : [formatIsoTime(request.from), formatIsoTime(request.to)]
                          .filter(Boolean)
                          .join(' – ');

                    /* ไม่มีกล่องซ้อนกล่อง — แต่ละใบคั่นด้วยเส้นบางเส้นเดียว
                       ลำดับความสำคัญมาจากขนาดตัวหนังสือ ไม่ใช่จากพื้นสี */
                    return (
                      <View
                        key={request.id}
                        style={{
                          borderTopColor: AURORA.glassBorder,
                          borderTopWidth: 1,
                          gap: 10,
                          paddingBottom: 2,
                          paddingTop: 14,
                        }}
                      >
                        <View
                          style={{
                            alignItems: 'flex-start',
                            flexDirection: 'row',
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text
                              style={{
                                color: AURORA.text,
                                fontSize: 14,
                                fontWeight: '800',
                              }}
                            >
                              {request.label}
                            </Text>
                            {request.detail ? (
                              <Text
                                style={{
                                  color: AURORA.textMuted,
                                  fontSize: 11,
                                }}
                              >
                                {request.detail}
                              </Text>
                            ) : null}
                          </View>

                          <Text
                            maxScale={1.1}
                            style={[
                              TABULAR,
                              {
                                color: AURORA.accent,
                                fontSize: 14,
                                fontWeight: '800',
                              },
                            ]}
                          >
                            {duration(request.amount)}
                          </Text>
                        </View>

                        <View style={{ gap: 7 }}>
                          {dateRange ? (
                            <DetailLine
                              label={
                                isLeaveRequest ? 'วันที่ลา' : 'วันที่ทำโอที'
                              }
                              value={dateRange}
                            />
                          ) : null}
                          {timeRange ? (
                            <DetailLine label="ช่วงเวลา" value={timeRange} />
                          ) : null}
                          <DetailLine
                            label="ยื่นเมื่อ"
                            value={
                              formatIsoDateTime(request.submittedAt) ?? '—'
                            }
                          />
                          <DetailLine
                            label="อนุมัติเมื่อ"
                            value={
                              formatIsoDateTime(request.approvedAt) ??
                              'ไม่มีบันทึกการอนุมัติ'
                            }
                          />
                          {request.reason ? (
                            <DetailLine label="เหตุผล" value={request.reason} />
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** บรรทัดป้าย-ค่า ในป๊อปอัพรายละเอียด */
function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Text style={{ color: AURORA.textMuted, fontSize: 11.5, width: 88 }}>
        {label}
      </Text>
      <Text style={{ color: AURORA.text, flex: 1, fontSize: 11.5 }}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ รายชื่อคน */

/** อักษรย่อจากชื่อ — ใช้เมื่อไม่มีรูปหรือรูปโหลดไม่ขึ้น */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(
      (part) => part && !/^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.)$/.test(part),
    )
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
}

/**
 * รูปโปรไฟล์พนักงาน
 *
 * ไฟล์รูปเสิร์ฟจาก **ราก** ของ backend ไม่ได้อยู่ใต้ `/api` จึงต้องผ่าน
 * `publicFileUrl` เสมอ (ต่อ URL เองจะได้ 404 เงียบ ๆ แล้วตกไปใช้อักษรย่อ
 * ทั้งที่รูปมีอยู่จริง — กับดักเดียวกับที่เขียนไว้ใน public-url.ts)
 *
 * พนักงานที่ยังไม่มีบัญชีผู้ใช้จะไม่มีรูป จึงต้องมีอักษรย่อเป็นตัวสำรองเสมอ
 */
function Avatar({ name, url }: { name: string; url?: string | null }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : publicFileUrl(url ?? null);
  const size = 38;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: AURORA.accentSoft,
        borderRadius: 999,
        height: size,
        justifyContent: 'center',
        overflow: 'hidden',
        width: size,
      }}
    >
      {source ? (
        <Image
          accessibilityLabel={`รูปของ ${name}`}
          onError={() => setFailed(true)}
          source={{ uri: source }}
          style={{ height: size, width: size }}
        />
      ) : (
        <Text
          maxScale={1}
          style={{ color: AURORA.accent, fontSize: 13, fontWeight: '800' }}
        >
          {initialsOf(name) || '—'}
        </Text>
      )}
    </View>
  );
}

function PersonRow({
  avatarUrl,
  divider,
  meta,
  name,
  onPress,
  submitted,
  tag,
}: {
  avatarUrl?: string | null;
  divider: boolean;
  meta: string;
  name: string;
  onPress: () => void;
  /** "ยื่น 3 ก.ย." — ละไว้ได้เมื่อไม่มีใบคำขอผูกกับแถวนั้น */
  submitted?: string;
  tag: string;
}) {
  return (
    <PressableScale
      accessibilityLabel={`ดูรายละเอียดของ ${name}`}
      onPress={onPress}
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 11,
      }}
    >
      <Avatar name={name} url={avatarUrl} />

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: AURORA.text, fontSize: 13.5, fontWeight: '600' }}
        >
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={{ color: AURORA.textMuted, fontSize: 10.5 }}
        >
          {meta}
        </Text>
      </View>

      {/* วันที่ยื่นอยู่คอลัมน์ขวาใต้ประเภทคำขอ ไม่ใช่ต่อท้ายชื่อแผนก/สาขา —
          ชื่อบริษัทของลูกค้ารายนี้ยาวจนบรรทัดถูกตัด แล้ววันที่ยื่นหายไปทั้งบรรทัด */}
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={[
            TABULAR,
            { color: AURORA.accent, fontSize: 12, fontWeight: '700' },
          ]}
        >
          {tag}
        </Text>
        {submitted ? (
          <Text
            maxScale={1.1}
            numberOfLines={1}
            style={[TABULAR, { color: AURORA.textMuted, fontSize: 10 }]}
          >
            {submitted}
          </Text>
        ) : null}
      </View>

      <Icon color={AURORA.textMuted} name="chevron-right" size={16} />
    </PressableScale>
  );
}

/**
 * รายการงวดย้อนหลัง — ป้ายชื่อคำนวณจากเดือนของงวดปัจจุบันที่ backend ตอบมา
 * แล้วถอยทีละเดือน จึงไม่ต้องยิงคำขอเพิ่มเพื่อสร้างรายการให้เลือก
 * (ขอบเขตวันที่จริงของงวดที่เลือกค่อยโหลดตอนกดเลือก)
 */
function PeriodPickerSheet({
  currentPeriodMonth,
  onClose,
  onSelect,
  selectedOffset,
  visible,
}: {
  currentPeriodMonth: string;
  onClose: () => void;
  onSelect: (offset: number) => void;
  selectedOffset: number;
  visible: boolean;
}) {
  const offsets = Array.from({ length: 12 }, (_, index) => -index);

  return (
    <Sheet onClose={onClose} title="เลือกงวด" visible={visible}>
      <View style={{ paddingBottom: 8 }}>
        {offsets.map((offset, index) => {
          const isSelected = offset === selectedOffset;

          return (
            <PressableScale
              accessibilityState={{ selected: isSelected }}
              key={offset}
              onPress={() => {
                onSelect(offset);
                onClose();
              }}
              style={{
                alignItems: 'center',
                borderTopColor: AURORA.glassBorder,
                borderTopWidth: index > 0 ? 1 : 0,
                flexDirection: 'row',
                gap: 12,
                paddingVertical: 13,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: isSelected ? AURORA.accent : AURORA.text,
                    fontSize: 14,
                    fontWeight: isSelected ? '800' : '600',
                  }}
                >
                  {`งวด${formatMonthLabel(shiftMonth(currentPeriodMonth, offset))}`}
                </Text>
                {offset === 0 ? (
                  <Text style={{ color: AURORA.textMuted, fontSize: 10.5 }}>
                    งวดปัจจุบัน
                  </Text>
                ) : null}
              </View>

              {isSelected ? (
                <Icon color={AURORA.accent} name="check" size={18} />
              ) : null}
            </PressableScale>
          );
        })}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------- */

/** หัวข้อหมวด — ขีดน้ำเงินสั้นนำหน้า ชุดเดียวกับ `PageSection` ของจอพนักงาน */
function Heading({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 9 }}>
      <View
        style={{
          backgroundColor: AURORA.accent,
          borderRadius: 999,
          height: 15,
          width: 3,
        }}
      />
      <Text style={{ color: AURORA.text, flex: 1 }} variant="h3">
        {title}
      </Text>
      {trailing ? (
        <Text
          style={{ color: AURORA.textFaint, fontSize: 11.5, lineHeight: 16 }}
        >
          {trailing}
        </Text>
      ) : null}
    </View>
  );
}

export function ExecutiveDaily() {
  const { gutter } = useResponsive();
  const bootstrap = useBootstrap();
  const canView = bootstrap.data?.featureFlags.executive ?? false;

  const [range, setRange] = useState<RangeMode>('day');
  const [topic, setTopic] = useState<Topic>('leave');
  const [date, setDate] = useState(() => todayKey());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detail, setDetail] = useState<{
    avatarUrl?: string | null;
    meta: string;
    name: string;
    requests: ExecutiveRequest[];
  } | null>(null);
  const hasFilter = Boolean(branchFilter || departmentFilter);
  /* เดือนที่ปฏิทินเปิดค้างอยู่ — ตั้งใหม่ทุกครั้งที่กดเปิด ให้ตามวันที่เลือกอยู่ */
  const [pickerMonth, setPickerMonth] = useState(() => monthOf(todayKey()));
  const isToday = date === todayKey();

  const daily = useExecutiveAttendanceToday(
    { date },
    canView && range === 'day',
  );

  /*
   * ขอบเขตงวดถามจากรอบเงินเดือนของผู้ใช้เอง — ยิงเฉพาะตอนสลับมาโหมดงวด
   * เพราะจอเปิดมาเป็นรายวันเสมอ ไม่ต้องจ่ายคำขอนี้ให้คนที่ไม่ได้กดดู
   */
  const [periodOffset, setPeriodOffset] = useState(0);
  const periodEnabled = canView && range === 'period';

  /*
   * งวดปัจจุบันต้องถามด้วยวันที่ "วันนี้" ก่อน เพราะเดือนของงวดไม่เท่ากับเดือน
   * ปฏิทิน (ตัดวันที่ 25 แปลว่า 26 ส.ค. อยู่ในงวดกันยายนแล้ว) แล้วค่อยถอยจาก
   * เดือนของงวดที่ backend ตอบกลับมา ไม่ใช่เดาเอาจากเดือนปฏิทินของวันนี้
   */
  const currentHistory = useAttendanceHistory(
    monthOf(todayKey()),
    'payroll',
    todayKey(),
    periodEnabled,
  );
  const currentPeriodMonth = currentHistory.data?.period
    ? monthOf(currentHistory.data.period.to)
    : monthOf(todayKey());
  const pastHistory = useAttendanceHistory(
    shiftMonth(currentPeriodMonth, periodOffset),
    'payroll',
    undefined,
    periodEnabled && periodOffset !== 0,
  );
  const history = periodOffset === 0 ? currentHistory : pastHistory;
  const periodFrom = history.data?.period?.from ?? '';
  const periodTo = history.data?.period?.to ?? '';

  const period = useExecutiveLeaveOtPeriod(
    { from: periodFrom, to: periodTo },
    canView && range === 'period',
  );

  const isPeriod = range === 'period';
  const isLeave = topic === 'leave';

  /* สถานะโหลด/พังของโหมดที่กำลังดูอยู่เท่านั้น */
  const active = isPeriod ? period : daily;
  const waitingForPeriod = isPeriod && !periodFrom && history.isPending;

  /* ------------------------------------------------------------ รายการ */
  const dayLeaveRows = (daily.data?.rows ?? []).filter(
    (row) => row.status === 'LEAVE',
  );
  const dayOtRows = (daily.data?.rows ?? [])
    .filter((row) => row.otHours > 0)
    .sort((left, right) => right.otHours - left.otHours);

  const periodLeaveRows = (period.data?.rows ?? [])
    .filter((row) => row.leaveHours > 0)
    .sort((left, right) => right.leaveHours - left.leaveHours);
  const periodOtRows = (period.data?.rows ?? [])
    .filter((row) => row.otHours > 0)
    .sort((left, right) => right.otHours - left.otHours);

  /* ตัวกรองหน่วยงาน — ใช้ id ไม่ใช่ชื่อ เพราะชื่อแผนกซ้ำกันข้ามบริษัทได้ */
  const matchesUnit = (row: {
    branchId?: string | null;
    departmentId?: string | null;
  }) =>
    (!branchFilter || row.branchId === branchFilter) &&
    (!departmentFilter || row.departmentId === departmentFilter);

  /* แท็บลาโชว์เฉพาะใบลา แท็บโอทีโชว์เฉพาะใบโอที — ไม่งั้นกดคนที่ทั้งลาและ
     ทำโอทีในงวดเดียวกันแล้วป๊อปอัพจะขึ้นปนกันจนอ่านไม่รู้เรื่อง */
  const pickRequests = (requests: ExecutiveRequest[]) =>
    requests.filter((request) =>
      isLeave ? request.kind === 'LEAVE' : request.kind === 'OT',
    );

  const listRows = isPeriod
    ? (isLeave ? periodLeaveRows : periodOtRows)
        .filter(matchesUnit)
        .map((row) => ({
          avatarUrl: row.avatarUrl,
          id: row.id,
          meta: [row.department, row.branch].filter(Boolean).join(' · '),
          name: row.name,
          requests: pickRequests(row.requests),
          tag: duration(isLeave ? row.leaveHours : row.otHours),
        }))
    : (isLeave ? dayLeaveRows : dayOtRows).filter(matchesUnit).map((row) => ({
        avatarUrl: row.avatarUrl,
        id: row.id,
        meta: [row.department, row.branch].filter(Boolean).join(' · '),
        name: row.name,
        requests: pickRequests(row.requests),
        tag: isLeave ? (row.leaveType ?? 'ลางาน') : duration(row.otHours),
      }));

  /* ------------------------------------------------- ตัวกรองรายหน่วยงาน */
  /**
   * ตัวเลือกในแผ่นกรอง — เส้นทางที่สองของการกรอง
   *
   * ทางหลักคือกดที่แถวสรุปรายหน่วยงานตรง ๆ (ดู `UnitDonut`) ส่วนแผ่นนี้มีไว้
   * ตอนที่หน่วยที่อยากกรองไม่ได้อยู่ในสรุป เพราะยอดของมันเป็นศูนย์ในช่วงนั้น
   */
  const unitOptions = (source: 'branch' | 'department') => {
    if (isPeriod) {
      const rows =
        source === 'branch'
          ? (period.data?.byBranch ?? [])
          : (period.data?.byDepartment ?? []);

      return rows
        .filter(
          (unit) =>
            unit.id && (isLeave ? unit.leavePeople > 0 : unit.otPeople > 0),
        )
        .map((unit) => ({
          count: `${isLeave ? unit.leavePeople : unit.otPeople}`,
          id: unit.id!,
          label: unit.label,
        }));
    }

    const rows =
      source === 'branch'
        ? (daily.data?.byBranch ?? [])
        : (daily.data?.byDepartment ?? []);

    return rows
      .filter(
        (unit) => unit.id && (isLeave ? unit.leave > 0 : unit.otPeople > 0),
      )
      .map((unit) => ({
        count: `${isLeave ? unit.leave : unit.otPeople}`,
        id: unit.id!,
        label: unit.label,
      }));
  };

  const branchOptions = unitOptions('branch');
  const departmentOptions = unitOptions('department');

  /* ----------------------------------------------- สรุปรายหน่วยงาน */
  /**
   * ตัวเลขของสรุปเปลี่ยนตามแท็บที่เปิดอยู่เสมอ — แท็บลาสรุปการลา แท็บโอที
   * สรุปโอที ไม่เอามารวมกันในชุดเดียว เพราะสองเรื่องนี้คนละหน่วยและคนละ
   * การตัดสินใจ (วัน/คน กับ ชั่วโมง/คน)
   */
  const unitSummaries = (source: 'branch' | 'department') => {
    const rows = isPeriod
      ? source === 'branch'
        ? (period.data?.byBranch ?? [])
        : (period.data?.byDepartment ?? [])
      : source === 'branch'
        ? (daily.data?.byBranch ?? [])
        : (daily.data?.byDepartment ?? []);

    /*
     * สัดส่วนในวงแหวนคิดจาก **จำนวนคน** เสมอ ไม่ใช่จำนวนชั่วโมง
     *
     * ชั่วโมงทำให้หน่วยที่มีคนลายาว ๆ คนเดียวกินวงมากกว่าหน่วยที่มีคนลาห้าคน
     * คนละครึ่งวัน ซึ่งอ่านผิดความหมายของจอนี้ (กำลังคนหายไปกี่คน) และไม่แสดง
     * ชั่วโมงคู่กันในกราฟ เพราะสองหน่วยในแถวเดียวทำให้ตาต้องเลือกว่าจะอ่านตัวไหน
     */
    const mapped = rows.map((unit) => {
      if (isLeave) {
        /* รายวันนับหัวคน (ลา/ไม่ลา) ส่วนรายงวดนับคนที่มีวันลาในงวดนั้น */
        const people = isPeriod
          ? ((unit as { leavePeople?: number }).leavePeople ?? 0)
          : ((unit as { leave?: number }).leave ?? 0);

        return {
          id: unit.id ?? unit.label,
          label: unit.label,
          primary: `${people} คน`,
          value: people,
        };
      }

      return {
        id: unit.id ?? unit.label,
        label: unit.label,
        primary: `${unit.otPeople} คน`,
        value: unit.otPeople,
      };
    });

    /*
     * บริษัทในเครือแสดงครบทุกแห่งเสมอ แม้วันนั้นไม่มีใครลาหรือทำโอทีเลย —
     * รายชื่อบริษัทเป็นโครงที่ผู้บริหารจำตำแหน่งได้ ถ้าหายไปเมื่อยอดเป็นศูนย์
     * จอจะเปลี่ยนหน้าตาไปมาทุกวันจนอ่านเทียบกันไม่ได้ และ "ไม่มีใครลา" ก็เป็น
     * คำตอบที่ต้องเห็น ไม่ใช่ช่องว่าง
     *
     * ส่วนแผนกมีสิบกว่าหน่วย ถ้าโชว์ศูนย์ด้วยจะกลายเป็นรายการยาวที่ไม่ได้บอกอะไร
     */
    return (
      source === 'branch' ? mapped : mapped.filter((unit) => unit.value > 0)
    ).sort((left, right) => right.value - left.value);
  };

  const branchUnits = unitSummaries('branch');
  const departmentUnits = unitSummaries('department');

  /* ตัวเลขกลางวงแหวน = จำนวนคนรวมของทั้งกลุ่ม ให้อ่านได้โดยไม่ต้องบวกเอง */
  const centerTextOf = (units: { value: number }[]) =>
    amount(units.reduce((sum, unit) => sum + unit.value, 0));

  /*
   * จำนวนคนของอีกแท็บที่ยังไม่ได้เปิด — ติดไว้บนแท็บเลย ผู้บริหารจะได้รู้ว่า
   * อีกฝั่งมีของรออยู่ไหมโดยไม่ต้องกดสลับไปดู
   */
  const leaveCount = (isPeriod ? periodLeaveRows : dayLeaveRows).filter(
    matchesUnit,
  ).length;
  const otCount = (isPeriod ? periodOtRows : dayOtRows).filter(
    matchesUnit,
  ).length;

  /* อยู่ที่ล่าสุดแล้วหรือยัง — ใช้ปิดปุ่ม "ถัดไป" ของทั้งสองโหมด */
  const atLatest = isPeriod ? periodOffset >= 0 : isToday;

  const periodRangeLabel =
    periodFrom && periodTo
      ? `${formatShortDate(periodFrom) ?? periodFrom} – ${formatShortDate(periodTo) ?? periodTo}`
      : 'กำลังหาขอบเขตงวด...';

  /*
   * ป้ายในแถบเป็นค่าที่กำลังดูล้วน ๆ ไม่มีคำนำหน้าอย่าง "วันนี้ ·" หรือ
   * "งวดปัจจุบัน ·" — แถบเลือกช่วงเวลาของทุกจอต้องอ่านเหมือนกัน และปุ่มถัดไป
   * ที่ถูกปิดอยู่ก็บอกอยู่แล้วว่านี่คือช่วงล่าสุด
   */
  const rangeLabel = isPeriod ? periodRangeLabel : formatFullDate(date);

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void active.refetch()}
                refreshing={active.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          {/* --------------------------------------------------- หัวจอ */}
          <Reveal>
            <PageHero
              decoration={<LeaveOvertimeMotif />}
              icon="calendar"
              subtitle="ใครลา ใครทำโอที แยกตามบริษัทในเครือและแผนก"
              title="ลา & โอที"
            />
          </Reveal>

          {/*
            แถบเลือกวัน — แคปซูลเดียวบนผิวขาว ไม่ใช่แถบสีเต็มความกว้าง
            อยู่นอกสถานะโหลด/ผิดพลาดโดยตั้งใจ ผู้ใช้ต้องเปลี่ยนวันได้แม้วันที่
            กำลังดูอยู่จะโหลดไม่ผ่าน
          */}
          {canView ? (
            <Reveal delay={40}>
              <View
                style={{ gap: 12, paddingHorizontal: gutter, paddingTop: 18 }}
              >
                {PERIOD_ENABLED ? (
                  <RangeSwitch<RangeMode>
                    onChange={setRange}
                    options={[
                      { label: 'รายวัน', value: 'day' },
                      { label: 'รายงวด', value: 'period' },
                    ]}
                    value={range}
                  />
                ) : null}

                <DaySwitcher
                  canGoNext={!atLatest}
                  label={rangeLabel}
                  onPick={() => {
                    setPickerMonth(monthOf(date));
                    setPickerOpen(true);
                  }}
                  onShift={(delta) =>
                    isPeriod
                      ? setPeriodOffset((current) =>
                          Math.min(current + delta, 0),
                        )
                      : setDate((current) => shiftDay(current, delta))
                  }
                />
              </View>
            </Reveal>
          ) : null}

          <View style={{ gap: 26, paddingHorizontal: gutter, paddingTop: 18 }}>
            {!canView ? (
              <Reveal delay={90}>
                <View
                  style={{
                    alignItems: 'center',
                    gap: 7,
                    paddingVertical: 26,
                  }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: 'rgba(148, 163, 184, 0.16)',
                      borderRadius: 999,
                      height: 52,
                      justifyContent: 'center',
                      marginBottom: 4,
                      width: 52,
                    }}
                  >
                    <Icon color={AURORA.textMuted} name="lock" size={23} />
                  </View>
                  <Text style={{ color: AURORA.text }} variant="bodyStrong">
                    บัญชีนี้ยังไม่ได้รับสิทธิ์ดูภาพรวมบริษัท
                  </Text>
                  <Text
                    style={{ color: AURORA.textMuted, textAlign: 'center' }}
                    variant="caption"
                  >
                    ติดต่อฝ่ายบุคคลเพื่อขอเปิดสิทธิ์ผู้บริหาร
                  </Text>
                </View>
              </Reveal>
            ) : active.isPending || waitingForPeriod ? (
              <SkeletonList rows={6} />
            ) : active.isError ? (
              <Reveal delay={90}>
                <View
                  style={{
                    alignItems: 'center',
                    gap: 7,
                    paddingVertical: 26,
                  }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: `${AURORA.rose}1a`,
                      borderRadius: 999,
                      height: 52,
                      justifyContent: 'center',
                      marginBottom: 4,
                      width: 52,
                    }}
                  >
                    <Icon color={AURORA.rose} name="alert-circle" size={23} />
                  </View>
                  <Text style={{ color: AURORA.text }} variant="bodyStrong">
                    {isPeriod
                      ? 'โหลดข้อมูลของงวดนี้ไม่สำเร็จ'
                      : 'โหลดข้อมูลของวันนี้ไม่สำเร็จ'}
                  </Text>
                  <Text
                    style={{ color: AURORA.textMuted, textAlign: 'center' }}
                    variant="caption"
                  >
                    {active.error instanceof ApiError
                      ? active.error.message
                      : 'ลองใหม่อีกครั้ง'}
                  </Text>
                  <SectionAction
                    label={active.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                    onPress={() => void active.refetch()}
                  />
                </View>
              </Reveal>
            ) : (
              <>
                {/* ----------------------------------------- สลับ ลา/โอที */}
                <Reveal delay={70}>
                  <TopicTabs<Topic>
                    onChange={setTopic}
                    options={[
                      { count: leaveCount, label: 'ลา', value: 'leave' },
                      { count: otCount, label: 'โอที', value: 'ot' },
                    ]}
                    value={topic}
                  />
                </Reveal>

                {/* --------------------------- สรุปรายหน่วยงานตามแท็บที่เปิด */}
                {branchUnits.length > 0 || departmentUnits.length > 0 ? (
                  <Reveal delay={100}>
                    <View style={{ gap: 10 }}>
                      <Heading
                        title={
                          isLeave
                            ? 'สรุปการลาตามหน่วยงาน'
                            : 'สรุปโอทีตามหน่วยงาน'
                        }
                        trailing={isPeriod ? 'ทั้งงวด' : 'วันนี้'}
                      />

                      {branchUnits.length > 0 ? (
                        <View style={{ gap: 1 }}>
                          <GroupLabel text="บริษัทในเครือ" />
                          <UnitDonut
                            activeId={branchFilter}
                            centerLabel="คน"
                            centerText={centerTextOf(branchUnits)}
                            onToggle={setBranchFilter}
                            units={branchUnits}
                          />
                        </View>
                      ) : null}

                      {departmentUnits.length > 0 ? (
                        <View style={{ gap: 1, paddingTop: 12 }}>
                          <GroupLabel text="แผนก" />
                          <UnitDonut
                            activeId={departmentFilter}
                            limit={TOP_UNITS}
                            centerLabel="คน"
                            centerText={centerTextOf(departmentUnits)}
                            onToggle={setDepartmentFilter}
                            units={departmentUnits}
                          />
                        </View>
                      ) : null}
                    </View>
                  </Reveal>
                ) : null}

                {/* ------------------------------------------ รายชื่อคน */}
                <Reveal delay={130}>
                  <View style={{ gap: 8 }}>
                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 9,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: AURORA.accent,
                          borderRadius: 999,
                          height: 15,
                          width: 3,
                        }}
                      />
                      <Text
                        numberOfLines={1}
                        style={{ color: AURORA.text, flex: 1 }}
                        variant="h3"
                      >
                        {isLeave ? 'พนักงานที่ลา' : 'พนักงานที่ทำโอที'}
                      </Text>

                      <Text
                        maxScale={1.1}
                        style={[
                          TABULAR,
                          {
                            color: AURORA.accent,
                            fontSize: 11.5,
                            fontWeight: '700',
                          },
                        ]}
                      >
                        {`${listRows.length} คน`}
                      </Text>

                      {/* ตัวกรองเป็นไอคอนเล็ก — พื้นทึบบอกว่ากรองอยู่ ไม่งั้นผู้ใช้
                          เห็นรายการสั้นผิดปกติแล้วนึกว่าข้อมูลหาย */}
                      <PressableScale
                        accessibilityLabel="กรองรายชื่อ"
                        hitSlop={hitSlop}
                        onPress={() => setFilterOpen(true)}
                        style={{
                          alignItems: 'center',
                          backgroundColor: hasFilter
                            ? AURORA.accent
                            : AURORA.accentSoft,
                          borderRadius: 999,
                          height: 30,
                          justifyContent: 'center',
                          width: 30,
                        }}
                      >
                        <Icon
                          color={hasFilter ? '#ffffff' : AURORA.accent}
                          name="sliders"
                          size={15}
                        />
                      </PressableScale>
                    </View>

                    {listRows.length === 0 ? (
                      <View
                        style={{
                          alignItems: 'center',
                          gap: 7,
                          paddingVertical: 24,
                        }}
                      >
                        <View
                          style={{
                            alignItems: 'center',
                            backgroundColor: AURORA.accentSoft,
                            borderRadius: 999,
                            height: 52,
                            justifyContent: 'center',
                            marginBottom: 4,
                            width: 52,
                          }}
                        >
                          <Icon
                            color={AURORA.accent}
                            name={isLeave ? 'sun' : 'moon'}
                            size={23}
                          />
                        </View>
                        <Text
                          style={{ color: AURORA.text }}
                          variant="bodyStrong"
                        >
                          {isLeave
                            ? isPeriod
                              ? 'ไม่มีพนักงานลาในงวดนี้'
                              : 'ไม่มีพนักงานลาในวันนี้'
                            : isPeriod
                              ? 'ไม่มีโอทีที่อนุมัติแล้วในงวดนี้'
                              : 'ไม่มีโอทีที่อนุมัติแล้วในวันนี้'}
                        </Text>
                        <Text
                          style={{
                            color: AURORA.textMuted,
                            textAlign: 'center',
                          }}
                          variant="caption"
                        >
                          {hasFilter
                            ? 'ลองยกเลิกตัวกรองแล้วดูใหม่'
                            : 'ถ้ามีใบที่อนุมัติแล้วจะขึ้นที่นี่ทันที'}
                        </Text>
                      </View>
                    ) : (
                      <View>
                        {listRows.map((row, index) => (
                          <PersonRow
                            avatarUrl={row.avatarUrl}
                            divider={index > 0}
                            key={row.id}
                            meta={row.meta}
                            name={row.name}
                            onPress={() =>
                              setDetail({
                                avatarUrl: row.avatarUrl,
                                meta: row.meta,
                                name: row.name,
                                requests: row.requests,
                              })
                            }
                            submitted={submittedLabel(row.requests)}
                            tag={row.tag}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                </Reveal>
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <RequestDetailSheet
        onClose={() => setDetail(null)}
        person={detail}
        visible={detail !== null}
      />

      <FilterSheet
        branchValue={branchFilter}
        branches={branchOptions}
        departmentValue={departmentFilter}
        departments={departmentOptions}
        onClear={() => {
          setBranchFilter(null);
          setDepartmentFilter(null);
        }}
        onClose={() => setFilterOpen(false)}
        onSelectBranch={setBranchFilter}
        onSelectDepartment={setDepartmentFilter}
        visible={filterOpen}
      />

      {/* ตัวเลือกช่วง — เปิดจากการแตะชื่อช่วงบนหัวจอ คนละตัวตามโหมดที่ดูอยู่ */}
      {isPeriod ? (
        <PeriodPickerSheet
          currentPeriodMonth={currentPeriodMonth}
          onClose={() => setPickerOpen(false)}
          onSelect={setPeriodOffset}
          selectedOffset={periodOffset}
          visible={pickerOpen}
        />
      ) : (
        <DayPickerSheet
          month={pickerMonth}
          onClose={() => setPickerOpen(false)}
          onMonthChange={setPickerMonth}
          onSelect={setDate}
          selected={date}
          visible={pickerOpen}
        />
      )}
    </View>
  );
}
