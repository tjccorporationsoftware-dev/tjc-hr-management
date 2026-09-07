import { View, type TextStyle } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { Icon, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import { AURORA, PageHero, PeriodBar } from '@/design/aurora';
import { thaiTime } from '@/lib/date/thai-date';

import {
  DAY_STATE_LABEL,
  WEEKDAY_LABELS,
  formatMonthLabel,
  formatShortMonth,
} from './calendar';
import type {
  AttendanceDay,
  AttendanceDayState,
} from './history.types';

/**
 * ชิ้นส่วนของจอลงเวลา — ผิวออโรราเดียวกับหน้าหลัก
 *
 * ทุกสีในไฟล์นี้หยิบจาก AURORA ตรง ๆ **ห้ามใช้ tone ของธีม** (`tone="muted"`)
 * เพราะจอนี้พื้นฟ้าอ่อนตลอดทั้งสองโหมด ถ้าใช้ tone ผู้ใช้โหมดมืดจะได้
 * ตัวหนังสือสีอ่อนบนกระจกขาวจนอ่านไม่ออก
 */

/** ตัวเลขทุกตัวกว้างเท่ากัน ไม่งั้นเปลี่ยนเดือนแล้วทั้งแถวจะขยับ */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };



/**
 * สีประจำสถานะ — ฟ้าคือเรื่องปกติ สีเตือนสงวนไว้ให้ของที่ต้องจัดการจริง
 *
 * ขาดงานกับเวลาไม่ครบแยกสีกัน ทั้งที่ทั้งคู่เป็นปัญหา เพราะสองอย่างนี้แก้
 * คนละทาง: ขาดงานต้องยื่นลาย้อนหลัง ส่วนเวลาไม่ครบแค่ขอแก้เวลา
 */
export const STATE_COLOR: Record<AttendanceDayState, string> = {
  ABSENT: AURORA.rose,
  /* วันหยุดเป็นเทาจาง — ไม่ใช่เรื่องดีหรือร้าย แค่ไม่ใช่วันทำงาน */
  HOLIDAY: AURORA.textFaint,
  LATE: AURORA.amber,
  LEAVE: AURORA.sky,
  /*
   * "เวลาไม่ครบ" เป็นแดงเหมือนขาดงาน ไม่ใช่เทาจาง — มันคือวันที่ต้องยื่นขอแก้
   * เวลา ถ้าปล่อยไว้จะโดนหักเงิน สีเทาอ่านเป็น "ไม่มีอะไร" จนกวาดตาข้ามไป
   *
   * ที่แยกจากขาดงานคือ "ป้ายข้อความ" ไม่ใช่สี เพราะสองอย่างนี้แก้คนละทาง
   * (ขาดงานยื่นลาย้อนหลัง เวลาไม่ครบขอแก้เวลา) แต่ความเร่งด่วนเท่ากัน —
   * หน้าหลักก็ใช้แดงกับสถานะนี้อยู่แล้ว (ดู HERO_STATE_COLOR)
   */
  MISSING_LOG: AURORA.rose,
  PRESENT: AURORA.accent,
};

/* --------------------------------------------------------- หัวข้อหน้า */

export interface AttendanceHeroProps {
  /** "วันศุกร์ที่ 5 กันยายน" — ละได้ระหว่างรอ bootstrap */
  dateLabel?: string;
  /** ลงไปแล้วกี่รอบจากทั้งหมด */
  doneCount: number;
  totalCount: number;
}

/** ขนาดหน้าปัดลายน้ำ — ใหญ่กว่าความสูงหัวจอ จะได้ล้นออกไปแล้วโดนตัด */
const WATERMARK_DIAL = 132;
const WATERMARK_CENTER = WATERMARK_DIAL / 2;

