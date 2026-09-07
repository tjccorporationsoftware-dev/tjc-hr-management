import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Text, useToast } from '@/design';
import { useResponsive } from '@/design/responsive';
import { AURORA, PressableScale, Reveal } from '@/design/aurora';
import { logout } from '@/features/auth/auth.service';
import { useAuthStore } from '@/features/auth/auth.store';
import { PinDots, PinPad } from '@/features/auth/pin-pad';
import {
  PIN_FORMAT_MESSAGE,
  PIN_LENGTH,
  clearPin,
  setPin,
  validatePinFormat,
  verifyPin,
} from '@/features/auth/pin';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * ตั้งรหัส PIN
 *
 * โผล่สองกรณีซึ่งกติกาต่างกันชัดเจน:
 *
 *   - **ครั้งแรกหลังล็อกอินด้วยอีเมล** — บังคับ ไม่มีทางข้าม ไม่มีปุ่มย้อนกลับ
 *     เพราะยังไม่มี PIN เก่าให้ยืนยัน และแอปเข้าไม่ได้ถ้าไม่ตั้ง
 *   - **กดเปลี่ยนเองจากหน้าตั้งค่า** (`?mode=change`) — **ต้องยืนยันรหัสเดิมก่อน**
 *     และยกเลิกได้ตลอด
 *
 * ## ทำไมต้องยืนยันรหัสเดิม
 *
 * เดิมกดเข้ามาแล้วตั้งใหม่ได้เลย ซึ่งแปลว่าใครก็ตามที่หยิบเครื่องที่ปลดล็อกอยู่
 * ไปเปิดแอป (ซึ่งคือสิ่งเดียวที่ PIN มีหน้าที่กัน) เปลี่ยน PIN ทับได้ในสามแตะ
 * แล้วเจ้าของเครื่องเข้าแอปตัวเองไม่ได้อีก — ด่านที่ยกเลิกตัวเองได้ไม่ใช่ด่าน
 *
 * ใส่รหัสเดิมผิดนับรวมกับเพดานเดียวกับหน้าปลดล็อก (5 ครั้ง = ล้าง session)
 * ไม่ได้ผ่อนให้เพราะอยู่ในแอปแล้ว — คนที่หยิบเครื่องไปก็อยู่ในแอปแล้วเหมือนกัน
 *
 * ทุกอย่างเกิดใน handler ของแป้น ไม่ใช้ effect คอยจับความยาว — effect ที่
 * setState ต่อทันทีทำให้ render ซ้อนกันโดยไม่จำเป็น (และ lint ห้ามไว้)
 */

type Step = 'current' | 'first' | 'confirm';

const STEP_COPY: Record<Step, { subtitle: string; title: string }> = {
  confirm: {
    subtitle: 'พิมพ์รหัสใหม่อีกครั้งเพื่อยืนยันว่าไม่ได้กดพลาด',
    title: 'ยืนยันรหัสใหม่',
  },
  current: {
    subtitle: 'ใส่รหัส PIN ที่ใช้อยู่ตอนนี้ เพื่อยืนยันว่าเป็นคุณจริง',
    title: 'ยืนยันรหัสเดิม',
  },
  first: {
    subtitle: `ใช้ ${PIN_LENGTH} หลักนี้เปิดแอปครั้งต่อไป แทนการกรอกอีเมลและรหัสผ่าน`,
    title: 'ตั้งรหัสใหม่',
  },
};

