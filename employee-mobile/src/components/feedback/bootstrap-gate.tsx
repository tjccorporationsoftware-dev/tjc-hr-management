import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppCard } from '@/components/ui/app-card';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { useAppTheme } from '@/theme/use-app-theme';

interface BlockingStateProps {
  actionLabel?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  message: string;
  onAction?: () => void;
  requestId?: string | null;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
  title: string;
}

/** หน้าจอที่บล็อกผู้ใช้ไว้ ต้องบอกเสมอว่าทำอะไรต่อได้ (บทที่ 9.8) */
export function BlockingState({
  actionLabel,
  icon,
  message,
  onAction,
  onSecondaryAction,
  requestId,
  secondaryLabel,
  title,
}: BlockingStateProps) {
  const { theme } = useAppTheme();

  return (
    <Screen contentContainerStyle={{ justifyContent: 'center' }}>
      <AppCard>
        <View style={{ gap: theme.spacing.md }}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.primarySoft,
              borderRadius: theme.radius.pill,
              height: 52,
              justifyContent: 'center',
              width: 52,
            }}
          >
            <Ionicons color={theme.colors.primary} name={icon} size={26} />
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="h2">{title}</AppText>
            <AppText color="muted">{message}</AppText>
            {requestId ? (
              <AppText color="subtle" variant="caption">
                รหัสอ้างอิง: {requestId}
              </AppText>
            ) : null}
          </View>

          {actionLabel && onAction ? (
            <AppButton onPress={onAction} title={actionLabel} />
          ) : null}

          {secondaryLabel && onSecondaryAction ? (
            <AppButton
              onPress={onSecondaryAction}
              title={secondaryLabel}
              variant="ghost"
            />
          ) : null}
        </View>
      </AppCard>
    </Screen>
  );
}

interface UpdateRequiredScreenProps {
  storeUrl?: string | null;
}

export function UpdateRequiredScreen({ storeUrl }: UpdateRequiredScreenProps) {
  return (
    <BlockingState
      actionLabel={storeUrl ? 'ไปที่สโตร์เพื่ออัปเดต' : undefined}
      icon="cloud-download-outline"
      message="แอปเวอร์ชันนี้เก่าเกินกว่าจะใช้งานกับระบบได้อย่างปลอดภัย กรุณาอัปเดตเป็นเวอร์ชันล่าสุดก่อน"
      onAction={storeUrl ? () => void Linking.openURL(storeUrl) : undefined}
      title="ต้องอัปเดตแอปก่อนใช้งาน"
    />
  );
}
