import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from './app-text';
import { useAppTheme } from '@/theme/use-app-theme';

interface AppButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  fullWidth?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export function AppButton({
  disabled,
  fullWidth = true,
  loading = false,
  style,
  title,
  variant = 'primary',
  ...props
}: AppButtonProps) {
  const { theme } = useAppTheme();
  const isDisabled = disabled || loading;

  const palette = {
    primary: {
      background: theme.colors.primary,
      border: theme.colors.primary,
      pressed: theme.colors.primaryPressed,
      text: theme.colors.onPrimary,
    },
    secondary: {
      background: theme.colors.primarySoft,
      border: theme.colors.primarySoft,
      pressed: theme.colors.border,
      text: theme.colors.primary,
    },
    ghost: {
      background: 'transparent',
      border: theme.colors.border,
      pressed: theme.colors.surfaceAlt,
      text: theme.colors.text,
    },
    danger: {
      background: theme.colors.danger,
      border: theme.colors.danger,
      pressed: theme.colors.dangerSoft,
      text: theme.colors.onPrimary,
    },
  }[variant];

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          backgroundColor: pressed ? palette.pressed : palette.background,
          borderColor: palette.border,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          flexDirection: 'row',
          justifyContent: 'center',
          minHeight: 52,
          opacity: isDisabled ? 0.55 : 1,
          paddingHorizontal: theme.spacing.lg,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <AppText
          style={{ color: palette.text, textAlign: 'center' }}
          variant="button"
        >
          {title}
        </AppText>
      )}
    </Pressable>
  );
}
