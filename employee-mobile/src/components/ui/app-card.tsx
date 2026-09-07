import { View, type ViewProps } from 'react-native';

import { useAppTheme } from '@/theme/use-app-theme';

interface AppCardProps extends ViewProps {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'soft' | 'primary';
}

export function AppCard({
  padding = 'lg',
  style,
  variant = 'default',
  ...props
}: AppCardProps) {
  const { theme } = useAppTheme();

  const backgroundColor = {
    default: theme.colors.surface,
    soft: theme.colors.surfaceAlt,
    primary: theme.colors.primary,
  }[variant];

  const paddingValue = {
    none: 0,
    sm: theme.spacing.sm,
    md: theme.spacing.md,
    lg: theme.spacing.lg,
  }[padding];

  return (
    <View
      {...props}
      style={[
        {
          backgroundColor,
          borderColor:
            variant === 'primary' ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radius.xl,
          borderWidth: 1,
          padding: paddingValue,
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: theme.dark ? 0.22 : 0.06,
          shadowRadius: 18,
          elevation: 2,
        },
        style,
      ]}
    />
  );
}
