import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './button';
import { Text } from './text';
import { tone as resolveTone, type ToneName } from './tokens';
import { useAppTheme } from '@/theme/use-app-theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/* ---------------------------------------------------------------- Empty */

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
}

/** ไม่มีข้อมูล — ไม่ใช่ความผิดพลาด ใช้โทนเงียบ ๆ ไม่ต้องเตือนภัย */
export function EmptyState({
  title,
  description,
  icon = 'file-tray-outline',
  action,
}: EmptyStateProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxl,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: 999,
          height: 56,
          justifyContent: 'center',
          marginBottom: theme.spacing.xxs,
          width: 56,
        }}
      >
        <Ionicons color={theme.colors.textSubtle} name={icon} size={26} />
      </View>
      <Text style={{ textAlign: 'center' }} variant="h3">
        {title}
      </Text>
      {description ? (
        <Text style={{ textAlign: 'center' }} tone="muted" variant="caption">
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: theme.spacing.sm }}>{action}</View> : null}
    </View>
  );
}

/* ---------------------------------------------------------------- Error */

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  description,
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  const { theme } = useAppTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxl,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.dangerSoft,
          borderRadius: 999,
          height: 56,
          justifyContent: 'center',
          marginBottom: theme.spacing.xxs,
          width: 56,
        }}
      >
        <Ionicons
          color={theme.colors.danger}
          name="cloud-offline-outline"
          size={26}
        />
      </View>
      <Text style={{ textAlign: 'center' }} variant="h3">
        {title}
      </Text>
      {description ? (
        <Text style={{ textAlign: 'center' }} tone="muted" variant="caption">
          {description}
        </Text>
      ) : null}
      {onRetry ? (
        <View style={{ marginTop: theme.spacing.sm, minWidth: 160 }}>
          <Button loading={retrying} onPress={onRetry} title="ลองใหม่" />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- Skeleton */

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * กล่องเทาเต้นเบา ๆ ระหว่างรอข้อมูล
 *
 * ใช้ opacity ล้วนและ useNativeDriver เพื่อให้อนิเมชันวิ่งบน UI thread
 * จอที่มี skeleton หลายสิบชิ้นจะได้ไม่กินเฟรมของ JS thread
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  style,
}: SkeletonProps) {
  const { theme } = useAppTheme();
  /* lazy init — สร้าง Animated.Value ครั้งเดียวตลอดอายุคอมโพเนนต์
     ใช้ useState แทน useRef เพราะอ่าน .current ตอน render ไม่ได้ */
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          toValue: 0.5,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: theme.colors.skeleton,
          borderRadius: radius ?? theme.radius.sm,
          height,
          opacity,
          width,
        },
        style,
      ]}
    />
  );
}

/** ชุด skeleton สำเร็จรูปสำหรับรายการ ใช้ซ้ำได้ทุกจอที่เป็น list */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const { theme } = useAppTheme();

  return (
    <View style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.sm,
          }}
        >
          <Skeleton height={36} radius={theme.radius.sm} width={36} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={14} width="60%" />
            <Skeleton height={12} width="35%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/* ---------------------------------------------------------------- Inline */

export interface InlineNoticeProps {
  message: string;
  tone?: ToneName;
  icon?: IconName;
}

/** แถบข้อความสั้นในหน้า เช่น "อยู่นอกรัศมีที่กำหนด" */
export function InlineNotice({
  message,
  tone = 'warning',
  icon = 'information-circle-outline',
}: InlineNoticeProps) {
  const { theme } = useAppTheme();
  const palette = resolveTone(theme, tone);

  return (
    <View
      style={{
        alignItems: 'flex-start',
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        flexDirection: 'row',
        gap: theme.spacing.xs,
        padding: theme.spacing.sm,
      }}
    >
      <Ionicons color={palette.fg} name={icon} size={18} />
      <Text style={{ color: palette.fg, flex: 1 }} variant="caption">
        {message}
      </Text>
    </View>
  );
}
