import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, SkeletonList, Text, useToast, type IconName } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  NotificationMotif,
  PageHero,
  PressableScale,
  Reveal,
  SectionAction,
} from '@/design/aurora';
import {
  enablePush,
  getPushPermission,
  type PushPermission,
} from '@/features/notifications/push';
import {
  usePushPreferences,
  useUpdatePushPreference,
} from '@/features/notifications/push-preferences';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * การแจ้งเตือน
 *
 * มีสองชั้นที่ต่างกันคนละเรื่อง และผู้ใช้สับสนบ่อยถ้าปนกันอยู่ในสวิตช์เดียว:
 *
 *   1. **สิทธิ์ของเครื่อง** — ระบบปฏิบัติการอนุญาตให้แอปเด้งแจ้งเตือนไหม
 *      เปลี่ยนได้จากในแอปครั้งเดียวตอนยังไม่เคยตอบ หลังจากนั้นต้องไปตั้งค่าเครื่อง
 *   2. **เรื่องที่อยากให้เด้ง** — ค่าของ **บัญชี** เก็บที่ backend ปิดจาก
 *      เครื่องนี้แล้วเงียบทุกเครื่องที่ลงชื่อด้วยบัญชีเดียวกัน
 *
 * ทั้งสองชั้นคุมแค่ "การเด้งขึ้นจอ" — รายการในศูนย์แจ้งเตือนขึ้นครบเสมอ
 * ไม่งั้นคนที่ปิดไว้จะพลาดของที่ต้องอนุมัติโดยไม่เหลือร่องรอยให้ตามเลย
 *
 * ## ผิวของจอ
 *
 * พื้นขาวล้วน หัวจอ `PageHero` เต็มความกว้าง แถวทั้งหมดวางบนพื้นตรง ๆ คั่น
 * ด้วยเส้นบาง — ชุดเดียวกับจอตั้งค่าและจอความปลอดภัย ไม่มี `<Glass>` แล้ว
 * เพราะจอนี้เป็นรายการล้วน ๆ หัวข้อหมวดกับระยะห่างแบ่งให้พออยู่แล้ว
 */

/*
 * ไอคอนประจำหมวด — รายการหมวดมาจาก backend (`MOBILE_PUSH_CATEGORIES`) จอนี้
 * แค่เติมไอคอนให้ หมวดใหม่ที่ยังไม่มีในตารางนี้จะได้กระดิ่งเป็นค่าเริ่มต้น
 * ไม่ใช่จอว่างหรือช่องโหว่
 */
const CATEGORY_ICON: Record<string, IconName> = {
  APPROVAL: 'check-circle',
  ATTENDANCE: 'clock',
  OTHER: 'volume-2',
  PAYROLL: 'credit-card',
  REQUEST: 'file-text',
  TEAM: 'users',
};

