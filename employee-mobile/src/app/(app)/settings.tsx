import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAppConfig } from '@/config/app-config';
import { Icon, Text, type IconName } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PressableScale,
  Reveal,
  SettingsMotif,
} from '@/design/aurora';
import {
  getPushPermission,
  type PushPermission,
} from '@/features/notifications/push';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * ตั้งค่า — สารบัญ ไม่ใช่จอที่ตั้งค่าอะไรได้เอง
 *
 * ทุกแถวพาไปจออื่นทั้งหมด จอนี้จึงไม่มีสวิตช์ ไม่มีฟอร์ม และไม่ควรมีการ์ด
 * ครอบ — รายการที่มีสองแถวในการ์ดบนฉากฟ้าอ่านเป็นกล่องซ้อนกล่องโดยไม่ได้
 * แบ่งอะไรเลย (กติกาข้อ 3.5 ใน AGENTS.md)
 *
 * ผิวจึงเป็นชุดเดียวกับจอ PIN ที่เพิ่งรื้อไป: พื้นขาวล้วน หัวจอ `PageHero`
 * เต็มความกว้าง แล้วแถวรายการวางบนพื้นตรง ๆ คั่นด้วยเส้นบาง
 *
 * รายการอยู่ชิดใต้หัวจอ ไม่ได้เว้นระยะบล็อกเต็ม ๆ แบบจออื่น — จอนี้มีบล็อก
 * เดียว ระยะที่เว้นไว้จึงไม่ได้แยกอะไรจากอะไร มีแต่ทำให้ของทั้งจอลอยต่ำลง
 */

function SettingRow({
  divider = false,
  icon,
  onPress,
  subtitle,
  title,
  trailing,
}: {
  /** เส้นคั่น = เส้นบนของแถวถัดไป แถวแรกจึงไม่มี (กติกาข้อ 8) */
  divider?: boolean;
  icon: IconName;
  onPress?: () => void;
  subtitle: string;
  title: string;
  trailing?: ReactNode;
}) {
  const content = (
    <View
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        minHeight: 76,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: AURORA.accentSoft,
          borderRadius: 15,
          height: 42,
          justifyContent: 'center',
          width: 42,
        }}
      >
        <Icon color={AURORA.accent} name={icon} size={19} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: AURORA.text, fontSize: 14, fontWeight: '600' }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 16 }}
        >
          {subtitle}
        </Text>
      </View>

      {trailing}

      {onPress ? (
        <Icon color={AURORA.textFaint} name="chevron-right" size={18} />
      ) : null}
    </View>
  );

  return onPress ? (
    <PressableScale accessibilityRole="button" onPress={onPress}>
      {content}
    </PressableScale>
  ) : (
    content
  );
}

export default function SettingsScreen() {
  const { gutter } = useResponsive();
  const router = useRouter();
  const appConfig = getAppConfig();
  const { resolvedMode } = useAppTheme();
  const [push, setPush] = useState<PushPermission>('UNSUPPORTED');
  const auroraStatusBarStyle = useVisibleStatusBarStyle('dark');
  const themeStatusBarStyle = useVisibleStatusBarStyle(
    resolvedMode === 'dark' ? 'light' : 'dark',
  );

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(auroraStatusBarStyle);

      return () => setStatusBarStyle(themeStatusBarStyle);
    }, [auroraStatusBarStyle, themeStatusBarStyle]),
  );

  useEffect(() => {
    void getPushPermission().then(setPush);
  }, []);

  /*
   * แถวนี้บอกสถานะอย่างเดียว การเปิดสิทธิ์กับสวิตช์รายหมวดอยู่ในจอถัดไป —
   * เดิมแตะแล้วเปิดสิทธิ์ทันทีบ้าง เด้งไปตั้งค่าเครื่องบ้าง แล้วแต่สถานะ
   * ซึ่งผู้ใช้เดาไม่ได้เลยว่าแตะแล้วจะเกิดอะไร
   */
  const pushSubtitle =
    push === 'GRANTED'
      ? 'เลือกเรื่องที่อยากให้เด้งขึ้นหน้าจอ'
      : push === 'DENIED'
        ? 'ถูกปิดอยู่ที่ตั้งค่าเครื่อง'
        : push === 'UNSUPPORTED'
          ? 'ใช้งานได้เมื่อเปิดผ่านแอปที่ติดตั้งจริง'
          : 'ยังไม่ได้เปิดบนเครื่องนี้';

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            gap: 20,
            paddingBottom: 42,
            paddingHorizontal: gutter,
            paddingTop: 34,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* --------------------------------------------------- หัวจอ */}
          <Reveal>
            <View style={{ marginHorizontal: -18, marginTop: -34 }}>
              <PageHero
                decoration={<SettingsMotif />}
                icon="arrow-left"
                iconLabel="ย้อนกลับ"
                onIconPress={() => router.back()}
                subtitle="ความปลอดภัย การแจ้งเตือน และหน้าตาแอป"
                title="การตั้งค่า"
              />
            </View>
          </Reveal>

          {/* ------------------------------------------------- รายการ */}
          <Reveal delay={60} style={{ marginTop: -16 }}>
            <View>
              {/*
                เปลี่ยนรหัส PIN ไม่ได้อยู่ที่นี่แล้ว — มันอยู่ในหน้าความปลอดภัย
                ซึ่งเป็นที่ของ "วิธีปลดล็อกแอป" ทั้งหมด (PIN, ไบโอเมตริก,
                การบังหน้าจอ) การมีทางเข้าสองที่ทำให้ผู้ใช้ต้องเดาว่าสองอันนี้
                ต่างกันยังไง ทั้งที่พาไปที่เดียวกัน
              */}
              <SettingRow
                icon="shield"
                onPress={() => router.push('/security')}
                subtitle="รหัส PIN ไบโอเมตริก และอุปกรณ์ที่เข้าใช้งานได้"
                title="ความปลอดภัยและอุปกรณ์"
              />

              <SettingRow
                divider
                icon="bell"
                onPress={() => router.push('/notification-settings')}
                subtitle={pushSubtitle}
                title="การแจ้งเตือน"
                trailing={
                  push === 'GRANTED' ? (
                    /* ป้ายสถานะบนแถว = จุดกลม + ข้อความสีเดียวกัน (กติกาข้อ 8) */
                    <View
                      style={{
                        alignItems: 'center',
                        flexDirection: 'row',
                        gap: 5,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: AURORA.sky,
                          borderRadius: 999,
                          height: 5,
                          width: 5,
                        }}
                      />
                      <Text
                        maxScale={1.1}
                        style={{
                          color: AURORA.sky,
                          fontSize: 10.5,
                          fontWeight: '700',
                        }}
                      >
                        เปิดอยู่
                      </Text>
                    </View>
                  ) : null
                }
              />

              {/*
                จอตรวจดีไซน์ของแจ้งเตือน — ขึ้นเฉพาะตอนที่ไม่ใช่เวอร์ชันจริง
                ผู้ใช้ทั่วไปไม่ควรเจอปุ่มที่ยิงแจ้งเตือนปลอมใส่ตัวเอง แต่ตอน
                ทำดีไซน์ต้องกดดูทุกแบบได้โดยไม่ต้องรอให้เกิดเหตุจริง
              */}
              {appConfig.appEnvironment === 'production' ? null : (
                <SettingRow
                  divider
                  icon="eye"
                  onPress={() => router.push('/notification-preview')}
                  subtitle="กดดูหน้าตาแถบลอยและแจ้งเตือนที่เด้งบนมือถือ"
                  title="ตัวอย่างแจ้งเตือน"
                />
              )}
            </View>
          </Reveal>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
