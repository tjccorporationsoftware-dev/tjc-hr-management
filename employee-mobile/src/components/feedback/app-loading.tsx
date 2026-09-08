import { ActivityIndicator, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { useAppTheme } from '@/theme/use-app-theme';

interface AppLoadingProps {
  message?: string;
}

/**
 * จอคั่นระหว่างรอ — มีแต่ตัวหมุน ไม่มีตัวหนังสือ
 *
 * ข้อความเคยแสดงอยู่กึ่งกลางจอ ซึ่งเป็นตำแหน่งเดียวกับโลโก้บนจอเปิดแอปพอดี
 * ตอนจอเปิดแอปค่อย ๆ จางออก ผู้ใช้จึงเห็นตัวหนังสือซ้อนทับกลางโลโก้อยู่ครู่หนึ่ง
 * ทุกครั้งที่เปิดแอป ดูเหมือนจอค้างหรือเรนเดอร์ผิดมากกว่าจะบอกอะไรได้
 *
 * `message` ยังรับไว้และส่งต่อให้โปรแกรมอ่านหน้าจอ — คนที่มองไม่เห็นตัวหมุน
 * ยังต้องรู้ว่ากำลังรออะไรอยู่ ไม่ใช่รอเฉย ๆ โดยไม่มีอะไรบอก
 */
export function AppLoading({ message = 'กำลังเตรียมแอป...' }: AppLoadingProps) {
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
        <ActivityIndicator
          accessibilityLabel={message}
          color={theme.colors.primary}
          size="large"
        />
      </View>
    </Screen>
  );
}
