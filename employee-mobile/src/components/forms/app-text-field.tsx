import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, useState } from 'react';
import {
  Platform,
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/theme/use-app-theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface AppTextFieldProps extends Omit<TextInputProps, 'style'> {
  error?: string;
  icon?: IconName;
  label: string;
  /** true = แสดงปุ่มสลับซ่อน/แสดงรหัสผ่าน */
  secure?: boolean;
}

export const AppTextField = forwardRef<TextInput, AppTextFieldProps>(
  function AppTextField({ error, icon, label, secure = false, ...props }, ref) {
    const { theme } = useAppTheme();
    const [isHidden, setIsHidden] = useState(secure);

    const borderColor = error ? theme.colors.danger : theme.colors.border;

    return (
      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="label">{label}</AppText>

        <View
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.surfaceAlt,
            borderColor,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            flexDirection: 'row',
            gap: theme.spacing.sm,
            minHeight: 52,
            paddingHorizontal: theme.spacing.md,
          }}
        >
          {icon ? (
            <Ionicons color={theme.colors.textSubtle} name={icon} size={20} />
          ) : null}

          <TextInput
            {...props}
            accessibilityLabel={props.accessibilityLabel ?? label}
            placeholderTextColor={theme.colors.textSubtle}
            ref={ref}
            secureTextEntry={isHidden}
            style={[
              {
                color: theme.colors.text,
                flex: 1,
                fontFamily: theme.typography.body.fontFamily,
                fontSize: 16,
              },
              /* เหตุผลเดียวกับใน design/input.tsx — ตัดกรอบโฟกัสสีดำของเบราว์เซอร์ */
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            ]}
          />

          {secure ? (
            <Pressable
              accessibilityLabel={isHidden ? 'แสดงรหัสผ่าน' : 'ซ่อนรหัสผ่าน'}
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => setIsHidden((hidden) => !hidden)}
            >
              <Ionicons
                color={theme.colors.textSubtle}
                name={isHidden ? 'eye-outline' : 'eye-off-outline'}
                size={20}
              />
            </Pressable>
          ) : null}
        </View>

        {error ? (
          // ไม่พึ่งสีอย่างเดียว มีไอคอนกำกับด้วย เพื่อให้ผู้ใช้ตาบอดสีอ่านออก (บทที่ 9.6)
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.xs,
            }}
          >
            <Ionicons
              color={theme.colors.danger}
              name="alert-circle-outline"
              size={14}
            />
            <AppText color="danger" variant="caption">
              {error}
            </AppText>
          </View>
        ) : null}
      </View>
    );
  },
);
