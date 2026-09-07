import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAware, KeyboardAwareScroll } from './keyboard-aware';
import { Text } from './text';
import { hitSlop } from './tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * คลุมพื้นหลังด้วยสีเข้มโปร่ง — **เปิดไว้เป็นค่าเริ่มต้น**
   *
   * ของที่เด้งขึ้นมาต้องดูลอยอยู่เหนือจอ ไม่ใช่ต่อกันเป็นเนื้อเดียวกับพื้น
   * ข้างหลัง แผ่นขาวบนจอขาวที่ไม่มีพื้นมืดคั่นทำให้แยกไม่ออกว่าตรงไหนคือ
   * แผ่นตรงไหนคือจอ และแตะพลาดโดนของข้างหลังบ่อย
   *
   * ปิดเฉพาะแผ่นที่ผู้ใช้ต้องเห็นของข้างหลังไปพร้อมกันจริง ๆ
   */
  dimBackground?: boolean;
  /** ปุ่มยืนยันด้านล่าง ติดขอบจอเสมอ ไม่เลื่อนหนีไปกับเนื้อหา */
  footer?: ReactNode;
}

/**
 * แผ่นเลื่อนขึ้นจากด้านล่าง ใช้แทน Modal เต็มจอสำหรับงานสั้น ๆ
 * (เลือกตัวเลือก ยืนยันรายการ ดูรายละเอียดย่อ)
 *
 * ใช้ Modal ของ RN ตรง ๆ ไม่พึ่งไลบรารีนอก เพราะงานที่ต้องการคือ
 * "ขึ้นมาแล้วปิดได้" ไม่ต้องลากปรับความสูง — ลดขนาด bundle ไปหนึ่งก้อน
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  dimBackground = true,
  footer,
}: SheetProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      {/*
        กันแป้นพิมพ์ทับช่องกรอกในแผ่น — Android ไม่ย่อเนื้อใน Modal ให้เอง
        เหมือนจอปกติ ฟอร์มในแผ่น (เหตุผลไม่อนุมัติ ค้นหา ฯลฯ) จึงโดนบัง
      */}
      <KeyboardAware mode="sheet">
      <Pressable
        accessibilityLabel="ปิด"
        accessibilityRole="button"
        onPress={onClose}
        style={{
          backgroundColor: dimBackground ? theme.colors.overlay : 'transparent',
          flex: 1,
        }}
      />

      <View
        style={{
          backgroundColor: theme.colors.surface,
          /* ขอบเส้นเดียวแทนพื้นมืด — บนจอสว่างแผ่นขาวจะได้ไม่กลืนไปกับเนื้อหา */
          borderColor: theme.colors.border,
          borderTopLeftRadius: theme.radius.xl,
          borderTopRightRadius: theme.radius.xl,
          borderWidth: 1,
          /* ยกแผ่นให้ลอยเหนือพื้นมืด ไม่ใช่แปะติดขอบจอเฉย ๆ */
          elevation: 24,
          shadowColor: '#0f172a',
          shadowOffset: { height: -6, width: 0 },
          shadowOpacity: 0.22,
          shadowRadius: 24,
          maxHeight: height * 0.88,
          paddingBottom: insets.bottom + theme.spacing.sm,
        }}
      >
        {/* ขีดจับด้านบน บอกใบ้ว่าปิดได้ */}
        <View style={{ alignItems: 'center', paddingTop: theme.spacing.sm }}>
          <View
            style={{
              backgroundColor: theme.colors.borderStrong,
              borderRadius: 999,
              height: 4,
              width: 40,
            }}
          />
        </View>

        {title ? (
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.sm,
              justifyContent: 'space-between',
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <Text style={{ flex: 1 }} variant="h3">
              {title}
            </Text>
            <Pressable
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              hitSlop={hitSlop}
              onPress={onClose}
            >
              <Ionicons
                color={theme.colors.textSubtle}
                name="close"
                size={22}
              />
            </Pressable>
          </View>
        ) : null}

        <KeyboardAwareScroll
          contentContainerStyle={{
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            paddingTop: title ? 0 : theme.spacing.md,
          }}
        >
          {children}
        </KeyboardAwareScroll>

        {footer ? (
          <View
            style={{
              borderTopColor: theme.colors.border,
              borderTopWidth: 1,
              gap: theme.spacing.xs,
              padding: theme.spacing.md,
            }}
          >
            {footer}
          </View>
        ) : null}
      </View>
      </KeyboardAware>
    </Modal>
  );
}