export default function SetPinScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isChanging = params.mode === 'change';

  const user = useAuthStore((state) => state.user);
  const setHasPin = useAuthStore((state) => state.setHasPin);
  const unlock = useAuthStore((state) => state.unlock);

  const [current, setCurrent] = useState('');
  const [first, setFirst] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<Step>(isChanging ? 'current' : 'first');
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [busy, setBusy] = useState(false);

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

  const value = step === 'current' ? current : step === 'first' ? first : confirm;
  const copy = STEP_COPY[step];

  const fail = (message: string) => {
    setError(message);
    setShakeKey((key) => key + 1);
  };

  /** กลับไปเริ่มขั้นตอนตั้งรหัสใหม่ ไม่ย้อนไปถามรหัสเดิมซ้ำ */
  const restartNewPin = (message: string) => {
    fail(message);
    setFirst('');
    setConfirm('');
    setStep('first');
  };

  function cancel() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  }

  /* มาถึงตรงนี้แปลว่าจำรหัสเดิมไม่ได้ ล้างทิ้งก่อนออก ไม่งั้นกลับมาก็ติดซ้ำ */
  async function leaveSession(message: string) {
    setBusy(true);
    await clearPin();
    await logout();
    useAuthStore.getState().markUnauthenticated(message);
    router.replace('/login');
  }

  async function save(pin: string) {
    if (!user) {
      restartNewPin('ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่');
      return;
    }

    setBusy(true);

    try {
      await setPin(user.id, pin);

      setHasPin(true);
      unlock();
      toast.success(
        isChanging ? 'เปลี่ยนรหัส PIN แล้ว' : 'ตั้งรหัส PIN เรียบร้อย',
      );

      if (isChanging && router.canGoBack()) {
        router.back();
        return;
      }

      router.replace('/');
    } catch (cause) {
      restartNewPin(
        cause instanceof Error ? cause.message : 'บันทึกรหัส PIN ไม่สำเร็จ',
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkCurrent(pin: string) {
    if (!user) {
      await leaveSession('เซสชันไม่สมบูรณ์ กรุณาเข้าสู่ระบบใหม่');
      return;
    }

    setBusy(true);

    try {
      const result = await verifyPin(user.id, pin);

      /* ไม่มี PIN ในเครื่องแปลว่าไม่มีอะไรให้ยืนยัน ข้ามไปตั้งใหม่ได้เลย */
      if (result.status === 'ok' || result.status === 'no-pin') {
        setCurrent('');
        setError(null);
        setStep('first');
        return;
      }

      if (result.status === 'exhausted') {
        await leaveSession('ใส่รหัส PIN ผิดหลายครั้งเกินไป กรุณาเข้าสู่ระบบใหม่');
        return;
      }

      setCurrent('');
      fail(`รหัสเดิมไม่ถูกต้อง เหลืออีก ${result.remaining} ครั้ง`);
    } finally {
      setBusy(false);
    }
  }

  function handleChange(next: string) {
    if (error) {
      setError(null);
    }

    if (step === 'current') {
      setCurrent(next);

      if (next.length < PIN_LENGTH) return;

      void checkCurrent(next);
      return;
    }

    if (step === 'first') {
      setFirst(next);

      if (next.length < PIN_LENGTH) return;

      const invalid = validatePinFormat(next);

      if (invalid) {
        fail(PIN_FORMAT_MESSAGE[invalid]);
        setFirst('');
        return;
      }

      /*
       * ห้ามตั้งรหัสเดิมซ้ำ — ผู้ใช้ที่มาเปลี่ยนเพราะสงสัยว่ามีคนรู้รหัส
       * จะได้ไม่กดผ่านสามจอแล้วออกไปโดยที่รหัสยังเป็นตัวเดิม
       */
      if (isChanging && next === current) {
        fail('รหัสใหม่ต้องไม่ซ้ำกับรหัสเดิม');
        setFirst('');
        return;
      }

      setStep('confirm');
      return;
    }

    setConfirm(next);

    if (next.length < PIN_LENGTH) return;

    if (next !== first) {
      restartNewPin('รหัสสองครั้งไม่ตรงกัน กรุณาตั้งใหม่');
      return;
    }

    void save(next);
  }

  return (
    /*
      พื้นขาวล้วน ไม่มีฉากออโรราและไม่มีการ์ด — จอนี้ทำงานเดียวคือรับตัวเลข
      หกหลัก การ์ดที่ครอบเนื้อหาไว้ทำให้เกิดกล่องซ้อนกล่อง (แผ่นการ์ดบนฉาก
      ฟ้า แล้วมีเม็ดรหัสกับปุ่มขาวซ้อนอยู่ในนั้นอีก) โดยไม่ได้แบ่งอะไรเลย
      เพราะทั้งจอมีบล็อกเดียวอยู่แล้ว

      พอเป็นพื้นขาว ปุ่มแป้นที่เป็นวงขาวจึงต้องพึ่งขอบกับเงาของตัวเองเต็ม ๆ
      (ตั้งไว้แล้วใน `pin-pad.tsx`)
    */
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
            ------------------------------------------- ขั้นตอนปัจจุบัน

            จอนี้ไม่มีหัวจอ — ต่างจากจออื่นทั้งแอปโดยตั้งใจ มันไม่ใช่หน้าที่
            เดินเข้าไปดูของ แต่เป็นด่านที่มีงานเดียวคือรับตัวเลข ชื่อจอบน
            แถบหัวจอพูดซ้ำกับหัวข้อกลางจอ ("เปลี่ยนรหัส PIN" เหนือ "ยืนยัน
            รหัสเดิม") และกินความสูงที่ควรเป็นของแป้น

            ทางออกอยู่ที่ปุ่ม "ยกเลิก" ท้ายจอ ซึ่งมีอยู่แล้วและอยู่ใกล้นิ้ว
            กว่าปุ่มย้อนกลับมุมบนซ้าย
          */}
          <Reveal>
            <View style={{ alignItems: 'center', gap: 5, paddingTop: 10 }}>
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: error ? 'rgba(225,29,72,0.1)' : AURORA.accentSoft,
                  borderRadius: 999,
                  height: 52,
                  justifyContent: 'center',
                  marginBottom: 3,
                  width: 52,
                }}
              >
                <Icon
                  color={error ? AURORA.rose : AURORA.accent}
                  name={
                    step === 'current'
                      ? 'lock'
                      : step === 'first'
                        ? 'key'
                        : 'check-circle'
                  }
                  size={23}
                />
              </View>

              <Text
                style={{ color: AURORA.text, textAlign: 'center' }}
                variant="h2"
              >
                {copy.title}
              </Text>
              <Text
                style={{
                  color: AURORA.textMuted,
                  lineHeight: 18,
                  paddingHorizontal: 6,
                  textAlign: 'center',
                }}
                variant="caption"
              >
                {copy.subtitle}
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

          {/* ------------------------------------------------- แป้นตัวเลข */}
          <Reveal delay={60} style={{ flex: 1, justifyContent: 'center' }}>
            <PinPad
              disabled={busy}
              onChange={handleChange}
              surface="aurora"
              value={value}
            />
          </Reveal>

          {isChanging ? (
            <Reveal delay={120}>
              <PressableScale
                accessibilityRole="button"
                disabled={busy}
                onPress={cancel}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 46,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ color: AURORA.textMuted, fontWeight: '700' }}>
                  ยกเลิก
                </Text>
              </PressableScale>
            </Reveal>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
