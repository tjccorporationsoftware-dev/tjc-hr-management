import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useAppTheme } from '@/theme/use-app-theme';

interface AppStartupErrorProps {
  issues: string[];
}

export function AppStartupError({ issues }: AppStartupErrorProps) {
  const { theme } = useAppTheme();

  return (
    <Screen contentContainerStyle={{ justifyContent: 'center' }}>
      <AppCard>
        <View style={{ gap: theme.spacing.md }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.dangerSoft,
              borderRadius: theme.radius.pill,
              height: 52,
              justifyContent: 'center',
              width: 52,
            }}
          >
            <Ionicons color={theme.colors.danger} name="warning-outline" size={26} />
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="h2">ตั้งค่าแอปไม่สมบูรณ์</AppText>
            <AppText color="muted">
              กรุณาตรวจสอบไฟล์ .env แล้วเปิด Development Server ใหม่
            </AppText>
          </View>

          {__DEV__ ? (
            <View
              style={{
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: theme.radius.md,
                gap: theme.spacing.xs,
                padding: theme.spacing.md,
              }}
            >
              {issues.map((issue) => (
                <AppText key={issue} color="danger" variant="caption">
                  • {issue}
                </AppText>
              ))}
            </View>
          ) : null}
        </View>
      </AppCard>
    </Screen>
  );
}
