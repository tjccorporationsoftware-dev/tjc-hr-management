import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ConfirmDialog,
  FingerprintMark,
  Icon,
  SkeletonList,
  Text,
  useToast,
  type IconName,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PressableScale,
  Reveal,
  SectionAction,
  SecurityMotif,
} from '@/design/aurora';
import {
  getBiometricCapability,
  isBiometricEnabled,
  promptBiometric,
  setBiometricEnabled,
  type BiometricCapability,
} from '@/features/auth/biometric';
import { useAuthStore } from '@/features/auth/auth.store';
import { canBlockScreenCapture } from '@/features/auth/screen-privacy';
import {
  useDevices,
  useRevokeDevice,
  useRevokeOtherDevices,
  type MobileDevice,
} from '@/features/devices/devices';
import { ApiError } from '@/lib/api/api-error';
import { useRefetchOnFocus } from '@/lib/query/use-refetch-on-focus';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';
import { thaiDate } from '@/lib/date/thai-date';

/**
 * ความปลอดภัยของบัญชี
 *
 * รวมสองเรื่องที่ผู้ใช้ต้องคุมเองไว้ที่เดียว:
 *   1. วิธีปลดล็อกแอปบนเครื่องนี้ (PIN / ไบโอเมตริก / การบังหน้าจอ)
 *   2. เครื่องที่ยังเข้าบัญชีนี้ได้ — ถอนสิทธิ์เครื่องที่หายได้ทันทีเอง
 *
 * ข้อสองสำคัญกว่าที่ดูเผิน ๆ: เครื่องที่หายไปพร้อม refresh token ยังเปิดสลิป
 * เงินเดือนได้จนกว่า token จะหมดอายุ การให้รอ IT ตอบเมลแปลว่ารอเป็นวัน
 *
 * ## ผิวของจอ
 *
 * พื้นขาวล้วน หัวจอ `PageHero` เต็มความกว้าง แล้วแถวทั้งหมดวางบนพื้นตรง ๆ
 * คั่นด้วยเส้นบาง — ชุดเดียวกับจอตั้งค่าและจอ PIN
 *
 * **ไม่มี `<Glass>`** ทั้งที่เดิมมีสองใบ เพราะจอนี้เป็นรายการล้วน ๆ สองหมวด
 * การ์ดที่ครอบไว้ไม่ได้แบ่งอะไรที่หัวข้อหมวดกับระยะห่างไม่ได้แบ่งอยู่แล้ว
 * มีแต่เพิ่มขอบให้สายตาต้องข้าม (กติกาข้อ 3.5 ใน AGENTS.md)
 */

const PLATFORM_LABEL: Record<string, string> = {
  android: 'Android',
  ios: 'iOS',
};

const dateTimeText = (value: Date | null | undefined) =>
  value
    ? thaiDate(value, {
        day: 'numeric',
        month: 'short',
        time: 'short',
        year: 'numeric',
      })
    : 'ไม่ทราบ';

/** หัวข้อของหมวด — วางบนพื้นจอ ไม่มีการ์ดครอบแล้ว */
function SectionHeading({
  action,
  subtitle,
  title,
}: {
  action?: ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <View
      style={{
        alignItems: 'flex-end',
        flexDirection: 'row',
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: AURORA.text }} variant="h2">
          {title}
        </Text>
        <Text style={{ color: AURORA.textMuted }} variant="caption">
          {subtitle}
        </Text>
      </View>
      {action}
    </View>
  );
}

/**
 * แถวการตั้งค่าหนึ่งบรรทัด
 *
 * รับได้ทั้งแบบกดแล้วไปที่อื่น (มี `onPress`), แบบมีสวิตช์ และแบบอ่านอย่างเดียว
 * ไว้ในหน้าตาเดียวกัน — สามอย่างนี้อยู่ในหมวดเดียวกัน ถ้าเลย์เอาต์ไม่ตรงกัน
 * จะอ่านเหมือนของคนละชุด
 *
 * `mark` มีไว้ให้ไอคอนที่ Feather ไม่มี (ลายนิ้วมือ) ใช้แทน `icon` ได้
 */