/** ขีดบอกชั่วโมงสิบสองขีดของหน้าปัดลายน้ำ — คำนวณครั้งเดียวตอนโหลดไฟล์ */
const WATERMARK_TICKS = Array.from({ length: 12 }, (_, index) => {
  const radians = ((index * 30 - 90) * Math.PI) / 180;
  const point = (radius: number) => ({
    x: WATERMARK_CENTER + radius * Math.cos(radians),
    y: WATERMARK_CENTER + radius * Math.sin(radians),
  });

  return { from: point(48), key: index, to: point(56) };
});

/**
 * ลายหน้าปัดนาฬิกาจาง ๆ ริมขวาของหัวจอ
 *
 * แถบน้ำเงินโค้งริมซ้ายเป็นของ `PageHero` ในชั้นดีไซน์แล้ว ไม่ต้องวาดซ้ำที่นี่
 * — ไฟล์นี้เหลือเฉพาะลายที่เป็นของจอลงเวลาจริง ๆ
 */
function HeroBackground() {
  return (
    <View style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}>
      {/*
        หน้าปัดนาฬิกาเป็นลายน้ำริมขวา — ลายที่พูดเรื่องเดียวกับจอนี้ ไม่ใช่
        ลายเรขาคณิตที่เอาอะไรมาวางก็ได้

        อยู่ใน SVG ของตัวเองที่เป็นสี่เหลี่ยมจัตุรัสและไม่ตั้ง
        `preserveAspectRatio` วงกลมจึงยังกลม (SVG ก้อนที่วาดแถบสีตั้งเป็น
        `none` ไว้ วงกลมในนั้นจะถูกยืดเป็นวงรี)

        หน้าปัดใหญ่กว่าความสูงหัวจอ ล้นออกไปทั้งบนล่างขวาแล้วถูก
        `overflow: 'hidden'` ตัด — เห็นเป็นเสี้ยวหน้าปัด ไม่ใช่ไอคอนนาฬิกา
        ทั้งเรือนวางอยู่เฉย ๆ
      */}
      <View
        style={{
          opacity: 0.16,
          position: 'absolute',
          right: -26,
          top: -22,
        }}
      >
        <Svg height={WATERMARK_DIAL} width={WATERMARK_DIAL}>
          <Circle
            cx={WATERMARK_CENTER}
            cy={WATERMARK_CENTER}
            fill="none"
            r={60}
            stroke={AURORA.textFaint}
            strokeWidth={2}
          />

          {WATERMARK_TICKS.map((tick) => (
            <Line
              key={tick.key}
              stroke={AURORA.textFaint}
              strokeLinecap="round"
              strokeWidth={tick.key % 3 === 0 ? 3 : 1.5}
              x1={tick.from.x}
              x2={tick.to.x}
              y1={tick.from.y}
              y2={tick.to.y}
            />
          ))}

          {/* เข็มชี้สิบโมงสิบนาที — ท่ามาตรฐานของนาฬิกาในงานโฆษณา */}
          <Line
            stroke={AURORA.textFaint}
            strokeLinecap="round"
            strokeWidth={4}
            x1={WATERMARK_CENTER}
            x2={WATERMARK_CENTER - 24}
            y1={WATERMARK_CENTER}
            y2={WATERMARK_CENTER - 18}
          />
          <Line
            stroke={AURORA.textFaint}
            strokeLinecap="round"
            strokeWidth={3}
            x1={WATERMARK_CENTER}
            x2={WATERMARK_CENTER + 30}
            y1={WATERMARK_CENTER}
            y2={WATERMARK_CENTER - 22}
          />
          <Circle
            cx={WATERMARK_CENTER}
            cy={WATERMARK_CENTER}
            fill={AURORA.textFaint}
            r={4}
          />
        </Svg>
      </View>
    </View>
  );
}

/**
 * หัวข้อหน้าของแท็บลงเวลา — โครง `PageHero` ของชั้นดีไซน์ + ลายหน้าปัดเฉพาะจอนี้
 */
