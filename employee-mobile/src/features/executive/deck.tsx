import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Icon, Text, type IconName } from '@/design';
import { PressableScale } from '@/design/aurora';

/**
 * ผิว "ห้องควบคุม" ของผู้บริหาร — **จอมืด ไม่ใช่ผิวออโรรา**
 *
 * ## ทำไมถึงต้องเป็นคนละผิวกับของพนักงาน
 *
 * ผู้บริหารส่วนใหญ่เป็นพนักงานในระบบด้วย เดิมจึงเปิดแอปมาเจอจอเดียวกับลูกน้อง
 * ทุกประการ — ปุ่มลงเวลา ทางลัดยื่นลา คำขอของตัวเอง — แล้วตัวเลขระดับบริษัท
 * ซึ่งเป็นเหตุผลเดียวที่เขาเปิดแอปกลับไปอยู่หลังแท็บที่ต้องกดหา
 *
 * สองบทบาทนี้ใช้แอปคนละแบบสิ้นเชิง:
 *   - พนักงานเปิดวันละ 2–4 ครั้ง กลางแดด เพื่อ **ลงมือทำ** อย่างเดียว
 *     → พื้นสว่าง ปุ่มใหญ่ ข้อมูลน้อย
 *   - ผู้บริหารเปิดวันละครั้ง ในร่ม เพื่อ **อ่านตัวเลข** ไม่ได้มากด
 *     → พื้นมืด ตัวเลขเรืองแสง ความหนาแน่นสูง ไม่มีปุ่มพระเอก
 *
 * จอมืดจึงไม่ใช่การตกแต่ง แต่คือการบอกตั้งแต่วินาทีแรกว่า "นี่คนละโหมด"
 * และทำให้ตัวเลขสว่างบนพื้นมืดเป็นของที่เด่นที่สุดในจอโดยไม่ต้องแข่งกับปุ่ม
 *
 * สีเตือน (amber/rose) ยังใช้กติกาเดียวกับผิวออโรรา — ใช้เฉพาะตอนที่มีอะไร
 * ต้องตามต่อ ไม่ใช่กับตัวเลขที่แค่ "มีค่ามาก"
 */
export const DECK = {
  /** พื้นล่างสุด — น้ำเงินอมดำ ไม่ใช่ดำสนิท ดำสนิททำให้แผงลอยไม่ขึ้น */
  base: '#070b16',
  /** พื้นของแถบล่างและหัวจอที่ต้องแยกจากพื้นหลัง */
  raised: '#0b1120',

  /** ผิวแผง — ขาวโปร่งบาง ๆ ทับพื้น ไม่ใช่สีทึบ จะได้ซ้อนชั้นกันได้ */
  panel: 'rgba(255, 255, 255, 0.045)',
  panelStrong: 'rgba(255, 255, 255, 0.075)',
  border: 'rgba(148, 163, 184, 0.14)',

  text: '#e8edf7',
  textMuted: '#8b97ad',
  textFaint: '#6b7a94',

  /** สีนำของจอ — ใช้กับตัวเลขที่เป็นคำตอบของแผงนั้น */
  accent: '#22d3ee',
  accentSoft: 'rgba(34, 211, 238, 0.14)',
  /** เส้นเทียบ/ค่ารอง ที่ต้องแยกจาก accent โดยไม่กลายเป็นคำเตือน */
  violet: '#8b7cf6',

  amber: '#f59e0b',
  rose: '#fb7185',
} as const;

/** ตัวเลขทุกตัวกว้างเท่ากัน ไม่งั้นค่าที่รีเฟรชเองจะทำให้ทั้งแถวขยับ */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

