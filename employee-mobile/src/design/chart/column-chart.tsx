import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/design/text';
import { useAppTheme } from '@/theme/use-app-theme';

import { gridColor, sequentialColor } from './palette';

export interface ColumnPoint {
  label: string;
  value: number;
  /** ข้อความรองที่โชว์ตอนแตะ เช่น "พนักงาน 14 คน" */
  detail?: string;
}

export interface ColumnChartProps {
  points: ColumnPoint[];
  /** แปลงตัวเลขเป็นข้อความ เช่นใส่คอมมาหรือหน่วย */
  format: (value: number) => string;
  height?: number;
}

/** แท่งหนาสุด 24px — ที่เหลือในช่องปล่อยเป็นอากาศ ห้ามเติมเต็มช่อง */
const MAX_BAR_WIDTH = 24;
const AXIS_BAND = 22;

/**
 * กราฟแท่งแนวตั้งสำหรับข้อมูลตามเวลา
 *
 * ## การตัดสินใจสำคัญ
 *
 * **ใช้ไล่เฉดสีเดียว (มากคือเข้ม) ไม่ใช่สีต่างกันรายแท่ง** — เดือนไม่ใช่ "ตัวตน"
 * ที่ต้องแยกจากกัน แต่เป็นขนาดที่ต้องเทียบกัน การให้แต่ละเดือนสีต่างกันคือการ
 * เผาช่องทางสีไปกับข้อมูลที่ความสูงของแท่งบอกอยู่แล้ว
 *
 * **แตะแท่งเพื่อดูค่า แต่ค่าไม่ได้อยู่แต่ในนั้น** — ค่าของแท่งที่กำลังดูแสดง
 * เป็นตัวหนังสืออยู่เหนือกราฟเสมอ และค่าเริ่มต้นคือแท่งที่สูงสุด
 * (ห้ามให้การแตะเป็นทางเดียวที่จะอ่านค่าได้)
 *
 * ไม่ใช้ SVG เพราะแท่งเป็นสี่เหลี่ยมล้วน — View ให้ปลายบนมนฐานเหลี่ยมได้ตรงสเปก
 * และไม่ต้องวัดความกว้างเองเหมือนตอนวางพิกัดใน SVG
 */
export function ColumnChart({ points, format, height = 148 }: ColumnChartProps) {
  const { theme } = useAppTheme();
  const [active, setActive] = useState<number | null>(null);

  const values = points.map((point) => point.value);
  const max = Math.max(...values, 0);

  if (points.length === 0 || max <= 0) {
    return null;
  }

  const plotHeight = height - AXIS_BAND;
  const peakIndex = values.indexOf(max);
  const shown = active ?? peakIndex;
  const shownPoint = points[shown];

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {/* ค่าที่กำลังดู — อยู่นอกกราฟเสมอ จะได้ไม่ถูกแท่งบังหรือถูกตัด */}
      {shownPoint ? (
        <View style={{ gap: 1 }}>
          <Text variant="h3">{format(shownPoint.value)}</Text>
          <Text tone="muted" variant="caption">
            {shownPoint.label}
            {shownPoint.detail ? ` · ${shownPoint.detail}` : ''}
            {active === null ? ' · สูงสุด' : ''}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', height }}>
        {points.map((point, index) => {
          const barHeight = Math.max((point.value / max) * (plotHeight - 4), 2);
          const isActive = index === shown;

          return (
            <Pressable
              accessibilityHint="แตะเพื่อดูค่าของเดือนนี้"
              accessibilityLabel={`${point.label} ${format(point.value)}`}
              accessibilityRole="button"
              key={point.label}
              onPress={() => setActive(index === active ? null : index)}
              style={{ flex: 1 }}
            >
              <View
                style={{
                  alignItems: 'center',
                  borderBottomColor: gridColor(theme),
                  /* เส้นฐาน — เส้นทึบบางหนึ่งขั้นจากพื้น ห้ามเส้นประ */
                  borderBottomWidth: 1,
                  height: plotHeight,
                  justifyContent: 'flex-end',
                }}
              >
                <View
                  style={{
                    backgroundColor: sequentialColor(theme, point.value, max),
                    /* ปลายบนมน 4px ฐานเหลี่ยม — โตจากเส้นฐานเดียวเสมอ */
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    height: barHeight,
                    width: MAX_BAR_WIDTH,
                  }}
                />
              </View>

              <View
                style={{
                  alignItems: 'center',
                  gap: 3,
                  height: AXIS_BAND,
                  paddingTop: 4,
                }}
              >
                <Text
                  numberOfLines={1}
                  tone={isActive ? 'default' : 'subtle'}
                  variant="caption"
                >
                  {point.label}
                </Text>
                {/* แท่งที่กำลังดูมีขีดบอก ไม่ได้ใช้สีบอกอย่างเดียว */}
                <View
                  style={{
                    backgroundColor: isActive
                      ? theme.colors.text
                      : 'transparent',
                    borderRadius: 1,
                    height: 2,
                    width: MAX_BAR_WIDTH,
                  }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
