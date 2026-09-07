import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog, Icon, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PressableScale,
  ProfileMotif,
} from '@/design/aurora';
import { logout } from '@/features/auth/auth.service';
import { useMoreItems, type MoreItem } from '@/features/more/more-menu';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * จอ "เพิ่มเติม" แบบเต็มจอ
 *
 * ทางเข้าหลักคือแผงที่เลื่อนออกมาจากขอบขวาตอนกดแท็บ (ดู `MoreDrawer`) จอนี้
 * เหลือไว้เพราะ expo-router ต้องมีไฟล์ของแท็บอยู่จริง และ deep link/แจ้งเตือน
 * ที่ชี้มาที่ `/profile` ต้องยังเปิดได้ — รายการเมนูใช้ชุดเดียวกันทั้งสองที่
 * ผ่าน `useMoreItems()` จะได้ไม่มีเมนูตกหล่นข้างใดข้างหนึ่ง
 */

function HubRow({
  divider,
  item,
  onPress,
}: {
  divider: boolean;
  item: MoreItem;
  onPress: () => void;
}) {
  const { gutter } = useResponsive();
  const soon = item.soon === true;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: soon }}
      disabled={soon}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor:
          pressed && !soon ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: gutter,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            backgroundColor: soon
              ? 'rgba(148, 163, 184, 0.14)'
              : `${AURORA.accent}1a`,
            borderRadius: 14,
            height: 42,
            justifyContent: 'center',
            width: 42,
          }}
        >
          <Icon
            color={soon ? AURORA.textFaint : AURORA.accent}
            name={item.icon}
            size={19}
          />
        </View>

        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: soon ? AURORA.textMuted : AURORA.text,
              fontSize: 14,
              fontWeight: '700',
              lineHeight: 19,
            }}
          >
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text
              numberOfLines={2}
              style={{
                color: AURORA.textMuted,
                fontSize: 11.5,
                lineHeight: 16,
              }}
            >
              {item.subtitle}
            </Text>
          ) : null}
        </View>

        {soon ? (
          <View
            style={{
              backgroundColor: 'rgba(148, 163, 184, 0.16)',
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
            <Text
              maxScale={1.1}
              style={{
                color: AURORA.textMuted,
                fontSize: 10.5,
                fontWeight: '700',
                lineHeight: 14,
              }}
            >
              กำลังพัฒนา
            </Text>
          </View>
        ) : (
          <Icon color={AURORA.textFaint} name="chevron-right" size={17} />
        )}
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const items = useMoreItems();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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

  function handleLogout() {
    setLoggingOut(true);
    void logout().finally(() => {
      setLoggingOut(false);
      setConfirmVisible(false);
    });
  }

  return (
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <PageHero
              decoration={<ProfileMotif />}
              icon="more-horizontal"
              subtitle="ข้อมูลพนักงาน บริการ และการตั้งค่าแอป"
              title="เพิ่มเติม"
            />
          </View>

          {items.map((item, index) => (
            <HubRow
              divider={index > 0}
              item={item}
              key={`${String(item.href)}-${index}`}
              onPress={() => router.push(item.href)}
            />
          ))}

          <View style={{ paddingHorizontal: gutter, paddingTop: 20 }}>
            <PressableScale
              accessibilityRole="button"
              onPress={() => setConfirmVisible(true)}
              style={{
                alignItems: 'center',
                backgroundColor: `${AURORA.rose}14`,
                borderRadius: 16,
                flexDirection: 'row',
                gap: 8,
                justifyContent: 'center',
                minHeight: 50,
              }}
            >
              <Icon color={AURORA.rose} name="log-out" size={18} />
              <Text
                style={{
                  color: AURORA.rose,
                  fontSize: 14,
                  fontWeight: '700',
                  lineHeight: 19,
                }}
              >
                ออกจากระบบ
              </Text>
            </PressableScale>
          </View>
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        confirmLabel="ออกจากระบบ"
        destructive
        loading={loggingOut}
        message="ต้องเข้าสู่ระบบใหม่เมื่อกลับมาใช้งานบนเครื่องนี้"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={handleLogout}
        title="ออกจากระบบ"
        visible={confirmVisible}
      />
    </View>
  );
}
