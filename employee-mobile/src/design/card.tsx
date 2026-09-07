import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './text';
import { elevation } from './tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export interface CardProps {
  children: ReactNode;
  title?: string;
  description?: string;
  /** มุมขวาบนของหัวการ์ด เช่น Badge หรือปุ่มเล็ก */
  action?: ReactNode;
  /** ไม่ใส่ padding ด้านใน ใช้กับการ์ดที่มีรายการเต็มความกว้าง */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  title,
  description,
  action,
  flush = false,
  style,
}: CardProps) {
  const { theme } = useAppTheme();
  const hasHeader = Boolean(title || description || action);

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          overflow: 'hidden',
        },
        elevation(theme, 1),
        style,
      ]}
    >
      {hasHeader ? (
        <View
          style={{
            alignItems: 'flex-start',
            borderBottomColor: theme.colors.border,
            borderBottomWidth: flush ? 1 : 0,
            flexDirection: 'row',
            gap: theme.spacing.sm,
            justifyContent: 'space-between',
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.md,
            paddingBottom: flush ? theme.spacing.md : theme.spacing.xs,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            {title ? <Text variant="h3">{title}</Text> : null}
            {description ? (
              <Text tone="muted" variant="caption">
                {description}
              </Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}

      <View style={flush ? undefined : { padding: theme.spacing.md }}>
        {children}
      </View>
    </View>
  );
}
