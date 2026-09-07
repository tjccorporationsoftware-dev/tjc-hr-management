import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Screen,
  SkeletonList,
  Text,
  type ToneName,
  useToast,
} from '@/design';
import {
  COMPLAINT_STATUS_LABEL,
  type ComplaintStatus,
} from '@/features/complaints/complaints.types';
import {
  useCancelComplaint,
  useComplaintDetail,
} from '@/features/complaints/use-complaints';
import { ApiError } from '@/lib/api/api-error';
import { useAppTheme } from '@/theme/use-app-theme';
import { thaiDate } from '@/lib/date/thai-date';

const STATUS_TONE: Record<ComplaintStatus, ToneName> = {
  SUBMITTED: 'warning',
  IN_PROGRESS: 'primary',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
};

const dateTimeText = (value?: Date | null) =>
  value
    ? thaiDate(value, {
        day: 'numeric',
        month: 'short',
        time: 'short',
        year: 'numeric',
      })
    : '-';

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const { theme } = useAppTheme();
  if (!value) return null;

  return (
    <View style={{ gap: 2 }}>
      <Text tone="subtle" variant="caption">
        {label}
      </Text>
      <Text>{value}</Text>
      <View style={{ height: theme.spacing.xs }} />
    </View>
  );
}

export default function ComplaintDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const toast = useToast();
  const { theme } = useAppTheme();
  const detail = useComplaintDetail(id);
  const cancel = useCancelComplaint();
  const [confirmVisible, setConfirmVisible] = useState(false);

  async function confirmCancel() {
    try {
      await cancel.mutateAsync({ id });
      toast.success('ถอนเรื่องร้องเรียนแล้ว');
      setConfirmVisible(false);
      await detail.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'ถอนเรื่องไม่สำเร็จ');
    }
  }

  const item = detail.data;

  return (
    <Screen scroll>
      <View style={{ gap: theme.spacing.lg }}>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: theme.spacing.sm,
          }}
        >
          <Pressable
            accessibilityLabel="ย้อนกลับ"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={{
              alignItems: 'center',
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}
          >
            <Ionicons color={theme.colors.text} name="chevron-back" size={22} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text tone="muted" variant="caption">
              เรื่องร้องเรียน
            </Text>
            <Text numberOfLines={1} variant="h2">
              {item?.title ?? 'รายละเอียดเรื่อง'}
            </Text>
          </View>
        </View>

        {detail.isPending ? (
          <SkeletonList rows={5} />
        ) : detail.isError ? (
          <ErrorState
            description={
              detail.error instanceof ApiError ? detail.error.message : undefined
            }
            onRetry={() => void detail.refetch()}
            title="ยังดูรายละเอียดไม่ได้"
          />
        ) : item ? (
          <>
            <Card
              action={
                <Badge
                  label={COMPLAINT_STATUS_LABEL[item.status]}
                  tone={STATUS_TONE[item.status]}
                />
              }
              title="สถานะ"
            >
              <View style={{ gap: theme.spacing.xs }}>
                <Text tone="muted" variant="caption">
                  เลขที่เรื่อง: {item.complaintNo || '-'}
                </Text>
                <Text tone="muted" variant="caption">
                  ยื่นเมื่อ: {dateTimeText(item.submittedAt)}
                </Text>
                {item.handledAt ? (
                  <Text tone="muted" variant="caption">
                    รับดำเนินการ: {dateTimeText(item.handledAt)}
                  </Text>
                ) : null}
                {item.closedAt ? (
                  <Text tone="muted" variant="caption">
                    ปิดเรื่อง: {dateTimeText(item.closedAt)}
                  </Text>
                ) : null}
                {item.cancelledAt ? (
                  <Text tone="muted" variant="caption">
                    ถอนเรื่อง: {dateTimeText(item.cancelledAt)}
                  </Text>
                ) : null}
              </View>
            </Card>

            <Card title="รายละเอียด">
              <View style={{ gap: theme.spacing.xs }}>
                <InfoRow label="หัวข้อ" value={item.title} />
                <InfoRow label="หมวดหมู่" value={item.category} />
                <InfoRow label="รายละเอียด" value={item.description} />
                <InfoRow
                  label="สิ่งที่ต้องการให้ดำเนินการ"
                  value={item.expectation}
                />
              </View>
            </Card>

            {item.handler?.displayName || item.note ? (
              <Card title="การดำเนินการ">
                <View style={{ gap: theme.spacing.xs }}>
                  <InfoRow
                    label="ผู้รับดำเนินการ"
                    value={item.handler?.displayName}
                  />
                  <InfoRow label="หมายเหตุ" value={item.note} />
                </View>
              </Card>
            ) : null}

            {item.capabilities.canCancel ? (
              <Button
                onPress={() => setConfirmVisible(true)}
                title="ถอนเรื่องร้องเรียน"
                variant="danger"
              />
            ) : null}
          </>
        ) : null}
      </View>

      <ConfirmDialog
        destructive
        loading={cancel.isPending}
        message="ถอนเรื่องได้เฉพาะก่อนที่ผู้รับผิดชอบจะรับเรื่องเข้าสู่กระบวนการ หลังถอนแล้วจะไม่สามารถนำเรื่องเดิมกลับมาดำเนินการต่อได้"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => void confirmCancel()}
        title="ถอนเรื่องร้องเรียน?"
        visible={confirmVisible}
      />
    </Screen>
  );
}
