import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Icon,
  Input,
  KeyboardAwareScroll,
  Text,
  useToast,
} from '@/design';
import { useResponsive } from '@/design/responsive';
import {
  AURORA,
  PageHero,
  PasswordMotif,
  PressableScale,
  Reveal,
} from '@/design/aurora';
import { toAuthErrorView } from '@/features/auth/auth-error';
import { changePassword } from '@/features/auth/auth.service';
import { useAuthStore } from '@/features/auth/auth.store';
import { useAppTheme } from '@/theme/use-app-theme';
import { useVisibleStatusBarStyle } from '@/theme/use-status-bar-style';

/**
 * เปลี่ยนรหัสผ่านของบัญชี
 *
 * โผล่สองกรณีที่กติกาต่างกันชัดเจน เหมือนจอตั้ง PIN:
 *
 *   - **บังคับ** (ไม่มีพารามิเตอร์) — HR สร้างบัญชีให้พร้อมรหัสชั่วคราวที่มัก
 *     เดาง่ายและส่งต่อกันทางแชท ถ้าไม่บังคับเปลี่ยน รหัสนั้นจะอยู่ยาวทั้งปี
 *     จอนี้จึงไม่มีทางออกนอกจากตั้งสำเร็จหรือออกจากระบบ
 *   - **เปลี่ยนเอง** (`?mode=change`) — เข้าจากหน้าความปลอดภัย ยกเลิกได้ตลอด
 *
 * รหัสผ่านคือกุญแจของ **บัญชี** ต่างจาก PIN ที่เป็นกุญแจของ **เครื่องนี้**
 * เปลี่ยนที่นี่แล้วมีผลกับเว็บด้วย ข้อความบนจอจึงต้องบอกให้ชัด ไม่งั้นผู้ใช้
 * จะเข้าใจว่าเป็นรหัสของแอปอย่างเดียว
 */

/* ต้องตรงกับ ChangeOwnPasswordDto ฝั่ง backend (MinLength 10)
   ถ้าตั้งต่ำกว่า ผู้ใช้จะกรอกผ่านหน้าจอแล้วโดน server ตีกลับ งงว่าผิดตรงไหน */
const MIN_LENGTH = 10;

