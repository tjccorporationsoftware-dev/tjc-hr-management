import { View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './text';
import { tone as resolveTone, type ToneName } from './tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export interface BadgeProps {
  label: string;
  tone?: ToneName;
  /** จุดสีนำหน้า ใช้กับสถานะที่ต้องกวาดตาเร็ว เช่น รออนุมัติ */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Badge({
  label,
  tone = 'neutral',
  dot = false,
  style,
}: BadgeProps) {
  const { theme } = useAppTheme();
  const palette = resolveTone(theme, tone);

  return (
    <View
      style={[
        {
          alignItems: 'center',
          alignSelf: 'flex-start',
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          flexDirection: 'row',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 4,
        },
        style,
      ]}
    >
      {dot ? (
        <View
          style={{
            backgroundColor: palette.fg,
            borderRadius: 999,
            height: 6,
            width: 6,
          }}
        />
      ) : null}
      <Text
        maxScale={1.2}
        style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}
      >
        {label}
      </Text>
    </View>
  );
}