/** ป้ายกำกับเล็ก ตัวห่าง — ใช้แทนหัวข้อย่อยทุกที่บนจอมืด */
export function DeckLabel({
  color = DECK.textFaint,
  label,
  style,
}: {
  color?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <Text
        maxScale={1.1}
        numberOfLines={1}
        style={{
          color,
          fontSize: 9.5,
          fontWeight: '700',
          letterSpacing: 1.5,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/** แผงหนึ่งใบ — การ์ดแบบเดียวของจอมืด ห้ามเขียนกรอบเอง */
export function DeckPanel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const flat = StyleSheet.flatten(style) ?? {};

  return (
    <View
      style={[
        {
          backgroundColor: DECK.panel,
          borderColor: DECK.border,
          borderRadius: 18,
          borderWidth: 1,
          padding: 15,
        },
        flat,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * ตัวเลขหนึ่งตัวพร้อมป้าย — ใช้ในตาราง 2×2 ด้านบนของจอ
 *
 * `note` เป็นบรรทัดที่สามที่บอกว่าตัวเลขนี้ประกอบด้วยอะไร ไม่ใช่คำอธิบายซ้ำ
 * ("218 คน" ไม่ต้องเขียนใต้ว่า "จำนวนพนักงาน" อีกรอบ)
 */
export function DeckStat({
  label,
  note,
  noteColor = DECK.textMuted,
  unit,
  value,
  valueColor = DECK.text,
}: {
  label: string;
  note?: string | null;
  noteColor?: string;
  unit?: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <DeckPanel style={{ flex: 1, gap: 6, padding: 14 }}>
      <DeckLabel label={label} />

      <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: 5 }}>
        <Text
          maxScale={1.1}
          style={[
            TABULAR,
            {
              color: valueColor,
              fontSize: 26,
              fontWeight: '800',
              letterSpacing: -0.6,
              lineHeight: 33,
            },
          ]}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            maxScale={1.1}
            style={{ color: DECK.textFaint, fontSize: 11 }}
          >
            {unit}
          </Text>
        ) : null}
      </View>

      {note ? (
        <Text
          maxScale={1.2}
          numberOfLines={1}
          style={{ color: noteColor, fontSize: 10.5 }}
        >
          {note}
        </Text>
      ) : null}
    </DeckPanel>
  );
}

export interface DeckSegment {
  color: string;
  label: string;
  value: number;
}

/**
 * แถบสัดส่วนพร้อมคำอธิบายใต้แถบ
 *
 * ช่วงที่ค่าเป็นศูนย์ต้องหายไปจากแถบ **แต่ยังอยู่ในคำอธิบาย** — ผู้บริหาร
 * ต้องอ่านออกว่า "ไม่ได้ลงเวลา 0" ไม่ใช่เดาว่าระบบไม่ได้นับช่องนั้น
 */
export function DeckBar({ segments }: { segments: DeckSegment[] }) {
  const total = segments.reduce((sum, item) => sum + Math.max(item.value, 0), 0);

  /*
   * ดึงสัดส่วนออกมาไว้นอก JSX ก่อน — **ห้ามอ่าน `item.value` ใน inline style**
   *
   * ปลั๊กอินของ Reanimated มองหา `.value` ในอ็อบเจกต์ style แบบดูจากรูปประโยค
   * ล้วน ๆ (ไม่ได้ดูว่าเป็น shared value จริงไหม) แล้วแทรกคำเตือนลงไปให้ทุกครั้ง
   * ที่ render ทั้งที่เป็นตัวเลขธรรมดา — กับดักเดียวกับที่เขียนไว้ใน
   * `design/chart/stacked-bar.tsx` ชื่อ `value` ยังคงไว้เพราะตรงความหมายที่สุด
   * สำหรับกราฟ แค่ต้องไม่แตะมันตรง ๆ ตอนประกอบ style
   */
  const bars = segments
    .filter((item) => item.value > 0)
    .map((item) => ({ color: item.color, grow: item.value, label: item.label }));

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          backgroundColor: 'rgba(148, 163, 184, 0.12)',
          borderRadius: 999,
          flexDirection: 'row',
          gap: 2,
          height: 9,
          overflow: 'hidden',
        }}
      >
        {total > 0
          ? bars.map((bar) => (
              <View
                key={bar.label}
                style={{ backgroundColor: bar.color, flexGrow: bar.grow }}
              />
            ))
          : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {segments.map((item) => (
          <View
            key={item.label}
            style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}
          >
            <View
              style={{
                backgroundColor: item.color,
                borderRadius: 2,
                height: 7,
                width: 7,
              }}
            />
            <Text
              maxScale={1.1}
              style={[
                TABULAR,
                { color: DECK.textMuted, fontSize: 10.5 },
              ]}
            >
              {item.label} {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface DeckColumn {
  emphasis?: boolean;
  label: string;
  value: number;
}

/**
 * กราฟแท่งเตี้ย ๆ สำหรับแนวโน้มรายงวด
 *
 * ไม่ใช้ ColumnChart ของ `@/design` เพราะตัวนั้นหยิบสีจาก theme ซึ่งเป็นชุด
 * สว่าง — บนพื้นมืดแท่งจะจมหายไปกับพื้น
 */
export function DeckColumns({ points }: { points: DeckColumn[] }) {
  const peak = points.reduce((max, point) => Math.max(max, point.value), 0);

  return (
    <View style={{ flexDirection: 'row', gap: 6, height: 78 }}>
      {points.map((point) => {
        /* แท่งค่าศูนย์ยังต้องเห็นเป็นขีดบาง ๆ ไม่ใช่หายไปทั้งแท่ง */
        const ratio = peak > 0 ? point.value / peak : 0;

        return (
          <View
            key={point.label}
            style={{ flex: 1, gap: 6, justifyContent: 'flex-end' }}
          >
            <View
              style={{
                backgroundColor: point.emphasis
                  ? DECK.accent
                  : 'rgba(148, 163, 184, 0.28)',
                borderRadius: 4,
                height: Math.max(ratio * 58, 3),
              }}
            />
            <Text
              maxScale={1}
              numberOfLines={1}
              style={{
                color: point.emphasis ? DECK.text : DECK.textFaint,
                fontSize: 9.5,
                textAlign: 'center',
              }}
            >
              {point.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** แถวลิงก์ไปจอเจาะลึก — ไอคอนซ้าย ชื่อกลาง ลูกศรขวา */
export function DeckRow({
  divider = true,
  icon,
  onPress,
  subtitle,
  title,
}: {
  divider?: boolean;
  icon: IconName;
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: 'center',
        borderTopColor: DECK.border,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        paddingVertical: 13,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: DECK.accentSoft,
          borderRadius: 12,
          height: 36,
          justifyContent: 'center',
          width: 36,
        }}
      >
        <Icon color={DECK.accent} name={icon} size={17} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          maxScale={1.2}
          numberOfLines={1}
          style={{ color: DECK.text, fontSize: 13.5, fontWeight: '600' }}
        >
          {title}
        </Text>
        <Text
          maxScale={1.2}
          numberOfLines={1}
          style={{ color: DECK.textMuted, fontSize: 10.5 }}
        >
          {subtitle}
        </Text>
      </View>

      <Icon color={DECK.textFaint} name="chevron-right" size={17} />
    </PressableScale>
  );
}