export function AttendanceHero({
  dateLabel,
  doneCount,
  totalCount,
}: AttendanceHeroProps) {
  const complete = doneCount >= totalCount;
  const statusColor = complete ? AURORA.emerald : AURORA.accent;

  return (
    <PageHero
      decoration={<HeroBackground />}
      icon="clock"
      right={
        /* ป้ายสถานะ = จุดกลม + ข้อความสีเดียวกัน ตามกติกาของแอป */
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
          <View
            style={{
              backgroundColor: statusColor,
              borderRadius: 999,
              height: 5,
              width: 5,
            }}
          />
          <Text
            maxScale={1.1}
            style={{
              color: statusColor,
              fontSize: 11,
              fontWeight: '800',
              lineHeight: 15,
            }}
          >
            {complete ? 'ครบทุกรอบ' : `${doneCount}/${totalCount} รอบ`}
          </Text>
        </View>
      }
      subtitle={dateLabel}
      title="ลงเวลา"
    />
  );
}

/* -------------------------------------------------------- เลือกเดือน */

export interface MonthSwitcherProps {
  canGoNext: boolean;
  month: string;
  onShiftMonth: (delta: number) => void;
  rangeLabel?: string;
}

/**
 * แถบเลือกงวดของแท็บลงเวลา — เปลือกบาง ๆ ของ `PeriodBar` ที่ใช้ร่วมกันทั้งแอป
 *
 * เดิมเป็นแคปซูลฟ้าอ่อนที่มีปุ่มกลมขาวลอยอยู่สองมุม คนละทรงกับแถบเลือกวันของ
 * จอผู้บริหาร ทั้งที่เป็นตัวควบคุมชนิดเดียวกัน — ตอนนี้ทุกจอใช้ตัวเดียวกันแล้ว
 *
 * ช่วงวันของงวดเป็นบรรทัดรองใต้ชื่อเดือน เพราะเป็นคำขยายของเดือน ไม่ใช่ค่าคู่กัน
 */
export function MonthSwitcher({
  canGoNext,
  month,
  onShiftMonth,
  rangeLabel,
}: MonthSwitcherProps) {
  return (
    <PeriodBar
      backLabel="งวดก่อนหน้า"
      canGoNext={canGoNext}
      forwardLabel="งวดถัดไป"
      label={formatMonthLabel(month)}
      onShift={onShiftMonth}
      {...(rangeLabel ? { sublabel: rangeLabel } : {})}
    />
  );
}

/* ---------------------------------------------------------- รายวัน */

const timeText = (value: Date | null | undefined) =>
  value
    ? thaiTime(value)
    : '—';

/** สายแบบสั้นสำหรับช่องแคบ — 98 นาที → "1:38", 2 นาที → "2 น." */
function compactLate(minutes: number): string {
  if (minutes <= 0) {
    return '—';
  }

  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);

  return hours > 0 ? `${hours}:${String(rest).padStart(2, '0')}` : `${rest} น.`;
}

/*
 * ความกว้างของคอลัมน์ต้องใช้ค่าเดียวกันทั้งหัวตารางและทุกแถว
 * ถ้าแยกกันเมื่อไรหัวตารางจะเลื่อนหลุดจากตัวเลขที่มันกำกับอยู่
 */
const DATE_WIDTH = 34;
const STATUS_WIDTH = 66;
const COLUMN_GAP = 8;

/** หมายเหตุความสายใต้ช่องเวลา — กว้างเท่าคอลัมน์เวลาและจัดกลางเหมือนกัน */
const LATE_NOTE: TextStyle = {
  color: AURORA.amber,
  flex: 1,
  fontSize: 9.5,
  lineHeight: 12,
  textAlign: 'center',
};

/** วันในสัปดาห์แบบสั้นจาก YYYY-MM-DD — คิดใน UTC เหมือนทั้งไฟล์ปฏิทิน */
function weekdayLabel(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);

  return WEEKDAY_LABELS[
    new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay()
  ];
}

