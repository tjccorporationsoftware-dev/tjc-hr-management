import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/design';
import { useRoleTabs, type TabName } from '@/features/bootstrap/use-role-tabs';
import { MoreDrawer } from '@/features/more/more-drawer';
import { fontFamily } from '@/theme/typography';
import { useAppTheme } from '@/theme/use-app-theme';

interface TabDefinition {
  name: TabName;
  title: string;
  icon: IconName;
}

/**
 * นิยามแท็บทั้งหมดที่แอปมี — จะโชว์ตัวไหนขึ้นกับสิทธิ์ (useRoleTabs)
 * expo-router ต้องประกาศ Screen ครบทุกไฟล์ที่มีอยู่จริง ตัวที่ไม่มีสิทธิ์
 * จึงใช้ href: null เพื่อซ่อนออกจากแถบ แต่ยัง deep link เข้าไม่ได้
 */
const TABS: TabDefinition[] = [
  /*
   * ไอคอนแท็บเลือกตัวที่ "เส้นน้อยที่สุดที่ยังอ่านออก" — ในกรอบ 22 พิกเซล
   * รายละเอียดข้างในกลายเป็นรอยเปื้อน ไม่ได้ช่วยให้อ่านเร็วขึ้น
   *   file-text (มีเส้นบรรทัดข้างใน) → file
   *   check-square (กรอบ+ติ๊ก)      → check (เหลือแค่เครื่องหมายถูก)
   *   credit-card (กรอบ+แถบ)        → dollar-sign
   *   grid (สี่ช่อง)                 → menu (สามเส้น)
   *   bar-chart-2 / pie-chart       → trending-up (เส้นเดียว)
   */
  { icon: 'home', name: 'today', title: 'หน้าหลัก' },
  { icon: 'clock', name: 'attendance', title: 'ลงเวลา' },
  { icon: 'trending-up', name: 'overview', title: 'ภาพรวม' },
  { icon: 'file', name: 'requests', title: 'คำขอ' },
  { icon: 'check', name: 'approvals', title: 'อนุมัติ' },
  { icon: 'dollar-sign', name: 'wallet', title: 'เงินเดือน' },
  { icon: 'menu', name: 'profile', title: 'เพิ่มเติม' },
];

