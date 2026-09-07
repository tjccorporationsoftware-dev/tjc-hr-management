import { StyleSheet, Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';
import {
  fontFamilyForWeight,
  type TypographyVariant,
} from '@/theme/typography';

interface AppTextProps extends TextProps {
  color?: 'default' | 'muted' | 'subtle' | 'primary' | 'success' | 'warning' | 'danger';
  variant?: TypographyVariant;
}

export function AppText({
  color = 'default',
  style,
  variant = 'body',
  ...props
}: AppTextProps) {
  const { theme } = useAppTheme();

  const textColor = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    subtle: theme.colors.textSubtle,
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
  }[color];
  const flattenedStyle = StyleSheet.flatten(style);
  const requestedWeight = flattenedStyle?.fontWeight;
  const overrideFont = requestedWeight
    ? {
        fontFamily: fontFamilyForWeight(requestedWeight),
        fontWeight: 'normal' as const,
      }
    : null;

  return (
    <Text
      {...props}
      style={[
        theme.typography[variant],
        { color: textColor },
        style,
        overrideFont,
      ]}
    />
  );
}
