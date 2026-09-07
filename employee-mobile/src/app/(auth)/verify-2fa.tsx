import Ionicons from '@expo/vector-icons/Ionicons';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { ErrorBanner } from '@/components/feedback/error-banner';
import { AppTextField } from '@/components/forms/app-text-field';
import { AppButton } from '@/components/ui/app-button';
import { AppCard } from '@/components/ui/app-card';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { toAuthErrorView, type AuthErrorView } from '@/features/auth/auth-error';
import { clearLocalSession, verifyTwoFactor } from '@/features/auth/auth.service';
import { useAuthStore } from '@/features/auth/auth.store';
import { registerCurrentDevice } from '@/features/devices/device.service';
import { useAppTheme } from '@/theme/use-app-theme';
import { thaiTime } from '@/lib/date/thai-date';

const verifyFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'รหัสยืนยันต้องเป็นตัวเลข 6 หลัก'),
});

type VerifyFormValues = z.infer<typeof verifyFormSchema>;

export default function VerifyTwoFactorScreen() {
  const { theme } = useAppTheme();
  const status = useAuthStore((state) => state.status);
  const expiresAt = useAuthStore((state) => state.twoFactorExpiresAt);
  const [submitError, setSubmitError] = useState<AuthErrorView | null>(null);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<VerifyFormValues>({
    defaultValues: { code: '' },
    resolver: zodResolver(verifyFormSchema),
  });

  // เข้าหน้านี้ตรง ๆ โดยไม่มี challenge ค้างอยู่ = ต้องกลับไปเริ่มที่ login
  if (status !== 'two-factor-required') {
    return <Redirect href="/login" />;
  }

  async function onSubmit(values: VerifyFormValues) {
    setSubmitError(null);

    try {
      await verifyTwoFactor(values.code);
      await registerCurrentDevice();
      router.replace('/');
    } catch (error) {
      setSubmitError(toAuthErrorView(error));
    }
  }

  async function onCancel() {
    await clearLocalSession();
    router.replace('/login');
  }

  return (
    <Screen contentContainerStyle={{ justifyContent: 'center' }} scroll>
      <View style={{ gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.sm }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.primarySoft,
              borderRadius: theme.radius.xl,
              height: 58,
              justifyContent: 'center',
              width: 58,
            }}
          >
            <Ionicons
              color={theme.colors.primary}
              name="shield-checkmark-outline"
              size={28}
            />
          </View>

          <AppText variant="h1">ยืนยันตัวตน</AppText>
          <AppText color="muted">
            กรอกรหัสยืนยัน 6 หลักที่ได้รับ เพื่อเข้าใช้งานบัญชีของคุณ
          </AppText>
        </View>

        <AppCard>
          <View style={{ gap: theme.spacing.md }}>
            {submitError ? (
              <ErrorBanner
                message={submitError.message}
                requestId={submitError.requestId}
                title={submitError.title}
              />
            ) : null}

            <Controller
              control={control}
              name="code"
              render={({ field: { onBlur, onChange, value } }) => (
                <AppTextField
                  autoComplete="one-time-code"
                  error={errors.code?.message}
                  icon="keypad-outline"
                  keyboardType="number-pad"
                  label="รหัสยืนยัน"
                  maxLength={6}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  onSubmitEditing={handleSubmit(onSubmit)}
                  placeholder="000000"
                  returnKeyType="go"
                  value={value}
                />
              )}
            />

            {expiresAt ? (
              <AppText color="subtle" variant="caption">
                รหัสหมดอายุเวลา{' '}
                {thaiTime(expiresAt)}
              </AppText>
            ) : null}

            <AppButton
              loading={isSubmitting}
              onPress={handleSubmit(onSubmit)}
              title="ยืนยัน"
            />

            <AppButton
              onPress={onCancel}
              title="ยกเลิกและเข้าสู่ระบบใหม่"
              variant="ghost"
            />
          </View>
        </AppCard>
      </View>
    </Screen>
  );
}
