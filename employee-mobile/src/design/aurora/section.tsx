import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/design/text';

import { PressableScale } from './motion';
import { AURORA } from './palette';

/** ป้ายกำกับหมวด — เล็ก หนา เว้นวรรคกว้าง วางนอกการ์ด */
export function SectionLabel({
  action,
  label,
}: {
  action?: ReactNode;
  label: string;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
        paddingBottom: 10,
        paddingHorizontal: 4,
      }}
    >
      <Text
        maxScale={1.2}
        style={{
          /* ป้ายหมวดวางบนพื้นฟ้า ไม่ใช่บนการ์ด จึงต้องเข้มกว่าตัวอักษรในการ์ด */
          color: AURORA.textMuted,
          flex: 1,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.4,
        }}
      >
        {label}
      </Text>
      {action}
    </View>
  );
}

/** ลิงก์ท้ายหัวข้อหรือท้ายการ์ด — ข้อความฟ้ากับลูกศร ไม่ใช่ปุ่มเต็มใบ */
export function SectionAction({
  color = AURORA.accent,
  label,
  onPress,
}: {
  /**
   * สีของลิงก์ — ค่าเริ่มต้นคือฟ้าเข้มสำหรับจอพื้นสว่าง
   * จอที่พื้นเป็นฟ้าเข้มต้องส่งสีอ่อนมาเอง ไม่งั้นลิงก์จะจมหายไปกับพื้น
   */
  color?: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: 1,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color }} variant="caption">
        {label}
      </Text>
      <Ionicons color={color} name="chevron-forward" size={13} />
    </PressableScale>
  );
}

/**
 * หัวข้อหมวดของจอผิวขาว — ขีดน้ำเงินสั้นนำหน้า ไม่มีการ์ดครอบ
 *
 * ใช้กับจอที่ย้ายมาเป็นผิวขาวผืนเดียวแล้ว (รายละเอียดคำขอ, ยื่น/แก้ไขคำขอ)
 * ซึ่งลำดับของเนื้อหามาจากขนาดตัวหนังสือกับระยะห่าง ไม่ใช่จากกล่องกระจก
 * ซ้อนกันหลายใบ — ขีดน้ำเงินทำหน้าที่แทนขอบการ์ดในการบอกว่า "หมวดใหม่เริ่มตรงนี้"
 *
 * ต่างจาก `SectionLabel` ตรงที่อันนั้นเป็นป้ายตัวเล็กเว้นวรรคกว้างสำหรับจอ
 * พื้นฟ้าที่มีการ์ดอยู่ข้างใต้
 */
export function PageSection({
  accent = AURORA.accent,
  children,
  title,
  trailing,
}: {
  /** สีของขีดนำหน้าหัวข้อ — ใช้เมื่อหมวดนั้นมีสีประจำตัว เช่น รายการหัก */
  accent?: string;
  children: ReactNode;
  title: string;
  /** ของท้ายหัวข้อ เช่น จำนวนไฟล์แนบ หรือหมายเหตุ "* จำเป็น" */
  trailing?: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 9 }}>
        <View
          style={{
            backgroundColor: accent,
            borderRadius: 999,
            height: 15,
            width: 3,
          }}
        />
        <Text style={{ color: AURORA.text, flex: 1 }} variant="h3">
          {title}
        </Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}
