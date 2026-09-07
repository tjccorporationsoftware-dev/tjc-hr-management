import { useState } from 'react';
import { Platform, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  DailyCostMotif,
  PageHero,
  PageSection,
  PeriodBar,
  PressableScale,
  Reveal,
} from '@/design/aurora';
import { monthOf, todayKey } from '@/features/attendance/calendar';
import { useScreenCaptureGuard } from '@/features/auth/screen-privacy';
import { useExecutiveDailyCost } from '@/features/executive/executive-views';
import {
  MAX_SLICES,
  SERIES,
  SERIES_REST,
  TABULAR,
  UnderlineTabs,
  UnitChart,
} from '@/features/executive/royal';
import { DayPickerSheet } from '@/features/executive/royal-day-picker';
import { ApiError } from '@/lib/api/api-error';

import type { ComponentProps } from 'react';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * ค่าจ้างรายวัน — แท็บที่สี่ของผู้บริหาร (แทนสลิปเงินเดือนของตัวเอง)
 *
 * เห็นเวลาเข้างานของใครเมื่อไร = เริ่มคิดค่าแรงของคนนั้นทันที แล้วหักสิ่งที่
 * ระบบตั้งไว้ออก (มาสาย ไม่ได้ลงเวลา ขาดงาน ลาไม่รับค่าจ้าง — ลาเป็นชั่วโมงหัก
 * ตามชั่วโมงจริง) ปิดท้ายด้วยค่าล่วงเวลาที่อนุมัติแล้ว
 *
 * ## ลำดับของจอ — เรียงตามลำดับคำถามที่คนถามจริง
 *
 * 1. **เท่าไร** ยอดรวมของวัน พร้อมป้ายเตือนถ้าตัวเลขนั้นยังเชื่อไม่ได้เต็มร้อย
 * 2. **ใครบ้าง** แถบสัดส่วนกำลังคน + ตัวเลขแยกสถานะ — ตอบว่าทำไมยอดถึงเป็น
 *    เท่านี้ได้เร็วที่สุด สัดส่วนอ่านจบตั้งแต่ยังไม่ทันอ่านตัวเลข
 * 3. **มาจากไหน** บัญชีจ่ายออก/หักคืน แยกสองกลุ่ม ไม่ใช่รายการบวกลบปนกัน
 * 4. **ใครใช้เยอะ** แยกตามหน่วยงาน
 *
 * เดิมเรียง ยอด → ที่มาของยอด → คนวันนี้ โดยมีย่อหน้าอธิบายวิธีคิดยาวคั่นอยู่
 * กลางจอ ทำให้ต้องอ่านผ่านของที่อ่านครั้งเดียวจำได้ ก่อนจะถึงตัวเลขที่ต้องดู
 * ทุกวัน และป้ายเตือนไปกองอยู่ท้ายหมวดไกลจากยอดที่มันทำให้ผิด — ย่อหน้าวิธีคิด
 * ถูกถอดออกทั้งก้อน จอนี้เป็นตัวเลขล้วน ไม่ใช่ที่อธิบายกติกา
 *
 * อัตราค่าแรงมาจากบันทึกค่าจ้างที่มีผล ณ วันนั้น ส่วนยอดหักมาจากสรุปเวลา
 * รายวันที่ระบบคำนวณตามนโยบายไว้แล้ว ไม่ได้ตั้งกติกาใหม่ที่จอ
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอผู้บริหารจออื่น — `PageHero` + `PageSection` +
 * `AURORA` โดยหัวข้อหมวดใช้ตัวกลางร่วมกับทั้งแอป ไม่ใช่ก๊อปมาไว้ในไฟล์
 */

type UnitTab = 'branch' | 'department';
type IconName = ComponentProps<typeof Icon>['name'];

/**
 * เกินสัดส่วนนี้ถือว่ายอดหักของวันนั้น "ผิดปกติ" ไม่ใช่วันที่คนทำผิดเยอะ
 *
 * ที่มา: วันปกติของลูกค้าหักอยู่ราว 5% ของค่าแรงทั้งวัน ส่วนวันที่ไฟล์ลงเวลา
 * นำเข้าไม่ครบ (คนไม่มีรอยสแกนออก ระบบตีเป็นออกก่อนเวลายกบริษัท) พุ่งไปถึง
 * 90% — ช่องว่างกว้างพอให้เส้นตรงกลางแยกสองกรณีนี้ออกจากกันได้
 */
const DEDUCTION_ALERT_RATIO = 0.3;

/**
 * พื้นจางของวงไอคอนฝั่ง "หักคืน"
 *
 * `AURORA` มี `accentSoft` ให้เฉพาะโทนฟ้า ส่วนโทนส้มยังไม่มีคู่ของมัน
 * ผสมที่นี่จากสี `amber` ตัวเดียวกัน ความเข้มเท่ากับ `accentSoft`
 */