export default function ChangePasswordScreen() {
  const { gutter } = useResponsive();
  const { resolvedMode } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isChanging = params.mode === 'change';

  const markPasswordChanged = useAuthStore((state) => state.markPasswordChanged);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  function cancel() {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  }

  function validate(): string | null {
    if (!currentPassword) return 'กรุณากรอกรหัสผ่านปัจจุบัน';
    if (newPassword.length < MIN_LENGTH) {
      return `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_LENGTH} ตัวอักษร`;
    }
    if (newPassword === currentPassword) {
      return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม';
    }
    if (newPassword !== confirmPassword) {
      return 'ยืนยันรหัสผ่านใหม่ไม่ตรงกัน';
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    setSubmitting(true);

    try {
      await changePassword({ currentPassword, newPassword });
      markPasswordChanged();
      toast.success('เปลี่ยนรหัสผ่านเรียบร้อย');

      if (isChanging && router.canGoBack()) {
        router.back();
        return;
      }

      router.replace('/');
    } catch (error) {
      const view = toAuthErrorView(error);
      setFormError(view.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    /* พื้นขาวล้วน ไม่มีการ์ดครอบ — เหตุผลเดียวกับจอตั้งรหัส (ดู set-pin.tsx) */
    <View style={{ backgroundColor: AURORA.baseDeep, flex: 1 }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.select({ ios: 'padding', default: undefined })}
          style={{ flex: 1 }}
        >
          <KeyboardAwareScroll
            contentContainerStyle={{
              gap: 20,
              paddingBottom: 36,
              paddingHorizontal: gutter,
              paddingTop: 34,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ------------------------------------------------- หัวจอ */}
            <Reveal>
              {/*
                หัวจอตัวเดียวกับหน้าหลัก ลงเวลา และยื่นคำขอ — margin ติดลบหัก
                ระยะขอบของ ScrollView ออก แถบจึงกินเต็มความกว้างจอ

                วงไอคอนเป็นปุ่มยกเลิกเฉพาะตอนผู้ใช้กดเข้ามาเปลี่ยนเอง ส่วนตอน
                ถูกบังคับเปลี่ยนรหัสชั่วคราวไม่มีทางออก วงจึงเป็นลูกกุญแจเฉย ๆ
              */}
              <View style={{ marginHorizontal: -18, marginTop: -34 }}>
                <PageHero
                  decoration={<PasswordMotif />}
                  icon={isChanging ? 'arrow-left' : 'key'}
                  iconLabel={isChanging ? 'ยกเลิก' : undefined}
                  onIconPress={isChanging && !submitting ? cancel : undefined}
                  subtitle={
                    isChanging
                      ? 'ใช้เข้าสู่ระบบทั้งบนแอปและบนเว็บ'
                      : 'เปลี่ยนรหัสชั่วคราวที่ได้จากฝ่ายบุคคลก่อนเริ่มใช้งาน'
                  }
                  title={isChanging ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่านใหม่'}
                />
              </View>
            </Reveal>

            {/* -------------------------------------------------- ฟอร์ม */}
            <Reveal delay={60}>
              <View style={{ gap: 16, paddingTop: 6 }}>
                <Input
                  appearance="aurora"
                  autoCapitalize="none"
                  autoComplete="current-password"
                  label="รหัสผ่านปัจจุบัน"
                  onChangeText={setCurrentPassword}
                  placeholder={
                    isChanging ? 'รหัสที่ใช้อยู่ตอนนี้' : 'รหัสที่ HR ให้มา'
                  }
                  required
                  secureTextEntry
                  textContentType="password"
                  value={currentPassword}
                />

                <Input
                  appearance="aurora"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  hint={`อย่างน้อย ${MIN_LENGTH} ตัวอักษร`}
                  label="รหัสผ่านใหม่"
                  onChangeText={setNewPassword}
                  required
                  secureTextEntry
                  textContentType="newPassword"
                  value={newPassword}
                />

                <Input
                  appearance="aurora"
                  autoCapitalize="none"
                  autoComplete="new-password"
                  error={formError ?? undefined}
                  label="ยืนยันรหัสผ่านใหม่"
                  onChangeText={setConfirmPassword}
                  onSubmitEditing={() => void handleSubmit()}
                  required
                  returnKeyType="done"
                  secureTextEntry
                  textContentType="newPassword"
                  value={confirmPassword}
                />

                {/*
                  คำแนะนำอยู่ต่อท้ายฟอร์ม ไม่ใช่แถบลอยบนหัวจอ — มันคือกติกา
                  ของรหัสที่กำลังจะตั้ง ต้องอ่านตอนคิดรหัส ไม่ใช่ตอนเพิ่งเปิดจอ
                */}
                <View
                  style={{
                    alignItems: 'flex-start',
                    borderTopColor: AURORA.glassBorder,
                    borderTopWidth: 1,
                    flexDirection: 'row',
                    gap: 9,
                    paddingTop: 14,
                  }}
                >
                  <Icon color={AURORA.accent} name="shield" size={17} />
                  <Text
                    maxScale={1.15}
                    style={{
                      color: AURORA.textMuted,
                      flex: 1,
                      lineHeight: 17,
                    }}
                    variant="caption"
                  >
                    อย่าใช้รหัสเดียวกับแอปอื่น และอย่าบอกต่อให้ใครแม้แต่หัวหน้า
                  </Text>
                </View>
              </View>
            </Reveal>

            {/* ------------------------------------------------- ปุ่ม */}
            <Reveal delay={120}>
              <View style={{ gap: 4 }}>
                <PressableScale
                  accessibilityLabel="บันทึกรหัสผ่านใหม่"
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() => void handleSubmit()}
                  style={{
                    alignItems: 'center',
                    backgroundColor: AURORA.accent,
                    borderRadius: 18,
                    flexDirection: 'row',
                    gap: 9,
                    justifyContent: 'center',
                    minHeight: 52,
                    opacity: submitting ? 0.65 : 1,
                    shadowColor: AURORA.accent,
                    shadowOffset: { height: 5, width: 0 },
                    shadowOpacity: 0.22,
                    shadowRadius: 9,
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : null}
                  <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
                  </Text>
                </PressableScale>

                {isChanging ? (
                  <PressableScale
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={cancel}
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 46,
                      opacity: submitting ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ color: AURORA.textMuted, fontWeight: '700' }}>
                      ยกเลิก
                    </Text>
                  </PressableScale>
                ) : null}
              </View>
            </Reveal>
          </KeyboardAwareScroll>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
