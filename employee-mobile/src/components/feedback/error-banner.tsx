import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/theme/use-app-theme';

interface ErrorBannerProps {
  message: string;
  /** แสดงไว้ให้ผู้ใช้อ่านให้ฝ่ายซัพพอร์ตตามเรื่องได้ (บทที่ 9.8) */
  requestId?: string | null;
  title?: string;
  tone?: 'danger' | 'warning';
}

export function ErrorBanner({
  message,
  requestId,
  title,
  tone = 'danger',
}: ErrorBannerProps) {
  const { theme } = useAppTheme();

  const palette =
    tone === 'warning'
      ? { background: theme.colors.warningSoft, foreground: theme.colors.warning }
      : { background: theme.colors.dangerSoft, foreground: theme.colors.danger };

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: palette.background,
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
      }}
    >
      <Ionicons
        color={palette.foreground}
        name={tone === 'warning' ? 'warning-outline' : 'alert-circle'}
        size={20}
      />

      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <AppText style={{ color: palette.foreground }} variant="label">
            {title}
          </AppText>
        ) : null}

        <AppText style={{ color: palette.foreground }} variant="caption">
          {message}
        </AppText>

        {requestId ? (
          <AppText color="subtle" variant="caption">
            รหัสอ้างอิง: {requestId}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
