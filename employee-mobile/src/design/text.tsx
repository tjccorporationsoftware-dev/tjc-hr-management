import {
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
} from 'react-native';

import {
  fontFamilyForWeight,
  type TypographyVariant,
} from '@/theme/typography';
import { useAppTheme } from '@/theme/use-app-theme';

export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'onPrimary';

export interface TextProps extends RNTextProps {
  tone?: TextTone;
  variant?: TypographyVariant;
  /**
   * จำกัดการขยายตัวอักษรตามระบบ
   * ผู้ใช้ตั้งฟอนต์ใหญ่สุดแล้วตัวเลขในการ์ดจะดันจนล้น เราจึงเพดานไว้
   * แต่ไม่ปิดทั้งหมด (accessibility) — ค่า 1.4 ยังอ่านง่ายและ layout ไม่แตก
   */
  maxScale?: number;
}

export function Text({
  tone = 'default',
  variant = 'body',
  maxScale = 1.4,
  style,
  ...props
}: TextProps) {
  const { theme } = useAppTheme();

  const color = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    subtle: theme.colors.textSubtle,
    primary: theme.colors.primary,
    success: theme.colors.successText,
    warning: theme.colors.warningText,
    danger: theme.colors.dangerText,
    onPrimary: theme.colors.onPrimary,
  }[tone];
  const flattenedStyle = StyleSheet.flatten(style);
  const requestedWeight = flattenedStyle?.fontWeight;
  /*
   * ผู้เรียกที่สั่ง `fontSize` เองแต่ไม่สั่ง `lineHeight` จะได้ `lineHeight` ของ
   * variant ติดมาด้วย ซึ่งคำนวณไว้สำหรับตัวอักษรคนละขนาด
   *
   * บั๊กที่เคยเกิดจริง: ยอดเงินบนจอผู้บริหารเขียน `fontSize: 30` ทับ variant
   * `body` ที่ `lineHeight` เป็น 22 — บนเครื่องจริงตัวเลขจึงถูกตัดหัวตัดท้าย
   * เหลือครึ่งเดียว ส่วนบนพรีวิวที่ฟอนต์ต่างกันเล็กน้อยกลับพอดีจนไม่มีใครเห็น
   *
   * เติมให้อัตโนมัติที่นี่ที่เดียว แทนการไล่ใส่ทุกจุดที่ override ขนาด ซึ่ง
   * ยังไงก็มีคนลืมอีก อัตราส่วนไล่ตามสเกลของ `typography` — ตัวใหญ่ใช้ช่องไฟ
   * แน่นกว่าตัวเล็ก
   */
  const sizeOverride = flattenedStyle?.fontSize;
  const autoLineHeight =
    typeof sizeOverride === 'number' &&
    flattenedStyle?.lineHeight === undefined
      ? {
          lineHeight: Math.round(
            sizeOverride *
              (sizeOverride >= 28
                ? 1.25
                : sizeOverride >= 20
                  ? 1.32
                  : sizeOverride >= 16
                    ? 1.4
                    : 1.45),
          ),
        }
      : null;
  const overrideFont = requestedWeight
    ? {
        fontFamily: fontFamilyForWeight(requestedWeight),
        fontWeight: 'normal' as const,
      }
    : null;

  return (
    <RNText
      maxFontSizeMultiplier={maxScale}
      {...props}
      style={[
        theme.typography[variant],
        { color },
        style,
        overrideFont,
        autoLineHeight,
      ]}
    />
  );
}
