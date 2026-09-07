import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog, Icon, Text, hitSlop } from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  MoreMotif,
  PageHero,
  PressableScale,
} from '@/design/aurora';
import { logout } from '@/features/auth/auth.service';
import {
  useMoreItems,
  type MoreGroup,
  type MoreItem,
} from '@/features/more/more-menu';

/** เวลาเลื่อนเข้า/ออก — สั้นพอให้รู้สึกว่าติดมือ ไม่ใช่รอแอนิเมชัน */
const SLIDE_MS = 220;

/** แผงกว้างเกือบเต็มจอแต่เหลือขอบซ้ายไว้ให้เห็นว่าจอเดิมยังอยู่ข้างหลัง */
const MAX_PANEL_WIDTH = 380;

/** สีประจำหมวด — กระเบื้องไอคอนของแต่ละหมวดคนละสี จะได้กวาดตาหาได้เร็ว */
/**
 * สีไอคอนของแต่ละกลุ่ม — ฟ้าเดียวกันหมด
 *
 * เดิมกลุ่มตั้งค่าเป็นเทาและห้องผู้บริหารเป็นเขียว ซึ่งเคยแยกออกจากกันด้วย
 * หัวข้อหมวด พอเมนูมารวมเป็นรายการเดียว สีที่ต่างกันไม่ได้บอกอะไรอีกแล้ว
 * เหลือแค่แถวเดียวที่ดูจางกว่าเพื่อนโดยไม่มีเหตุผล
 */
const GROUP_COLOR: Record<MoreGroup, string> = {
  app: AURORA.accent,
  exec: AURORA.accent,
  me: AURORA.accent,
  team: AURORA.accent,
};

function MoreRow({
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
  const tint = soon ? AURORA.textFaint : GROUP_COLOR[item.group];

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
        opacity: soon ? 0.75 : 1,
      })}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: gutter,
          paddingVertical: 11,
        }}
      >
        <View
          style={{
            alignItems: 'center',
            backgroundColor: `${tint}16`,
            borderRadius: 13,
            height: 40,
            justifyContent: 'center',
            width: 40,
          }}
        >
          <Icon color={tint} name={item.icon} size={18} />
        </View>

        <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: soon ? AURORA.textMuted : AURORA.text,
              fontSize: 13.5,
              fontWeight: '700',
              lineHeight: 18,
            }}
          >
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                color: AURORA.textFaint,
                fontSize: 11,
                lineHeight: 15,
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
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text
              maxScale={1.1}
              style={{
                color: AURORA.textMuted,
                fontSize: 10,
                fontWeight: '700',
                lineHeight: 14,
              }}
            >
              เร็ว ๆ นี้
            </Text>
          </View>
        ) : (
          <Icon color={AURORA.textFaint} name="chevron-right" size={16} />
        )}
      </View>
    </Pressable>
  );
}

/**
 * เมนู "เพิ่มเติม" แบบแผงเลื่อนออกมาจากขอบขวา
 *
 * เดิมเป็นจอเต็มในแท็บ ซึ่งทำให้ทุกครั้งที่จะเข้าเมนูต้องทิ้งจอที่กำลังดูอยู่
 * แล้วกดกลับเอง ทั้งที่เมนูเป็นแค่ทางผ่านไปจออื่น — แผงเลื่อนวางทับจอเดิม
 * เลือกเสร็จก็ปิดกลับมาที่เดิมได้ทันที
 *
 * ใช้ `Modal` ของ RN เพื่อให้แผงคลุมแถบแท็บด้านล่างด้วย ไม่งั้นแถบแท็บจะโผล่
 * ทับแผงและกดโดนของข้างหลังได้
 */
