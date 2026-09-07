import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from './text';
import { MIN_TOUCH_SIZE, elevation } from './tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps
  extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  icon,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const { theme } = useAppTheme();
  const isDisabled = Boolean(disabled) || loading;

  const palette = {
    primary: {
      bg: theme.colors.primary,
      pressed: theme.colors.primaryPressed,
      border: 'transparent',
      fg: theme.colors.onPrimary,
      raised: true,
    },
    secondary: {
      bg: theme.colors.surface,
      pressed: theme.colors.surfaceAlt,
      border: theme.colors.borderStrong,
      fg: theme.colors.text,
      raised: false,
    },
    ghost: {
      bg: 'transparent',
      pressed: theme.colors.surfaceAlt,
      border: 'transparent',
      fg: theme.colors.primary,
      raised: false,
    },
    danger: {
      bg: theme.colors.danger,
      pressed: theme.colors.dangerText,
      border: 'transparent',
      fg: '#ffffff',
      raised: true,
    },
  }[variant];

  const height = size === 'lg' ? 54 : MIN_TOUCH_SIZE + 4;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      {...props}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          borderRadius: theme.radius.md,
          borderWidth: palette.border === 'transparent' ? 0 : 1,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          height,
          justifyContent: 'center',
          // จางลงตอนกดไม่ได้ แต่ยังอ่านออก — ผู้ใช้ต้องรู้ว่าปุ่มเขียนว่าอะไร
          opacity: isDisabled ? 0.45 : 1,
          paddingHorizontal: theme.spacing.lg,
        },
        palette.raised && !isDisabled ? elevation(theme, 1) : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon ? (
            <Ionicons color={palette.fg} name={icon} size={18} />
          ) : null}
          <View>
            <Text style={[theme.typography.button, { color: palette.fg }]}>
              {title}
            </Text>
          </View>
        </>
      )}
    </Pressable>
  );
}