/** บรรทัดหมายเหตุใต้รายการ — ไอคอนเล็กกับข้อความอธิบาย ไม่ใช่แถบเตือนมีพื้น */
function FootNote({
  color,
  icon,
  children,
}: {
  children: ReactNode;
  color: string;
  icon: IconName;
}) {
  return (
    <View
      style={{
        alignItems: 'flex-start',
        flexDirection: 'row',
        gap: 8,
      }}
    >
      <Icon color={color} name={icon} size={15} />
      <Text
        style={{
          color: AURORA.textMuted,
          flex: 1,
          fontSize: 11,
          lineHeight: 16,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const toast = useToast();

  const [permission, setPermission] = useState<PushPermission>('UNSUPPORTED');
  const [enabling, setEnabling] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);

  const preferences = usePushPreferences();
  const updatePreference = useUpdatePushPreference();

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

  /*
   * อ่านสิทธิ์ใหม่ทุกครั้งที่กลับมาที่จอ — ผู้ใช้ที่ถูกส่งไปตั้งค่าเครื่องแล้ว
   * กดเปิดที่นั่นจะกลับมาเจอสถานะเดิมค้างอยู่ถ้าอ่านแค่ตอน mount
   */
  useFocusEffect(
    useCallback(() => {
      void getPushPermission().then(setPermission);
    }, []),
  );

  useEffect(() => {
    void getPushPermission().then(setPermission);
  }, []);

  async function handleEnablePush() {
    setEnabling(true);

    const result = await enablePush();
    setPermission(result);
    setEnabling(false);

    if (result === 'GRANTED') {
      toast.success('เปิดการแจ้งเตือนแล้ว');
    } else if (result === 'DENIED') {
      toast.warn('เครื่องปฏิเสธการแจ้งเตือน ต้องเปิดจากตั้งค่าเครื่อง');
    }
  }

  async function toggleCategory(category: string, enabled: boolean) {
    setPendingCategory(category);

    try {
      await updatePreference.mutateAsync({ category, enabled });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'บันทึกการตั้งค่าไม่สำเร็จ',
      );
    } finally {
      setPendingCategory(null);
    }
  }

  const granted = permission === 'GRANTED';
  const items = preferences.data?.items ?? [];

  const permissionCopy =
    permission === 'GRANTED'
      ? 'เครื่องนี้อนุญาตให้แอปแจ้งเตือนแล้ว'
      : permission === 'DENIED'
        ? 'ถูกปิดไว้ที่ตั้งค่าเครื่อง แตะเพื่อไปเปิด'
        : permission === 'UNSUPPORTED'
          ? 'ใช้งานได้เมื่อเปิดผ่านแอปที่ติดตั้งจริง ไม่ใช่ Expo Go'
          : 'ยังไม่ได้ขออนุญาตบนเครื่องนี้ แตะเพื่อเปิด';

  const permissionAction =
    permission === 'DENIED'
      ? () => void Linking.openSettings()
      : permission === 'UNDETERMINED'
        ? () => void handleEnablePush()
        : undefined;

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            gap: 22,
            paddingBottom: 36,
            paddingHorizontal: gutter,
            paddingTop: 34,
          }}
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void preferences.refetch()}
                refreshing={preferences.isRefetching}
                tintColor={AURORA.textMuted}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        >
          {/* --------------------------------------------------- หัวจอ */}
          <Reveal>
            <View style={{ marginHorizontal: -18, marginTop: -34 }}>
              <PageHero
                decoration={<NotificationMotif />}
                icon="arrow-left"
                iconLabel="ย้อนกลับ"
                onIconPress={() => router.back()}
                subtitle="เลือกเรื่องที่อยากให้เด้งขึ้นหน้าจอ"
                title="การแจ้งเตือน"
              />
            </View>
          </Reveal>

          {/* -------------------------------------- สิทธิ์ของเครื่องนี้ */}
          <Reveal delay={60} style={{ marginTop: -12 }}>
            <PressableScale
              accessibilityRole="button"
              disabled={!permissionAction || enabling}
              onPress={permissionAction ?? (() => undefined)}
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: 12,
                minHeight: 76,
                paddingVertical: 12,
              }}
            >
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: granted
                    ? AURORA.accentSoft
                    : 'rgba(217,119,6,0.1)',
                  borderRadius: 15,
                  height: 42,
                  justifyContent: 'center',
                  width: 42,
                }}
              >
                <Icon
                  color={granted ? AURORA.accent : AURORA.amber}
                  name={granted ? 'bell' : 'bell-off'}
                  size={19}
                />
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    color: AURORA.text,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  สิทธิ์บนเครื่องนี้
                </Text>
                <Text
                  numberOfLines={3}
                  style={{
                    color: AURORA.textMuted,
                    fontSize: 11,
                    lineHeight: 16,
                  }}
                >
                  {permissionCopy}
                </Text>
              </View>

              {enabling ? (
                <ActivityIndicator color={AURORA.accent} size="small" />
              ) : granted ? (
                <Icon color={AURORA.accent} name="check-circle" size={19} />
              ) : permissionAction ? (
                <Icon color={AURORA.textFaint} name="chevron-right" size={18} />
              ) : null}
            </PressableScale>
          </Reveal>

          {/* ------------------------------------------ เลือกรายหมวด */}
          <Reveal delay={120}>
            <View style={{ gap: 6 }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: AURORA.text }} variant="h2">
                  เรื่องที่ให้เด้ง
                </Text>
                <Text style={{ color: AURORA.textMuted }} variant="caption">
                  ค่านี้ผูกกับบัญชี ปิดที่นี่แล้วเงียบทุกเครื่อง
                </Text>
              </View>

              {preferences.isPending ? (
                <View style={{ paddingTop: 10 }}>
                  <SkeletonList rows={4} />
                </View>
              ) : preferences.isError ? (
                <View style={{ gap: 6, paddingTop: 12 }}>
                  <Text style={{ color: AURORA.text }} variant="bodyStrong">
                    โหลดการตั้งค่าไม่สำเร็จ
                  </Text>
                  <Text style={{ color: AURORA.textMuted }} variant="caption">
                    {preferences.error instanceof ApiError
                      ? preferences.error.message
                      : 'กรุณาลองใหม่อีกครั้ง'}
                  </Text>
                  <SectionAction
                    label={preferences.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                    onPress={() => void preferences.refetch()}
                  />
                </View>
              ) : (
                items.map((item, index) => (
                  <View
                    key={item.category}
                    style={{
                      alignItems: 'center',
                      borderTopColor: AURORA.glassBorder,
                      borderTopWidth: index > 0 ? 1 : 0,
                      flexDirection: 'row',
                      gap: 12,
                      minHeight: 76,
                      paddingVertical: 12,
                    }}
                  >
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: item.enabled
                          ? AURORA.accentSoft
                          : 'rgba(148,163,184,0.14)',
                        borderRadius: 15,
                        height: 42,
                        justifyContent: 'center',
                        width: 42,
                      }}
                    >
                      <Icon
                        color={item.enabled ? AURORA.accent : AURORA.textFaint}
                        name={CATEGORY_ICON[item.category] ?? 'bell'}
                        size={19}
                      />
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        numberOfLines={2}
                        style={{
                          color: AURORA.text,
                          fontSize: 14,
                          fontWeight: '600',
                        }}
                      >
                        {item.label}
                      </Text>
                      <Text
                        numberOfLines={3}
                        style={{
                          color: AURORA.textMuted,
                          fontSize: 11,
                          lineHeight: 16,
                        }}
                      >
                        {item.description}
                      </Text>
                    </View>

                    {pendingCategory === item.category ? (
                      <ActivityIndicator color={AURORA.accent} size="small" />
                    ) : (
                      <Switch
                        accessibilityLabel={item.label}
                        disabled={pendingCategory !== null}
                        onValueChange={(value) =>
                          void toggleCategory(item.category, value)
                        }
                        value={item.enabled}
                      />
                    )}
                  </View>
                ))
              )}

              {/*
                บอกให้ชัดว่าปิดแล้วไม่ได้หายไปไหน — ผู้ใช้ที่กลัวพลาดงานอนุมัติ
                จะได้กล้าปิดเสียงรบกวน โดยไม่ต้องเสี่ยงว่าจะไม่รู้เรื่องเลย
              */}
              <View style={{ gap: 8, paddingTop: 12 }}>
                <FootNote color={AURORA.sky} icon="info">
                  ปิดแล้วยังเห็นทุกเรื่องในศูนย์แจ้งเตือนตามปกติ
                  แค่ไม่เด้งขึ้นหน้าจอ
                </FootNote>

                {!granted && items.length > 0 ? (
                  <FootNote color={AURORA.amber} icon="alert-circle">
                    ตอนนี้เครื่องยังไม่อนุญาตให้แจ้งเตือน
                    ค่าที่ตั้งไว้จะเริ่มมีผลเมื่อเปิดสิทธิ์ด้านบนแล้ว
                  </FootNote>
                ) : null}
              </View>
            </View>
          </Reveal>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