const AMBER_SOFT = 'rgba(180, 83, 9, 0.09)';

/** ยอดเงินเต็มจำนวน ไม่มีสตางค์ — งบระดับองค์กรไม่มีใครอ่านทศนิยม */
function baht(value: number): string {
  if (!Number.isFinite(value)) return '0';

  return Math.round(value).toLocaleString('th-TH');
}

/** ย่อสำหรับที่แคบ — "2.4 ล." / "185K" */
function short(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000)
    return `${(value / 1_000_000).toFixed(2)} ล.`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1_000)}K`;

  return Math.round(value).toLocaleString('th-TH');
}

/** วันเป็นสตริง "YYYY-MM-DD" เลื่อนแบบ UTC ไม่ให้เขตเวลาเครื่องมาขยับวัน */
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

/** ชั่วโมงแบบอ่านง่าย — ต่ำกว่าหนึ่งชั่วโมงบอกเป็นนาที */
function duration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 ชม.';

  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${minutes} นาที`;

  const wholeHours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${wholeHours} ชม.` : `${wholeHours} ชม. ${rest} นาที`;
}

/**
 * ป้ายเตือนว่ายอดบนจอยังเชื่อไม่ได้เต็มร้อย ด้วยเหตุอะไร
 *
 * อยู่ติดกับยอดรวมเสมอ ไม่ใช่ท้ายหมวดที่ต้องเลื่อนไปหา — ยอดที่ผิดโดยไม่บอกเหตุ
 * อันตรายกว่ายอดที่ไม่มีเลย เพราะผู้บริหารจะเอาไปเทียบกับสลิปแล้วสรุปว่าระบบ
 * คำนวณผิด ทั้งที่เป็นเรื่องข้อมูลตั้งต้นยังไม่ครบ
 */
function Warning({ text }: { text: string }) {
  return (
    <View
      style={{
        alignItems: 'flex-start',
        backgroundColor: AMBER_SOFT,
        borderRadius: 12,
        flexDirection: 'row',
        gap: 9,
        padding: 11,
      }}
    >
      <View style={{ paddingTop: 1 }}>
        <Icon color={AURORA.amber} name="alert-triangle" size={13} />
      </View>
      <Text
        style={{ color: AURORA.amber, flex: 1, fontSize: 11, lineHeight: 17 }}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * ไล่เฉดฟ้าของแท่งกำลังคน — เข้มสุดคือแถวที่คนเยอะสุด
 *
 * ใช้เฉดเดียวไล่ระดับแทนการให้สีประจำสถานะ เพราะกราฟนี้ตอบคำถามเดียวคือ
 * "อันไหนเยอะกว่ากัน" ซึ่งความยาวแท่งตอบอยู่แล้ว สีจึงไม่ต้องแบกความหมาย
 * เพิ่ม — และพอทุกแท่งเป็นโทนเดียวกัน ตาจะไปจับความยาวแทนที่จะไล่จับสี
 */
const BAR_SCALE = [
  '#1d4ed8',
  '#2563eb',
  '#3b82f6',
  '#60a5fa',
  '#93c5fd',
  '#bfdbfe',
];

/** ความสูงของพื้นที่กราฟ — รวมตัวเลขที่เกาะอยู่บนหัวแท่ง */
const COLUMN_PLOT_HEIGHT = 132;

/** ที่ว่างบนหัวแท่งสำหรับตัวเลข — หักออกจากความสูงที่แท่งใช้ได้จริง */
const COLUMN_VALUE_BAND = 20;

/** แท่งหนาสุด — ที่เหลือในช่องปล่อยเป็นอากาศ ไม่เติมจนแท่งชนกัน */
const COLUMN_MAX_WIDTH = 38;

/**
 * ความสูงคงที่ของป้ายใต้แท่ง (สองบรรทัด)
 *
 * ป้ายบางอันบรรทัดเดียว บางอันสองบรรทัด ถ้าไม่ตรึงความสูงไว้ ช่องจะสูงไม่เท่ากัน
 * แล้วตัวเลขบนหัวแท่งจะเหลื่อมกันเป็นขั้นบันไดทั้งแถว
 */
const COLUMN_LABEL_HEIGHT = 26;

/**
 * หนึ่งแท่งของกราฟกำลังคน — ตัวเลขบน · แท่ง · ป้ายกับสัดส่วนข้างล่าง
 *
 * เลือกทรงนี้หลังลองมาหลายแบบ: แถบสัดส่วนหลอดเดียวซ้ำกับที่ใช้อยู่หลายจอและ
 * สองสถานะฟ้าด้วยกันแยกท่อนไม่ออก, กระเบื้องตัวเลขไม่ได้บอกสัดส่วนอะไรเลย,
 * ตารางจุดหนึ่งช่องหนึ่งคนอ่านเป็นพรมสีเมื่อคนเยอะ, แท่งแนวนอนกินความสูงหกแถว
 *
 * แนวตั้งวางทั้งหกสถานะจบในความสูงเดียว และเทียบความสูงกันได้ในพริบตาเพราะ
 * ฐานของทุกแท่งอยู่ระดับเดียวกัน
 *
 * **ความสูงวัดเทียบกับแท่งที่มากที่สุด ไม่ใช่เทียบจำนวนคนทั้งหมด** — วัดจาก
 * ทั้งบริษัทแล้วแท่งสูงสุดกินแค่ครึ่งกราฟ ที่เหลือเป็นขาวโล่ง และแท่งท้าย ๆ
 * แบนติดพื้น ส่วนสัดส่วนต่อทั้งบริษัทมีตัวเลข % กำกับใต้ป้ายอยู่แล้ว
 */
function ColumnBar({
  color,
  label,
  max,
  share,
  value,
}: {
  color: string;
  label: string;
  max: number;
  /** สัดส่วนต่อคนทั้งหมด แสดงเป็น % ใต้ป้าย */
  share: number;
  value: number;
}) {
  /* ค่าที่ไม่ใช่ศูนย์ต้องเห็นเป็นขีด ไม่ใช่หายไปทั้งแท่ง */
  const barHeight =
    value > 0
      ? Math.max(5, (value / max) * (COLUMN_PLOT_HEIGHT - COLUMN_VALUE_BAND))
      : 0;

  return (
    <View style={{ alignItems: 'center', flex: 1, gap: 6 }}>
      {/*
        กล่องความสูงคงที่ จัดของชิดล่าง — ฐานของทุกแท่งจึงอยู่ระดับเดียวกัน
        และตัวเลขที่วางไว้เหนือแท่งในกล่องเดียวกันจะขยับขึ้นลงตามหัวแท่งเอง
        ไม่ใช่ลอยเรียงเป็นแถวเดียวห่างจากแท่งเตี้ย ๆ อยู่คนละที่
      */}
      <View
        style={{
          alignItems: 'center',
          height: COLUMN_PLOT_HEIGHT,
          justifyContent: 'flex-end',
          width: '100%',
        }}
      >
        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={[
            TABULAR,
            {
              color: value > 0 ? AURORA.text : AURORA.textFaint,
              fontSize: 13,
              fontWeight: '800',
              lineHeight: 17,
              marginBottom: 3,
            },
          ]}
        >
          {value}
        </Text>
        <View
          style={{
            backgroundColor: color,
            borderRadius: 7,
            height: barHeight,
            maxWidth: COLUMN_MAX_WIDTH,
            width: '90%',
          }}
        />
      </View>

      <View style={{ alignItems: 'center', gap: 1, width: '100%' }}>
        {/* ตรึงความสูงไว้แล้วจึงต้องคุมการขยายฟอนต์ตามระบบด้วย — ปล่อยให้ขยาย
            เต็ม 1.4 เท่าเมื่อไร สองบรรทัดจะล้นกรอบแล้วโดนตัดครึ่ง */}
        <Text
          maxScale={1.1}
          numberOfLines={2}
          style={{
            color: AURORA.textMuted,
            fontSize: 9.5,
            height: COLUMN_LABEL_HEIGHT,
            lineHeight: 13,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
        <Text
          maxScale={1.1}
          style={[TABULAR, { color: AURORA.textFaint, fontSize: 9.5 }]}
        >
          {`${Math.round(share * 100)}%`}
        </Text>
      </View>
    </View>
  );
}

/** ป้ายกลุ่มย่อยในบัญชี — บอกว่าบรรทัดถัดไปเป็นเงินออกหรือเงินที่หักคืน */
function LedgerGroup({
  label,
  tone,
  total,
}: {
  label: string;
  tone: string;
  total: string;
}) {
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
      <Text
        style={{
          color: tone,
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 1.2,
        }}
      >
        {label}
      </Text>
      {/* เส้นบาง ๆ ลากไปหายอดรวมของกลุ่ม — บอกขอบเขตกลุ่มโดยไม่ต้องตีกรอบ */}
      <View
        style={{
          backgroundColor: AURORA.glassBorder,
          flex: 1,
          height: 1,
        }}
      />
      <Text
        maxScale={1.1}
        style={[TABULAR, { color: tone, fontSize: 11, fontWeight: '700' }]}
      >
        {total}
      </Text>
    </View>
  );
}

/**
 * หนึ่งบรรทัดของที่มายอด
 *
 * ต้องเห็นเป็นรายการ ไม่ใช่ก้อนเดียว เพราะคำถามถัดไปของผู้บริหารเสมอคือ
 * "ทำไมวันนี้ถูก/แพงกว่าเมื่อวาน" ซึ่งตอบได้ก็ต่อเมื่อเห็นว่าเงินไปตรงไหน
 *
 * วงไอคอนหน้าแถวทำให้กวาดตาหาบรรทัดที่ต้องการเจอโดยไม่ต้องอ่านป้าย — ชุดเดียว
 * กับแถวรายการทั้งแอป (วงพื้นจาง ไอคอน Feather ข้างใน)
 */
function LedgerRow({
  amount,
  hint,
  icon,
  label,
  negative,
}: {
  amount: number;
  hint?: string;
  icon: IconName;
  label: string;
  /** แถวฝั่งหักคืน — ไอคอนกับตัวเลขเป็นโทนส้ม และมีเครื่องหมายลบ */
  negative?: boolean;
}) {
  const tone = negative ? AURORA.amber : AURORA.accent;

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 11 }}>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: negative ? AMBER_SOFT : AURORA.accentSoft,
          borderRadius: 999,
          height: 34,
          justifyContent: 'center',
          width: 34,
        }}
      >
        <Icon color={tone} name={icon} size={16} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: AURORA.text, fontSize: 12.5 }}>
          {label}
        </Text>
        {hint ? (
          <Text
            numberOfLines={1}
            style={{ color: AURORA.textMuted, fontSize: 10.5 }}
          >
            {hint}
          </Text>
        ) : null}
      </View>

      {/* ยอดหักเป็นสีส้มพร้อมเครื่องหมายลบ — บรรทัดบวกกับบรรทัดหักต้องแยก
          ออกจากกันตั้งแต่สายตายังไม่ทันอ่านตัวเลข */}
      <Text
        maxScale={1.1}
        style={[
          TABULAR,
          {
            color: negative ? AURORA.amber : AURORA.text,
            fontSize: 13.5,
            fontWeight: '700',
          },
        ]}
      >
        {negative ? `- ${baht(Math.abs(amount))}` : baht(amount)}
      </Text>
    </View>
  );
}

export function ExecutiveCost() {
  const { gutter } = useResponsive();
  /* จอนี้เป็นข้อมูลค่าจ้าง ปิดการถ่ายภาพหน้าจอไว้ตลอดที่อยู่บนจอ */
  useScreenCaptureGuard();

  const today = todayKey();
  const [date, setDate] = useState(today);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(monthOf(today));
  const [unitTab, setUnitTab] = useState<UnitTab>('branch');

  const cost = useExecutiveDailyCost(date);
  const forbidden = cost.error instanceof ApiError && cost.error.status === 403;
  const data = cost.data;
  const amounts = data?.amounts;
  const counts = data?.counts;
  const isToday = date === today;

  const units =
    unitTab === 'branch' ? (data?.byBranch ?? []) : (data?.byDepartment ?? []);
  const unitTotal = units.reduce((sum, unit) => sum + unit.total, 0);

  /* ยุบหน่วยที่เล็กกว่าท็อปห้าเป็น "อื่น ๆ" ไม่งั้นวงแหวนซอยจนอ่านไม่ออก */
  const visibleUnits = units.filter((unit) => unit.total > 0);
  const top = visibleUnits.slice(0, MAX_SLICES).map((unit, index) => ({
    color: SERIES[index % SERIES.length]!,
    label: unit.label,
    text: short(unit.total),
    value: unit.total,
  }));
  const rest = visibleUnits.slice(MAX_SLICES);
  const restValue = rest.reduce((sum, unit) => sum + unit.total, 0);
  const slices =
    rest.length > 0
      ? [
          ...top,
          {
            color: SERIES_REST,
            label: `อื่น ๆ (${rest.length} หน่วย)`,
            text: short(restValue),
            value: restValue,
          },
        ]
      : top;

  /*
   * ยอดหักที่สูงจนผิดปกติ = สัญญาณว่าข้อมูลลงเวลายังไม่ครบ ไม่ใช่วันที่คนทำผิด
   *
   * เทียบกับ "เงินที่จ่ายออกก่อนหัก" ไม่ใช่ยอดสุทธิ เพราะสุทธิเป็นตัวที่ถูกหัก
   * ไปแล้ว วันที่หักหนักจนสุทธิเกือบศูนย์จะได้สัดส่วนเพี้ยนไปอีกทางหนึ่ง
   */
  const grossPay = amounts
    ? amounts.worked + amounts.leave + amounts.overtime
    : 0;
  const deductionRatio =
    amounts && grossPay > 0 ? amounts.deduction / grossPay : 0;
  const deductionAlert = deductionRatio >= DEDUCTION_ALERT_RATIO;

  /*
   * แถวของกราฟกำลังคน เรียงจากมากไปน้อย — ลำดับเป็นตัวกำหนดเฉดสีด้วย
   * (เข้มสุด = เยอะสุด) จึงต้องเรียงก่อนเรนเดอร์ ไม่ใช่เรียงตอนวาด
   */
  const peopleRows = counts
    ? [
        {
          label: 'มาตรงเวลา',
          /* ป้ายใต้แท่งขึ้นบรรทัดตรงที่กำหนดเอง — ภาษาไทยไม่มีเว้นวรรคให้
             ตัวตัดคำของระบบใช้ ปล่อยไว้แล้วมันจะตัดกลางคำ */
          short: 'มาตรง\nเวลา',
          value: Math.max(0, counts.worked - counts.late),
        },
        { label: 'มาสาย', short: 'มาสาย', value: counts.late },
        {
          label: 'ลารับค่าจ้าง',
          short: 'ลารับ\nค่าจ้าง',
          value: counts.leavePaid,
        },
        {
          label: 'ลาไม่รับค่าจ้าง',
          short: 'ลาไม่รับ\nค่าจ้าง',
          value: counts.leaveUnpaid,
        },
        { label: 'ขาดงาน', short: 'ขาดงาน', value: counts.absent },
        {
          label: 'ยังไม่มีข้อมูล',
          short: 'ยังไม่มี\nข้อมูล',
          value: Math.max(
            0,
            counts.total -
              counts.worked -
              counts.leavePaid -
              counts.leaveUnpaid -
              counts.absent,
          ),
        },
      ].sort((left, right) => right.value - left.value)
    : [];

  /* แท่งสูงสุดเป็นตัวตั้งของความสูงทุกแท่ง อย่างน้อยหนึ่งกันหารศูนย์ */
  const peopleMax = Math.max(1, ...peopleRows.map((row) => row.value));

  /* ค่าเฉลี่ยต่อหัวใช้ "วันคน" ที่มีค่าแรงจริง ครึ่งวันจึงไม่ทำให้เฉลี่ยเพี้ยน */
  const perPerson =
    data && data.paidDays > 0 && amounts ? amounts.total / data.paidDays : 0;

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void cost.refetch()}
                refreshing={cost.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          <Reveal>
            <PageHero
              decoration={<DailyCostMotif />}
              icon="credit-card"
              subtitle="คิดจากเวลาเข้างานจริง หักสาย/ลา บวกค่าล่วงเวลา"
              title="ค่าจ้างรายวัน"
            />
          </Reveal>

          <View style={{ gap: 26, paddingHorizontal: gutter, paddingTop: 22 }}>
            {forbidden ? (
              <Reveal delay={60}>
                <View
                  style={{
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: AURORA.accentSoft,
                      borderRadius: 999,
                      height: 40,
                      justifyContent: 'center',
                      width: 40,
                    }}
                  >
                    <Icon color={AURORA.accent} name="lock" size={18} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: AURORA.text,
                        fontSize: 14,
                        fontWeight: '600',
                      }}
                    >
                      บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลค่าจ้าง
                    </Text>
                    <Text style={{ color: AURORA.textMuted, fontSize: 12 }}>
                      ติดต่อฝ่ายบุคคลเพื่อขอสิทธิ์ดูข้อมูลเงินเดือน
                    </Text>
                  </View>
                </View>
              </Reveal>
            ) : (
              <>
                {/* ------------------------------------------ เลือกวัน */}
                <Reveal delay={60}>
                  <PeriodBar
                    backLabel="วันก่อนหน้า"
                    canGoNext={!isToday}
                    forwardLabel="วันถัดไป"
                    label={formatFullDate(date)}
                    onPick={() => {
                      setPickerMonth(monthOf(date));
                      setPickerOpen(true);
                    }}
                    onShift={(delta) =>
                      setDate((current) => shiftDay(current, delta))
                    }
                    pickLabel="เลือกวัน"
                  />
                </Reveal>

                {cost.isPending ? (
                  <Reveal delay={120}>
                    <View style={{ gap: 16 }}>
                      <View
                        style={{
                          backgroundColor: AURORA.glassBorder,
                          borderRadius: 12,
                          height: 88,
                        }}
                      />
                      <View
                        style={{
                          backgroundColor: AURORA.glassBorder,
                          borderRadius: 12,
                          height: 120,
                        }}
                      />
                    </View>
                  </Reveal>
                ) : cost.isError ? (
                  <Reveal delay={120}>
                    <View style={{ gap: 5 }}>
                      <Text style={{ color: AURORA.text }} variant="bodyStrong">
                        โหลดค่าจ้างของวันนี้ไม่สำเร็จ
                      </Text>
                      <Text
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 12,
                          lineHeight: 17,
                        }}
                      >
                        {cost.error instanceof ApiError
                          ? cost.error.message
                          : 'ลองใหม่อีกครั้ง'}
                      </Text>
                      <PressableScale
                        accessibilityRole="button"
                        onPress={() => void cost.refetch()}
                        style={{ alignSelf: 'flex-start' }}
                      >
                        <Text
                          style={{
                            color: AURORA.accent,
                            fontSize: 13,
                            fontWeight: '700',
                          }}
                        >
                          ลองใหม่
                        </Text>
                      </PressableScale>
                    </View>
                  </Reveal>
                ) : amounts && counts && data ? (
                  <>
                    {/* --------------------------------- ยอดรวมของวัน */}
                    <Reveal delay={120}>
                      <View style={{ gap: 12 }}>
                        <View style={{ gap: 2 }}>
                          <Text
                            style={{ color: AURORA.textMuted, fontSize: 11 }}
                          >
                            {isToday
                              ? 'ค่าจ้างของวันนี้'
                              : 'ค่าจ้างของวันที่เลือก'}
                          </Text>
                          <View
                            style={{
                              alignItems: 'flex-end',
                              flexDirection: 'row',
                              gap: 6,
                            }}
                          >
                            <Text
                              maxScale={1.05}
                              style={[
                                TABULAR,
                                {
                                  color: AURORA.accent,
                                  fontSize: 30,
                                  fontWeight: '800',
                                },
                              ]}
                            >
                              {baht(amounts.total)}
                            </Text>
                            <Text
                              style={{
                                color: AURORA.textMuted,
                                fontSize: 12,
                                paddingBottom: 5,
                              }}
                            >
                              บาท
                            </Text>
                          </View>
                        </View>

                        {/* บรรทัดเดียวตอบสองอย่าง — คนกี่คน และเฉลี่ยหัวละเท่าไร
                            ซึ่งเป็นตัวเทียบข้ามวันที่แท้จริง ยอดรวมเทียบไม่ได้
                            เพราะแต่ละวันคนมาไม่เท่ากัน */}
                        <Text
                          style={{ color: AURORA.textMuted, fontSize: 11.5 }}
                        >
                          {`มาทำงาน ${counts.worked} จาก ${counts.total} คน`}
                          {perPerson > 0
                            ? ` · เฉลี่ย ${baht(perPerson)} บาท/คน`
                            : ''}
                        </Text>

                        {/*
                          ป้ายเตือนทั้งหมดอยู่ติดยอด ไม่กระจายไปท้ายหมวด
                          เรียงจากเรื่องที่ทำให้ตัวเลขเพี้ยนมากสุดลงมา
                        */}
                        {deductionAlert ? (
                          <Warning
                            text={`ยอดหักของวันนี้สูงผิดปกติ (${Math.round(
                              deductionRatio * 100,
                            )}% ของค่าแรงทั้งวัน) มักเกิดจากข้อมูลลงเวลานำเข้าไม่ครบ เช่นไม่มีรอยสแกนออก แล้วระบบตีเป็นออกก่อนเวลาทั้งบริษัท — ตรวจไฟล์ลงเวลาของวันนี้ก่อนใช้ตัวเลขนี้`}
                          />
                        ) : null}

                        {data.employeesWithoutWage > 0 ? (
                          <Warning
                            text={`มีพนักงาน ${data.employeesWithoutWage} คนที่มาทำงานวันนี้แต่ยังไม่มีบันทึกอัตราค่าจ้าง ยอดรวมจึงต่ำกว่าจริง`}
                          />
                        ) : null}

                        {data.employeesWithoutOtPolicy > 0 ? (
                          <Warning
                            text={`มีพนักงาน ${data.employeesWithoutOtPolicy} คนที่มีชั่วโมงล่วงเวลาวันนี้ แต่ยังไม่ได้ตั้งนโยบายอัตราค่าล่วงเวลาให้ ยอดค่าล่วงเวลาจึงยังไม่รวมคนกลุ่มนี้`}
                          />
                        ) : null}
                      </View>
                    </Reveal>

                    {/* -------------------------------------- คนวันนี้ */}
                    <Reveal delay={180}>
                      <PageSection
                        title="คนวันนี้"
                        trailing={
                          <Text
                            style={[
                              TABULAR,
                              {
                                color: AURORA.textFaint,
                                fontSize: 11.5,
                                lineHeight: 16,
                              },
                            ]}
                          >
                            {`${counts.total} คน`}
                          </Text>
                        }
                      >
                        <View style={{ gap: 8, paddingTop: 10 }}>
                          {/*
                            มาสายเป็นส่วนหนึ่งของคนที่มา จึงตัดออกมาเป็นแท่งของ
                            ตัวเอง ไม่นับซ้ำในแท่งแรก ส่วน "ยังไม่มีข้อมูล" คือคน
                            ที่วันนั้นไม่สแกนและไม่มีใบลา ต้องเห็น ไม่ใช่หายเงียบ
                          */}
                          <View
                            style={{
                              alignItems: 'stretch',
                              flexDirection: 'row',
                              gap: 6,
                            }}
                          >
                            {peopleRows.map((row, index) => (
                              <ColumnBar
                                color={
                                  BAR_SCALE[
                                    Math.min(index, BAR_SCALE.length - 1)
                                  ]!
                                }
                                key={row.label}
                                label={row.short}
                                max={peopleMax}
                                share={
                                  counts.total > 0
                                    ? row.value / counts.total
                                    : 0
                                }
                                value={row.value}
                              />
                            ))}
                          </View>
                        </View>
                      </PageSection>
                    </Reveal>

                    {/* ----------------------------------- ที่มาของยอด */}
                    <Reveal delay={240}>
                      <PageSection title="ที่มาของยอด">
                        <View style={{ gap: 13, paddingTop: 6 }}>
                          <LedgerGroup
                            label="จ่ายออก"
                            tone={AURORA.textMuted}
                            total={baht(grossPay)}
                          />

                          <LedgerRow
                            amount={amounts.worked}
                            hint={`ค่าแรงต่อวันของคนที่ลงเวลาเข้างาน ${counts.worked} คน`}
                            icon="users"
                            label="ค่าแรงคนมาทำงาน"
                          />

                          {amounts.leave > 0 ? (
                            <LedgerRow
                              amount={amounts.leave}
                              hint={`${counts.leavePaid} คน — จ่ายแต่ไม่มีคนอยู่หน้างาน`}
                              icon="sun"
                              label="วันลาที่ได้รับค่าจ้าง"
                            />
                          ) : null}

                          {amounts.overtime > 0 ? (
                            <LedgerRow
                              amount={amounts.overtime}
                              hint={`${counts.overtime} คน รวม ${duration(
                                data.overtimeHours,
                              )}`}
                              icon="moon"
                              label="ค่าล่วงเวลา"
                            />
                          ) : null}

                          {/* กลุ่มหักแยกออกมาต่างหาก ไม่ใช่ปนอยู่ในรายการเดียว
                              — เงินที่จ่ายออกกับเงินที่หักคืนเป็นคนละคำถาม */}
                          {amounts.deduction > 0 ? (
                            <>
                              <View style={{ paddingTop: 4 }}>
                                <LedgerGroup
                                  label="หักคืน"
                                  tone={AURORA.amber}
                                  total={`- ${baht(amounts.deduction)}`}
                                />
                              </View>

                              {amounts.unpaidLeave > 0 ? (
                                <LedgerRow
                                  amount={amounts.unpaidLeave}
                                  hint={`${counts.leaveUnpaid} คน · ${duration(
                                    data.unpaidLeaveHours,
                                  )}`}
                                  icon="user-minus"
                                  label="ลาไม่รับค่าจ้าง"
                                  negative
                                />
                              ) : null}

                              {amounts.absence > 0 ? (
                                <LedgerRow
                                  amount={amounts.absence}
                                  hint={`ขาดงาน ${counts.absent} คน`}
                                  icon="user-x"
                                  label="ขาดงาน"
                                  negative
                                />
                              ) : null}

                              {amounts.late > 0 ? (
                                <LedgerRow
                                  amount={amounts.late}
                                  hint={`มาสาย ${counts.late} คน รวม ${data.lateMinutes} นาที`}
                                  icon="clock"
                                  label="มาสาย"
                                  negative
                                />
                              ) : null}

                              {amounts.timePenalty > 0 ? (
                                <LedgerRow
                                  amount={amounts.timePenalty}
                                  hint="ไม่ได้ลงเวลา / ออกก่อนเวลา"
                                  icon="alert-circle"
                                  label="ตามระเบียบเวลา"
                                  negative
                                />
                              ) : null}
                            </>
                          ) : null}

                          {/* ยอดรวมอยู่ในแผ่นฟ้าจาง ไม่ใช่แค่บรรทัดใต้เส้น —
                              เป็นตัวเลขที่คนกลับมามองซ้ำหลังไล่รายการจบ */}
                          <View
                            style={{
                              alignItems: 'center',
                              backgroundColor: AURORA.accentSoft,
                              borderRadius: 14,
                              flexDirection: 'row',
                              gap: 12,
                              marginTop: 3,
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                            }}
                          >
                            <Text
                              style={{
                                color: AURORA.text,
                                flex: 1,
                                fontSize: 13,
                                fontWeight: '800',
                              }}
                            >
                              รวมค่าจ้างของวัน
                            </Text>
                            <Text
                              maxScale={1.1}
                              style={[
                                TABULAR,
                                {
                                  color: AURORA.accent,
                                  fontSize: 17,
                                  fontWeight: '800',
                                },
                              ]}
                            >
                              {baht(amounts.total)}
                            </Text>
                            <Text
                              style={{
                                color: AURORA.textMuted,
                                fontSize: 11,
                              }}
                            >
                              บาท
                            </Text>
                          </View>
                        </View>
                      </PageSection>
                    </Reveal>

                    {/* ------------------------------ แยกตามหน่วยงาน */}
                    <Reveal delay={300}>
                      <PageSection
                        title="ค่าจ้างตามหน่วยงาน"
                        trailing={
                          <Text
                            style={{
                              color: AURORA.textFaint,
                              fontSize: 11.5,
                              lineHeight: 16,
                            }}
                          >
                            วันที่เลือก
                          </Text>
                        }
                      >
                        <View style={{ gap: 14, paddingTop: 4 }}>
                          <UnderlineTabs<UnitTab>
                            onChange={setUnitTab}
                            options={[
                              { label: 'บริษัทในเครือ', value: 'branch' },
                              { label: 'แผนก', value: 'department' },
                            ]}
                            value={unitTab}
                          />

                          {visibleUnits.length === 0 ? (
                            <Text
                              style={{
                                color: AURORA.textMuted,
                                fontSize: 12.5,
                              }}
                            >
                              วันนี้ยังไม่มียอดที่แยกตามหน่วยงานได้
                            </Text>
                          ) : (
                            <View style={{ gap: 16 }}>
                              <UnitChart
                                center={short(unitTotal)}
                                centerLabel="รวม"
                                slices={slices}
                              />

                              {/* ตารางใต้กราฟบอกสิ่งที่วงแหวนบอกไม่ได้ —
                                  จำนวนคนกับยอดที่หัก ซึ่งเป็นตัวเทียบข้าม
                                  หน่วยงานที่แท้จริง */}
                              <View>
                                {visibleUnits.map((unit, index) => (
                                  <View
                                    key={unit.id ?? unit.label}
                                    style={{
                                      alignItems: 'center',
                                      borderTopColor: AURORA.glassBorder,
                                      borderTopWidth: index === 0 ? 0 : 1,
                                      flexDirection: 'row',
                                      gap: 10,
                                      paddingVertical: 7,
                                    }}
                                  >
                                    {/* เม็ดสีตรงกับท่อนในวงแหวน — ไม่ต้องเดา
                                        ว่าแถวไหนคือชิ้นไหน */}
                                    <View
                                      style={{
                                        backgroundColor:
                                          index < MAX_SLICES
                                            ? SERIES[index % SERIES.length]
                                            : SERIES_REST,
                                        borderRadius: 999,
                                        height: 7,
                                        width: 7,
                                      }}
                                    />

                                    <View style={{ flex: 1, gap: 1 }}>
                                      <Text
                                        numberOfLines={1}
                                        style={{
                                          color: AURORA.text,
                                          fontSize: 12,
                                        }}
                                      >
                                        {unit.label}
                                      </Text>
                                      <Text
                                        numberOfLines={1}
                                        style={[
                                          TABULAR,
                                          {
                                            color: AURORA.textFaint,
                                            fontSize: 10,
                                          },
                                        ]}
                                      >
                                        {`${unit.people} คน${
                                          unit.overtime > 0
                                            ? ` · โอที ${baht(unit.overtime)}`
                                            : ''
                                        }${
                                          unit.deduction > 0
                                            ? ` · หัก ${baht(unit.deduction)}`
                                            : ''
                                        }`}
                                      </Text>
                                    </View>

                                    {/* ยอดกับสัดส่วนซ้อนกันเป็นคอลัมน์เดียว —
                                        สัดส่วนคือสิ่งที่วงแหวนบอก แต่พออ่าน
                                        เป็นตัวเลขแล้วเทียบข้ามแถวได้จริง */}
                                    <View
                                      style={{ alignItems: 'flex-end', gap: 1 }}
                                    >
                                      <Text
                                        maxScale={1.1}
                                        style={[
                                          TABULAR,
                                          {
                                            color: AURORA.text,
                                            fontSize: 12.5,
                                            fontWeight: '700',
                                          },
                                        ]}
                                      >
                                        {baht(unit.total)}
                                      </Text>
                                      {unitTotal > 0 ? (
                                        <Text
                                          maxScale={1.1}
                                          style={[
                                            TABULAR,
                                            {
                                              color: AURORA.textFaint,
                                              fontSize: 10,
                                            },
                                          ]}
                                        >
                                          {`${Math.round(
                                            (unit.total / unitTotal) * 100,
                                          )}%`}
                                        </Text>
                                      ) : null}
                                    </View>
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}
                        </View>
                      </PageSection>
                    </Reveal>
                  </>
                ) : null}
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <DayPickerSheet
        month={pickerMonth}
        onClose={() => setPickerOpen(false)}
        onMonthChange={setPickerMonth}
        onSelect={(next) => {
          setDate(next);
          setPickerOpen(false);
        }}
        selected={date}
        visible={pickerOpen}
      />
    </View>
  );
}