function SettingRow({
  divider,
  icon,
  mark,
  muted,
  onPress,
  right,
  subtitle,
  title,
}: {
  divider: boolean;
  icon?: IconName;
  mark?: (color: string) => ReactNode;
  muted?: boolean;
  onPress?: () => void;
  right?: ReactNode;
  subtitle: string;
  title: string;
}) {
  const iconColor = muted ? AURORA.textFaint : AURORA.accent;

  const body = (
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
          backgroundColor: muted ? 'rgba(148,163,184,0.14)' : AURORA.accentSoft,
          borderRadius: 15,
          height: 42,
          justifyContent: 'center',
          width: 42,
        }}
      >
        {mark ? mark(iconColor) : icon ? (
          <Icon color={iconColor} name={icon} size={19} />
        ) : null}
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={{
            color: muted ? AURORA.textMuted : AURORA.text,
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={3}
          style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 16 }}
        >
          {subtitle}
        </Text>
      </View>

      {right ??
        (onPress ? (
          <Icon color={AURORA.textFaint} name="chevron-right" size={18} />
        ) : null)}
    </View>
  );

  if (!onPress) return body;

  return (
    <PressableScale accessibilityRole="button" onPress={onPress}>
      {body}
    </PressableScale>
  );
}

/**
 * หนึ่งอุปกรณ์
 *
 * เครื่องที่ใช้อยู่ได้ป้ายฟ้า ส่วนเครื่องอื่นได้ปุ่มถอนสิทธิ์สีชมพู — เดิมทั้งสอง
 * แบบเป็น "ป้าย" เหมือนกัน ทำให้ป้าย "ถอนสิทธิ์" อ่านเป็นสถานะของเครื่อง
 * แทนที่จะเป็นปุ่มที่กดได้
 */
