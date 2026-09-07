import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Icon, Text, hitSlop, type IconName } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  ExecutiveHomeMotif,
  PageHero,
  PageSection,
  PressableScale,
  Reveal,
} from '@/design/aurora';
import { useBootstrap } from '@/features/bootstrap/use-bootstrap';
import { useExecutiveSummary } from '@/features/executive/executive';
import {
  useExecutiveAttendanceTrend,
  useExecutiveInsights,
  type ExecutiveAttendanceTrendPoint,
} from '@/features/executive/executive-views';
import { TABULAR, compact } from '@/features/executive/royal';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * หน้าหลักของผู้บริหาร
 *
 * ผิวขาวผืนเดียวชุดเดียวกับจอของพนักงาน — `PageHero` + `PageSection` + `AURORA`
 * เดิมจอนี้มีหัวจอน้ำเงินเต็มความกว้าง (`HeaderBand`) กับหมวดที่คั่นด้วยเส้นบาง
 * (`Section` + `SectionLabel`) ซึ่งเป็นผิวเฉพาะของห้องผู้บริหาร สลับจากแท็บ
 * พนักงานมาแล้วเหมือนคนละแอป
 *
 * โครงเนื้อหาไม่เปลี่ยน: วงแหวนอัตรามาทำงานเป็นจุดโฟกัสเดียวของจอ ตามด้วย
 * ตัวเลขกำลังคน สัดส่วนการลงเวลา การเข้า-ออกพนักงาน และค่าจ้างรายเดือน
 */

/** ราง (พื้นของแท่ง/วงแหวนส่วนที่ยังไม่เต็ม) — ฟ้าจางบนผิวขาว */
const TRACK = AURORA.accentSoft;

/* ------------------------------------------------------ วงแหวนพระเอก */

/** วงแหวนอัตรามาทำงานวันนี้ — จุดโฟกัสเดียวของทั้งจอ */
function RateRing({ rate, size = 96 }: { rate: number; size?: number }) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(rate, 100)) / 100;

  return (
    <View style={{ height: size, width: size }}>
      <Svg height={size} width={size}>
        <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke={TRACK} strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={AURORA.accent}
          strokeDasharray={`${circumference}, ${circumference}`}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          strokeWidth={stroke}
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      <View
        style={{
          alignItems: 'center',
          height: size,
          justifyContent: 'center',
          position: 'absolute',
          width: size,
        }}
      >
        <Text
          maxScale={1.05}
          style={[TABULAR, { color: AURORA.accent, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 }]}
        >
          {rate}
        </Text>
        <Text style={{ color: AURORA.textMuted, fontSize: 11, fontWeight: '600' }}>%</Text>
      </View>
    </View>
  );
}

/* --------------------------------------------------------------- สถิติ */