function TabBadge({ count }: { count: number }) {
  const { theme } = useAppTheme();

  if (count <= 0) return null;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.danger,
        borderRadius: 999,
        justifyContent: 'center',
        minWidth: 18,
        paddingHorizontal: 5,
        paddingVertical: 1,
        position: 'absolute',
        right: -10,
        top: -4,
      }}
    >
      <Text
        maxScale={1}
        style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}
      >
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { flags, isVisible, pendingApprovals } = useRoleTabs();
  const [moreOpen, setMoreOpen] = useState(false);

  /*
   * ผู้บริหารใช้สองช่องแรกเป็นจอระดับบริษัท ไม่ใช่จอส่วนตัวของพนักงาน
   * (today.tsx / attendance.tsx สลับเนื้อหาเองตาม flags) ป้ายกับไอคอนจึงต้อง
   * เปลี่ยนตาม ไม่งั้นเขากดคำว่า "หน้าหลัก"/"ลงเวลา" แล้วเจอคนละเรื่อง
   *   today      → ภาพรวมบริษัท
   *   attendance → ลา & โอที ของทั้งบริษัทรายวัน
   *   wallet     → ค่าจ้างรายวันของบริษัท (สลิปของตัวเองไปอยู่แท็บเพิ่มเติม)
   */
  const isExecutive = flags?.executive ?? false;

  const executiveTab: Partial<Record<TabName, { icon: IconName; title: string }>> = {
    attendance: { icon: 'calendar', title: 'ลา/โอที' },
    today: { icon: 'trending-up', title: 'ภาพรวม' },
    wallet: { icon: 'dollar-sign', title: 'ค่าจ้าง' },
  };

  /*
   * เผื่อพื้นที่ให้แถบปุ่มระบบของ Android
   *
   * SDK 57 เปิด edge-to-edge เป็นค่าเริ่มต้น แอปจึงวาดลงไปใต้แถบปุ่มระบบ
   * พอ tabBarStyle กำหนด height ตายตัว react-navigation ก็ไม่ได้บวก inset
   * ให้เอง ผลคือชื่อแท็บถูกปุ่มย้อนกลับ/โฮมทับบนเครื่องที่ใช้ปุ่ม 3 ปุ่ม
   * (inset ~48dp) ส่วนเครื่องที่ใช้ปัดนิ้วจะเหลือ inset น้อยกว่ามาก
   *
   * บวกเฉพาะ Android — ค่า 78/16 ของ iOS จูนไว้กับ home indicator อยู่แล้ว
   * ถ้าบวกซ้ำแถบจะสูงเกินจริง
   */
  const bottomInset = Platform.OS === 'android' ? insets.bottom : 0;

  return (
    <>
    <Tabs
      initialRouteName="today"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.background },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: theme.colors.textSubtle,
        tabBarLabelStyle: {
          fontFamily: fontFamily.semibold,
          fontSize: 11,
          marginTop: 1,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          elevation: 12,
          height: Platform.select({ android: 68, default: 78 }) + bottomInset,
          paddingBottom:
            Platform.select({ android: 8, default: 16 }) + bottomInset,
          paddingTop: 8,
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: theme.dark ? 0.28 : 0.06,
          shadowRadius: 16,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          /*
            แท็บเพิ่มเติมไม่พาไปจอใหม่ แต่เลื่อนแผงเมนูออกมาจากขอบขวาทับจอเดิม
            — เมนูเป็นแค่ทางผ่านไปจออื่น การทิ้งจอที่กำลังดูอยู่เพื่อเปิดสารบัญ
            แล้วต้องกดกลับเองทำให้เสียจังหวะโดยไม่ได้อะไร
            (ตัวจอ profile ยังอยู่ ไว้ให้ deep link เข้าถึงได้)
          */
          listeners={
            tab.name === 'profile'
              ? {
                  tabPress: (event) => {
                    event.preventDefault();
                    setMoreOpen(true);
                  },
                }
              : undefined
          }
          name={tab.name}
          options={{
            href: isVisible(tab.name) ? undefined : null,
            /*
              ไม่มีไอคอนทึบตอนถูกเลือกแล้ว — Feather เป็นชุดเส้นล้วน สถานะ
              "อยู่แท็บนี้" บอกด้วยสีอย่างเดียว (tabBarActiveTintColor)
              ซึ่งชัดพอและทำให้ทั้งแถบมีน้ำหนักเส้นเท่ากันตลอด
            */
            tabBarIcon: ({ color, size }) => (
              <View style={{ alignItems: 'center' }}>
                {/*
                  ไม่มีจุด ไม่มีเม็ดพื้น — แท็บที่เลือกอยู่บอกด้วย **สี** อย่างเดียว
                  (`tabBarActiveTintColor`) ซึ่งเป็นแนวเดียวกับที่ Feather ตั้งใจ
                  ไว้: ชุดเส้นล้วนที่ไม่มีตัวทึบ ตัวชี้เพิ่มเติมทุกแบบที่ลองมา
                  (เม็ดพื้น จุดใต้ไอคอน) กลายเป็นน้ำหนักส่วนเกินบนแถบที่มีห้าช่อง
                */}
                <Icon
                  color={color}
                  name={
                    (isExecutive && executiveTab[tab.name]?.icon) || tab.icon
                  }
                  size={size}
                />
                {tab.name === 'approvals' ? (
                  <TabBadge count={pendingApprovals} />
                ) : null}
              </View>
            ),
            title:
              (isExecutive && executiveTab[tab.name]?.title) || tab.title,
          }}
        />
      ))}
    </Tabs>

    <MoreDrawer onClose={() => setMoreOpen(false)} visible={moreOpen} />
    </>
  );
}