function DeviceRow({
  device,
  divider,
  onRevoke,
}: {
  device: MobileDevice;
  divider: boolean;
  onRevoke: () => void;
}) {
  const title = device.deviceName || device.deviceModel || 'อุปกรณ์ไม่ระบุชื่อ';
  const meta = [
    PLATFORM_LABEL[device.platform ?? ''] ?? device.platform,
    device.appVersion ? `เวอร์ชัน ${device.appVersion}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale
      accessibilityLabel={`ถอนสิทธิ์ ${title}`}
      accessibilityRole="button"
      onPress={onRevoke}
      style={{
        alignItems: 'center',
        borderTopColor: AURORA.glassBorder,
        borderTopWidth: divider ? 1 : 0,
        flexDirection: 'row',
        gap: 12,
        minHeight: 78,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: device.isCurrentDevice
            ? AURORA.accentSoft
            : 'rgba(148,163,184,0.14)',
          borderRadius: 15,
          height: 42,
          justifyContent: 'center',
          width: 42,
        }}
      >
        <Icon
          color={device.isCurrentDevice ? AURORA.accent : AURORA.textMuted}
          name="smartphone"
          size={19}
        />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
          <Text
            numberOfLines={1}
            style={{
              color: AURORA.text,
              flexShrink: 1,
              fontSize: 14,
              fontWeight: '600',
            }}
          >
            {title}
          </Text>
          {device.isCurrentDevice ? (
            /* ป้ายพื้นทึบสงวนไว้ให้ "ประเภท/ตัวตน" — เครื่องนี้คือเครื่องไหน */
            <View
              style={{
                backgroundColor: AURORA.accentSoft,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text
                maxScale={1.1}
                style={{
                  color: AURORA.accent,
                  fontSize: 10.5,
                  fontWeight: '700',
                }}
              >
                เครื่องนี้
              </Text>
            </View>
          ) : null}
        </View>
        {meta ? (
          <Text
            numberOfLines={1}
            style={{ color: AURORA.textMuted, fontSize: 11, lineHeight: 16 }}
          >
            {meta}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          style={{ color: AURORA.textFaint, fontSize: 11, lineHeight: 16 }}
        >
          ใช้ล่าสุด {dateTimeText(device.lastSeenAt)}
        </Text>
      </View>

      <View
        style={{
          alignItems: 'center',
          backgroundColor: 'rgba(225,29,72,0.09)',
          borderRadius: 999,
          height: 34,
          justifyContent: 'center',
          width: 34,
        }}
      >
        <Icon color={AURORA.rose} name="x" size={17} />
      </View>
    </PressableScale>
  );
}

export default function SecurityScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const user = useAuthStore((state) => state.user);

  const devices = useDevices();
  const revokeDevice = useRevokeDevice();
  const revokeOthers = useRevokeOtherDevices();

  useRefetchOnFocus(devices);

  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [biometricOn, setBiometricOn] = useState(false);
  const [pendingDevice, setPendingDevice] = useState<MobileDevice | null>(null);
  const [confirmRevokeOthers, setConfirmRevokeOthers] = useState(false);

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
    let active = true;

    void (async () => {
      if (!user) return;

      const [found, enabled] = await Promise.all([
        getBiometricCapability(),
        isBiometricEnabled(user.id),
      ]);

      if (!active) return;

      setCapability(found);
      setBiometricOn(enabled);
    })();

    return () => {
      active = false;
    };
  }, [user]);

  /**
   * เปิดสวิตช์ต้องยืนยันด้วยไบโอเมตริกก่อนหนึ่งครั้ง
   *
   * ไม่ใช่พิธีกรรม — เป็นการพิสูจน์ว่าเซนเซอร์อ่านนิ้ว/หน้าของ **คนที่ถือ
   * เครื่องอยู่ตอนนี้** ได้จริง ถ้าไม่ทดสอบก่อน ผู้ใช้จะรู้ตัวว่าใช้ไม่ได้
   * ตอนถูกล็อกหน้าแอปแล้ว ซึ่งเป็นตอนที่แก้อะไรไม่ได้
   *
   * ส่วนการปิดไม่ต้องยืนยัน — การปิดทำให้ปลอดภัยขึ้น ไม่ใช่ลดลง
   */
  async function toggleBiometric(next: boolean) {
    if (!user) return;

    if (!next) {
      await setBiometricEnabled(user.id, false);
      setBiometricOn(false);
      toast.success('ปิดการปลดล็อกด้วยไบโอเมตริกแล้ว');
      return;
    }

    const result = await promptBiometric('ยืนยันเพื่อเปิดใช้งานบนเครื่องนี้');

    if (result.status !== 'ok') {
      if (result.status === 'failed') toast.error(result.message);
      return;
    }

    await setBiometricEnabled(user.id, true);
    setBiometricOn(true);
    toast.success('เปิดการปลดล็อกด้วยไบโอเมตริกแล้ว');
  }

  async function handleRevoke(device: MobileDevice) {
    try {
      await revokeDevice.mutateAsync(device.id);
      setPendingDevice(null);

      if (device.isCurrentDevice) {
        /* ถอนเครื่องตัวเอง = ถูกไล่ออกจากระบบ ซึ่งเป็นผลที่ตั้งใจ */
        toast.success('ถอนสิทธิ์เครื่องนี้แล้ว กรุณาเข้าสู่ระบบใหม่');
        return;
      }

      toast.success('ถอนสิทธิ์อุปกรณ์เรียบร้อย');
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'ถอนสิทธิ์ไม่สำเร็จ',
      );
    }
  }

  const list = devices.data?.data ?? [];
  const otherCount = list.filter((device) => !device.isCurrentDevice).length;

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
          /*
           * ดึงเพื่อรีเฟรชมีเฉพาะบนมือถือ — react-native-web ไม่ได้ทำ
           * RefreshControl ให้ครบ มันส่ง prop อย่าง refreshing ลงไปเป็น
           * attribute ของ DOM ตรง ๆ แล้วขึ้น error แดงคาจอตอน dev
           */
          refreshControl={
            Platform.OS === 'web' ? undefined : (
              <RefreshControl
                onRefresh={() => void devices.refetch()}
                refreshing={devices.isRefetching}
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
                decoration={<SecurityMotif />}
                icon="arrow-left"
                iconLabel="ย้อนกลับ"
                onIconPress={() => router.back()}
                subtitle="การปลดล็อกและอุปกรณ์ที่เข้าใช้งานได้"
                title="ความปลอดภัย"
              />
            </View>
          </Reveal>

          {/* --------------------------------------- การปลดล็อกแอป */}
          <Reveal delay={60} style={{ marginTop: -12 }}>
            <View style={{ gap: 6 }}>
              <SectionHeading
                subtitle="ตั้งค่าเฉพาะเครื่องนี้ ไม่มีผลกับเครื่องอื่น"
                title="การปลดล็อกแอป"
              />

              {/*
                รหัสผ่านมาก่อน PIN โดยตั้งใจ — รหัสผ่านคือกุญแจของ "บัญชี"
                (ใช้ได้ทั้งเว็บและทุกเครื่อง) ส่วน PIN เป็นกุญแจของเครื่องนี้
                เครื่องเดียว ถ้าเรียง PIN ไว้บนสุดผู้ใช้จะเข้าใจว่า PIN คือ
                รหัสของบัญชี
              */}
              <SettingRow
                divider={false}
                icon="key"
                onPress={() =>
                  router.push({
                    params: { mode: 'change' },
                    pathname: '/change-password',
                  })
                }
                subtitle="ใช้เข้าสู่ระบบทั้งบนแอปและบนเว็บ"
                title="เปลี่ยนรหัสผ่าน"
              />

              <SettingRow
                divider
                icon="lock"
                onPress={() =>
                  router.push({
                    params: { mode: 'change' },
                    pathname: '/set-pin',
                  })
                }
                subtitle="ใช้เข้าแอปบนเครื่องนี้ทุกครั้งหลังปิดไว้นาน"
                title="เปลี่ยนรหัส PIN"
              />

              {capability?.available ? (
                <SettingRow
                  divider
                  mark={(color) => <FingerprintMark color={color} size={19} />}
                  right={
                    <Switch
                      accessibilityLabel={`${capability.label}ปลดล็อก`}
                      onValueChange={(value) => void toggleBiometric(value)}
                      value={biometricOn}
                    />
                  }
                  subtitle="ใช้แทนการพิมพ์ PIN — รหัส PIN ยังใช้ได้เสมอเป็นทางสำรอง"
                  title={`${capability.label}ปลดล็อก`}
                />
              ) : (
                <SettingRow
                  divider
                  mark={(color) => <FingerprintMark color={color} size={19} />}
                  muted
                  subtitle="เครื่องนี้ยังไม่ได้ตั้งลายนิ้วมือหรือใบหน้าไว้ในระบบ ตั้งในการตั้งค่าของเครื่องก่อนจึงจะเปิดได้"
                  title="ปลดล็อกด้วยไบโอเมตริก"
                />
              )}

              <SettingRow
                divider
                icon="eye-off"
                muted
                subtitle={
                  canBlockScreenCapture
                    ? 'หน้าสลิปเงินเดือนและเอกสารภาษีถ่ายภาพหน้าจอไม่ได้ และแอปจะบังหน้าจอทุกครั้งที่สลับไปแอปอื่น'
                    : 'แอปจะบังหน้าจอทุกครั้งที่สลับไปแอปอื่น สำหรับ iOS ระบบไม่อนุญาตให้ปิดการถ่ายภาพหน้าจอ'
                }
                title="การปกป้องหน้าจอ"
              />
            </View>
          </Reveal>

          {/* -------------------------------------------- อุปกรณ์ */}
          <Reveal delay={120}>
            <View style={{ gap: 6 }}>
              <SectionHeading
                action={
                  otherCount > 0 ? (
                    <PressableScale
                      accessibilityRole="button"
                      onPress={() => setConfirmRevokeOthers(true)}
                      style={{ paddingVertical: 2 }}
                    >
                      <Text
                        style={{ color: AURORA.rose, fontWeight: '700' }}
                        variant="caption"
                      >
                        ถอนเครื่องอื่นทั้งหมด
                      </Text>
                    </PressableScale>
                  ) : undefined
                }
                subtitle="แตะที่อุปกรณ์เพื่อถอนสิทธิ์"
                title={`อุปกรณ์ที่เข้าได้ (${list.length})`}
              />

              {devices.isPending ? (
                <View style={{ paddingTop: 10 }}>
                  <SkeletonList rows={3} />
                </View>
              ) : devices.isError ? (
                <View style={{ gap: 6, paddingTop: 12 }}>
                  <Text style={{ color: AURORA.text }} variant="bodyStrong">
                    ยังโหลดรายการอุปกรณ์ไม่ได้
                  </Text>
                  <Text style={{ color: AURORA.textMuted }} variant="caption">
                    {devices.error instanceof ApiError
                      ? devices.error.message
                      : 'กรุณาลองใหม่อีกครั้ง'}
                  </Text>
                  <SectionAction
                    label={devices.isRefetching ? 'กำลังโหลด...' : 'ลองใหม่'}
                    onPress={() => void devices.refetch()}
                  />
                </View>
              ) : list.length === 0 ? (
                <View
                  style={{
                    alignItems: 'center',
                    gap: 7,
                    paddingHorizontal: 20,
                    paddingVertical: 28,
                  }}
                >
                  <Icon color={AURORA.accent} name="smartphone" size={28} />
                  <Text style={{ color: AURORA.text }} variant="bodyStrong">
                    ยังไม่มีอุปกรณ์ที่ลงทะเบียนไว้
                  </Text>
                  <Text
                    style={{ color: AURORA.textMuted, textAlign: 'center' }}
                    variant="caption"
                  >
                    เครื่องที่เข้าสู่ระบบด้วยบัญชีนี้จะมาแสดงที่นี่
                  </Text>
                </View>
              ) : (
                list.map((device, index) => (
                  <DeviceRow
                    device={device}
                    divider={index > 0}
                    key={device.id}
                    onRevoke={() => setPendingDevice(device)}
                  />
                ))
              )}
            </View>
          </Reveal>
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        confirmLabel="ถอนสิทธิ์"
        destructive
        loading={revokeDevice.isPending}
        message={
          pendingDevice?.isCurrentDevice
            ? 'นี่คือเครื่องที่คุณใช้อยู่ ถอนสิทธิ์แล้วจะถูกออกจากระบบทันทีและต้องเข้าสู่ระบบใหม่'
            : `${pendingDevice?.deviceName ?? 'อุปกรณ์นี้'} จะเข้าใช้งานบัญชีของคุณไม่ได้อีก และการแจ้งเตือนจะหยุดส่งไปเครื่องนั้น`
        }
        onCancel={() => setPendingDevice(null)}
        onConfirm={() => {
          if (pendingDevice) void handleRevoke(pendingDevice);
        }}
        title="ถอนสิทธิ์อุปกรณ์?"
        visible={Boolean(pendingDevice)}
      />

      <ConfirmDialog
        confirmLabel="ถอนทั้งหมด"
        destructive
        loading={revokeOthers.isPending}
        message={`อุปกรณ์อื่นอีก ${otherCount} เครื่องจะเข้าใช้งานบัญชีนี้ไม่ได้ทันที เครื่องที่คุณใช้อยู่ตอนนี้จะยังใช้งานได้ตามปกติ`}
        onCancel={() => setConfirmRevokeOthers(false)}
        onConfirm={() => {
          setConfirmRevokeOthers(false);
          void revokeOthers
            .mutateAsync()
            .then(() => toast.success('ถอนสิทธิ์เครื่องอื่นทั้งหมดแล้ว'))
            .catch((error: unknown) =>
              toast.error(
                error instanceof ApiError ? error.message : 'ถอนสิทธิ์ไม่สำเร็จ',
              ),
            );
        }}
        title="ถอนสิทธิ์เครื่องอื่นทั้งหมด?"
        visible={confirmRevokeOthers}
      />
    </View>
  );
}