function StatCell({
  divider = false,
  label,
  note,
  noteWarn = false,
  unit,
  value,
}: {
  divider?: boolean;
  label: string;
  note?: string | null;
  noteWarn?: boolean;
  unit?: string;
  value: string;
}) {
  return (
    <View
      style={{
        borderLeftColor: AURORA.glassBorder,
        borderLeftWidth: divider ? 1 : 0,
        flex: 1,
        gap: 5,
        paddingLeft: divider ? 14 : 0,
      }}
    >
      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{ color: AURORA.textFaint, fontSize: 10, lineHeight: 14 }}
      >
        {label}
      </Text>
      <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: 4 }}>
        <Text maxScale={1.1} style={[TABULAR, { color: AURORA.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 }]}>
          {value}
        </Text>
        {unit ? (
          <Text maxScale={1.1} style={{ color: AURORA.textMuted, fontSize: 10.5 }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {note ? (
        <Text maxScale={1.2} numberOfLines={1} style={{ color: noteWarn ? AURORA.amber : AURORA.textMuted, fontSize: 10 }}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------- การลงเวลาวันนี้ */

interface BarSegment {
  color: string;
  label: string;
  value: number;
}

function ProportionBar({ segments }: { segments: BarSegment[] }) {
  const total = segments.reduce((sum, item) => sum + Math.max(item.value, 0), 0);

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          backgroundColor: TRACK,
          borderRadius: 999,
          flexDirection: 'row',
          gap: 2,
          height: 8,
          overflow: 'hidden',
        }}
      >
        {total > 0
          ? segments
              .filter((item) => item.value > 0)
              .map((item) => (
                <View key={item.label} style={{ backgroundColor: item.color, flexGrow: item.value }} />
              ))
          : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {segments.map((item) => (
          <View key={item.label} style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
            <View style={{ backgroundColor: item.color, borderRadius: 999, height: 5, width: 5 }} />
            <Text maxScale={1.1} style={[TABULAR, { color: AURORA.textMuted, fontSize: 10.5 }]}>
              {item.label} {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------ ตัวชี้วัดบริหาร */

type DeltaDirection = 'up' | 'down' | 'flat';

interface Delta {
  direction: DeltaDirection;
  text: string;
}

/**
 * ส่วนต่างเทียบงวดก่อนของตัวเลขนับจำนวน (คน) — ต่างจากอัตราเป็น % ตรงที่
 * ต้องบอกหน่วยเป็น "คน" ไม่ใช่ "จุด" และทิศทางที่ "ดี" ไม่แน่นอนเหมือนกันทุกตัว
 * (เข้าใหม่ยิ่งขึ้นยิ่งดี แต่ลาออกยิ่งขึ้นยิ่งแย่) จึงแยก `goodDirection` ออกไป
 * เป็นของ `InsightCell` แทนที่จะผูกไว้ในฟังก์ชันคำนวณนี้
 */
function countDelta(current: number, previous: number): Delta {
  const diff = current - previous;

  if (diff === 0) {
    return { direction: 'flat', text: 'เท่าเดิมจากงวดก่อน' };
  }

  const sign = diff > 0 ? '+' : '';

  return {
    direction: diff > 0 ? 'up' : 'down',
    text: `${sign}${diff} คนจากงวดก่อน`,
  };
}

function InsightCell({
  delta,
  divider,
  goodDirection = 'down',
  label,
  unit,
  value,
}: {
  delta: Delta | null;
  divider: boolean;
  /** ทิศทางที่ถือว่า "ดีขึ้น" ของตัวเลขนี้ — ค่าเริ่มต้น 'down' เพราะตัวชี้วัด
   * ส่วนใหญ่ (ลาออก, ขาดงาน, ต้นทุน) ยิ่งลดยิ่งดี ตัวที่สวนทาง (เช่นเข้าใหม่)
   * ต้องส่ง 'up' มาเอง */
  goodDirection?: 'down' | 'up';
  label: string;
  unit?: string;
  value: string;
}) {
  const isNeutral = !delta || delta.direction === 'flat';
  const isGood = !isNeutral && delta.direction === goodDirection;
  const deltaColor = isNeutral ? AURORA.textFaint : isGood ? AURORA.emerald : AURORA.rose;
  const deltaIcon: IconName =
    delta?.direction === 'up' ? 'trending-up' : delta?.direction === 'down' ? 'trending-down' : 'minus';

  return (
    <View
      style={{
        borderLeftColor: AURORA.glassBorder,
        borderLeftWidth: divider ? 1 : 0,
        flex: 1,
        gap: 6,
        paddingLeft: divider ? 16 : 0,
      }}
    >
      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{ color: AURORA.textFaint, fontSize: 10, lineHeight: 14 }}
      >
        {label}
      </Text>

      <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: 4 }}>
        <Text maxScale={1.1} style={[TABULAR, { color: AURORA.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 }]}>
          {value}
        </Text>
        {unit ? (
          <Text maxScale={1.1} style={{ color: AURORA.textMuted, fontSize: 10.5 }}>
            {unit}
          </Text>
        ) : null}
      </View>

      {delta ? (
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 3 }}>
          <Icon color={deltaColor} name={deltaIcon} size={11} />
          <Text maxScale={1.1} numberOfLines={1} style={[TABULAR, { color: deltaColor, fontSize: 10, fontWeight: '600' }]}>
            {delta.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------------------- แนวโน้มการเข้างานย้อนหลัง */

/** ความสูงของพื้นที่วาดเส้น — ป้ายวันที่อยู่นอกกรอบนี้ */
const TREND_HEIGHT = 100;

/* เว้นขอบบนล่างไว้ ไม่ให้เส้นที่แตะ 0% หรือ 100% ถูกตัดครึ่งที่ขอบกรอบ */
const TREND_TOP = 8;
const TREND_BOTTOM = TREND_HEIGHT - 8;


type TrendMetric = 'onTime' | 'late' | 'leave' | 'ot';

/**
 * ตัวชี้วัดที่กราฟวาดได้ — ทุกตัวเป็น "สัดส่วนของคนที่ต้องมาทำงานวันนั้น"
 *
 * ทำเป็นเปอร์เซ็นต์ทุกตัว ไม่ใช่จำนวนคน เพราะจำนวนคนที่ต้องมาทำงานไม่เท่ากัน
 * ทุกวัน (คนเข้าใหม่ คนลาออก วันที่บางแผนกหยุด) เส้นจำนวนคนจึงขยับตามขนาด
 * องค์กร ไม่ใช่ตามพฤติกรรมที่ผู้บริหารอยากดู
 *
 * ฐานของ "ตรงเวลา" กับ "มาสาย" หักคนลาออกก่อน — คนลาไม่ได้มีโอกาสมาสาย
 * ส่วน "ลา" กับ "ขอโอที" ใช้ฐานเต็ม เพราะเป็นสัดส่วนของกำลังคนทั้งหมด
 */
const TREND_METRICS: {
  color: string;
  hint: string;
  label: string;
  value: TrendMetric;
}[] = [
  {
    color: AURORA.accent,
    hint: 'สัดส่วนคนที่ลงเวลาเข้างานตรงเวลา เทียบกับคนที่ต้องมาทำงานวันนั้น (ไม่นับคนลา)',
    label: 'มาตรงเวลา',
    value: 'onTime',
  },
  {
    color: AURORA.amber,
    hint: 'สัดส่วนคนที่ลงเวลาเข้างานสาย เทียบกับคนที่ต้องมาทำงานวันนั้น (ไม่นับคนลา)',
    label: 'มาสาย',
    value: 'late',
  },
  {
    color: AURORA.sky,
    hint: 'สัดส่วนคนที่ลาในวันนั้น เทียบกับคนที่ต้องมาทำงานทั้งหมด',
    label: 'อัตราการลา',
    value: 'leave',
  },
  {
    color: AURORA.accentEnd,
    hint: 'สัดส่วนคนที่มีโอทีอนุมัติแล้วในวันนั้น เทียบกับคนที่ต้องมาทำงานทั้งหมด',
    label: 'ขอโอที',
    value: 'ot',
  },
];

/** ค่าของตัวชี้วัดหนึ่งตัวในหนึ่งวัน — คืนเป็นเปอร์เซ็นต์ปัดทศนิยมหนึ่งตำแหน่ง */
function metricValue(
  point: ExecutiveAttendanceTrendPoint,
  metric: TrendMetric,
): number {
  const base = Math.max(point.expected - point.leave, 0);
  const ratio = (value: number, over: number) =>
    over > 0 ? Math.round((value / over) * 1000) / 10 : 0;

  if (metric === 'onTime') {
    return ratio(Math.max(point.present - point.late, 0), base);
  }

  if (metric === 'late') return ratio(point.late, base);
  if (metric === 'leave') return ratio(point.leave, point.expected);

  return ratio(point.ot, point.expected);
}

/**
 * ตัวเลือกของกราฟ — เม็ดมนที่กางรายการลอยลงมา
 *
 * ต่างจาก `<Select>` ของฟอร์มตรงบทบาท: ในฟอร์มช่องกรอกต้องมีป้ายกำกับกับกรอบ
 * ชัด ๆ เพราะผู้ใช้กำลัง "กรอกข้อมูล" แต่สองตัวนี้เป็นตัวควบคุมของกราฟที่อยู่
 * ติดกัน ค่าที่เลือกอยู่คือข้อความบนปุ่มเลย ไม่ต้องมีป้ายบอกอีกชั้น — ไอคอน
 * นำหน้าบอกว่าเม็ดไหนคุมอะไร (อาคาร = ดูของใคร, กราฟ = ดูเรื่องอะไร)
 *
 * รายการกางแบบลอยทับเนื้อหา ไม่ดันกราฟลงไปทุกครั้งที่เปิด (กติกาเดียวกับ
 * ดรอปดาวน์ในตัวกรองจออื่น)
 */
function TrendPill<T extends string>({
  icon,
  label,
  onChange,
  options,
  value,
}: {
  icon: IconName;
  /** ใช้เป็นป้ายเรียกตอนกด (screen reader) ไม่ได้แสดงบนจอ */
  label: string;
  onChange: (next: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

  return (
    <View style={{ flex: 1, zIndex: open ? 30 : 0 }}>
      <PressableScale
        accessibilityLabel={`${label}: ${selected?.label ?? ''}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={{
          alignItems: 'center',
          backgroundColor: open ? AURORA.baseDeep : AURORA.accentSoft,
          borderColor: open ? AURORA.accent : 'transparent',
          borderRadius: 999,
          borderWidth: 1.5,
          flexDirection: 'row',
          gap: 7,
          minHeight: 38,
          paddingHorizontal: 12,
        }}
      >
        <Icon color={AURORA.accent} name={icon} size={14} />

        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={{
            color: AURORA.text,
            flex: 1,
            fontSize: 12.5,
            fontWeight: '700',
          }}
        >
          {selected?.label ?? '—'}
        </Text>

        <Icon
          color={AURORA.accent}
          name={open ? 'chevron-up' : 'chevron-down'}
          size={15}
        />
      </PressableScale>

      {open ? (
        <View
          style={{
            backgroundColor: AURORA.baseDeep,
            borderColor: 'rgba(29, 78, 216, 0.26)',
            borderRadius: 14,
            borderWidth: 1,
            elevation: 12,
            left: 0,
            marginTop: 6,
            overflow: 'hidden',
            position: 'absolute',
            right: 0,
            shadowColor: '#0f172a',
            shadowOffset: { height: 8, width: 0 },
            shadowOpacity: 0.18,
            shadowRadius: 18,
            top: '100%',
          }}
        >
          {options.map((option, index) => {
            const active = option.value === value;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={option.value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  backgroundColor: active
                    ? AURORA.accentSoft
                    : pressed
                      ? 'rgba(37, 99, 235, 0.06)'
                      : 'transparent',
                  borderTopColor: AURORA.glassBorder,
                  borderTopWidth: index === 0 ? 0 : 1,
                  flexDirection: 'row',
                  gap: 9,
                  minHeight: 42,
                  paddingHorizontal: 11,
                })}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    color: active ? AURORA.accent : AURORA.text,
                    flex: 1,
                    fontSize: 12.5,
                    fontWeight: active ? '700' : '500',
                    lineHeight: 18,
                  }}
                >
                  {option.label}
                </Text>

                {active ? (
                  <Icon color={AURORA.accent} name="check" size={15} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/**
 * กราฟเส้นแนวโน้มของตัวชี้วัดที่เลือก
 *
 * เลือกเส้นแทนแท่ง เพราะคำถามคือ "ขึ้นหรือลง" ไม่ใช่ "วันไหนเท่าไร" — แท่ง
 * สิบสี่แท่งบนจอมือถือกว้างแท่งละไม่ถึงยี่สิบพิกเซล ตาต้องไล่เทียบความสูงทีละคู่
 * ส่วนเส้นบอกทิศทางได้ในการมองครั้งเดียว
 *
 * ## แกนตั้งซูมเข้าหาช่วงของข้อมูล แต่มีป้ายเปอร์เซ็นต์กำกับทุกเส้นกริด
 *
 * ค่าจริงของแต่ละตัวชี้วัดแกว่งในช่วงแคบ (มาตรงเวลา 85–100%, มาสาย 0–15%)
 * ถ้าลากแกนจาก 0 ถึง 100 เสมอ เส้นจะแบนราบจนไม่เห็นความต่างที่ผู้บริหารต้องเห็น
 *
 * การซูมทำให้ความชันดูแรงกว่าความจริงได้ **ป้ายเปอร์เซ็นต์ริมซ้ายจึงไม่ใช่ของ
 * ประดับ** แต่เป็นตัวบอกว่าที่เห็นชันนั้นคือช่วงกี่จุดจริง ๆ
 */
function AttendanceTrendChart({
  color,
  metric,
  points,
}: {
  color: string;
  metric: TrendMetric;
  points: ExecutiveAttendanceTrendPoint[];
}) {
  const [width, setWidth] = useState(0);

  const worked = points.filter((point) => !point.restDay);
  const values = worked.map((point) => metricValue(point, metric));

  if (worked.length < 2) {
    return (
      <View style={{ height: TREND_HEIGHT, justifyContent: 'center' }}>
        <Text
          style={{ color: AURORA.textMuted, fontSize: 12.5, lineHeight: 18 }}
        >
          ยังมีวันทำงานไม่พอวาดแนวโน้ม (ต้องมีอย่างน้อยสองวัน)
        </Text>
      </View>
    );
  }

  const peak = Math.max(...values);
  const bottom = Math.min(...values);
  /* ช่วงขั้นต่ำ 8 จุด กันไม่ให้วันที่ค่าเท่ากันหมดกลายเป็นเส้นชิดขอบบน */
  const span = Math.max(peak - bottom, 8);
  const floor = Math.max(Math.floor(bottom - span * 0.3), 0);
  const ceiling = Math.min(Math.ceil(floor + span * 1.6), 100);

  /* สามเส้นกริด: ล่าง กลาง บน — ถี่กว่านี้บนความสูงร้อยพิกเซลคืออ่านไม่ออก
     ค่าซ้ำถูกตัดออก (เกิดได้เมื่อช่วงแคบมากจนปัดแล้วชนกัน) */
  const ticks = [...new Set([floor, Math.round((floor + ceiling) / 2), ceiling])];

  const lastIndex = worked.length - 1;
  const x = (index: number) => (index / lastIndex) * Math.max(width - 8, 0) + 4;
  const y = (value: number) =>
    TREND_BOTTOM -
    ((value - floor) / Math.max(ceiling - floor, 1)) *
      (TREND_BOTTOM - TREND_TOP);

  const line = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`)
    .join(' ');
  const area = `${line} L${x(lastIndex)},${TREND_HEIGHT} L${x(0)},${TREND_HEIGHT} Z`;

  /* ป้ายวันที่: หัว กลาง ท้าย เท่านั้น — สิบสี่ป้ายบนจอมือถือทับกันจนอ่านไม่ออก */
  const labelIndexes = [0, Math.floor(lastIndex / 2), lastIndex];

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {/* คอลัมน์ป้ายเปอร์เซ็นต์ — กว้างคงที่ กราฟจึงไม่ขยับเวลาค่าเปลี่ยน */}
        <View style={{ height: TREND_HEIGHT, width: 26 }}>
          {ticks.map((tick) => (
            <Text
              key={tick}
              maxScale={1}
              style={[
                TABULAR,
                {
                  color: AURORA.textFaint,
                  fontSize: 9,
                  lineHeight: 12,
                  position: 'absolute',
                  right: 0,
                  textAlign: 'right',
                  /* กึ่งกลางตัวอักษรให้ตรงกับเส้นกริดพอดี */
                  top: y(tick) - 6,
                },
              ]}
            >
              {`${tick}%`}
            </Text>
          ))}
        </View>

        <View
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.width);
            setWidth((current) => (current === next ? current : next));
          }}
          style={{ flex: 1, height: TREND_HEIGHT }}
        >
          {width > 0 ? (
            <Svg height={TREND_HEIGHT} width={width}>
              <Defs>
                {/* id ผูกกับตัวชี้วัด — สอง gradient ที่ชื่อซ้ำกันบนจอเดียวจะแย่ง
                    กันนิยาม แล้วอันหนึ่งกลายเป็นสีทึบบนเครื่องจริง */}
                <LinearGradient
                  id={`trendFill-${metric}`}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={color} stopOpacity={0.18} />
                  <Stop offset="1" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {ticks.map((tick) => (
                <Path
                  d={`M0,${y(tick)} L${width},${y(tick)}`}
                  key={tick}
                  stroke={AURORA.glassBorder}
                  strokeWidth={1}
                />
              ))}

              <Path d={area} fill={`url(#trendFill-${metric})`} />
              <Path
                d={line}
                fill="none"
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
              />

              {/* จุดทุกวัน เม็ดเล็ก — จุดสุดท้ายใหญ่กว่าเพราะเป็นค่าล่าสุด */}
              {worked.map((point, index) => (
                <Circle
                  cx={x(index)}
                  cy={y(values[index] ?? 0)}
                  fill={AURORA.baseDeep}
                  key={point.date}
                  r={index === lastIndex ? 4.5 : 2.6}
                  stroke={color}
                  strokeWidth={index === lastIndex ? 2.5 : 1.6}
                />
              ))}
            </Svg>
          ) : null}
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingLeft: 32,
        }}
      >
        {labelIndexes.map((index, order) => (
          <Text
            key={`${worked[index]?.date ?? index}-${order}`}
            maxScale={1}
            style={[
              TABULAR,
              { color: AURORA.textFaint, fontSize: 10, lineHeight: 14 },
            ]}
          >
            {shortDate(worked[index]?.date)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** "6 ก.ย." จากคีย์วันแบบ YYYY-MM-DD (อ่านแบบ UTC ไม่ให้เขตเวลาขยับวัน) */
function shortDate(dateKey?: string): string {
  if (!dateKey) return '';

  const [year, month, day] = dateKey.split('-').map(Number);

  if (!year || !month || !day) return '';

  return thaiDate(new Date(Date.UTC(year, month - 1, day)), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/* ------------------------------------------------------- ค่าจ้างรายงวด */

/** ชื่อเดือนของโครงกราฟทั้งปี ใช้เมื่อ backend ยังไม่ได้ส่งเดือนนั้นมา */
const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

interface TrendPoint {
  emphasis?: boolean;
  label: string;
  /** ยังไม่ถึงรอบจ่ายของเดือนนั้น — วาดเป็นช่องว่างที่รออยู่ ไม่ใช่ยอดที่ร่วงลง */
  pending?: boolean;
  value: number;
}

function TrendColumns({ points }: { points: TrendPoint[] }) {
  const peak = points.reduce((max, point) => Math.max(max, point.value), 0);

  /*
   * กางทั้งสิบสองเดือนต้องมีป้ายครบทุกเดือน ไม่ใช่ติดเว้นช่วง — ผู้บริหารต้องกวาดตา
   * แล้วรู้ทันทีว่าแท่งไหนคือเดือนไหน ชื่อเดือนย่อภาษาไทยกว้างราวสิบหกพิกเซลที่
   * ขนาดตัวอักษรเก้า จึงพอดีช่องละยี่สิบต้น ๆ ที่เหลือหลังหักช่องไฟสามพิกเซล
   *
   * แท่งกับป้ายแยกเป็นคนละแถว ไม่ใช่ซ้อนกันในคอลัมน์เดียว เพราะความสูงของป้าย
   * ที่ไม่เท่ากันจะดันแท่งของช่องนั้นหลุดแนวไปด้วย
   */
  const dense = points.length > 8;
  const gap = dense ? 3 : 8;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap, height: 58 }}>
        {points.map((point) => {
          /* แท่งค่าศูนย์ยังต้องเห็นเป็นขีดบาง ๆ ไม่ใช่หายไปทั้งแท่ง */
          const ratio = peak > 0 ? point.value / peak : 0;

          return (
            <View
              key={point.label}
              style={{
                backgroundColor: point.emphasis ? AURORA.accent : TRACK,
                borderRadius: 4,
                flex: 1,
                height: Math.max(ratio * 58, 3),
                opacity: point.pending ? 0.5 : 1,
              }}
            />
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap }}>
        {points.map((point) => (
          <Text
            key={point.label}
            maxScale={1}
            numberOfLines={1}
            style={{
              color: point.emphasis ? AURORA.text : AURORA.textFaint,
              flex: 1,
              fontSize: dense ? 9 : 9.5,
              letterSpacing: dense ? -0.4 : 0,
              textAlign: 'center',
            }}
          >
            {point.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- */

export function ExecutiveHome() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const bootstrap = useBootstrap();
  const data = bootstrap.data;

  const canView = data?.featureFlags.executive ?? false;
  const summary = useExecutiveSummary(canView);
  /* ยิงคู่กับ summary ตั้งแต่หน้าแรก เพราะ "ตัวชี้วัดบริหาร" เป็นสิ่งที่ต้องเห็น
     ทันที ไม่ใช่รอผู้บริหารกดเข้าไปเจาะลึกก่อนถึงจะเห็น */
  const insights = useExecutiveInsights(canView);

  /*
   * บริษัทในเครือที่กำลังดูกราฟอยู่ — null คือรวมทั้งบริษัท
   * เก็บแยกจากตัวกรองอื่นของจอ เพราะคุมเฉพาะกราฟแนวโน้ม ไม่ได้คุมทั้งหน้า
   */
  const [trendBranchId, setTrendBranchId] = useState<string | null>(null);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('onTime');
  const attendanceTrend = useExecutiveAttendanceTrend(
    trendBranchId ? { branchId: trendBranchId } : {},
    canView,
  );

  /* ตัวเลขทั้งบริษัทขยับตลอดวัน ต้องไม่ค้างอยู่ที่ยอดตอนเช้า */
  useRefetchOnFocus(summary);

  const company = data?.organization.company?.nameTh ?? '';
  const unread = data?.summary.unreadNotifications ?? 0;

  /* วันที่แปะไว้ที่หัวข้อ "ภาพรวมวันนี้" — ผู้บริหารยังต้องรู้ว่าตัวเลขที่เห็น
     อยู่เป็นของวันไหน */
  const todayLabel = thaiDate((data?.server.now ?? new Date()), {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    year: 'numeric',
  });

  const overview = summary.data;
  const today = overview?.today;
  const manpower = overview?.manpower;
  const trend = overview?.trend ?? [];

  /*
   * ฐานของสัดส่วนคือคนที่ "ต้องมาทำงานวันนี้" ไม่ใช่พนักงานทั้งหมด — คนลา
   * ยังนับอยู่ในฐานเพราะเขาอยู่ในกะ ส่วนคนที่หยุดตามตารางไม่ได้อยู่ในนี้ตั้งแต่ต้น
   */
  const expected = today ? today.checkedIn + today.late + today.notCheckedIn + today.onLeave : 0;
  const present = today ? today.checkedIn + today.late : 0;
  const rate = expected > 0 ? Math.round((present / expected) * 100) : 0;

  /*
   * โครงกราฟเป็นสิบสองเดือนเสมอ ไม่ว่าจะทำเงินเดือนไปแล้วกี่งวด — ปีที่เพิ่งเริ่ม
   * ใช้ระบบจะได้เห็นว่าอีกกี่เดือนยังรออยู่ ไม่ใช่เห็นแท่งเดียวลอย ๆ หรือเห็นแค่
   * ข้อความว่ายังไม่มีข้อมูล เดือนที่ยังไม่ถึงรอบจ่ายวาดเป็นเส้นฐานจาง ๆ ไว้
   *
   * วางแท่งด้วยเลขเดือนเป็นหลัก เผื่อ backend ส่งมาไม่ครบปี (รุ่นก่อนตัดเดือนที่
   * ยังไม่มีงวดทิ้ง) แล้วค่อยถอยไปเทียบชื่อเดือน
   */
  const chart = THAI_MONTHS.map((label, index) => {
    const point = trend.find((row) => (row.month > 0 ? row.month === index + 1 : row.label === label));

    return {
      employees: point?.employees ?? 0,
      /* ยอดที่มากกว่าศูนย์ก็คือทำเงินเดือนแล้ว — เผื่อ backend รุ่นที่ยังไม่ส่ง hasRun */
      hasRun: Boolean(point && (point.hasRun || point.netPay > 0)),
      label,
      netPay: point?.netPay ?? 0,
    };
  });

  /* "งวดล่าสุด" ที่โชว์เป็นตัวเลขใหญ่ต้องเป็นเดือนที่ทำเงินเดือนแล้วเท่านั้น */
  const latestIndex = chart.reduce((found, point, index) => (point.hasRun ? index : found), -1);
  const latest = latestIndex >= 0 ? chart[latestIndex] : null;

  const metrics = insights.data;
  const insightCells: {
    delta: Delta | null;
    goodDirection?: 'down' | 'up';
    label: string;
    unit?: string;
    value: string;
  }[] = [];

  if (metrics) {
    /* เข้าใหม่ยิ่งขึ้นยิ่งดี — ตรงข้ามกับลาออกและตัวชี้วัดอื่น ๆ ในจอนี้ทั้งหมด
       จึงต้องระบุ goodDirection กลับด้านให้สีของลูกศรตรงกับความหมายจริง */
    insightCells.push({
      delta: countDelta(metrics.workforce.hired, metrics.workforce.hiredPrev),
      goodDirection: 'up',
      label: 'เข้าใหม่เดือนนี้',
      unit: 'คน',
      value: compact(metrics.workforce.hired),
    });

    insightCells.push({
      delta: countDelta(metrics.workforce.resigned, metrics.workforce.resignedPrev),
      label: 'ลาออกเดือนนี้',
      unit: 'คน',
      value: compact(metrics.workforce.resigned),
    });

    /* ไม่มีอายุงานเฉลี่ยของงวดก่อนให้เทียบ (backend ไม่ได้ส่ง *Prev มาให้ตัวนี้)
       จึงไม่มีลูกศรส่วนต่างเหมือนอีกสองช่อง */
    insightCells.push({
      delta: null,
      label: 'อายุงานเฉลี่ย',
      unit: 'ปี',
      value: (metrics.workforce.avgTenureMonths / 12).toFixed(1),
    });
  }

  const metricOption =
    TREND_METRICS.find((item) => item.value === trendMetric) ??
    TREND_METRICS[0]!;

  /* ค่าล่าสุดของตัวชี้วัดที่เลือก — โชว์ข้างหัวข้อ ผู้บริหารจะได้ไม่ต้องเล็งจากกราฟ */
  const trendLatest = (() => {
    const worked = (attendanceTrend.data?.points ?? []).filter(
      (point) => !point.restDay,
    );
    const last = worked[worked.length - 1];

    return last ? metricValue(last, trendMetric) : null;
  })();

  const attendanceWarn = Boolean(today && (today.late > 0 || today.missingCheckIn > 0));
  const attendanceNote = attendanceWarn
    ? `สาย ${today?.late ?? 0} · ไม่ได้ลงเวลา ${today?.missingCheckIn ?? 0}`
    : 'ไม่มีรายการค้าง';

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => {
                  void bootstrap.refetch();
                  void summary.refetch();
                  void insights.refetch();
                  void attendanceTrend.refetch();
                }}
                refreshing={summary.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          {/* --------------------------------------------------- หัวจอ */}
          <Reveal>
            <PageHero
              decoration={<ExecutiveHomeMotif />}
              icon="briefcase"
              right={
                <PressableScale
                  accessibilityLabel={unread > 0 ? `การแจ้งเตือน ${unread} รายการ` : 'การแจ้งเตือน'}
                  accessibilityRole="button"
                  hitSlop={hitSlop}
                  onPress={() => router.push('/notifications')}
                  style={{
                    /*
                     * ขาวทึบมีขอบกับเงา ไม่ใช่ฟ้าจาง — ตรงนี้มีลายน้ำของหัวจอ
                     * อยู่ข้างหลัง ฟ้าจาง 8% ทับลายแล้วแยกไม่ออกว่าปุ่มเริ่มตรงไหน
                     * (ชุดเดียวกับปุ่มลูกศรของแถบเลือกวัน)
                     */
                    alignItems: 'center',
                    backgroundColor: AURORA.baseDeep,
                    borderColor: `${AURORA.accent}1f`,
                    borderRadius: 999,
                    borderWidth: 1,
                    elevation: 2,
                    height: 36,
                    justifyContent: 'center',
                    shadowColor: AURORA.accent,
                    shadowOffset: { height: 2, width: 0 },
                    shadowOpacity: 0.16,
                    shadowRadius: 5,
                    width: 36,
                  }}
                >
                  <Icon color={AURORA.accent} name="bell" size={17} />
                  {unread > 0 ? (
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: AURORA.rose,
                        borderColor: AURORA.baseDeep,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        height: 15,
                        justifyContent: 'center',
                        minWidth: 15,
                        paddingHorizontal: 3,
                        position: 'absolute',
                        right: -2,
                        top: -2,
                      }}
                    >
                      <Text maxScale={1} style={{ color: AURORA.baseDeep, fontSize: 8.5, fontWeight: '800' }}>
                        {unread > 9 ? '9+' : unread}
                      </Text>
                    </View>
                  ) : null}
                </PressableScale>
              }
              subtitle={company || undefined}
              title="ห้องผู้บริหาร"
            />
          </Reveal>

          <View style={{ gap: 28, paddingHorizontal: gutter, paddingTop: 24 }}>
            {!canView ? (
              <Reveal delay={90}>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: 12 }}>
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
                    <Text style={{ color: AURORA.text, fontSize: 14, fontWeight: '600' }}>
                      บัญชีนี้ยังไม่ได้รับสิทธิ์ดูภาพรวมบริษัท
                    </Text>
                    <Text style={{ color: AURORA.textMuted, fontSize: 12 }}>
                      ติดต่อฝ่ายบุคคลเพื่อขอเปิดสิทธิ์ผู้บริหาร
                    </Text>
                  </View>
                </View>
              </Reveal>
            ) : summary.isPending ? (
              <Reveal delay={90}>
                <View style={{ gap: 16 }}>
                  <View style={{ backgroundColor: AURORA.glassBorder, borderRadius: 12, height: 96 }} />
                  <View style={{ backgroundColor: AURORA.glassBorder, borderRadius: 12, height: 60 }} />
                </View>
              </Reveal>
            ) : summary.isError ? (
              <Reveal delay={90}>
                <View style={{ gap: 5 }}>
                  <Text style={{ color: AURORA.text }} variant="bodyStrong">
                    โหลดภาพรวมบริษัทไม่สำเร็จ
                  </Text>
                  <Text style={{ color: AURORA.textMuted, fontSize: 12, lineHeight: 17 }}>
                    {summary.error instanceof ApiError ? summary.error.message : 'ลองใหม่อีกครั้ง'}
                  </Text>
                  <PressableScale onPress={() => void summary.refetch()} style={{ alignSelf: 'flex-start' }}>
                    <Text style={{ color: AURORA.accent, fontSize: 13, fontWeight: '700' }}>ลองใหม่</Text>
                  </PressableScale>
                </View>
              </Reveal>
            ) : overview && today && manpower ? (
              <>
                {/* ------------------------------------- ภาพรวมวันนี้ */}
                <Reveal delay={60}>
                  <PageSection
                    title="ภาพรวมวันนี้"
                    trailing={
                      <Text style={{ color: AURORA.textFaint, fontSize: 11.5, lineHeight: 16 }}>
                        {todayLabel}
                      </Text>
                    }
                  >
                    <View style={{ gap: 18, paddingTop: 4 }}>
                      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 18 }}>
                        <RateRing rate={rate} />
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text
                            maxScale={1.1}
                            numberOfLines={1}
                            style={{ color: AURORA.textFaint, fontSize: 10.5, lineHeight: 14 }}
                          >
                            มาทำงานวันนี้
                          </Text>
                          <Text maxScale={1.1} style={[TABULAR, { color: AURORA.text, fontSize: 15, fontWeight: '700' }]}>
                            {present}
                            <Text style={{ color: AURORA.textMuted, fontSize: 12, fontWeight: '500' }}>
                              {`  จาก ${expected} คนที่เข้ากะ`}
                            </Text>
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={{ color: attendanceWarn ? AURORA.amber : AURORA.textMuted, fontSize: 11.5, marginTop: 2 }}
                          >
                            {attendanceNote}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row' }}>
                        <StatCell
                          label="จำนวนพนักงาน"
                          note={`เข้าใหม่ ${manpower.newThisMonth} · ทดลองงาน ${manpower.probationEmployees}`}
                          unit="คน"
                          value={compact(manpower.activeEmployees)}
                        />
                        <StatCell
                          divider
                          label="โอทีอนุมัติงวดนี้"
                          note={`ทั้งหมด ${manpower.totalEmployees} คนในระบบ`}
                          unit="ชม."
                          value={compact(today.approvedOtHours)}
                        />
                        {/* บอกขอบเขตไว้ในบรรทัดล่างเสมอ — ตัวเลขนี้คือใบค้าง
                            "ทั้งบริษัทในเดือนนี้" ไม่ใช่คิวที่รอคนที่เปิดจออยู่
                            อนุมัติ (ซึ่งอยู่ที่แท็บอนุมัติและมักน้อยกว่า) */}
                        <StatCell
                          divider
                          label="คำขอค้าง"
                          note={
                            manpower.pendingRequests > 0
                              ? 'ทั้งบริษัทในเดือนนี้'
                              : 'ไม่มีใบค้าง'
                          }
                          noteWarn={manpower.pendingRequests > 0}
                          unit="ใบ"
                          value={compact(manpower.pendingRequests)}
                        />
                      </View>
                    </View>
                  </PageSection>
                </Reveal>

                {/* --------------------------------- การลงเวลาวันนี้ */}
                <Reveal delay={100}>
                  <PageSection title="การลงเวลาวันนี้">
                    <View style={{ paddingTop: 4 }}>
                      <ProportionBar
                        segments={[
                          { color: AURORA.accent, label: 'ตรงเวลา', value: today.checkedIn },
                          { color: AURORA.amber, label: 'สาย', value: today.late },
                          { color: AURORA.sky, label: 'ลา', value: today.onLeave },
                          { color: 'rgba(87, 96, 122, 0.24)', label: 'ยังไม่เข้า', value: today.notCheckedIn },
                        ]}
                      />
                    </View>
                  </PageSection>
                </Reveal>

                {/* ------------------------------ แนวโน้มการเข้างาน */}
                {/*
                  ยกทั้งหมวดขึ้นชั้นบน — รายการของเม็ดเลือกกางลอยออกนอกกรอบ
                  ของตัวเอง ถ้าไม่ยก หมวดที่อยู่ถัดลงไป (ซึ่งเรนเดอร์ทีหลัง)
                  จะทับรายการที่กางอยู่ เพราะ zIndex เทียบกันได้เฉพาะในหมู่
                  ลูกของพ่อแม่เดียวกัน การใส่ที่ตัวเม็ดอย่างเดียวจึงไม่พอ
                */}
                <Reveal delay={120} style={{ zIndex: 20 }}>
                  <PageSection
                    title="แนวโน้มการเข้างาน"
                    trailing={
                      trendLatest !== null ? (
                        <Text
                          style={[
                            TABULAR,
                            {
                              color: metricOption.color,
                              fontSize: 11.5,
                              fontWeight: '700',
                              lineHeight: 16,
                            },
                          ]}
                        >
                          {`ล่าสุด ${trendLatest}%`}
                        </Text>
                      ) : undefined
                    }
                  >
                    <View style={{ gap: 12, paddingTop: 4 }}>
                      {/*
                        เม็ดเลือกสองอันเรียงกัน: ดูของใคร กับ ดูเรื่องอะไร
                        ไม่ใช้ช่องฟอร์มมีป้ายกำกับ เพราะเป็นตัวควบคุมของกราฟ
                        ที่อยู่ติดกัน ค่าที่เลือกอยู่คือข้อความบนปุ่มอยู่แล้ว
                      */}
                      <View style={{ flexDirection: 'row', gap: 8, zIndex: 5 }}>
                        <TrendPill
                          icon="briefcase"
                          label="ดูของ"
                          onChange={(next) =>
                            setTrendBranchId(next === 'all' ? null : next)
                          }
                          options={[
                            { label: 'ทั้งบริษัท', value: 'all' },
                            ...(
                              attendanceTrend.data?.filterOptions.branches ?? []
                            )
                              .filter((branch) => branch.id)
                              .map((branch) => ({
                                label: branch.label,
                                value: branch.id as string,
                              })),
                          ]}
                          value={trendBranchId ?? 'all'}
                        />

                        <TrendPill
                          icon="trending-up"
                          label="ตัวชี้วัด"
                          onChange={setTrendMetric}
                          options={TREND_METRICS.map((item) => ({
                            label: item.label,
                            value: item.value,
                          }))}
                          value={trendMetric}
                        />
                      </View>

                      {attendanceTrend.isPending ? (
                        <View
                          style={{
                            backgroundColor: AURORA.glassBorder,
                            borderRadius: 12,
                            height: 96,
                          }}
                        />
                      ) : attendanceTrend.isError ? (
                        <View style={{ gap: 4 }}>
                          <Text
                            style={{
                              color: AURORA.textMuted,
                              fontSize: 12.5,
                              lineHeight: 18,
                            }}
                          >
                            โหลดแนวโน้มการเข้างานไม่สำเร็จ
                          </Text>
                          <PressableScale
                            onPress={() => void attendanceTrend.refetch()}
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
                      ) : (
                        <>
                          <AttendanceTrendChart
                            color={metricOption.color}
                            metric={trendMetric}
                            points={attendanceTrend.data?.points ?? []}
                          />

                          {/* บอกวิธีคิดไว้ใต้กราฟ ไม่งั้นเลขนี้จะถูกเอาไปเทียบ
                              กับ "มาทำงานวันนี้" ที่นับคนลาไว้ในฐานด้วย */}
                          <Text
                            style={{
                              color: AURORA.textFaint,
                              fontSize: 10.5,
                              lineHeight: 15,
                            }}
                          >
                            {`${metricOption.hint} ย้อนหลัง ${attendanceTrend.data?.summary.workedDays ?? 0} วันทำงาน`}
                          </Text>
                        </>
                      )}
                    </View>
                  </PageSection>
                </Reveal>

                {/* ------------------------------------------ ตัวชี้วัดบริหาร */}
                {insightCells.length > 0 ? (
                  <Reveal delay={160}>
                    <PageSection
                      title="การเข้า-ออกพนักงาน"
                      trailing={
                        metrics?.periodLabel ? (
                          <Text style={{ color: AURORA.textFaint, fontSize: 11.5, lineHeight: 16 }}>
                            {metrics.periodLabel}
                          </Text>
                        ) : undefined
                      }
                    >
                      <View style={{ flexDirection: 'row', paddingTop: 4 }}>
                        {insightCells.map((cell, index) => (
                          <InsightCell key={cell.label} divider={index > 0} {...cell} />
                        ))}
                      </View>
                    </PageSection>
                  </Reveal>
                ) : null}

                {/* ----------------------------------------- ค่าจ้างรายงวด */}
                {!overview.payrollVisible ? (
                  <Reveal delay={200}>
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: 'rgba(148, 163, 184, 0.12)',
                        borderRadius: 16,
                        flexDirection: 'row',
                        gap: 11,
                        padding: 14,
                      }}
                    >
                      <Icon color={AURORA.textMuted} name="lock" size={17} />
                      <Text style={{ color: AURORA.textMuted, flex: 1, fontSize: 12.5, lineHeight: 18 }}>
                        บัญชีนี้ไม่ได้รับสิทธิ์ดูข้อมูลค่าจ้าง
                      </Text>
                    </View>
                  </Reveal>
                ) : (
                  <Reveal delay={200}>
                    <PageSection
                      title="ค่าจ้างรายเดือน"
                      trailing={
                        overview.trendYear ? (
                          <Text style={{ color: AURORA.textFaint, fontSize: 11.5, lineHeight: 16 }}>
                            {`ปี ${overview.trendYear}`}
                          </Text>
                        ) : undefined
                      }
                    >
                      <View style={{ gap: 14, paddingTop: 4 }}>
                        {latest ? (
                          <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: 6 }}>
                            <Text
                              maxScale={1.1}
                              style={{
                                color: AURORA.accent,
                                fontSize: 26,
                                fontVariant: ['tabular-nums'],
                                fontWeight: '800',
                                letterSpacing: -0.6,
                              }}
                            >
                              {compact(latest.netPay)}
                            </Text>
                            <Text style={{ color: AURORA.textMuted, fontSize: 11.5 }}>
                              {`บาท · งวด${latest.label} · ${latest.employees} คน`}
                            </Text>
                          </View>
                        ) : (
                          <Text style={{ color: AURORA.textMuted, fontSize: 12.5, lineHeight: 18 }}>
                            ยังไม่มีงวดที่ปิดแล้ว แท่งจะขึ้นทีละเดือนเมื่อทำเงินเดือน
                          </Text>
                        )}

                        <TrendColumns
                          points={chart.map((point, index) => ({
                            emphasis: index === latestIndex,
                            label: point.label,
                            pending: !point.hasRun,
                            value: point.netPay,
                          }))}
                        />
                      </View>
                    </PageSection>
                  </Reveal>
                )}
              </>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
