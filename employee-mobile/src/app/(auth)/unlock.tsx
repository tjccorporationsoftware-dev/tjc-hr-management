import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog, FingerprintMark, Icon, Text } from '@/design';
import { useResponsive } from '@/design/responsive';
import { AURORA, PressableScale, Reveal } from '@/design/aurora';
import { ProfileAvatar } from '@/features/home/panels';
import { logout } from '@/features/auth/auth.service';
import { useAuthStore } from '@/features/auth/auth.store';
import {
  getBiometricCapability,
  isBiometricEnabled,
  promptBiometric,
  type BiometricCapability,
} from '@/features/auth/biometric';
import { PinDots, PinPad } from '@/features/auth/pin-pad';
import {
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  clearPin,
  verifyPin,
} from '@/features/auth/pin';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * ปลดล็อกด้วย PIN
 *
 * ด่านนี้ไม่คุยกับ backend เลย — session ยังอยู่ครบในเครื่อง PIN แค่เปิดประตู
 * ให้เข้าไปใช้ ผู้ใช้จึงปลดล็อกได้แม้เน็ตล่ม ซึ่งเป็นเหตุผลหลักที่ไม่ทำเป็น
 * การยิงตรวจกับเซิร์ฟเวอร์
 *
 * ใส่ผิดครบเพดาน = ล้าง session ทิ้งแล้วกลับไปหน้าอีเมล/รหัสผ่าน ไม่ใช่แค่
 * หน่วงเวลา — บนเครื่องที่หายไป การหน่วงเวลาแปลว่าคนเก็บได้มีเวลาไม่จำกัด
 */
