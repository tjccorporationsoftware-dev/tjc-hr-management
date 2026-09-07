import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useRef, useState, type ComponentProps } from 'react';
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useKeyboardScroll } from './keyboard-aware';
import { Text } from './text';
import { hitSlop } from './tokens';
import { AURORA } from './aurora';
import { useAppTheme } from '@/theme/use-app-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface InputProps extends Omit<TextInputProps, 'style'> {
  appearance?: 'aurora' | 'default';
  label?: string;
  /** ข้อความช่วยใต้ช่อง แสดงเมื่อยังไม่มี error */
  hint?: string;
  error?: string;
  icon?: IconName;
  required?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    appearance = 'default',
    label,
    hint,
    error,
    icon,
    required,
    secureTextEntry,
    ...props
  },
  ref,
) {
  const { theme } = useAppTheme();
  /*
   * ตัวเลื่อนของฟอร์ม — มีเฉพาะตอนช่องนี้อยู่ใน `KeyboardAwareScroll`
   * ช่องที่อยู่นอกฟอร์ม (เช่นช่องค้นหาบนหัวจอ) จะได้ null แล้วไม่ทำอะไร
   */
  const ensureVisible = useKeyboardScroll();
  const fieldRef = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isPassword = Boolean(secureTextEntry);
  const isAurora = appearance === 'aurora';
  const borderColor = error
    ? isAurora
      ? AURORA.rose
      : theme.colors.danger
    : focused
      ? isAurora
        ? AURORA.accent
        : theme.colors.primary
      : isAurora
        ? AURORA.glassBorder
        : theme.colors.border;

  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text
          style={isAurora ? { color: AURORA.textMuted } : undefined}
          tone="muted"
          variant="label"
        >
          {label}
          {required ? (
            <Text
              style={isAurora ? { color: AURORA.rose } : undefined}
              tone="danger"
              variant="label"
            >
              {' '}
              *
            </Text>
          ) : null}
        </Text>
      ) : null}

      <View
        ref={fieldRef}
        style={{
          alignItems: 'center',
          backgroundColor: isAurora ? AURORA.glassStrong : theme.colors.surface,
          borderColor,
          borderRadius: theme.radius.md,
          borderWidth: focused || error ? 1.5 : 1,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          minHeight: 48,
          paddingHorizontal: theme.spacing.sm,
        }}
      >
        {icon ? (
          <Ionicons
            color={
              focused
                ? isAurora
                  ? AURORA.accent
                  : theme.colors.primary
                : isAurora
                  ? AURORA.textFaint
                  : theme.colors.textSubtle
            }
            name={icon}
            size={18}
          />
        ) : null}

        <TextInput
          ref={ref}
          placeholderTextColor={
            isAurora ? AURORA.textFaint : theme.colors.textSubtle
          }
          secureTextEntry={isPassword && !revealed}
          {...props}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            /* เลื่อนช่องนี้ให้พ้นแป้นพิมพ์ทันทีที่ถูกโฟกัส */
            ensureVisible?.(fieldRef.current);
            props.onFocus?.(event);
          }}
          style={[
            theme.typography.body,
            {
              color: isAurora ? AURORA.text : theme.colors.text,
              flex: 1,
              paddingVertical: theme.spacing.sm,
            },
          /*
           * ปิด focus outline ของเบราว์เซอร์
           *
           * react-native-web เรนเดอร์ TextInput เป็น <input> ซึ่งเบราว์เซอร์
           * วาดกรอบโฟกัสของตัวเอง (Chrome เป็นกรอบดำหนา) ทับกรอบสีที่เรา
           * ควบคุมผ่าน borderColor อยู่แล้ว ผลคือช่องที่โฟกัสมีสองกรอบซ้อนกัน
           * และกรอบนอกเป็นสีดำที่ไม่อยู่ในชุดสีของแอปเลย
           *
           * ตัดออกได้เพราะสถานะโฟกัสยังสื่อด้วยกรอบสี accent และไอคอนที่
           * เปลี่ยนสีอยู่แล้ว ไม่ได้ทิ้งผู้ใช้คีย์บอร์ดไว้โดยไม่มีสัญญาณ
           */
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          ]}
        />

        {isPassword ? (
          <Pressable
            accessibilityLabel={revealed ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            accessibilityRole="button"
            hitSlop={hitSlop}
            onPress={() => setRevealed((value) => !value)}
          >
            <Ionicons
              color={isAurora ? AURORA.textFaint : theme.colors.textSubtle}
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={18}
            />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text
          style={isAurora ? { color: AURORA.rose } : undefined}
          tone="danger"
          variant="caption"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text
          style={isAurora ? { color: AURORA.textFaint } : undefined}
          tone="subtle"
          variant="caption"
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
