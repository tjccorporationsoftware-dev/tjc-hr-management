import { Platform } from 'react-native';

import type { AppTheme } from '@/theme/theme.types';

/**
 * Token เสริมที่ไม่ได้อยู่ใน theme หลัก
 *
 * theme มี colors/spacing/radius/typography อยู่แล้ว ไฟล์นี้เก็บของที่
 * ขึ้นกับแพลตฟอร์มหรือใช้ร่วมกันหลายคอมโพเนนต์ จะได้ไม่กระจายเป็นเลขลอย
 */

/**
 * พื้นที่แตะขั้นต่ำ 44pt ตามเกณฑ์ Apple HIG / Material
 * ปุ่มไอคอนเล็ก ๆ ต้องขยายพื้นที่แตะด้วย hitSlop ไม่ใช่ขยายตัวปุ่ม
 */
export const MIN_TOUCH_SIZE = 44;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** ระดับเงา — iOS ใช้ shadow* / Android ใช้ elevation ต้องกำหนดคู่กันเสมอ */
export function elevation(theme: AppTheme, level: 0 | 1 | 2 | 3) {
  if (level === 0) return {};

  const config = {
    1: { radius: 8, offsetY: 2, opacity: 0.05, elevation: 2 },
    2: { radius: 16, offsetY: 6, opacity: 0.07, elevation: 6 },
    3: { radius: 28, offsetY: 12, opacity: 0.1, elevation: 12 },
  }[level];

  return Platform.select({
    android: { elevation: config.elevation },
    default: {
      shadowColor: theme.colors.shadow,
      shadowOffset: { width: 0, height: config.offsetY },
      shadowOpacity: theme.dark ? config.opacity * 2.4 : config.opacity,
      shadowRadius: config.radius,
    },
  });
}

/** ระยะเวลาอนิเมชัน — สั้นพอที่จะไม่รู้สึกหน่วง */
export const duration = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/**
 * โทนของสถานะ ใช้ร่วมกันทั้ง Badge / ErrorState / Toast
 * แยกเป็นฟังก์ชันเพราะต้องอ่านค่าจาก theme ตอน runtime (มืด/สว่างคนละค่า)
 */
export type ToneName =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger';

export function tone(theme: AppTheme, name: ToneName) {
  const map: Record<ToneName, { bg: string; fg: string; border: string }> = {
    neutral: {
      bg: theme.colors.surfaceAlt,
      fg: theme.colors.textMuted,
      border: theme.colors.border,
    },
    primary: {
      bg: theme.colors.primarySoft,
      fg: theme.colors.primary,
      border: theme.colors.primarySoftBorder,
    },
    success: {
      bg: theme.colors.successSoft,
      fg: theme.colors.successText,
      border: theme.colors.successSoft,
    },
    warning: {
      bg: theme.colors.warningSoft,
      fg: theme.colors.warningText,
      border: theme.colors.warningSoft,
    },
    danger: {
      bg: theme.colors.dangerSoft,
      fg: theme.colors.dangerText,
      border: theme.colors.dangerSoft,
    },
  };

  return map[name];
}