/**
 * หัวตาราง — กำกับแค่สามคอลัมน์เวลา
 *
 * คอลัมน์ "สาย" ถูกยกออกจากตาราง เพราะวันที่สายจริงมีไม่กี่วันต่อเดือน แต่
 * คอลัมน์นั้นกินที่ทุกแถวและใส่ขีดกลางว่าง ๆ ให้อ่านทิ้ง ตอนนี้ความสายไปอยู่
 * เป็นบรรทัดหมายเหตุใต้แถว เฉพาะวันที่มีจริง
 */
function DayListHeader() {
  return (
    <View
      style={{
        alignItems: 'center',
        borderBottomColor: AURORA.glassBorder,
        borderBottomWidth: 1,
        flexDirection: 'row',
        gap: COLUMN_GAP,
        paddingBottom: 8,
        paddingTop: 4,
      }}
    >
      <Text
        maxScale={1.05}
        style={{
          color: AURORA.textFaint,
          fontSize: 9.5,
          textAlign: 'center',
          width: DATE_WIDTH,
        }}
      >
        วันที่
      </Text>

      {['เข้าเช้า', 'เข้าบ่าย', 'ออกงาน'].map((label) => (
        <Text
          key={label}
          maxScale={1.05}
          style={{
            color: AURORA.textFaint,
            flex: 1,
            fontSize: 9.5,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      ))}

      {/*
        ชิดซ้ายเหมือนป้ายสถานะในแถว ซึ่งเริ่มด้วยจุดกลมที่ขอบซ้ายของคอลัมน์ —
        ถ้าจัดกลางหัวตารางจะเยื้องจากของที่มันกำกับอยู่
      */}
      <Text
        maxScale={1.05}
        style={{
          color: AURORA.textFaint,
          fontSize: 9.5,
          width: STATUS_WIDTH,
        }}
      >
        สถานะ
      </Text>
    </View>
  );
}

/**
 * หนึ่งวัน = หนึ่งแถว สูงหนึ่งหรือสองบรรทัด
 *
 * เดิมเป็นตารางหกคอลัมน์ที่อัดกันจนแน่น — วันที่ วันในสัปดาห์ เวลาสามช่อง
 * ความสาย และป้ายสถานะพื้นทึบ ทุกแถวมีสีเต็มไปหมดจนกวาดตาหาวันที่ผิดปกติ
 * ไม่เจอ รอบนี้ลดลงเหลือสิ่งที่ต้องอ่านจริง:
 *
 *   - วันที่กับวันในสัปดาห์ซ้อนกันเป็นก้อนเดียว ไม่ใช่สองคอลัมน์
 *   - เวลาสามช่องเหมือนเดิม (นี่คือเหตุผลที่คนเปิดจอนี้)
 *   - สถานะเป็นจุดกลม + ข้อความสีเดียวกัน ตามกติกาของแอป ไม่ใช่ป้ายพื้นทึบ
 *   - ความสายลงมาเป็นบรรทัดที่สอง เฉพาะวันที่สายจริง
 */
function DayRow({ day, isToday }: { day: AttendanceDay; isToday: boolean }) {
  const { gutter } = useResponsive();
  const color = STATE_COLOR[day.state];

  /*
   * วันที่ "ไม่ต้องสแกน" — วันหยุด วันลา และวันที่อนุมัติให้ทำงานนอกสถานที่
   *
   * ทั้งสามแบบเดิมขึ้นเป็นขีดกลางสามอันเหมือนกันหมด ซึ่งแปลว่า "ไม่มีข้อมูล"
   * และชวนให้คิดว่าลืมสแกน ทั้งที่วันนั้นไม่ต้องสแกนตั้งแต่แรก — เขียนเหตุผล
   * ลงไปตรง ๆ อ่านจบในบรรทัดเดียว
   *
   * ใช้ได้เฉพาะวันที่ "ไม่มีเวลาลงไว้เลย" ถ้ามีเวลาแม้รอบเดียว (ถูกเรียกมา
   * ทำงานวันหยุด ลาครึ่งวัน ออกนอกบริษัทครึ่งวัน) ต้องโชว์เวลาตามจริง
   */
  const noStamps =
    !day.morningInAt && !day.afternoonInAt && !day.checkOutAt;

  /*
   * สีของหมายเหตุแยกตามเหตุผล ไม่ใช่เทาเหมือนกันหมด — กวาดตาลงมาทั้งเดือนแล้ว
   * แยกออกทันทีว่าวันไหนหยุด วันไหนลา วันไหนออกไปทำงานข้างนอก
   *
   * ทั้งสามสีอยู่ในกลุ่ม "ไม่ใช่ปัญหา" ตามกติกาสีของแอป ส้มกับแดงยังสงวนไว้ให้
   * วันที่ต้องตามแก้เท่านั้น
   */
  const dayNote =
    day.state === 'HOLIDAY'
      ? {
          color: AURORA.emerald,
          text: day.holidayName ?? 'วันหยุดประจำสัปดาห์',
        }
      : day.state === 'LEAVE'
        ? { color: AURORA.sky, text: day.leaveTypeName ?? 'ลา' }
        : day.offsiteMinutes > 0
          ? { color: AURORA.accent, text: 'ทำงานนอกสถานที่' }
          : null;

  const restDay = noStamps && dayNote !== null;

  /*
   * แยกให้เห็นว่าสายรอบไหน — สายเช้ากับสายบ่ายเป็นคนละเรื่องเวลาจะยื่นแก้เวลา
   * และคนที่สายบ่ายบ่อย ๆ มักเป็นคนที่ออกไปทำงานนอกบริษัทตอนกลางวัน
   *
   * ถ้า backend รุ่นเก่าไม่ได้ส่งค่าที่แยกไว้มา (ทั้งคู่เป็น 0 แต่ยอดรวมมากกว่า
   * ศูนย์) ให้ถอยไปแสดงยอดรวมแบบเดิม ดีกว่าเงียบไปทั้งบรรทัด
   */
  const morningLate =
    day.morningLateMinutes > 0
      ? `สาย ${compactLate(day.morningLateMinutes)}`
      : '';
  const afternoonLate =
    day.afternoonLateMinutes > 0
      ? `สาย ${compactLate(day.afternoonLateMinutes)}`
      : '';
  const splitLate = Boolean(morningLate || afternoonLate);

  /* ค่ารวมใช้เมื่อ backend รุ่นเก่ายังไม่ส่งค่าที่แยกรอบมาให้ */
  const totalLate =
    !splitLate && day.lateMinutes > 0
      ? `สาย ${compactLate(day.lateMinutes)}`
      : '';

  /*
   * พื้นสีจาง ๆ ของแถวคือสิ่งเดียวที่ทำให้รายการทั้งเดือนไม่กลายเป็นแผ่นขาวยาว
   * ๆ — วันหยุดกับวันลาโผล่ทุกสัปดาห์อยู่แล้ว พอมีพื้นสีมันเลยทำหน้าที่แบ่ง
   * รายการเป็นก้อน ๆ ตามสัปดาห์ให้เองโดยไม่ต้องเพิ่มเส้นคั่นหรือหัวข้อสัปดาห์
   *
   * วันนี้ได้พื้นฟ้าจางเพื่อให้หาเจอทันทีเวลาเลื่อนกลับขึ้นมา
   */
  const rowTint = dayNote
    ? `${dayNote.color}0d`
    : isToday
      ? AURORA.accentSoft
      : undefined;

  return (
    <View
      style={{
        backgroundColor: rowTint,
        gap: 3,
        marginHorizontal: -18,
        paddingHorizontal: gutter,
        paddingVertical: 9,
      }}
    >
      <View
        style={{ alignItems: 'center', flexDirection: 'row', gap: COLUMN_GAP }}
      >
        {/* วันที่กับวันในสัปดาห์ซ้อนกัน อ่านเป็นก้อนเดียว */}
        <View style={{ alignItems: 'center', width: DATE_WIDTH }}>
          <Text
            maxScale={1.05}
            style={[
              TABULAR,
              {
                color: AURORA.text,
                fontSize: 14,
                fontWeight: isToday ? '900' : '700',
                lineHeight: 18,
              },
            ]}
          >
            {Number(day.workDate.slice(8))}
          </Text>
          {/*
            เดือนอยู่ใต้เลขวันทุกแถว ไม่ใช่เฉพาะแถวที่เดือนเปลี่ยน — งวดเงินเดือน
            คร่อมสองเดือนเสมอ (26 ก.ค. – 25 ส.ค.) แถวที่มีแต่เลข "25" จึงตอบ
            ไม่ได้ว่าเป็นวันไหน ถ้าใส่เฉพาะแถวที่เปลี่ยนเดือน คนที่เลื่อนมาหยุด
            กลางรายการก็ยังต้องเลื่อนขึ้นไปหาอยู่ดี
          */}
          <Text
            maxScale={1.05}
            style={{
              color: AURORA.textFaint,
              fontSize: 9,
              fontWeight: '600',
              lineHeight: 11,
            }}
          >
            {formatShortMonth(day.workDate)}
          </Text>
          <Text
            maxScale={1.05}
            style={{
              color: AURORA.textFaint,
              fontSize: 9,
              lineHeight: 11,
            }}
          >
            {weekdayLabel(day.workDate)}
          </Text>
        </View>

        {restDay && dayNote ? (
          <Text
            maxScale={1.05}
            numberOfLines={1}
            style={{
              color: dayNote.color,
              flex: 3,
              fontSize: 11.5,
              fontWeight: '600',
              lineHeight: 17,
              textAlign: 'center',
            }}
          >
            {dayNote.text}
          </Text>
        ) : (
          [day.morningInAt, day.afternoonInAt, day.checkOutAt].map(
            (stamp, index) => (
              <Text
                key={index}
                maxScale={1.05}
                style={[
                  TABULAR,
                  {
                    color: stamp ? AURORA.text : AURORA.textFaint,
                    flex: 1,
                    fontSize: 12.5,
                    fontWeight: stamp ? '700' : '400',
                    lineHeight: 17,
                    textAlign: 'center',
                  },
                ]}
              >
                {timeText(stamp)}
              </Text>
            ),
          )
        )}

        {/*
          ป้ายสถานะ = จุดกลม + ข้อความสีเดียวกัน ไม่ใช่ป้ายพื้นทึบ

          วันหยุดไม่ต้องมีป้าย เพราะช่องเวลาเขียนว่า "วันหยุด" ไปแล้ว เหลือไว้
          เป็นช่องว่างเปล่าเพื่อให้ทุกแถวกว้างเท่ากันและตัวเลขยังเรียงตรง
        */}
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: 4,
            width: STATUS_WIDTH,
          }}
        >
          {restDay ? null : (
            <>
              <View
                style={{
                  backgroundColor: color,
                  borderRadius: 999,
                  height: 5,
                  width: 5,
                }}
              />
              <Text
                maxScale={1.05}
                numberOfLines={1}
                style={{
                  color,
                  flex: 1,
                  fontSize: 10,
                  fontWeight: '700',
                  lineHeight: 14,
                }}
              >
                {DAY_STATE_LABEL[day.state]}
              </Text>
            </>
          )}
        </View>
      </View>

      {/*
        หมายเหตุความสายอยู่ "ใต้ช่องเวลาของรอบนั้น" ไม่ใช่บรรทัดเดียวชิดซ้าย —
        แถวนี้ใช้ความกว้างคอลัมน์ชุดเดียวกับแถวเวลาข้างบน ตัวเลขกับคำอธิบาย
        จึงตรงกันพอดี ไม่ต้องอ่านคำว่า "เช้า/บ่าย" เพื่อจับคู่เอง
      */}
      {splitLate || totalLate ? (
        <View style={{ flexDirection: 'row', gap: COLUMN_GAP }}>
          <View style={{ width: DATE_WIDTH }} />

          {splitLate ? (
            <>
              <Text maxScale={1.05} style={LATE_NOTE}>
                {morningLate}
              </Text>
              <Text maxScale={1.05} style={LATE_NOTE}>
                {afternoonLate}
              </Text>
              <View style={{ flex: 1 }} />
            </>
          ) : (
            <Text maxScale={1.05} style={[LATE_NOTE, { flex: 3 }]}>
              {totalLate}
            </Text>
          )}

          <View style={{ width: STATUS_WIDTH }} />
        </View>
      ) : null}
    </View>
  );
}

