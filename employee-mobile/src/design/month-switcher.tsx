import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { Text } from './text';
import { useAppTheme } from '@/theme/use-app-theme';

/**
 * แถบเลือกเดือนของจอที่ยังใช้สีจากธีม
 *
 * ทรงเดียวกับ `PeriodBar` ของผิวออโรรา — **แถบเดียวสามช่อง** ลูกศรซ้าย · ชื่อ
 * เดือน · ลูกศรขวา แยกด้วยเส้นคั่นในแถบ ต่างกันแค่ที่มาของสี: ตัวนี้หยิบจาก
 * theme เพราะจอที่ใช้ (ทีมของฉัน ปฏิทินทีม ตารางงาน) พื้นหลังเปลี่ยนตามโหมด
 * มืด/สว่าง ส่วนจอผิวออโรราเป็นฟ้าอ่อนตลอดทั้งสองโหมด
 *
 * การรวมสองตัวเป็นตัวเดียวแปลว่าต้องส่ง prop สีเข้าไปทุกครั้ง ซึ่งเปิดช่องให้
 * จอใดจอหนึ่งส่งสีผิดแล้วตัวหนังสือหายไปกับพื้น
 *
 * ปุ่มถัดไปถูกปิดเมื่อถึงเดือนปัจจุบัน — ข้อมูลของอนาคตยังไม่เกิด การให้กด
 * ไปข้างหน้าได้แปลว่าผู้ใช้จะเจอจอว่างแล้วคิดว่าระบบพัง แต่ปุ่มยังต้องอยู่ใน
 * แถบ ไม่ใช่หายไปจนแถบเบี้ยวข้างเดียว
 */

export interface MonthSwitcherProps {
  canGoNext: boolean;
  /** ข้อความที่แสดงตรงกลาง เช่น "สิงหาคม 2569" */
  label: string;
  onShiftMonth: (delta: number) => void;
}

const ARROW_SIZE = 46;

function Arrow({
  direction,
  disabled,
  label,
  onPress,
}: {
  direction: 'back' | 'forward';
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useAppTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: 'center',
        alignSelf: 'stretch',
        /* เส้นคั่นอยู่ด้านที่ติดกับชื่อเดือนเสมอ ขอบนอกเป็นของตัวแถบ */
        ...(direction === 'back'
          ? { borderRightColor: theme.colors.border, borderRightWidth: 1 }
          : { borderLeftColor: theme.colors.border, borderLeftWidth: 1 }),
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        width: ARROW_SIZE,
      }}
    >
      <Ionicons
        color={disabled ? theme.colors.textSubtle : theme.colors.primary}
        name={direction === 'back' ? 'chevron-back' : 'chevron-forward'}
        size={18}
      />
    </Pressable>
  );
}

export function MonthSwitcher({
  canGoNext,
  label,
  onShiftMonth,
}: MonthSwitcherProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        /* แคปซูลเต็มโค้งให้ตรงกับ `PeriodBar` ของผิวออโรรา — ตัวควบคุมชนิด
           เดียวกันต้องทรงเดียวกัน ไม่ว่าจอนั้นจะย้ายผิวแล้วหรือยัง */
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        minHeight: ARROW_SIZE,
        overflow: 'hidden',
      }}
    >
      <Arrow
        direction="back"
        label="เดือนก่อนหน้า"
        onPress={() => onShiftMonth(-1)}
      />
      {/* ไอคอนปฏิทินกับขนาดตัวอักษรล็อกให้ตรงกับ `PeriodBar` ของผิวออโรรา —
          แถบเดียวกันคนละจอต้องอ่านเหมือนกัน ไม่ใช่ต่างกันเพราะคนละ variant */}
      <View
        style={{
          alignItems: 'center',
          flex: 1,
          flexDirection: 'row',
          gap: 7,
          justifyContent: 'center',
          paddingHorizontal: 8,
        }}
      >
        <Ionicons
          color={theme.colors.textSubtle}
          name="calendar-outline"
          size={14}
        />
        {/* ตัวเลขความกว้างคงที่ ไม่งั้นสลับเดือนแล้วปุ่มสองข้างจะขยับ */}
        <Text
          maxScale={1.1}
          numberOfLines={1}
          style={{
            fontSize: 14,
            fontVariant: ['tabular-nums'],
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </View>
      <Arrow
        direction="forward"
        disabled={!canGoNext}
        label="เดือนถัดไป"
        onPress={() => onShiftMonth(1)}
      />
    </View>
  );
}