export function MoreDrawer({
  onClose,
  visible,
}: {
  onClose: () => void;
  visible: boolean;
}) {
  const { gutter } = useResponsive();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.88, MAX_PANEL_WIDTH);
  const items = useMoreItems();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  /*
   * ค่าอนิเมชันเก็บใน state initializer ไม่ใช่ ref — React Compiler ห้ามอ่าน
   * ref ระหว่าง render ซึ่ง `interpolate` ตอนวาด transform ทำอยู่พอดี
   */
  const [progress] = useState(() => new Animated.Value(0));

  /*
   * ขาเข้าเลื่อนเอง ส่วนขาออกปล่อยให้ `animationType="fade"` ของ Modal จัดการ
   * — ถ้าจะเลื่อนออกเองต้องหน่วงการถอด Modal ไว้ด้วย state ที่ตั้งค่าใน effect
   * ซึ่งเป็นสิ่งที่ React Compiler ห้าม และไม่คุ้มกับเสี้ยววินาทีที่ได้มา
   */
  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }

    const animation = Animated.timing(progress, {
      duration: SLIDE_MS,
      toValue: 1,
      useNativeDriver: true,
    });

    animation.start();

    return () => animation.stop();
  }, [progress, visible]);

  function handleNavigate(href: Href) {
    onClose();
    router.push(href);
  }

  function handleLogout() {
    setLoggingOut(true);
    void logout().finally(() => {
      setLoggingOut(false);
      setConfirmVisible(false);
      onClose();
    });
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Animated.View style={{ flex: 1, opacity: progress }}>
          <Pressable
            accessibilityLabel="ปิดเมนู"
            accessibilityRole="button"
            onPress={onClose}
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)', flex: 1 }}
          />
        </Animated.View>

        <Animated.View
          style={{
            backgroundColor: AURORA.baseDeep,
            elevation: 24,
            /* +10 เพราะชนแถบสถานะพอดีเป๊ะแล้วหัวแผงดูเหมือนถูกตัดขอบบน */
            paddingTop: insets.top + 10,
            shadowColor: '#0f172a',
            shadowOffset: { height: 0, width: -6 },
            shadowOpacity: 0.22,
            shadowRadius: 24,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [panelWidth, 0],
                }),
              },
            ],
            width: panelWidth,
          }}
        >
          {/*
            หัวแผงเป็นชุดเดียวกับหัวจออื่น ๆ (แถบน้ำเงินโค้งริมซ้าย พื้นขาว
            พร้อมลายประจำแผง) — แถบน้ำเงินเต็มความกว้างพร้อมชื่อผู้ใช้ทำให้แผง
            กลายเป็นอีกแอปหนึ่ง และชื่อ/ตำแหน่งก็มีอยู่แล้วในจอข้อมูลพนักงาน
            ซึ่งอยู่ห่างไปแค่แถวแรก

            ระยะห่างจากแถบสถานะไปอยู่ที่ตัวแผง (`paddingTop`) ไม่ใช่ที่หัวจอ
            เพราะแผงนี้เลื่อนเข้ามาทับจออื่น ไม่ได้เริ่มที่ขอบบนของจอเหมือน
            จอปกติ ชนพอดีเป๊ะแล้วหัวแผงจะดูเหมือนถูกตัดขอบบน
          */}
          <View>
            <PageHero
              decoration={<MoreMotif />}
              icon="more-horizontal"
              right={
                <PressableScale
                  accessibilityLabel="ปิดเมนู"
                  accessibilityRole="button"
                  hitSlop={hitSlop}
                  onPress={onClose}
                  style={{
                    alignItems: 'center',
                    backgroundColor: AURORA.accentSoft,
                    borderRadius: 999,
                    height: 38,
                    justifyContent: 'center',
                    width: 38,
                  }}
                >
                  <Icon color={AURORA.accent} name="x" size={19} />
                </PressableScale>
              }
              subtitle="ข้อมูลพนักงาน บริการ และการตั้งค่าแอป"
              title="เพิ่มเติม"
            />
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            {/*
              รายการเดียวเรียงต่อกัน ไม่มีหัวข้อหมวดคั่น — สิบกว่าแถวที่ถูกซอย
              เป็นสามหมวดทำให้ต้องอ่านหัวข้อก่อนถึงจะรู้ว่าของที่หาอยู่หมวดไหน
              ทั้งที่ชื่อเมนูบอกตัวเองอยู่แล้ว และแถบหัวข้อยังกินความสูงไปอีก
              สามแถบบนแผงที่ต้องเลื่อนอยู่แล้ว
            */}
            {items.map((item, index) => (
              <MoreRow
                divider={index > 0}
                item={item}
                key={String(item.href)}
                onPress={() => handleNavigate(item.href)}
              />
            ))}
          </ScrollView>

          <View
            style={{
              borderTopColor: AURORA.glassBorder,
              borderTopWidth: 1,
              paddingBottom: Math.max(insets.bottom, 14),
              paddingHorizontal: gutter,
              paddingTop: 12,
            }}
          >
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
        </Animated.View>
      </View>

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
    </Modal>
  );
}
