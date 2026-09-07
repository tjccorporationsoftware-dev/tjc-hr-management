import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from './text';
import { MIN_TOUCH_SIZE, tone as resolveTone, type ToneName } from './tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** ข้อความชิดขวา เช่น จำนวนเงินหรือเวลา */
  value?: string;
  icon?: IconName;
  iconTone?: ToneName;
  /** ต่อท้ายด้านขวา เช่น Badge หรือ Switch — มาแทน value ถ้าใส่ทั้งคู่ */
  right?: ReactNode;
  onPress?: () => void;
  /** เส้นคั่นล่าง ปิดที่แถวสุดท้าย */
  divider?: boolean;
}

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconTone = 'primary',
  right,
  onPress,
  divider = true,
}: ListRowProps) {
  const { theme } = useAppTheme();
  const iconPalette = resolveTone(theme, iconTone);
  const interactive = Boolean(onPress);

  const content = (
    <View
      style={{
        alignItems: 'center',
        borderBottomColor: theme.colors.border,
        borderBottomWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: MIN_TOUCH_SIZE + 8,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {icon ? (
        <View
          style={{
            alignItems: 'center',
            backgroundColor: iconPalette.bg,
            borderRadius: theme.radius.sm,
            height: 36,
            justifyContent: 'center',
            width: 36,
          }}
        >
          <Ionicons color={iconPalette.fg} name={icon} size={18} />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} variant="bodyStrong">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} tone="muted" variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ?? (value ? <Text variant="bodyStrong">{value}</Text> : null)}

      {interactive ? (
        <Ionicons
          color={theme.colors.textSubtle}
          name="chevron-forward"
          size={18}
        />
      ) : null}
    </View>
  );

  if (!interactive) return content;

  return (
    <Pressable
      accessibilityRole="button"
      android_ripple={{ color: theme.colors.surfaceAlt }}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
      })}
    >
      {content}
    </Pressable>
  );
}