export default function UnlockScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const unlock = useAuthStore((state) => state.unlock);

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  /*
   * จอนี้พื้นฟ้าอ่อนตลอดทั้งสองโหมด ตัวหนังสือบนแถบสถานะจึงต้องเป็นสีเข้ม
   * แม้ผู้ใช้จะตั้งแอปเป็นโหมดมืด แล้วคืนค่าตามธีมจริงตอนออกจากจอ
   */
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
   * ไบโอเมตริกเป็นทางลัดของ PIN ไม่ใช่ตัวแทน — ปุ่มจะโผล่เมื่อครบสามอย่าง
   * เท่านั้น: เครื่องรองรับ ผู้ใช้เปิดสวิตช์ไว้ และรู้ว่าเป็นใคร
   *
   * เด้งถามอัตโนมัติครั้งเดียวตอนเปิดจอ ไม่เด้งซ้ำหลังผู้ใช้กดยกเลิก —
   * แผ่นที่เด้งกลับมาเรื่อย ๆ ทำให้กดปุ่มตัวเลขไม่ได้เลย
   */
  const [biometric, setBiometric] = useState<BiometricCapability | null>(null);

  /*
   * ออกจากระบบพร้อม **ล้าง PIN ทิ้ง**
   *
   * ทั้งสองทางที่มาถึงฟังก์ชันนี้คือ "เข้าด้วย PIN เดิมไม่ได้แล้ว" — กดลืมรหัส
   * หรือใส่ผิดครบเพดาน ถ้าไม่ล้าง พอล็อกอินกลับมาจะเจอหน้าใส่ PIN เดิมอีกรอบ
   * แล้ววนอยู่ตรงนั้นไม่จบ (การออกจากระบบตามปกติที่อื่นไม่ล้าง PIN แล้ว)
   */
  async function leaveSession(message: string) {
    setBusy(true);
    await clearPin();
    await logout();
    useAuthStore.getState().markUnauthenticated(message);
    router.replace('/login');
  }

  /*
   * หาความสามารถแล้วเด้งถามในรอบเดียว
   *
   * รวมสองอย่างไว้ใน effect เดียวโดยตั้งใจ — ถ้าแยกเป็น effect ที่สองที่คอย
   * ดู `biometric` มันจะ setState แบบ synchronous ทันทีที่ค่าเปลี่ยน ซึ่ง
   * ทำให้เกิด render ซ้อนโดยไม่จำเป็น (และ lint จับได้ถูกแล้ว)
   */
  useEffect(() => {
    let active = true;

    void (async () => {
      if (!user) return;

      const [capability, enabled] = await Promise.all([
        getBiometricCapability(),
        isBiometricEnabled(user.id),
      ]);

      if (!active || !capability.available || !enabled) return;

      setBiometric(capability);
      setBusy(true);

      try {
        const result = await promptBiometric();

        if (!active) return;

        if (result.status === 'ok') {
          unlock();
          router.replace('/');
          return;
        }

        if (result.status === 'failed') {
          setError(result.message);
        }
      } finally {
        if (active) setBusy(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [unlock, user]);

  /** กดปุ่มเองหลังจากยกเลิกแผ่นที่เด้งอัตโนมัติไปแล้ว */
  async function unlockWithBiometric() {
    if (!biometric || busy) return;

    setBusy(true);

    try {
      const result = await promptBiometric();

      if (result.status === 'ok') {
        unlock();
        router.replace('/');
        return;
      }

      if (result.status === 'failed') {
        setError(result.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function attempt(pin: string) {
    if (!user) {
      await leaveSession('เซสชันไม่สมบูรณ์ กรุณาเข้าสู่ระบบใหม่');
      return;
    }

    setBusy(true);

    try {
      const result = await verifyPin(user.id, pin);

      if (result.status === 'ok') {
        unlock();
        router.replace('/');
        return;
      }

      if (result.status === 'exhausted') {
        await leaveSession(
          `ใส่รหัส PIN ผิดครบ ${MAX_PIN_ATTEMPTS} ครั้ง กรุณาเข้าสู่ระบบใหม่`,
        );
        return;
      }

      if (result.status === 'no-pin') {
        /* PIN หายไปจากเครื่องกลางคัน (ล้างข้อมูลแอป/ย้ายเครื่อง) — ให้ตั้งใหม่ */
        useAuthStore.getState().setHasPin(false);
        useAuthStore.getState().unlock();
        router.replace('/set-pin');
        return;
      }

      setValue('');
      setShakeKey((key) => key + 1);
      setError(`รหัส PIN ไม่ถูกต้อง เหลืออีก ${result.remaining} ครั้ง`);
    } finally {
      setBusy(false);
    }
  }

  function handleChange(next: string) {
    if (error) {
      setError(null);
    }

    setValue(next);

    if (next.length === PIN_LENGTH) {
      void attempt(next);
    }
  }

  return (
    /* พื้นขาวล้วน ไม่มีการ์ดครอบ — เหตุผลเดียวกับจอตั้งรหัส (ดู set-pin.tsx) */
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            gap: 20,
            paddingBottom: 36,
            paddingHorizontal: gutter,
            paddingTop: 34,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/*
            --------------------------------------------- ใครกำลังปลดล็อก

            จอนี้ไม่มีหัวจอเหมือนจออื่นในแอป — มันเป็นด่าน ไม่ใช่หน้าที่เดิน
            เข้าออกได้ ไม่มีปุ่มย้อนกลับให้กด และแถบชื่อจอก็พูดซ้ำกับรูปและ
            ชื่อที่อยู่กลางจออยู่แล้ว

            รูปกับชื่ออยู่บนพื้นตรง ๆ ไม่มีการ์ดครอบ (ดูเหตุผลใน set-pin.tsx)
          */}
          <Reveal>
            <View style={{ alignItems: 'center', gap: 5, paddingTop: 10 }}>
              <View style={{ marginBottom: 3 }}>
                <ProfileAvatar
                  name={user?.displayName ?? ''}
                  size={58}
                  url={user?.avatarUrl ?? null}
                />
              </View>

              <Text
                numberOfLines={1}
                style={{ color: AURORA.text, textAlign: 'center' }}
                variant="h2"
              >
                {user?.displayName ?? 'ใส่รหัส PIN'}
              </Text>
              <Text
                style={{
                  color: AURORA.textMuted,
                  lineHeight: 18,
                  textAlign: 'center',
                }}
                variant="caption"
              >
                ใส่รหัส {PIN_LENGTH} หลักเพื่อเข้าใช้งาน
              </Text>

              <View style={{ paddingTop: 16 }}>
                <PinDots
                  filled={value.length}
                  shakeKey={shakeKey}
                  surface="aurora"
                  tone={error ? 'danger' : 'default'}
                />
              </View>

              {/* พื้นที่ข้อความคงที่ ไม่ให้แป้นเด้งขึ้นลงตอนมี/ไม่มีข้อความ */}
              <View style={{ justifyContent: 'center', minHeight: 26 }}>
                {error ? (
                  <Text
                    style={{ color: AURORA.rose, textAlign: 'center' }}
                    variant="caption"
                  >
                    {error}
                  </Text>
                ) : null}
              </View>
            </View>
          </Reveal>

          {/* -------------------------------------------------- แป้นตัวเลข */}
          <Reveal delay={60} style={{ flex: 1, justifyContent: 'center' }}>
            <PinPad
              disabled={busy}
              onChange={handleChange}
              surface="aurora"
              value={value}
            />
          </Reveal>

          {/* ------------------------------------------------ ทางเลือกอื่น */}
          <Reveal delay={120}>
            <View style={{ gap: 4 }}>
              {biometric ? (
                <PressableScale
                  accessibilityLabel={`${biometric.label}ปลดล็อก`}
                  disabled={busy}
                  onPress={() => void unlockWithBiometric()}
                  style={{
                    alignItems: 'center',
                    backgroundColor: AURORA.glassStrong,
                    borderColor: AURORA.glassBorder,
                    borderRadius: 18,
                    borderWidth: 1,
                    flexDirection: 'row',
                    gap: 8,
                    justifyContent: 'center',
                    minHeight: 50,
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {biometric.kind === 'FACE' ? (
                    <Icon color={AURORA.accent} name="maximize" size={20} />
                  ) : (
                    <FingerprintMark color={AURORA.accent} size={20} />
                  )}
                  <Text style={{ color: AURORA.accent, fontWeight: '700' }}>
                    {biometric.label}ปลดล็อก
                  </Text>
                </PressableScale>
              ) : null}

              <PressableScale
                accessibilityLabel="ลืมรหัส PIN เข้าสู่ระบบด้วยอีเมล"
                disabled={busy}
                onPress={() => setConfirmSwitch(true)}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 46,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ color: AURORA.textMuted, fontWeight: '700' }}>
                  ลืมรหัส PIN · เข้าสู่ระบบด้วยอีเมล
                </Text>
              </PressableScale>
            </View>
          </Reveal>
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        confirmLabel="ออกจากระบบ"
        destructive
        message="ระบบจะออกจากระบบเครื่องนี้ แล้วให้เข้าสู่ระบบด้วยอีเมลและรหัสผ่านอีกครั้ง จากนั้นตั้งรหัส PIN ใหม่"
        onCancel={() => setConfirmSwitch(false)}
        onConfirm={() => {
          setConfirmSwitch(false);
          void leaveSession('กรุณาเข้าสู่ระบบเพื่อตั้งรหัส PIN ใหม่');
        }}
        title="ลืมรหัส PIN?"
        visible={confirmSwitch}
      />
    </View>
  );
}
