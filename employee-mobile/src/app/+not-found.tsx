import { router } from 'expo-router';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useAppTheme } from '@/theme/use-app-theme';

export default function NotFoundScreen() {
  const { theme } = useAppTheme();

  return (
    <Screen>
      <View
        style={{
          alignItems: 'center',
          flex: 1,
          gap: theme.spacing.md,
          justifyContent: 'center',
        }}
      >
        <AppText color="primary" variant="display">404</AppText>
        <AppText style={{ textAlign: 'center' }} variant="h2">
          ไม่พบหน้าที่ต้องการ
        </AppText>
        <AppText color="muted" style={{ textAlign: 'center' }}>
          ลิงก์อาจหมดอายุหรือหน้านี้ยังไม่เปิดใช้งาน
        </AppText>
        <AppButton
          fullWidth={false}
          onPress={() => router.replace('/login')}
          title="กลับหน้าหลัก"
        />
      </View>
    </Screen>
  );
}