export interface DayListPanelProps {
  /**
   * ตารางนี้วางอยู่ในการ์ดใบอื่นแล้ว ไม่ต้องมีผิวกระจกของตัวเอง
   * (ห้ามกระจกซ้อนกระจก — ขอบสองชั้นทำให้ตารางดูจมลงไปอีกชั้น)
   */
  bare?: boolean;
  days: AttendanceDay[];
  today: string;
}

/**
 * รายการรายวันของเดือน เรียงวันล่าสุดขึ้นก่อน
 *
 * แทนที่ปฏิทินเดิม — ปฏิทินบอกได้แค่ "วันไหนมีปัญหา" ต้องแตะอีกทีถึงจะเห็นเวลา
 * ส่วนตารางนี้เห็นเวลาทั้งสามรอบของทุกวันพร้อมกันโดยไม่ต้องแตะ ซึ่งเป็นสิ่งที่คน
 * เปิดจอนี้มาดูจริง ๆ และเรียงล่าสุดขึ้นก่อนเพราะวันที่เพิ่งผ่านไปสำคัญกว่าต้นเดือน
 */
export function DayListPanel({ bare, days, today }: DayListPanelProps) {
  const sorted = [...days].sort((left, right) =>
    right.workDate.localeCompare(left.workDate),
  );

  if (sorted.length === 0) {
    return (
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 26 }}>
        <Icon color={AURORA.accent} name="calendar" size={28} />
        <Text
          maxScale={1.2}
          style={{ color: AURORA.text, fontSize: 13, fontWeight: '800' }}
        >
          ช่วงนี้ยังไม่มีบันทึกเวลา
        </Text>
        <Text
          maxScale={1.2}
          style={{ color: AURORA.textMuted, fontSize: 11, textAlign: 'center' }}
        >
          เวลาที่ลงในงวดนี้จะขึ้นมาที่นี่ทันทีที่บันทึก
        </Text>
      </View>
    );
  }

  const body = (
    <>
      <DayListHeader />

      {/*
        แถวกินเต็มความกว้างจอ (หักระยะขอบ 18 ออกแล้วใส่กลับเป็น padding) เพื่อให้
        พื้นสีของวันหยุด/วันลาลากชนขอบจอ — พื้นสีที่จบก่อนถึงขอบอ่านเป็นการ์ด
        ไม่ใช่ "แถบของแถวนั้น"
      */}
      {sorted.map((day, index) => (
        <View
          key={day.workDate}
          style={{
            borderTopColor: AURORA.glassBorder,
            borderTopWidth: index === 0 ? 0 : 1,
          }}
        >
          <DayRow day={day} isToday={day.workDate === today} />
        </View>
      ))}
    </>
  );

  /*
   * ไม่มีผิวของตัวเองทั้งสองเส้นทาง — ตารางอยู่ในแผ่นขาวใบเดียวของจออยู่แล้ว
   * (`bare` เหลือไว้เพื่อไม่ต้องแก้ผู้เรียกที่ส่งมาอยู่แล้ว แต่ตอนนี้ผลลัพธ์
   * เหมือนกันทั้งคู่ — จอเป็นคนตัดสินผิว ไม่ใช่ตาราง)
   */
  return <View>{body}</View>;
}
