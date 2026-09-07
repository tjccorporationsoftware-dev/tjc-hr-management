import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Text } from '@/design/text';
import { useAppTheme } from '@/theme/use-app-theme';

import { Sparkline } from './sparkline';

export interface StatTileProps {
  label: string;
  value: string;
  /** หน่วยตัวเล็กต่อท้ายตัวเลข */
  unit?: string;
  /** ส่วนต่างเทียบงวดก่อน — ต้องบอกด้วยว่าเทียบกับอะไร */
  delta?: { comparedTo: string; percent: number };
  /**
   * ขึ้นแล้วดีไหม — ค่าเริ่มต้นคือดี
   * ตัวเลขอย่าง "วันมาสาย" ขึ้นแล้วแย่ ต้องตั้งเป็น false ไม่งั้นสีจะโกหก
   */
  higherIsBetter?: boolean;
  trend?: number[];
}

/**
 * การ์ดตัวเลขเดี่ยว — ป้าย + ค่า + ส่วนต่าง + เส้นแนวโน้ม
 *
 * ใช้แทนกราฟแท่งแท่งเดียว ซึ่งเป็นรูปแบบที่ผิดที่พบบ่อยที่สุด
 * ถ้าข้อมูลคือ "ตัวเลขเดียว ณ ตอนนี้" ตัวเลขนั้นคือกราฟแล้ว
 *
 * ส่วนต่างใช้ทั้งลูกศรและสี ไม่ได้ใช้สีลำพัง และบอกเสมอว่าเทียบกับงวดไหน
 * ("+12%" ลอย ๆ ไม่มีความหมาย)
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  higherIsBetter = true,
  trend,
}: StatTileProps) {
  const { theme } = useAppTheme();

  const rising = (delta?.percent ?? 0) > 0;
  const flat = !delta || Math.abs(delta.percent) < 0.5;
  const good = rising === higherIsBetter;

  const deltaColor = flat
    ? theme.colors.textSubtle
    : good
      ? theme.colors.successText
      : theme.colors.dangerText;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        flex: 1,
        gap: 6,
        minWidth: 148,
        padding: theme.spacing.sm,
      }}
    >
      <Text numberOfLines={1} tone="muted" variant="caption">
        {label}
      </Text>

      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 3 }}>
        <Text variant="h2">{value}</Text>
        {unit ? (
          <Text style={{ paddingBottom: 3 }} tone="subtle" variant="caption">
            {unit}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.xs,
        }}
      >
        {delta ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 2 }}>
            <Ionicons
              color={deltaColor}
              name={flat ? 'remove' : rising ? 'arrow-up' : 'arrow-down'}
              size={13}
            />
            <Text style={{ color: deltaColor }} variant="caption">
              {flat ? 'เท่าเดิม' : `${Math.abs(Math.round(delta.percent))}%`}
            </Text>
            <Text tone="subtle" variant="caption">
              {delta.comparedTo}
            </Text>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        {trend && trend.length >= 2 ? (
          <Sparkline height={24} values={trend} width={60} />
        ) : null}
      </View>
    </View>
  );
}
