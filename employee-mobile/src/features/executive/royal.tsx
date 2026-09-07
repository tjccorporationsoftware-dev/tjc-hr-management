import { View, type TextStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/design';
import { AURORA, PressableScale } from '@/design/aurora';

/**
 * ผิวของจอผู้บริหาร — "หน้าเดียวต่อเนื่อง โทนสีฟ้าขาว"
 *
 * แยกออกมาจาก `executive-home.tsx` ตอนที่จอที่สอง(ลา/โอทีรายวัน) เกิดขึ้น
 * เพราะสีกับโครงหมวดต้องเป็นชุดเดียวกันทั้งสองจอ ถ้าปล่อยให้ต่างคนต่างถือ
 * สำเนาของตัวเอง วันที่แก้สีทีหนึ่งจะเหลือจออีกจอเป็นโทนเก่าค้างไว้เสมอ
 *
 * ตอนนี้จอผู้บริหารทุกจอย้ายไปใช้ผิวขาวชุดเดียวกับจอพนักงานแล้ว (`PageHero` +
 * หัวข้อขีดน้ำเงิน + `AURORA`) ไฟล์นี้จึงเหลือเฉพาะของที่ยังใช้ร่วมกันจริง ๆ —
 * โทเคนสี ตัวเลขแบบ tabular แท็บขีดใต้ ปุ่มพื้นทึบ และวงแหวนสัดส่วน
 * ส่วนหัวจอ (`HeaderBand`) กับโครงหมวด (`Section` / `SectionLabel`) ถูกถอดออก
 * พร้อมกับการย้ายจอสุดท้าย
 */
/*
 * สีของจอผู้บริหาร = สีของทั้งแอป
 *
 * เดิมชุดนี้เป็นฟ้าคนละเฉด (#0369a1) เพราะจอผู้บริหารเกิดทีหลังและถือจานสี
 * ของตัวเอง ผลคือสลับจากแท็บพนักงานมาแล้วรู้สึกเป็นคนละแอป ตอนนี้ทุกค่าชี้
 * กลับไปที่ `AURORA` — เหลือชื่อ `ROYAL` ไว้เพื่อไม่ต้องแก้ทุกบรรทัดในห้าจอ
 * ที่อ้างถึงมัน แต่ค่าจริงมาจากที่เดียวกับทั้งแอปแล้ว
 */
export const ROYAL = {
  base: AURORA.baseDeep,

  text: AURORA.text,
  textMuted: AURORA.textMuted,
  hairline: AURORA.glassBorder,
  track: 'rgba(29, 78, 216, 0.08)',

  accent: AURORA.accent,
  accentSoft: AURORA.accentSoft,
  /** แถบหัวจอใช้คู่สีเดียวกับหัวจอของพนักงาน (`PageHero`) */
  headerFrom: AURORA.accent,
  headerTo: AURORA.accentEnd,
  onAccent: AURORA.baseDeep,
  sky: AURORA.sky,

  warn: AURORA.amber,
  rose: AURORA.rose,
} as const;

/** ตัวเลขทุกตัวกว้างเท่ากัน ไม่งั้นค่าที่รีเฟรชเองจะทำให้ทั้งแถวขยับ */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

/** ตัวเลขใหญ่ที่ต้องอ่านผ่านตา — เกินหลักล้านให้ย่อ ไม่งั้นล้นบรรทัด */
export function compact(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)} ล.`;
  }

  return Math.round(value).toLocaleString('th-TH');
}

/* ------------------------------------------------------------- โครงหมวด */

/**
 * แท็บสลับเรื่องที่กำลังดู — บอกตัวที่เลือกด้วย **ขีดใต้ + สี** ไม่ใช่พื้นทึบ
 *
 * ต่างจากปุ่มพื้นทึบ (`Segmented`) ตรงบทบาท: ปุ่มพื้นทึบเลือก "ช่วงเวลา" ซึ่ง
 * เป็นตัวควบคุมของทั้งจอ ส่วนตัวนี้สลับ "เนื้อหาที่กำลังอ่าน" อยู่ติดหัวรายการ
 * เส้นใต้จึงสื่อความเป็นแท็บได้ตรงกว่าและกินสายตาน้อยกว่า
 *
 * อยู่ที่นี่เพราะจอผู้บริหารทุกจอที่มีการสลับเรื่อง (ลา/โอที, สถานะคำขอ)
 * ต้องเป็นตัวเดียวกัน ถ้าจอไหนเขียนสำเนาของตัวเอง ความหนาของขีดกับสีตัวที่
 * ไม่ได้เลือกจะค่อย ๆ เพี้ยนกันไปคนละทาง
 */
export function UnderlineTabs<T extends string>({
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
        borderBottomColor: ROYAL.hairline,
        borderBottomWidth: 1,
        flexDirection: 'row',
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
              flex: 1,
              paddingBottom: 10,
              paddingTop: 2,
            }}
          >
            <Text
              maxScale={1.1}
              numberOfLines={1}
              style={{
                color: active ? ROYAL.accent : ROYAL.textMuted,
                fontSize: 13,
                fontWeight: active ? '800' : '600',
              }}
            >
              {option.label}
            </Text>

            {/* ทับเส้นฐานพอดี (bottom: -1) ไม่งั้นจะเห็นเป็นสองเส้นซ้อนกัน */}
            <View
              style={{
                backgroundColor: active ? ROYAL.accent : 'transparent',
                borderRadius: 999,
                bottom: -1,
                height: 2.5,
                left: 0,
                position: 'absolute',
                right: 0,
              }}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------- กราฟวงแหวน */

/**
 * สีของชิ้นในกราฟ — **ไล่เฉดฟ้าล้วน จากเข้มไปอ่อน ไม่ผสมสีตระกูลอื่น**
 *
 * ชุดเดิมมีเขียว (#047857) แทรกอยู่กลางฟ้าสี่เฉด ซึ่งบนวงแหวนอ่านเป็นสีหลุด
 * โทนหนึ่งชิ้น ไม่ใช่ลำดับของข้อมูล — สีในกราฟนี้ไม่ได้แทน "ประเภทที่ต่างกัน"
 * แต่แทน "อันดับมากไปน้อย" การไล่เฉดจึงตรงความหมายกว่าสีที่ตัดกัน
 *
 * ความต่างของความสว่างระหว่างชิ้นติดกันมากพอให้แยกออกตอนวางชิดกันบนวงแหวน
 * และทุกค่ายังอยู่ในตระกูลฟ้าของแอป
 */
export const SERIES = ['#1d4ed8', '#0284c7', '#38bdf8', '#93c5fd', '#c7d9f7'];

/** ชิ้น "อื่น ๆ" — เทากลาง ไม่ใช่ฟ้าจาง จะได้ไม่ถูกอ่านเป็นอันดับถัดไปของเฉด */
export const SERIES_REST = '#94a3b8';

/** จำนวนชิ้นสูงสุดก่อนยุบเป็น "อื่น ๆ" — มากกว่านี้วงกลมจะอ่านไม่ออก */
export const MAX_SLICES = 5;

export interface Slice {
  color: string;
  label: string;
  text: string;
  value: number;
}

/**
 * กราฟวงแหวน — เห็นสัดส่วนของแต่ละหน่วยงานจากการมองครั้งเดียว
 *
 * ใช้วงแหวนแทนแท่ง เพราะชื่อบริษัท/สาขาของลูกค้ารายนี้ยาวมาก กราฟแท่งแนวตั้ง
 * จะไม่มีที่เขียนชื่อใต้แท่ง ส่วนวงแหวนย้ายชื่อไปไว้ในคำอธิบายข้าง ๆ ได้
 *
 * วาดด้วย `strokeDasharray` บนวงกลมวงเดียว (เทคนิคเดียวกับวงแหวนอัตรามาทำงาน
 * ในหน้าภาพรวม) จึงไม่ต้องคำนวณ path ของแต่ละชิ้นเอง
 */
export function DonutChart({
  center,
  centerLabel,
  size = 96,
  slices,
}: {
  center: string;
  centerLabel: string;
  size?: number;
  slices: Slice[];
}) {
  /*
   * ความหนาของวงแปรตามขนาด ไม่ใช่ 15 ตายตัว — วงเล็ก (78) ที่ถูกกินความหนา
   * ไปสิบห้าทั้งสองด้าน เหลือรูกลางแค่สี่สิบแปด ตัวเลขข้างในเลยเบียดขอบวง
   */
  const stroke = Math.max(Math.round(size * 0.16), 9);
  const radius = (size - stroke) / 2;
  /** ตัวเลขกลางวงย่อตามขนาดวงด้วย ไม่งั้นวงเล็กจะมีเลขล้นรู */
  const centerSize = size < 88 ? 14 : 16;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  /* คำนวณจุดเริ่มของแต่ละชิ้นแบบไม่แก้ตัวแปรนอก map (ลินต์ห้าม mutate ตอนเรนเดอร์)
     ชิ้นมีไม่เกินหกอันอยู่แล้ว การไล่บวกซ้ำจึงไม่กระทบอะไร */
  const lengthOf = (value: number) =>
    total > 0 ? (value / total) * circumference : 0;
  const arcs = slices.map((slice, index) => ({
    ...slice,
    length: lengthOf(slice.value),
    offset: slices
      .slice(0, index)
      .reduce((sum, previous) => sum + lengthOf(previous.value), 0),
  }));

  return (
    <View style={{ height: size, width: size }}>
      <Svg height={size} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={ROYAL.track}
          strokeWidth={stroke}
        />
        {arcs.map((arc) =>
          arc.length > 0 ? (
            <Circle
              cx={size / 2}
              cy={size / 2}
              fill="none"
              key={arc.label}
              r={radius}
              stroke={arc.color}
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={-arc.offset}
              strokeWidth={stroke}
              transform={`rotate(-90, ${size / 2}, ${size / 2})`}
            />
          ) : null,
        )}
      </Svg>

      {/*
        ตัวเลขจัดกลางด้วยกรอบของตัวเอง ส่วนหน่วยลอยอยู่ใต้มันแบบ absolute
        — เดิมสองบรรทัดอยู่ในกล่องเดียวกันแล้วจัดกลางทั้งกล่อง ตัวเลขซึ่งเป็น
        ของหลักจึงถูกดันขึ้นไปเหนือจุดกึ่งกลางวงเท่ากับครึ่งความสูงของหน่วย
        ยิ่งวงเล็กยิ่งเห็นชัดว่า "เลขไม่อยู่กลาง"
      */}
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
          maxScale={1}
          numberOfLines={1}
          style={[
            TABULAR,
            {
              color: ROYAL.text,
              fontSize: centerSize,
              fontWeight: '800',
              /* ช่องไฟต้องเผื่อสระบนกับวรรณยุกต์ ไม่ใช่แค่ +1 ซึ่งพอดีเป๊ะกับ
                 ตัวเลขละตินแล้วไปตัดหัวเลขบนเครื่องจริง */
              lineHeight: Math.round(centerSize * 1.3),
              textAlign: 'center',
            },
          ]}
        >
          {center}
        </Text>
      </View>

      <View
        style={{
          alignItems: 'center',
          left: 0,
          position: 'absolute',
          right: 0,
          top: size / 2 + centerSize * 0.5,
        }}
      >
        <Text
          maxScale={1}
          numberOfLines={1}
          style={{ color: ROYAL.textMuted, fontSize: 9.5, lineHeight: 12 }}
        >
          {centerLabel}
        </Text>
      </View>
    </View>
  );
}

/** กราฟหนึ่งชุด — วงแหวนซ้าย คำอธิบายขวา (ชื่อยาวอยู่ตรงนี้ได้เต็มบรรทัด) */
export function UnitChart({
  center,
  centerLabel,
  slices,
}: {
  center: string;
  centerLabel: string;
  slices: Slice[];
}) {
  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 16 }}>
      <DonutChart center={center} centerLabel={centerLabel} slices={slices} />

      <View style={{ flex: 1, gap: 7 }}>
        {slices.map((slice) => (
          <View
            key={slice.label}
            style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}
          >
            <View
              style={{
                backgroundColor: slice.color,
                borderRadius: 3,
                height: 8,
                width: 8,
              }}
            />
            <Text
              numberOfLines={1}
              style={{ color: ROYAL.text, flex: 1, fontSize: 11.5 }}
            >
              {slice.label}
            </Text>
            <Text
              maxScale={1.1}
              style={[TABULAR, { color: ROYAL.textMuted, fontSize: 11.5, fontWeight: '700' }]}
            >
              {slice.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
